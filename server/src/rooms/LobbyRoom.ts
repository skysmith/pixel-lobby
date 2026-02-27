import { Room, Client } from "colyseus";
import { PATCH_RATE_MS, TICK_RATE_MS, WORLD, collidesCircle, getMapSizePx, lobbyMap, type InputPayload } from "@pixel-lobby/shared";
import { LobbyState, Npc, Player } from "./schema";

const MAX_INPUTS_PER_SEC = 40;
const MAX_CHAT_PER_10S = 8;
const NPC_SPEED = 72;
const NPC_COLLISION_RADIUS = 10;
const MISSIONARY_FIRST_WAVE_DELAY_MS = 60_000;
const MISSIONARY_WAVE_DURATION_MS = 120_000;
const MISSIONARY_WAVE_COOLDOWN_MS = 600_000;

export class LobbyRoom extends Room<LobbyState> {
  maxClients = 40;
  private readonly mapSize = getMapSizePx(lobbyMap);

  private readonly inputBuckets = new Map<string, { count: number; windowStart: number }>();
  private readonly chatBuckets = new Map<string, { count: number; windowStart: number }>();
  private nextMissionaryWaveAt = 0;
  private missionaryWaveEndsAt = 0;

  onCreate() {
    this.setState(new LobbyState());
    this.setPatchRate(PATCH_RATE_MS);
    this.seedNpcs();
    this.nextMissionaryWaveAt = Date.now() + MISSIONARY_FIRST_WAVE_DELAY_MS;

    this.onMessage("input", (client, payload: InputPayload) => {
      if (!this.consumeInputToken(client.sessionId)) {
        return;
      }

      const player = this.state.players.get(client.sessionId);
      if (!player) {
        return;
      }

      player.inputUp = !!payload.up;
      player.inputDown = !!payload.down;
      player.inputLeft = !!payload.left;
      player.inputRight = !!payload.right;
    });

    this.onMessage("chat", (client, body: string) => {
      if (!this.consumeChatToken(client.sessionId)) {
        return;
      }

      const player = this.state.players.get(client.sessionId);
      if (!player) {
        return;
      }

      const msg = String(body || "").trim().slice(0, 140);
      if (!msg) {
        return;
      }

      if (player.lastMessages.length >= 1) {
        player.lastMessages.shift();
      }
      player.lastMessages.push(msg);

      this.broadcast("chat", { id: client.sessionId, msg, t: Date.now() });
    });

    this.setSimulationInterval((deltaMs) => {
      const dt = deltaMs / 1000;
      for (const player of this.state.players.values()) {
        this.simulatePlayer(player, dt);
      }
      for (const npc of this.state.npcs.values()) {
        this.simulateNpc(npc, dt);
      }
      this.updateMissionaryWave();
    }, TICK_RATE_MS);

    this.onMessage("ping", (client, seq: number) => {
      client.send("pong", seq);
    });
  }

  onJoin(client: Client, options: { name?: string; avatar?: string }) {
    const player = new Player();
    player.name = sanitizeName(options?.name);
    player.avatar = sanitizeAvatar(options?.avatar);
    const spawn = findSpawnPosition();
    player.x = spawn.x;
    player.y = spawn.y;
    this.state.players.set(client.sessionId, player);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.inputBuckets.delete(client.sessionId);
    this.chatBuckets.delete(client.sessionId);
  }

  private simulatePlayer(player: Player, dt: number) {
    let dx = 0;
    let dy = 0;

    if (player.inputUp) {
      dy -= 1;
      player.dir = "up";
    }
    if (player.inputDown) {
      dy += 1;
      player.dir = "down";
    }
    if (player.inputLeft) {
      dx -= 1;
      player.dir = "left";
    }
    if (player.inputRight) {
      dx += 1;
      player.dir = "right";
    }

    if (dx !== 0 && dy !== 0) {
      const inv = 1 / Math.sqrt(2);
      dx *= inv;
      dy *= inv;
    }

    const speed = WORLD.playerSpeed * dt;
    const nextX = player.x + dx * speed;
    const nextY = player.y + dy * speed;
    const radius = WORLD.playerRadius;

    const candidateX = clamp(nextX, radius, this.mapSize.width - radius);
    if (!collidesCircle(lobbyMap, candidateX, player.y, radius)) {
      player.x = candidateX;
    }

    const candidateY = clamp(nextY, radius, this.mapSize.height - radius);
    if (!collidesCircle(lobbyMap, player.x, candidateY, radius)) {
      player.y = candidateY;
    }
  }

  private simulateNpc(npc: Npc, dt: number) {
    if (!npc.active) {
      npc.moving = false;
      return;
    }

    if (npc.kind === "missionary") {
      this.simulateMissionary(npc, dt);
      return;
    }

    npc.wanderMs -= dt * 1000;
    if (npc.wanderMs <= 0) {
      this.pickNextNpcAction(npc);
    }

    if (!npc.moving) {
      return;
    }

    const move = directionToVector(npc.dir);
    const nextX = npc.x + move.x * NPC_SPEED * dt;
    const nextY = npc.y + move.y * NPC_SPEED * dt;

    const clampedX = clamp(nextX, NPC_COLLISION_RADIUS, this.mapSize.width - NPC_COLLISION_RADIUS);
    const clampedY = clamp(nextY, NPC_COLLISION_RADIUS, this.mapSize.height - NPC_COLLISION_RADIUS);

    const canMoveX = !collidesCircle(lobbyMap, clampedX, npc.y, NPC_COLLISION_RADIUS);
    const canMoveY = !collidesCircle(lobbyMap, npc.x, clampedY, NPC_COLLISION_RADIUS);

    if (!canMoveX && !canMoveY) {
      npc.wanderMs = 0;
      return;
    }

    if (canMoveX) {
      npc.x = clampedX;
    }
    if (canMoveY) {
      npc.y = clampedY;
    }
  }

  private simulateMissionary(npc: Npc, dt: number) {
    const target = this.pickMissionaryTarget(npc);
    if (!target) {
      npc.moving = false;
      return;
    }

    const dx = target.x - npc.x;
    const dy = target.y - npc.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 4) {
      npc.moving = false;
      return;
    }

    npc.moving = true;
    let moveX = dx / dist;
    let moveY = dy / dist;

    if (Math.abs(dx) > Math.abs(dy)) {
      npc.dir = dx >= 0 ? "right" : "left";
    } else {
      npc.dir = dy >= 0 ? "down" : "up";
    }

    const nextX = npc.x + moveX * NPC_SPEED * dt;
    const nextY = npc.y + moveY * NPC_SPEED * dt;

    const clampedX = clamp(nextX, NPC_COLLISION_RADIUS, this.mapSize.width - NPC_COLLISION_RADIUS);
    const clampedY = clamp(nextY, NPC_COLLISION_RADIUS, this.mapSize.height - NPC_COLLISION_RADIUS);

    const canMoveX = !collidesCircle(lobbyMap, clampedX, npc.y, NPC_COLLISION_RADIUS);
    const canMoveY = !collidesCircle(lobbyMap, npc.x, clampedY, NPC_COLLISION_RADIUS);

    if (canMoveX) {
      npc.x = clampedX;
    } else {
      moveX = 0;
    }
    if (canMoveY) {
      npc.y = clampedY;
    } else {
      moveY = 0;
    }

    if (moveX === 0 && moveY === 0) {
      npc.moving = false;
    }
  }

  private pickMissionaryTarget(npc: Npc): { x: number; y: number } | null {
    let best: Player | null = null;
    let bestDist = Number.POSITIVE_INFINITY;

    for (const player of this.state.players.values()) {
      const dx = player.x - npc.x;
      const dy = player.y - npc.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist) {
        bestDist = d2;
        best = player;
      }
    }

    if (!best) {
      return null;
    }

    return { x: best.x, y: best.y };
  }

  private updateMissionaryWave() {
    const now = Date.now();
    const missionaries = [...this.state.npcs.values()].filter((npc) => npc.kind === "missionary");
    if (missionaries.length === 0) {
      return;
    }

    const waveActive = now < this.missionaryWaveEndsAt;
    if (waveActive) {
      for (const npc of missionaries) {
        npc.active = true;
      }
      return;
    }

    if (this.missionaryWaveEndsAt !== 0 && now >= this.missionaryWaveEndsAt) {
      for (const npc of missionaries) {
        npc.active = false;
      }
      this.missionaryWaveEndsAt = 0;
      this.nextMissionaryWaveAt = now + MISSIONARY_WAVE_COOLDOWN_MS;
      return;
    }

    if (now < this.nextMissionaryWaveAt) {
      return;
    }

    this.spawnMissionariesNearPlayers(missionaries);
    this.missionaryWaveEndsAt = now + MISSIONARY_WAVE_DURATION_MS;
  }

  private spawnMissionariesNearPlayers(missionaries: Npc[]) {
    const players = [...this.state.players.values()];
    for (let i = 0; i < missionaries.length; i += 1) {
      const npc = missionaries[i];
      const target = players[i % Math.max(players.length, 1)] ?? { x: this.mapSize.width / 2, y: this.mapSize.height / 2 };

      const angle = Math.random() * Math.PI * 2;
      const dist = 38 + Math.random() * 24;
      const candidate = {
        x: clamp(target.x + Math.cos(angle) * dist, NPC_COLLISION_RADIUS, this.mapSize.width - NPC_COLLISION_RADIUS),
        y: clamp(target.y + Math.sin(angle) * dist, NPC_COLLISION_RADIUS, this.mapSize.height - NPC_COLLISION_RADIUS)
      };

      if (!collidesCircle(lobbyMap, candidate.x, candidate.y, NPC_COLLISION_RADIUS)) {
        npc.x = candidate.x;
        npc.y = candidate.y;
      }
      npc.active = true;
      npc.moving = true;
      npc.dir = randomDirection();
    }
  }

  private pickNextNpcAction(npc: Npc) {
    if (Math.random() < 0.35) {
      npc.moving = false;
      npc.wanderMs = randomRange(600, 1800);
      return;
    }

    npc.moving = true;
    npc.dir = randomDirection();
    npc.wanderMs = randomRange(900, 2600);
  }

  private seedNpcs() {
    const configs = [
      { id: "npc-missionary-1", name: "Elder Pine", kind: "missionary", x: 3 * 32 + 16, y: 3 * 32 + 16 },
      { id: "npc-missionary-2", name: "Elder Canyon", kind: "missionary", x: 23 * 32 + 16, y: 14 * 32 + 16 }
    ];

    for (const config of configs) {
      const npc = new Npc();
      npc.name = config.name;
      npc.kind = config.kind;
      npc.dir = randomDirection();
      npc.moving = false;
      npc.wanderMs = randomRange(700, 1400);
      npc.active = false;

      const spawn = collidesCircle(lobbyMap, config.x, config.y, NPC_COLLISION_RADIUS) ? findSpawnPosition() : config;
      npc.x = spawn.x;
      npc.y = spawn.y;

      this.state.npcs.set(config.id, npc);
    }
  }

  private consumeInputToken(sessionId: string): boolean {
    const now = Date.now();
    const current = this.inputBuckets.get(sessionId) ?? { count: 0, windowStart: now };
    if (now - current.windowStart > 1000) {
      current.count = 0;
      current.windowStart = now;
    }
    current.count += 1;
    this.inputBuckets.set(sessionId, current);
    return current.count <= MAX_INPUTS_PER_SEC;
  }

  private consumeChatToken(sessionId: string): boolean {
    const now = Date.now();
    const current = this.chatBuckets.get(sessionId) ?? { count: 0, windowStart: now };
    if (now - current.windowStart > 10_000) {
      current.count = 0;
      current.windowStart = now;
    }
    current.count += 1;
    this.chatBuckets.set(sessionId, current);
    return current.count <= MAX_CHAT_PER_10S;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sanitizeName(name: string | undefined): string {
  const out = String(name || "Player").trim().replace(/\s+/g, " ");
  return out.slice(0, 18) || "Player";
}

function sanitizeAvatar(avatar: string | undefined): string {
  const allowed = new Set(["cat", "fox", "frog", "bear"]);
  return allowed.has(String(avatar)) ? String(avatar) : "cat";
}

function findSpawnPosition(): { x: number; y: number } {
  const size = getMapSizePx(lobbyMap);
  const radius = WORLD.playerRadius;

  for (let i = 0; i < 40; i += 1) {
    const x = radius + Math.random() * (size.width - radius * 2);
    const y = radius + Math.random() * (size.height - radius * 2);
    if (!collidesCircle(lobbyMap, x, y, radius)) {
      return { x, y };
    }
  }

  return { x: 64, y: 64 };
}

function randomDirection() {
  const dirs: Array<"up" | "down" | "left" | "right"> = ["up", "down", "left", "right"];
  return dirs[Math.floor(Math.random() * dirs.length)];
}

function directionToVector(dir: "up" | "down" | "left" | "right"): { x: number; y: number } {
  switch (dir) {
    case "up":
      return { x: 0, y: -1 };
    case "down":
      return { x: 0, y: 1 };
    case "left":
      return { x: -1, y: 0 };
    case "right":
      return { x: 1, y: 0 };
  }
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
