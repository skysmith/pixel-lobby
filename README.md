# pixel-lobby

A tiny Pokemon-ish online top-down lobby in the browser.

## MVP included

- Join screen with name + avatar select
- Shared room via Colyseus
- Authoritative movement + collision (server owns position)
- Realtime player sync in Phaser
- Basic sidebar chat + speech bubbles
- Tiled-style shared map data (ground/collision/interact layers)
- Camera follow + polished avatar sprites
- Interact zone support (`E` near sign opens modal)

## Stack

- Client: Phaser + Vite + TypeScript
- Server: Colyseus + Express + TypeScript
- Maps: Tiled-ready structure (collision integration is next step)

## Run locally

```bash
npm install
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:2567

If join gets stuck on `Connecting...`, verify the server terminal shows `colyseus listening on http://localhost:2567`.

## Next milestones

1. Swap shared TS map for direct `.tmj` Tiled JSON import pipeline
2. Add richer sprite sheets / animations
3. Add server-side interact events for multiplayer triggers
