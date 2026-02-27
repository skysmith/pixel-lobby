import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";
import type { Direction } from "@pixel-lobby/shared";

export class Player extends Schema {
  @type("string") name = "";
  @type("string") avatar = "cat";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("string") dir: Direction = "down";
  @type(["string"]) lastMessages = new ArraySchema<string>();

  inputUp = false;
  inputDown = false;
  inputLeft = false;
  inputRight = false;
}

export class LobbyState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
}
