export const ROOM_NAME = "lobby";

export const WORLD = {
  playerSpeed: 140,
  playerRadius: 10
} as const;

export { lobbyMap } from "./maps/lobby.js";
export { collidesCircle, getInteractZones, getMapSizePx, getTileLayer, isBlockedTile, isBlockedWorld, type InteractZone } from "./maps/helpers.js";
export type { TiledMap, TiledObject, TiledLayer, TiledObjectLayer, TiledTileLayer } from "./maps/types.js";

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
