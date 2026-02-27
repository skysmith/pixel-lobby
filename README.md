# pixel-lobby

A tiny Pokemon-ish online top-down lobby in the browser.

## MVP included

- Auto-entry with generated guest name + avatar (no login gate)
- Shared room via Colyseus
- Authoritative movement + collision (server owns position)
- Realtime player sync in Phaser
- Basic sidebar chat + speech bubbles
- Tiled-style shared map data (ground/collision/interact layers)
- Camera follow + polished avatar sprites
- Interact zone support (`E` near sign opens modal)
- Terminal interact zones can open project URLs

## Stack

- Client: Phaser + Vite + TypeScript
- Server: Colyseus + Express + TypeScript
- Maps: Tiled `.tmj` source in `shared/maps/lobby.tmj` with generated TS module

## Run locally

```bash
npm install
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:2567

If join gets stuck on `Connecting...`, verify the server terminal shows `colyseus listening on http://localhost:2567`.

## Editing maps in Tiled

1. Edit `shared/maps/lobby.tmj` in Tiled
2. Run:

```bash
npm run maps:sync
```

3. Restart dev/build

`shared` build also auto-runs map generation via `prebuild`.

## Next milestones

1. Swap shared TS map for direct `.tmj` Tiled JSON import pipeline
2. Add richer sprite sheets / animations
3. Add server-side interact events for multiplayer triggers
