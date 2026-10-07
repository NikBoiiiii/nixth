# Poker Night
Multiplayer No-Limit Hold'em with seat-attached WebRTC webcams.
```
npm install && npm run dev     # http://localhost:3000
npm test                       # engine tests
```
Open two+ windows (use different browsers/profiles or incognito, since identity is a localStorage token), create a room, share the `?r=CODE` link, sit, Start (host only).
- `engine.js` – pure, deterministic, server-authoritative engine (hand eval, betting, min-raise, side pots, split pots). Inject `rng` for fixtures.
- `server.js` – WebSocket rooms, server-owned turn timers (auto check/fold), reconnection by token, per-player state views (hidden cards never sent), WebRTC signaling relay (video is peer-to-peer mesh).
- `index.html` – client. Env: see `.env.example`.
Not yet built: Postgres/Prisma, Next.js, lobby settings UI, sounds, animations, spectator webcams, SFU. Camera needs https or localhost.
