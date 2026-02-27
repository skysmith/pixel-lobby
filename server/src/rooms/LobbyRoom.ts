import { Room, Client } from "colyseus";
import { PATCH_RATE_MS, ROOM_NAME, TICK_RATE_MS, WORLD, type InputPayload } from "@pixel-lobby/shared";
import { LobbyState, Player } from "./schema";

const MAX_INPUTS_PER_SEC = 40;
const MAX_CHAT_PER_10S = 8;

export class LobbyRoom extends Room<LobbyState> {
  maxClients = 40;

  private readonly inputBuckets = new Map<string, { count: number; windowStart: number }>();
  private readonly chatBuckets = new Map<string, { count: number; windowStart: number }>();

  onCreate() {
    this.roomName = ROOM_NAME;
    this.setState(new LobbyState());
    this.setPatchRate(PATCH_RATE_MS);

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
    }, TICK_RATE_MS);

    this.onMessage("ping", (client, seq: number) => {
      client.send("pong", seq);
    });
  }

  onJoin(client: Client, options: { name?: string; avatar?: string }) {
    const player = new Player();
    player.name = sanitizeName(options?.name);
    player.avatar = sanitizeAvatar(options?.avatar);
    player.x = 80 + Math.random() * (WORLD.width - 160);
    player.y = 80 + Math.random() * (WORLD.height - 160);
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

    player.x = clamp(player.x + dx * WORLD.playerSpeed * dt, 16, WORLD.width - 16);
    player.y = clamp(player.y + dy * WORLD.playerSpeed * dt, 16, WORLD.height - 16);
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
