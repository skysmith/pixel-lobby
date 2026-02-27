export type TiledTileLayer = {
  type: "tilelayer";
  name: string;
  width: number;
  height: number;
  data: number[];
};

export type TiledObject = {
  id: number;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  properties?: Array<{ name: string; type: string; value: string | number | boolean }>;
};

export type TiledObjectLayer = {
  type: "objectgroup";
  name: string;
  objects: TiledObject[];
};

export type TiledLayer = TiledTileLayer | TiledObjectLayer;

export type TiledMap = {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TiledLayer[];
};
