import type { TiledMap, TiledObject, TiledTileLayer } from "./types";

const WIDTH = 30;
const HEIGHT = 20;
const TILE_SIZE = 32;

function makeTileLayer(name: string, fill: number): TiledTileLayer {
  return {
    type: "tilelayer",
    name,
    width: WIDTH,
    height: HEIGHT,
    data: Array.from({ length: WIDTH * HEIGHT }, () => fill)
  };
}

function setTile(layer: TiledTileLayer, x: number, y: number, value: number) {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) {
    return;
  }
  layer.data[y * WIDTH + x] = value;
}

const ground = makeTileLayer("ground", 1);
const collision = makeTileLayer("collision", 0);

for (let x = 0; x < WIDTH; x += 1) {
  setTile(collision, x, 0, 1);
  setTile(collision, x, HEIGHT - 1, 1);
}
for (let y = 0; y < HEIGHT; y += 1) {
  setTile(collision, 0, y, 1);
  setTile(collision, WIDTH - 1, y, 1);
}

for (let x = 3; x < WIDTH - 3; x += 1) {
  setTile(ground, x, 9, 2);
  setTile(ground, x, 10, 2);
}
for (let y = 3; y < HEIGHT - 3; y += 1) {
  setTile(ground, 14, y, 2);
  setTile(ground, 15, y, 2);
}

for (let x = 6; x <= 10; x += 1) {
  setTile(collision, x, 5, 1);
}
for (let y = 12; y <= 16; y += 1) {
  setTile(collision, 20, y, 1);
}
for (let x = 22; x <= 26; x += 1) {
  setTile(collision, x, 4, 1);
}

const interactObjects: TiledObject[] = [
  {
    id: 1,
    name: "welcome-sign",
    type: "interact",
    x: 12 * TILE_SIZE,
    y: 3 * TILE_SIZE,
    width: TILE_SIZE,
    height: TILE_SIZE,
    properties: [
      { name: "title", type: "string", value: "Welcome Board" },
      {
        name: "message",
        type: "string",
        value: "Welcome to Pixel Lobby. Press arrow keys to move and chat in the sidebar."
      }
    ]
  }
];

export const lobbyMap: TiledMap = {
  width: WIDTH,
  height: HEIGHT,
  tilewidth: TILE_SIZE,
  tileheight: TILE_SIZE,
  layers: [
    ground,
    collision,
    {
      type: "objectgroup",
      name: "interact",
      objects: interactObjects
    }
  ]
};
