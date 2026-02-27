import http from "node:http";
import express from "express";
import cors from "cors";
import { Server } from "colyseus";
import { ROOM_NAME } from "@pixel-lobby/shared";
import { LobbyRoom } from "./rooms/LobbyRoom";

const PORT = Number(process.env.PORT || 2567);

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, room: ROOM_NAME, ts: Date.now() });
});

const server = http.createServer(app);
const gameServer = new Server({ server });

gameServer.define(ROOM_NAME, LobbyRoom);

gameServer.listen(PORT);
console.log(`colyseus listening on http://localhost:${PORT}`);
