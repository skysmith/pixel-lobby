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

type JoinPayload = { name: string; avatar: string };

let joinPayload: JoinPayload | null = null;
let gameStarted = false;
let connectedRoom: Room | null = null;

const mapSize = getMapSizePx(lobbyMap);

const avatarColor: Record<string, number> = {
  cat: 0x7db6ff,
  fox: 0xf9af7a,
  frog: 0x8ed989,
  bear: 0xc9a07f
};

class LobbyScene extends Phaser.Scene {
  private room!: Room;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private players = new Map<string, PlayerView>();
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
    this.interactKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
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

    this.room.send("input", { up, down, left, right, seq: ++this.inputSeq });

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

    const localPlayer = this.players.get(this.localId);
    if (!localPlayer) {
      return;
    }

    const nearestZone = findNearestZone(this.interactZones, localPlayer.visual.root.x, localPlayer.visual.root.y, 44);
    if (nearestZone) {
      this.interactHint.setText("Press E near sign");
      this.interactHint.setVisible(true);
      if (Phaser.Input.Keyboard.JustDown(this.interactKey)) {
        openInteractModal(nearestZone.title, nearestZone.message);
      }
    } else {
      this.interactHint.setVisible(false);
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

        gfx.fillStyle(groundTile === 2 ? 0xdce8ff : 0xeef4ff, 1);
        gfx.fillRect(px, py, lobbyMap.tilewidth, lobbyMap.tileheight);

        if (collisionTile !== 0) {
          gfx.fillStyle(0x7f8ea8, 1);
          gfx.fillRoundedRect(px + 2, py + 2, lobbyMap.tilewidth - 4, lobbyMap.tileheight - 4, 4);
        }
      }
    }

    gfx.lineStyle(1, 0xd5deed, 0.5);
    for (let x = 0; x <= mapSize.width; x += lobbyMap.tilewidth) {
      gfx.lineBetween(x, 0, x, mapSize.height);
    }
    for (let y = 0; y <= mapSize.height; y += lobbyMap.tileheight) {
      gfx.lineBetween(0, y, mapSize.width, y);
    }

    for (const zone of this.interactZones) {
      const marker = this.add.rectangle(zone.x + zone.width / 2, zone.y + zone.height / 2, zone.width, zone.height, 0xf8de79);
      marker.setStrokeStyle(2, 0x7e5f00, 0.8);
      marker.setDepth(6);
      this.add
        .text(zone.x + zone.width / 2, zone.y + zone.height / 2, "!", {
          color: "#6f5200",
          fontSize: "14px"
        })
        .setOrigin(0.5)
        .setDepth(7);
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

function applyFacing(view: PlayerView, dir: Direction) {
  const eyeY = dir === "up" ? -8 : dir === "down" ? -3 : -5;
  const offset = dir === "left" ? -6 : dir === "right" ? 6 : 4;
  view.visual.eyeLeft.x = -offset;
  view.visual.eyeRight.x = offset;
  view.visual.eyeLeft.y = eyeY;
  view.visual.eyeRight.y = eyeY;
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

joinForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();

  if (gameStarted) {
    return;
  }

  const name = (document.getElementById("name") as HTMLInputElement).value;
  const avatar = (document.getElementById("avatar") as HTMLSelectElement).value;
  joinPayload = { name, avatar };
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
  } catch (err) {
    connectedRoom = null;
    gameStarted = false;
    joinButton.disabled = false;
    const details = formatJoinError(err);
    console.error("join failed", err);
    joinStatus.textContent = `Join failed: ${details}`;
  }
});

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

function openInteractModal(title: string, message: string) {
  const modal = document.getElementById("interactModal") as HTMLElement;
  const titleNode = document.getElementById("interactTitle") as HTMLElement;
  const bodyNode = document.getElementById("interactBody") as HTMLElement;

  titleNode.textContent = title;
  bodyNode.textContent = message;
  modal.hidden = false;
}

function closeInteractModal() {
  const modal = document.getElementById("interactModal") as HTMLElement;
  modal.hidden = true;
}

const interactClose = document.getElementById("interactClose") as HTMLButtonElement;
interactClose.addEventListener("click", () => closeInteractModal());
