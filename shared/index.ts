export const ROOM_NAME = "lobby";

export const WORLD = {
  width: 32 * 30,
  height: 32 * 20,
  tileSize: 32,
  playerSpeed: 140
} as const;

export type Direction = "up" | "down" | "left" | "right";

export type InputPayload = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  seq: number;
};

export const TICK_RATE_MS = 50; // 20hz
export const PATCH_RATE_MS = 100; // 10hz
