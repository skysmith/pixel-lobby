import Phaser from "phaser";
import { Client, Room } from "colyseus.js";
import { ROOM_NAME, WORLD, type Direction } from "@pixel-lobby/shared";

type PlayerView = {
  id: string;
  sprite: Phaser.GameObjects.Rectangle;
  nameLabel: Phaser.GameObjects.Text;
  bubble: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
  dir: Direction;
};

type JoinPayload = { name: string; avatar: string };

let joinPayload: JoinPayload | null = null;

const avatarColor: Record<string, number> = {
  cat: 0x8fcbff,
  fox: 0xffb980,
  frog: 0x95e08d,
  bear: 0xc8a182
};

class LobbyScene extends Phaser.Scene {
  private room!: Room;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private players = new Map<string, PlayerView>();
  private inputSeq = 0;
  private localId = "";

  constructor() {
    super("lobby");
  }

  async create() {
    if (!joinPayload) {
      return;
    }

    this.drawBackgroundGrid();

    const endpoint = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? "ws://localhost:2567";
    const client = new Client(endpoint);
    this.room = await client.joinOrCreate(ROOM_NAME, joinPayload);
    this.localId = this.room.sessionId;

    this.cursors = this.input.keyboard!.createCursorKeys();

    this.room.state.players.onAdd((player: any, key: string) => {
      const sprite = this.add.rectangle(player.x, player.y, 22, 26, avatarColor[player.avatar] ?? 0xdde3f2);
      const nameLabel = this.add.text(player.x, player.y - 26, player.name, {
        color: "#f6f8ff",
        fontSize: "11px",
        backgroundColor: "#00000066",
        padding: { x: 3, y: 1 }
      }).setOrigin(0.5, 1);
      const bubble = this.add.text(player.x, player.y - 44, "", {
        color: "#0d1320",
        fontSize: "11px",
        backgroundColor: "#f0f4ff",
        padding: { x: 4, y: 2 },
        wordWrap: { width: 180 }
      }).setOrigin(0.5, 1);
      bubble.setVisible(false);

      const view: PlayerView = {
        id: key,
        sprite,
        nameLabel,
        bubble,
        targetX: player.x,
        targetY: player.y,
        dir: player.dir
      };
      this.players.set(key, view);

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
      view.sprite.destroy();
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
      const lerp = isLocal ? 0.32 : 0.22;

      view.sprite.x = Phaser.Math.Linear(view.sprite.x, view.targetX, lerp);
      view.sprite.y = Phaser.Math.Linear(view.sprite.y, view.targetY, lerp);

      view.nameLabel.setPosition(view.sprite.x, view.sprite.y - 26);
      view.bubble.setPosition(view.sprite.x, view.sprite.y - 44);
    }
  }

  private drawBackgroundGrid() {
    const gfx = this.add.graphics();
    gfx.fillStyle(0x273248, 1);
    gfx.fillRect(0, 0, WORLD.width, WORLD.height);

    gfx.lineStyle(1, 0x364667, 0.65);
    for (let x = 0; x <= WORLD.width; x += WORLD.tileSize) {
      gfx.lineBetween(x, 0, x, WORLD.height);
    }
    for (let y = 0; y <= WORLD.height; y += WORLD.tileSize) {
      gfx.lineBetween(0, y, WORLD.width, y);
    }

    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);
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

const joinForm = document.getElementById("joinForm") as HTMLFormElement;
joinForm.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const name = (document.getElementById("name") as HTMLInputElement).value;
  const avatar = (document.getElementById("avatar") as HTMLSelectElement).value;
  joinPayload = { name, avatar };

  const join = document.getElementById("join") as HTMLElement;
  join.hidden = true;

  new Phaser.Game({
    type: Phaser.AUTO,
    parent: "app",
    width: WORLD.width,
    height: WORLD.height,
    backgroundColor: "#202634",
    pixelArt: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: [LobbyScene]
  });
});
