# pixel-lobby

A tiny Pokemon-ish online top-down lobby in the browser.

## MVP included

- Join screen with name + avatar select
- Shared room via Colyseus
- Authoritative movement (server owns position)
- Realtime player sync in Phaser
- Basic sidebar chat + speech bubbles

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

## Next milestones

1. Replace bounded-map collision with Tiled collision layer (server source of truth)
2. Add map JSON loader shared between client/server
3. Add interact zones (`E` key)
