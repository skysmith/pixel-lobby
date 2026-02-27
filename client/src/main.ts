import Phaser from "phaser";
import { Client, Room } from "colyseus.js";
import {
  ROOM_NAME,
  WORLD,
  getInteractZones,
  getMapSizePx,
  getTileLayer,
  lobbyMap,
  type Direction,
  type InteractZone
} from "@pixel-lobby/shared";

type PlayerVisual = {
  root: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Rectangle;
  eyeLeft: Phaser.GameObjects.Arc;
  eyeRight: Phaser.GameObjects.Arc;
};

type PlayerView = {
  id: string;
  visual: PlayerVisual;
  nameLabel: Phaser.GameObjects.Text;
  bubble: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
  dir: Direction;
};

type NpcView = {
  id: string;
  visual: PlayerVisual;
  nameLabel: Phaser.GameObjects.Text;
  speech: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
  dir: Direction;
  kind: string;
  active: boolean;
};

type JoinPayload = { name: string; avatar: string };

let joinPayload: JoinPayload | null = null;
let gameStarted = false;
let connectedRoom: Room | null = null;
let currentVisitorName = "";

const mapSize = getMapSizePx(lobbyMap);

const avatarColor: Record<string, number> = {
  cat: 0x7db6ff,
  fox: 0xf9af7a,
  frog: 0x8ed989,
  bear: 0xc9a07f
};

const npcColor: Record<string, number> = {
  guide: 0x8a7df2,
  greeter: 0xf28da7,
  missionary: 0xd6d6d6
};

const avatarPool = Object.keys(avatarColor);

class LobbyScene extends Phaser.Scene {
  private room!: Room;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private players = new Map<string, PlayerView>();
  private npcs = new Map<string, NpcView>();
  private inputSeq = 0;
  private localId = "";
  private interactZones: InteractZone[] = [];
  private interactHint!: Phaser.GameObjects.Text;
  private interactKey!: Phaser.Input.Keyboard.Key;
  private escapeKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super("lobby");
  }

  async create() {
    if (!joinPayload || !connectedRoom) {
      return;
    }

    this.interactZones = getInteractZones(lobbyMap);
    this.drawMap();

    this.room = connectedRoom;
    this.localId = this.room.sessionId;

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.interactKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.escapeKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this.interactHint = this.add
      .text(14, 12, "", {
        color: "#1f2a3d",
        fontSize: "14px",
        backgroundColor: "#ffffffe0",
        padding: { x: 8, y: 6 }
      })
      .setScrollFactor(0)
      .setDepth(40)
      .setVisible(false);

    this.add
      .text(14, 48, `Visitor: ${currentVisitorName}`, {
        color: "#2f425f",
        fontSize: "13px",
        backgroundColor: "#ffffffcc",
        padding: { x: 8, y: 5 }
      })
      .setScrollFactor(0)
      .setDepth(40);

    this.room.state.players.onAdd((player: any, key: string) => {
      const color = avatarColor[player.avatar] ?? 0xcfd7e8;
      const visual = createPlayerVisual(this, player.x, player.y, color);
      const nameLabel = this.add
        .text(player.x, player.y - 26, player.name, {
          color: "#f9fbff",
          fontSize: "11px",
          backgroundColor: "#0f17277a",
          padding: { x: 4, y: 1 }
        })
        .setOrigin(0.5, 1)
        .setDepth(12);
      const bubble = this.add
        .text(player.x, player.y - 44, "", {
          color: "#0d1320",
          fontSize: "11px",
          backgroundColor: "#f9fcff",
          padding: { x: 4, y: 2 },
          wordWrap: { width: 180 }
        })
        .setOrigin(0.5, 1)
        .setDepth(18);
      bubble.setVisible(false);

      const view: PlayerView = {
        id: key,
        visual,
        nameLabel,
        bubble,
        targetX: player.x,
        targetY: player.y,
        dir: player.dir
      };
      this.players.set(key, view);
      applyFacing(view, player.dir);

      if (key === this.localId) {
        this.cameras.main.startFollow(view.visual.root, true, 0.11, 0.11);
      }

      player.onChange(() => {
        view.targetX = player.x;
        view.targetY = player.y;
        view.dir = player.dir;
        if (player.lastMessages?.length) {
          const latest = player.lastMessages[player.lastMessages.length - 1];
          view.bubble.setText(latest);
          view.bubble.setVisible(true);
          this.time.delayedCall(5000, () => view.bubble.setVisible(false));
        }
      });
    });

    this.room.state.players.onRemove((_player: any, key: string) => {
      const view = this.players.get(key);
      if (!view) {
        return;
      }
      view.visual.root.destroy();
      view.nameLabel.destroy();
      view.bubble.destroy();
      this.players.delete(key);
    });

    this.room.state.npcs.onAdd((npc: any, key: string) => {
      const visual = createPlayerVisual(this, npc.x, npc.y, npcColor[npc.kind] ?? 0xc6a4f5);
      visual.body.setSize(20, 20);
      visual.body.setStrokeStyle(2, 0x49366f, 0.55);
      const nameLabel = this.add
        .text(npc.x, npc.y - 24, `${npc.name}`, {
          color: npc.kind === "missionary" ? "#fffaf4" : "#fff7ff",
          fontSize: "11px",
          backgroundColor: npc.kind === "missionary" ? "#4a4a4ab8" : "#4f2d6e8a",
          padding: { x: 4, y: 1 }
        })
        .setOrigin(0.5, 1)
        .setDepth(12);
      const speech = this.add
        .text(npc.x, npc.y - 44, "", {
          color: "#1c1c1c",
          fontSize: "11px",
          backgroundColor: "#f7f3ea",
          padding: { x: 4, y: 2 },
          wordWrap: { width: 220 }
        })
        .setOrigin(0.5, 1)
        .setDepth(18)
        .setVisible(false);

      const view: NpcView = {
        id: key,
        visual,
        nameLabel,
        speech,
        targetX: npc.x,
        targetY: npc.y,
        dir: npc.dir,
        kind: String(npc.kind ?? ""),
        active: Boolean(npc.active)
      };
      this.npcs.set(key, view);
      applyFacing(view, npc.dir);
      view.visual.root.setVisible(view.active);
      view.nameLabel.setVisible(view.active);
      view.speech.setVisible(false);

      npc.onChange(() => {
        view.targetX = npc.x;
        view.targetY = npc.y;
        view.dir = npc.dir;
        view.active = Boolean(npc.active);
        view.kind = String(npc.kind ?? view.kind);
        view.visual.root.setVisible(view.active);
        view.nameLabel.setVisible(view.active);
        if (!view.active) {
          view.speech.setVisible(false);
        }
      });
    });

    this.room.state.npcs.onRemove((_npc: any, key: string) => {
      const view = this.npcs.get(key);
      if (!view) {
        return;
      }
      view.visual.root.destroy();
      view.nameLabel.destroy();
      view.speech.destroy();
      this.npcs.delete(key);
    });

    this.room.onMessage("chat", (msg: { id: string; msg: string }) => {
      this.appendChatMessage(msg.id === this.localId ? "you" : msg.id.slice(0, 6), msg.msg);
    });

    this.showChat();
    this.appendChatMessage("system", "connected");
  }

  update(_time: number, _delta: number) {
    if (!this.room) {
      return;
    }

    const up = !!this.cursors.up?.isDown;
    const down = !!this.cursors.down?.isDown;
    const left = !!this.cursors.left?.isDown;
    const right = !!this.cursors.right?.isDown;
    const typingInUi = isTypingInUi();

    this.room.send("input", {
      up: typingInUi ? false : up,
      down: typingInUi ? false : down,
      left: typingInUi ? false : left,
      right: typingInUi ? false : right,
      seq: ++this.inputSeq
    });

    for (const [id, view] of this.players) {
      const isLocal = id === this.localId;
      const lerp = isLocal ? 0.34 : 0.22;

      view.visual.root.x = Phaser.Math.Linear(view.visual.root.x, view.targetX, lerp);
      view.visual.root.y = Phaser.Math.Linear(view.visual.root.y, view.targetY, lerp);

      view.nameLabel.setPosition(view.visual.root.x, view.visual.root.y - 26);
      view.bubble.setPosition(view.visual.root.x, view.visual.root.y - 44);
      applyFacing(view, view.dir);

      const bob = Math.sin((this.time.now + id.length * 60) / 190) * 0.6;
      view.visual.body.y = -2 + bob;
    }

    for (const [id, view] of this.npcs) {
      if (!view.active) {
        continue;
      }
      view.visual.root.x = Phaser.Math.Linear(view.visual.root.x, view.targetX, 0.18);
      view.visual.root.y = Phaser.Math.Linear(view.visual.root.y, view.targetY, 0.18);
      view.nameLabel.setPosition(view.visual.root.x, view.visual.root.y - 24);
      view.speech.setPosition(view.visual.root.x, view.visual.root.y - 44);
      applyFacing(view, view.dir);

      const bob = Math.sin((this.time.now + id.length * 35) / 260) * 0.45;
      view.visual.body.y = -2 + bob;
    }

    const localPlayer = this.players.get(this.localId);
    if (!localPlayer) {
      return;
    }

    const interactPressed = !typingInUi && Phaser.Input.Keyboard.JustDown(this.interactKey);
    const missionaryNearby = this.handleMissionaryInteraction(localPlayer, interactPressed);
    if (!missionaryNearby) {
      const nearestZone = findNearestZone(this.interactZones, localPlayer.visual.root.x, localPlayer.visual.root.y, 44);
      if (nearestZone) {
        this.interactHint.setText(`Press Space: ${nearestZone.title}`);
        this.interactHint.setVisible(true);
        if (interactPressed) {
          openInteractModal(nearestZone);
        }
      } else {
        this.interactHint.setVisible(false);
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.escapeKey)) {
      closeInteractModal();
    }
  }

  private drawMap() {
    const ground = getTileLayer(lobbyMap, "ground");
    const collision = getTileLayer(lobbyMap, "collision");

    const gfx = this.add.graphics();

    for (let y = 0; y < lobbyMap.height; y += 1) {
      for (let x = 0; x < lobbyMap.width; x += 1) {
        const index = y * lobbyMap.width + x;
        const groundTile = ground.data[index];
        const collisionTile = collision.data[index];

        const px = x * lobbyMap.tilewidth;
        const py = y * lobbyMap.tileheight;

        gfx.fillStyle(colorForGroundTile(groundTile), 1);
        gfx.fillRect(px, py, lobbyMap.tilewidth, lobbyMap.tileheight);
        drawGroundDetail(gfx, groundTile, px, py, lobbyMap.tilewidth, lobbyMap.tileheight, x, y);

        if (collisionTile !== 0) {
          gfx.fillStyle(collisionColorForGroundTile(groundTile), 0.95);
          gfx.fillRoundedRect(px + 3, py + 3, lobbyMap.tilewidth - 6, lobbyMap.tileheight - 6, 5);
        }
      }
    }

    gfx.lineStyle(1, 0xb9c6d8, 0.35);
    for (let x = 0; x <= mapSize.width; x += lobbyMap.tilewidth) {
      gfx.lineBetween(x, 0, x, mapSize.height);
    }
    for (let y = 0; y <= mapSize.height; y += lobbyMap.tileheight) {
      gfx.lineBetween(0, y, mapSize.width, y);
    }

    for (const zone of this.interactZones) {
      drawZoneSprite(this, zone);
    }

    this.cameras.main.setBounds(0, 0, mapSize.width, mapSize.height);
    this.cameras.main.setZoom(1.15);
    this.cameras.main.roundPixels = true;
  }

  private showChat() {
    const chat = document.getElementById("chat") as HTMLElement;
    const form = document.getElementById("chatForm") as HTMLFormElement;
    const input = document.getElementById("chatInput") as HTMLInputElement;

    chat.hidden = false;
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const msg = input.value.trim();
      if (!msg) {
        return;
      }
      this.room.send("chat", msg);
      input.value = "";
    });
  }

  private appendChatMessage(who: string, msg: string) {
    const ul = document.getElementById("messages") as HTMLUListElement;
    const li = document.createElement("li");
    li.textContent = `[${who}] ${msg}`;
    ul.appendChild(li);
    ul.scrollTop = ul.scrollHeight;
  }

  private handleMissionaryInteraction(localPlayer: PlayerView, interactPressed: boolean): boolean {
    const triggerDistance = 22;
    let nearest: NpcView | null = null;
    let best = Number.POSITIVE_INFINITY;

    for (const npc of this.npcs.values()) {
      if (!npc.active || npc.kind !== "missionary") {
        continue;
      }

      const dx = npc.visual.root.x - localPlayer.visual.root.x;
      const dy = npc.visual.root.y - localPlayer.visual.root.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= triggerDistance * triggerDistance && d2 < best) {
        best = d2;
        nearest = npc;
      }
    }

    if (!nearest) {
      return false;
    }

    this.interactHint.setText("Press Space: Talk to missionaries");
    this.interactHint.setVisible(true);

    if (!interactPressed) {
      return true;
    }

    const phrase = "Do you have a moment to talk about the gospel?";
    this.appendChatMessage("missionary", phrase);
    const missionary = nearest;
    missionary.speech.setText(phrase);
    missionary.speech.setVisible(true);
    this.time.delayedCall(4200, () => missionary.speech.setVisible(false));

    openExternalLinkModal(
      "Missionary Visit",
      phrase,
      "Visit lds.org",
      "https://www.churchofjesuschrist.org/"
    );
    return true;
  }
}

function createPlayerVisual(scene: Phaser.Scene, x: number, y: number, color: number): PlayerVisual {
  const shadow = scene.add.ellipse(0, 8, 18, 7, 0x40506f, 0.2).setDepth(8);
  const body = scene.add.rectangle(0, -2, 20, 24, color).setDepth(10);
  body.setStrokeStyle(2, 0x304564, 0.5);

  const eyeLeft = scene.add.circle(-4, -5, 1.8, 0x1c2b43).setDepth(11);
  const eyeRight = scene.add.circle(4, -5, 1.8, 0x1c2b43).setDepth(11);

  const root = scene.add.container(x, y, [shadow, body, eyeLeft, eyeRight]);
  root.setDepth(10);

  return { root, body, eyeLeft, eyeRight };
}

function applyFacing(view: { visual: PlayerVisual }, dir: Direction) {
  const eyeY = dir === "up" ? -8 : dir === "down" ? -3 : -5;
  const offset = dir === "left" ? -6 : dir === "right" ? 6 : 4;
  view.visual.eyeLeft.x = -offset;
  view.visual.eyeRight.x = offset;
  view.visual.eyeLeft.y = eyeY;
  view.visual.eyeRight.y = eyeY;
}

function colorForGroundTile(tileId: number): number {
  switch (tileId) {
    case 2:
      return 0xc99c6a; // dirt trail
    case 3:
      return 0x6aaed6; // river
    case 4:
      return 0x8e7d72; // canyon rock
    case 5:
      return 0x5b8358; // pines
    case 6:
      return 0xd8bc88; // viewpoint
    default:
      return 0xbfd2b1; // meadow
  }
}

function collisionColorForGroundTile(tileId: number): number {
  switch (tileId) {
    case 3:
      return 0x4f89ac;
    case 5:
      return 0x466b43;
    case 4:
      return 0x6f6158;
    default:
      return 0x7f8a98;
  }
}

function drawGroundDetail(
  gfx: Phaser.GameObjects.Graphics,
  tileId: number,
  px: number,
  py: number,
  w: number,
  h: number,
  tx: number,
  ty: number
) {
  if (tileId === 2) {
    gfx.fillStyle(0xb68658, 0.35);
    gfx.fillRect(px + 5, py + 12, w - 10, 8);
  } else if (tileId === 3) {
    gfx.fillStyle(0x90c7e6, 0.35);
    gfx.fillRect(px + 3, py + 6, w - 6, 3);
    gfx.fillRect(px + 6, py + 18, w - 12, 2);
  } else if (tileId === 4) {
    const tone = (tx + ty) % 2 === 0 ? 0x7a6b63 : 0x86766d;
    gfx.fillStyle(tone, 0.28);
    gfx.fillCircle(px + 9, py + 10, 3);
    gfx.fillCircle(px + 22, py + 19, 2.5);
  } else if (tileId === 1 && (tx + ty) % 4 === 0) {
    gfx.fillStyle(0xa9c39b, 0.26);
    gfx.fillCircle(px + 11, py + 11, 2.4);
  }
}

function drawZoneSprite(scene: Phaser.Scene, zone: InteractZone) {
  const cx = zone.x + zone.width / 2;
  const cy = zone.y + zone.height / 2;

  const g = scene.add.graphics();
  g.setDepth(7);

  if (zone.kind === "lemonade") {
    // Lemonade stand (awning + counter)
    g.fillStyle(0xfde48a, 1);
    g.fillRect(cx - 20, cy - 18, 40, 6);
    g.fillStyle(0xef8f6a, 1);
    g.fillRect(cx - 20, cy - 12, 40, 4);
    g.fillStyle(0xa36a3c, 1);
    g.fillRect(cx - 16, cy - 8, 32, 16);
    g.fillStyle(0x6d4626, 1);
    g.fillRect(cx - 18, cy + 8, 36, 4);
    scene.add.text(cx, cy - 2, "LEMON", { color: "#fff9e7", fontSize: "8px" }).setOrigin(0.5).setDepth(8);
  } else if (zone.kind === "arcade") {
    // Arcade cabinet cluster
    g.fillStyle(0x2f3c8c, 1);
    g.fillRect(cx - 20, cy - 16, 14, 30);
    g.fillRect(cx - 2, cy - 20, 16, 34);
    g.fillRect(cx + 16, cy - 14, 12, 28);
    g.fillStyle(0x7de7ff, 1);
    g.fillRect(cx - 17, cy - 12, 8, 10);
    g.fillRect(cx + 1, cy - 15, 10, 11);
    g.fillRect(cx + 18, cy - 10, 6, 9);
    g.fillStyle(0xf26ca7, 1);
    g.fillCircle(cx - 12, cy + 4, 2);
    g.fillCircle(cx + 6, cy + 2, 2);
    g.fillCircle(cx + 21, cy + 6, 1.8);
    scene.add.text(cx, cy - 24, "ARCADE", { color: "#f4fbff", fontSize: "8px" }).setOrigin(0.5).setDepth(8);
  } else if (zone.kind === "shop" || zone.kind === "realty") {
    // Shop hut (roof + walls + door)
    const roof = zone.kind === "realty" ? 0x5f6f86 : 0x7c5440;
    const wall = zone.kind === "realty" ? 0xb9cce6 : 0xb68868;
    const door = zone.kind === "realty" ? 0x42556d : 0x5f3c2a;
    g.fillStyle(roof, 1);
    g.fillRect(cx - 24, cy - 16, 48, 8);
    g.fillStyle(wall, 1);
    g.fillRect(cx - 20, cy - 8, 40, 24);
    g.fillStyle(door, 1);
    g.fillRect(cx - 6, cy + 2, 12, 14);
    g.fillStyle(0x9ed8ff, 1);
    g.fillRect(cx - 16, cy - 2, 8, 6);
    g.fillRect(cx + 8, cy - 2, 8, 6);
    scene
      .add.text(cx, cy - 21, zone.kind === "realty" ? "HOME" : "GEAR", {
        color: "#f7f7f7",
        fontSize: "8px"
      })
      .setOrigin(0.5)
      .setDepth(8);
  } else {
    // Default info marker
    g.fillStyle(0xfadf8f, 1);
    g.fillRoundedRect(cx - 10, cy - 12, 20, 24, 4);
    scene.add.text(cx, cy - 1, "i", { color: "#6f5200", fontSize: "12px" }).setOrigin(0.5).setDepth(8);
  }

  scene.add
    .text(cx, zone.y + zone.height + 8, zone.title, {
      color: "#23384f",
      fontSize: "11px",
      backgroundColor: "#ffffffdd",
      padding: { x: 4, y: 2 }
    })
    .setOrigin(0.5, 0)
    .setDepth(9);
}

function findNearestZone(zones: InteractZone[], x: number, y: number, maxDistance: number): InteractZone | null {
  let nearest: InteractZone | null = null;
  let best = Number.POSITIVE_INFINITY;

  for (const zone of zones) {
    const dx = x - Phaser.Math.Clamp(x, zone.x, zone.x + zone.width);
    const dy = y - Phaser.Math.Clamp(y, zone.y, zone.y + zone.height);
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= maxDistance && dist < best) {
      best = dist;
      nearest = zone;
    }
  }

  return nearest;
}

const joinForm = document.getElementById("joinForm") as HTMLFormElement;
const joinButton = document.getElementById("joinButton") as HTMLButtonElement;
const joinStatus = document.getElementById("joinStatus") as HTMLParagraphElement;

async function connectAndLaunch(payload: JoinPayload): Promise<boolean> {
  if (gameStarted) {
    return true;
  }

  joinPayload = payload;
  currentVisitorName = payload.name;
  joinStatus.textContent = "Connecting...";
  joinButton.disabled = true;

  try {
    const endpoint = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? `ws://${window.location.hostname}:2567`;
    const client = new Client(endpoint);
    connectedRoom = await withTimeout(
      client.joinOrCreate(ROOM_NAME, joinPayload),
      8000,
      "Connection timed out. Confirm the server is running on port 2567."
    );

    gameStarted = true;
    new Phaser.Game({
      type: Phaser.AUTO,
      parent: "app",
      width: mapSize.width,
      height: mapSize.height,
      backgroundColor: "#e8eef8",
      pixelArt: true,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
      },
      scene: [LobbyScene]
    });

    const join = document.getElementById("join") as HTMLElement;
    join.hidden = true;
    return true;
  } catch (err) {
    connectedRoom = null;
    gameStarted = false;
    joinButton.disabled = false;
    const details = formatJoinError(err);
    console.error("join failed", err);
    joinStatus.textContent = `Join failed: ${details}`;
    const join = document.getElementById("join") as HTMLElement;
    join.hidden = false;
    return false;
  }
}

joinForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const name = (document.getElementById("name") as HTMLInputElement).value || generateGuestName();
  const avatar = (document.getElementById("avatar") as HTMLSelectElement).value || pickRandomAvatar();
  await connectAndLaunch({ name, avatar });
});

void connectAndLaunch({ name: generateGuestName(), avatar: pickRandomAvatar() });

function generateGuestName(): string {
  const names = [
    "Shackleton",
    "Earhart",
    "Norgay",
    "Hillary",
    "Magellan",
    "Cousteau",
    "Hudson",
    "Byrd",
    "Aspen",
    "Canyon",
    "Juniper",
    "River",
    "Summit",
    "Pine",
    "Granite",
    "Echo"
  ];
  return names[Math.floor(Math.random() * names.length)] ?? "Guest";
}

function pickRandomAvatar(): string {
  return avatarPool[Math.floor(Math.random() * avatarPool.length)] ?? "cat";
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then((result) => {
        window.clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        window.clearTimeout(timer);
        reject(err);
      });
  });
}

function formatJoinError(err: unknown): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }

  if (typeof err === "object" && err !== null) {
    const maybeCode = "code" in err ? String((err as { code?: unknown }).code) : "";
    const maybeMessage = "message" in err ? String((err as { message?: unknown }).message) : "";
    if (maybeCode || maybeMessage) {
      return [maybeCode, maybeMessage].filter(Boolean).join(" ");
    }

    try {
      return JSON.stringify(err);
    } catch {
      return "Unknown object error";
    }
  }

  if (typeof err === "string" && err.trim()) {
    return err;
  }

  return "Unknown error";
}

function openInteractModal(zone: InteractZone) {
  openExternalLinkModal(
    zone.title,
    zone.message,
    zone.cta || "Open",
    zone.url,
    zone.secondaryCta,
    zone.secondaryUrl,
    zone.previewImage,
    zone.previewUrl,
    zone.previewText
  );
}

function openExternalLinkModal(
  title: string,
  message: string,
  cta: string,
  url?: string,
  secondaryCta?: string,
  secondaryUrl?: string,
  previewImage?: string,
  previewUrl?: string,
  previewText?: string
) {
  const modal = document.getElementById("interactModal") as HTMLElement;
  const titleNode = document.getElementById("interactTitle") as HTMLElement;
  const bodyNode = document.getElementById("interactBody") as HTMLElement;
  const openButton = document.getElementById("interactOpenLink") as HTMLButtonElement;
  const openButton2 = document.getElementById("interactOpenLink2") as HTMLButtonElement;
  const previewCard = document.getElementById("interactPreview") as HTMLElement;
  const previewImageNode = document.getElementById("interactPreviewImage") as HTMLImageElement;
  const previewUrlNode = document.getElementById("interactPreviewUrl") as HTMLAnchorElement;
  const previewTextNode = document.getElementById("interactPreviewText") as HTMLParagraphElement;

  titleNode.textContent = title;
  bodyNode.textContent = message;

  const resolvedPreviewUrl = previewUrl ?? url;
  const hasPreview = Boolean(previewImage || resolvedPreviewUrl || previewText);
  previewCard.hidden = !hasPreview;
  if (hasPreview) {
    previewImageNode.hidden = !previewImage;
    previewImageNode.src = previewImage ?? "";

    if (resolvedPreviewUrl) {
      previewUrlNode.hidden = false;
      previewUrlNode.href = resolvedPreviewUrl;
      previewUrlNode.textContent = resolvedPreviewUrl;
    } else {
      previewUrlNode.hidden = true;
      previewUrlNode.href = "#";
      previewUrlNode.textContent = "";
    }

    previewTextNode.textContent = previewText ?? "";
    previewTextNode.hidden = !previewText;
  }

  if (url) {
    openButton.hidden = false;
    openButton.textContent = cta || "Open";
    openButton.onclick = () => window.open(url, "_blank", "noopener,noreferrer");
  } else {
    openButton.hidden = true;
    openButton.onclick = null;
  }

  if (secondaryUrl) {
    openButton2.hidden = false;
    openButton2.textContent = secondaryCta || "Open";
    openButton2.onclick = () => window.open(secondaryUrl, "_blank", "noopener,noreferrer");
  } else {
    openButton2.hidden = true;
    openButton2.onclick = null;
  }
  modal.hidden = false;
}

function closeInteractModal() {
  const modal = document.getElementById("interactModal") as HTMLElement;
  modal.hidden = true;
}

function isTypingInUi(): boolean {
  const active = document.activeElement as HTMLElement | null;
  if (!active) {
    return false;
  }

  const tag = active.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    active.isContentEditable
  );
}

const interactClose = document.getElementById("interactClose") as HTMLButtonElement;
interactClose.addEventListener("click", () => closeInteractModal());
