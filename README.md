# 101 CLUB — 3D Multiplayer 101 Okey

Browser-based 101 Okey, with a Three.js 3D table, real-time Socket.IO rooms, 4-player seating, optional *katlamalı* and *eşli* variants, tile drawing/discarding, meld opening and extension, couples, round totals, and in-room chat.

## Run locally

Requirements: Node.js 20+

```bash
npm install
npm run build
npm start
```

Open http://localhost:3001 in up to four separate browser windows/devices. Enter a nickname, create a room, and share the 6-character room code. Local dev with HMR: `npm run dev` (open the Vite address shown in the terminal; Vite config proxies Socket.IO to the server).

## Online deployment

Deploy as a **Node Web Service** on Render:
- Build: `npm install && npm run build`
- Start: `npm start`
- Free plan supported (sleep/wake is normal; rooms are kept in memory only).
- Region: Frankfurt for Turkey/EU.

## Room rules

- Host configures **Folding** (`katlamalı`, next opener needs one more point than previous opposing opening, similarly with pairs), **Partners** (`eşli`, opposite seats are one team), and 3/5/11 rounds before starting.
- 104 numbered tiles + two false jokers. Indicator determines the wildcard tile. 22 tiles for starter and 21 for others.
- Opens with 101+ meld points or 5+ identical pairs. Pure runs are consecutive from 1 through 13 (no circular wrapping), or sets have 3–4 distinct colors of equal value. Okey is a wildcard, and fake joker functions as the printed tile of the okey face.
- Turns: draw stock or discard (except starter), optionally open/lay off, discard. Discard from last player must be used in an opening if player was still closed.
- Round ends when a player discards their last tile, or stock runs out. Players who never opened score +202, others score remaining tiles, the winner gets -101 or -202 for pairs, and their partner receives the same benefit in partner mode.
- Socket connection tokens allow browser refresh/rejoin to the same seat.

### MVP limitations

This is a playable foundation, not every regional/tournament rule. No bots, ranked accounts, tournament penalties, joker retrieval from the table, or advanced automated rearrangement. In-memory rooms disappear when the server restarts, including on Render Free sleep. Game owner starts each new round. More complex house rules (such as **12-13-1**, **siler**, and mandatory play penalties) should be added before calling it a tournament-accurate version.

## Testing

`npm test` runs the rule-engine tests. For real multiplayer testing, open four sessions with different browser storage profiles. Server validates all actions, so a user cannot see another player's hand via the client state endpoint.
