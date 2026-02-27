import type { TiledLayer, TiledMap, TiledObject, TiledTileLayer } from "./types";

export type InteractZone = {
  id: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  message: string;
  kind: string;
  cta: string;
  url?: string;
};

export function getMapSizePx(map: TiledMap): { width: number; height: number } {
  return {
    width: map.width * map.tilewidth,
    height: map.height * map.tileheight
  };
}

export function getTileLayer(map: TiledMap, name: string): TiledTileLayer {
  const layer = map.layers.find((entry: TiledLayer) => entry.type === "tilelayer" && entry.name === name);
  if (!layer || layer.type !== "tilelayer") {
    throw new Error(`Missing tile layer: ${name}`);
  }
  return layer;
}

export function isBlockedTile(map: TiledMap, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) {
    return true;
  }
  const collision = getTileLayer(map, "collision");
  return collision.data[ty * map.width + tx] !== 0;
}

export function isBlockedWorld(map: TiledMap, x: number, y: number): boolean {
  const tx = Math.floor(x / map.tilewidth);
  const ty = Math.floor(y / map.tileheight);
  return isBlockedTile(map, tx, ty);
}

export function collidesCircle(map: TiledMap, x: number, y: number, radius: number): boolean {
  const points = [
    { x: x - radius, y },
    { x: x + radius, y },
    { x, y: y - radius },
    { x, y: y + radius },
    { x: x - radius, y: y - radius },
    { x: x + radius, y: y - radius },
    { x: x - radius, y: y + radius },
    { x: x + radius, y: y + radius }
  ];

  return points.some((point) => isBlockedWorld(map, point.x, point.y));
}

export function getInteractZones(map: TiledMap): InteractZone[] {
  const layer = map.layers.find((entry: TiledLayer) => entry.type === "objectgroup" && entry.name === "interact");
  if (!layer || layer.type !== "objectgroup") {
    return [];
  }

  return layer.objects.map((object: TiledObject) => toInteractZone(object));
}

function toInteractZone(object: TiledObject): InteractZone {
  const title = readObjectStringProperty(object, "title") ?? "Interact";
  const message = readObjectStringProperty(object, "message") ?? "No message configured.";
  const kind = readObjectStringProperty(object, "kind") ?? object.type ?? "info";
  const cta = readObjectStringProperty(object, "cta") ?? "Open";
  const url = readObjectStringProperty(object, "url");

  return {
    id: object.id,
    name: object.name,
    x: object.x,
    y: object.y,
    width: object.width,
    height: object.height,
    title,
    message,
    kind,
    cta,
    url
  };
}

function readObjectStringProperty(object: TiledObject, name: string): string | undefined {
  const prop = object.properties?.find((entry: { name: string; type: string; value: string | number | boolean }) => entry.name === name);
  return typeof prop?.value === "string" ? prop.value : undefined;
}
