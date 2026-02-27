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

## Vercel deploy (client)

- Framework preset: `Vite`
- Root Directory: `client`
- Build command: `npm run build`
- Output directory: `dist`

`client` now runs a `prebuild` step that builds the `shared` workspace first, so Vercel can resolve `@pixel-lobby/shared` during build.

## Render deploy (server)

This repo includes [`render.yaml`](render.yaml) for the Colyseus backend.

1. In Render, create a new Blueprint service from this GitHub repo.
2. Select the `pixel-lobby-server` service.
3. Deploy and wait for it to become healthy.
4. Confirm health endpoint:
   - `https://<your-render-domain>/health`

### Wire Vercel to Render

Set this env var in your Vercel project:

- `VITE_SERVER_URL=wss://<your-render-domain>`

Then redeploy Vercel so the client connects to the hosted Colyseus server.

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
