# Kilometre Taşı 2 — Çok Oyunculu Salon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Up to 15 friends join the same salon by link with a name and look, see each other walk and sit in sync, chat by text and send emotes; the cat is shared.

**Architecture:** npm workspaces `shared/` (pure TS: layout, collision, movement, seats, cat brain, protocol), `server/` (Node + Colyseus 0.18 `SalonRoom`, also serves the built client), `client/` (M1 app + net layer). Movement is client-predicted and server-validated; seats, chat, emotes and the cat are server-authoritative. If the server can't be reached the client falls back to the M1 single-player mode with a notice.

**Tech Stack:** Node ≥ 20, TypeScript 5 strict, `@colyseus/core` + `@colyseus/ws-transport` + `@colyseus/schema` 5 (server), `@colyseus/sdk` 0.18 (client), `@colyseus/testing` 0.18, `express`, `tsx` (run server TS), Vitest 2, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-15-kahvehane-sosyal-lobi-design.md` (§2 items 2–3, §8.1, §8.3, §8.8, §9 step 2).

## Global Constraints

- All UI copy Turkish. No accounts: name + look, then enter.
- One shared salon, max 15 players (`maxClients = 15`); 16th sees "Salon dolu (15/15)".
- Free hosting only: single Node process (Render free or the owner's Oracle VM); no database. State may reset when the server restarts.
- Server authoritative for seats, chat, emotes, cat; it never trusts a client position it can't validate.
- Old code is not copied. M1 behaviour (single-player) must keep working offline.
- Reuse M1 pure modules by moving them to `shared/` — no duplicates.

## Review Focus

1. **Two players press Sit on the same seat at the same moment** → exactly one sits; the other gets "Bu koltuk dolu" and stays standing; test `second sit on same seat is rejected` (Task 3).
2. **A player disconnects (tab closed / phone sleeps) while seated** → their avatar disappears within 5 s and the seat frees; test `leave frees the seat and removes the player` (Task 3).
3. **Hostile or messy input** — 500-char chat, HTML in names, empty name, emoji names, chat spam → names 1–20 chars, HTML shown as text, chat ≤ 200 chars, max 3 messages / 2 s; tests in Task 2 (`sanitizeName…`, `sanitizeChat…`, `RateLimiter…`).
4. **Teleport / speed hack or lag burst** → server rejects moves faster than run speed ×1.5 (+0.5 m slack) or into colliders and snaps the client back; test `move faster than allowed is corrected` (Task 3), `validateMove allows a lag burst within slack` (Task 2).
5. **Server unreachable** (static preview, server asleep) → client still loads, shows "Çevrimdışı — tek başına geziyorsun", single-player works; test `connect falls back to offline when server unreachable` (Task 4).

---

## File Structure

```
package.json                  workspaces: ["shared", "server", "client"]; scripts: dev (server+client), build, start, test, smoke, smoke:multi
shared/
  package.json  tsconfig.json
  src/layout.ts  src/collision.ts  src/controller.ts  src/seats.ts  src/cat-brain.ts   (moved from client)
  src/protocol.ts            message types, LOOKS, EMOTES, sanitizers, validateMove, RateLimiter
  src/index.ts               re-exports
  test/*.test.ts             (moved M1 pure tests + protocol tests)
server/
  package.json  tsconfig.json
  src/schema.ts              PlayerState, CatSchema, SalonState
  src/SalonRoom.ts           room logic
  src/index.ts               express + colyseus server, serves client/dist, /health
  test/salon.test.ts         @colyseus/testing
client/
  src/net/connection.ts      connect() → Session (online or offline)
  src/net/interpolation.ts   SnapshotBuffer (pure)
  src/net/remote.ts          RemotePlayers: views for other players, name tags, emote bubbles
  src/ui/join.ts             join screen (name + look)
  src/ui/chat.ts             chat panel + emote bar
  src/main.ts                (modify) wiring
  test/interpolation.test.ts  test/connection.test.ts
e2e/multi.mjs                two browsers in one salon
render.yaml                  free Render web service (build + start)
```

---

### Task 1: Extract `shared/` package

**Files:**
- Create: `shared/package.json` (`"name": "@kahvehane/shared"`, `"type": "module"`, `"main": "src/index.ts"`, script `test: vitest run`), `shared/tsconfig.json` (extends base), `shared/src/index.ts`
- Move (git mv): `client/src/world/layout.ts → shared/src/layout.ts`, `client/src/avatar/collision.ts → shared/src/collision.ts`, `client/src/avatar/controller.ts → shared/src/controller.ts`, `client/src/interact/seats.ts → shared/src/seats.ts`, `client/src/cat/brain.ts → shared/src/cat-brain.ts`; their tests (`layout`, `controller`, `seats`, `cat`) → `shared/test/`
- Modify: every client import of those modules → `@kahvehane/shared`; root `package.json` workspaces and `test` script (`npm test --workspaces --if-present`)

**Interfaces:**
- Produces: `@kahvehane/shared` exporting everything the moved modules exported (names unchanged: `ROOM, PLACEMENTS, SEATS, SEAT_POSE, CAT_SPOTS, CAT_EDGES, COLLIDERS, SPAWN, seatApproach, resolveCircle, moveCircle, overlapsAny, step, AvatarState, MoveInput, WALK_SPEED, RUN_SPEED, AVATAR_RADIUS, nearestSeat, sitDown, standUp, catStep, initialCat, CatState`).

- [ ] **Step 1:** Move files and tests; fix imports (tests import from `../src/...`).
- [ ] **Step 2:** Run `npm test`. Expected: all 53 M1 tests pass, now split across `shared` and `client`.
- [ ] **Step 3:** Run `npm run build`. Expected: client builds (Vite resolves the workspace package).
- [ ] **Step 4:** Commit `refactor: move pure world logic into shared package`.

---

### Task 2: Protocol — looks, emotes, sanitizers, move validation, rate limit

**Files:**
- Create: `shared/src/protocol.ts`, `shared/test/protocol.test.ts`

**Interfaces:**
- Produces:
  - `MAX_PLAYERS = 15`
  - `LOOKS: readonly { id: string; label: string; color: string }[]` — 6 entries: `kiremit` "Kiremit" `#c0583c`, `zeytin` "Zeytin" `#6b7a3a`, `lacivert` "Lacivert" `#2c3e66`, `hardal` "Hardal" `#c9962e`, `murdum` "Mürdüm" `#6a2c4f`, `kum` "Kum" `#cdb38a`
  - `EMOTES: readonly { id: string; emoji: string; label: string }[]` — `selam 👋 Selam`, `kahkaha 😂 Kahkaha`, `cay ☕ Çay`, `tamam 👍 Tamam`, `kalp ❤️ Kalp`, `alkis 👏 Alkış`
  - `sanitizeName(raw: unknown): string | null` — trim, collapse whitespace, strip control chars and `<>`, max 20 chars (by code points); `null` if empty
  - `sanitizeChat(raw: unknown): string | null` — same cleaning, max 200 code points, `null` if empty
  - `interface MoveMsg { x: number; z: number; facing: number; speed: number }`
  - `validateMove(prev: {x: number; z: number}, next: MoveMsg, elapsedSec: number, boxes: readonly Box2[]): boolean` — finite numbers; distance ≤ `RUN_SPEED * 1.5 * elapsed + 0.5`; inside room; `!overlapsAny(next, AVATAR_RADIUS - 0.02, boxes)`
  - `class RateLimiter { constructor(max: number, windowMs: number); allow(nowMs: number): boolean }`
  - Client→server messages: `'move' MoveMsg`, `'sit' {seatId: string}`, `'stand' {}`, `'chat' {text: string}`, `'emote' {id: string}`; server→client: `'chat' {from: string; name: string; text: string; at: number}`, `'emote' {from: string; id: string}`, `'correct' {x: number; z: number}`, `'denied' {reason: 'seat-taken' | 'rate-limit'}`; join options `{ name: string; look: string }`.

- [ ] **Step 1: Write failing tests:** `sanitizeName trims and limits to 20 code points` (`'  Efe   Ö  '` → `'Efe Ö'`; 30×`'ş'` → 20×`'ş'`); `sanitizeName strips tags and rejects empty` (`'<b>Ali</b>'` → `'bAli/b'`; `'   '` → null; `42` → null); `sanitizeName keeps emoji whole` (`'🐱'.repeat(25)` → 20 cats); `sanitizeChat limits to 200` ; `validateMove accepts a normal step` (0.05 s, 0.08 m); `validateMove allows a lag burst within slack` (1 s, 4.5 m → true; 1 s, 6 m → false); `validateMove rejects NaN and outside room and into furniture`; `RateLimiter allows 3 per 2 s` (4th at t=1000 false, at t=2100 true); `LOOKS and EMOTES have unique ids`.
- [ ] **Step 2:** `npm test -w shared` → FAIL (module missing).
- [ ] **Step 3:** Implement `protocol.ts`; export from `index.ts`.
- [ ] **Step 4:** `npm test -w shared` → PASS.
- [ ] **Step 5:** Commit `feat: shared protocol (looks, emotes, sanitizers, move validation)`.

---

### Task 3: Server — SalonRoom

**Files:**
- Create: `server/package.json` (deps `@colyseus/core`, `@colyseus/ws-transport`, `@colyseus/schema`, `express`, `@kahvehane/shared`; dev `@colyseus/testing`, `tsx`, `vitest`, `@types/express`; scripts `dev: tsx watch src/index.ts`, `start: tsx src/index.ts`, `test: vitest run`), `server/tsconfig.json` (`experimentalDecorators: true`, `useDefineForClassFields: false`), `server/src/schema.ts`, `server/src/SalonRoom.ts`, `server/src/index.ts`, `server/test/salon.test.ts`

**Interfaces:**
- Consumes: protocol (Task 2), `SEATS, COLLIDERS, SPAWN, catStep, initialCat, CAT_SPOTS` (Task 1).
- Produces:
  - Schema `PlayerState { name: string; look: string; x: number; z: number; facing: number; speed: number; seatId: string; away: boolean }` (`seatId` `''` when standing); `CatSchema { x; z; facing; action: string }`; `SalonState { players: MapSchema<PlayerState>; cat: CatSchema }`
  - Room name `'salon'`; `maxClients = MAX_PLAYERS`; `onAuth/onJoin(options: {name, look})` rejects with error message `'İsim gerekli'` if `sanitizeName` → null; unknown look → first look; spawn at `SPAWN` offset by `(index % 5) * 0.6` in x so players don't stack.
  - Handlers: `move` (validate vs last accepted position and time; on fail send `'correct'` with the last accepted position); `sit` (seat must exist, be free, and the player within 1.5 m of it → set `seatId` and snap position; else `'denied' {reason:'seat-taken'}` when occupied, ignore otherwise); `stand` (clear seat, position = `standUp(...)`); `chat` (sanitize, rate limit 3/2 s per client, broadcast `'chat'`; on limit send `'denied' {reason:'rate-limit'}`); `emote` (known id, rate limit shared with chat, broadcast).
  - Cat: server ticks `catStep` at 10 Hz (`setSimulationInterval(…, 100)`), avatar context = nearest player; writes `state.cat`.
  - `onLeave`: remove player (seat frees implicitly). Allow reconnection for 10 s (`allowReconnection(client, 10)`) — the player stays visible but greyed (`away: boolean` on schema) during that window.
  - `server/src/index.ts`: express serves `../client/dist` statically, `GET /health` → `{ ok: true, players: n }`; Colyseus on the same HTTP server; port `process.env.PORT ?? 2567`.

- [ ] **Step 1: Write failing tests** (`@colyseus/testing` boot with the room): `join adds a player with sanitized name and valid look`; `join without a name is rejected`; `16th client is rejected` (15 join ok, 16th throws); `valid move updates state`; `move faster than allowed is corrected` (teleport 10 m → state unchanged, client receives `'correct'`); `sit takes a free seat near the player`; `second sit on same seat is rejected` (two clients near `sofa-l`, both send sit, exactly one `seatId === 'sofa-l'`, other got `'denied'`); `stand frees the seat`; `chat is sanitized and broadcast to everyone`; `chat over the rate limit is denied`; `leave frees the seat and removes the player` (after reconnection window — use a short window via room option `reconnectSeconds: 0` in tests); `cat state advances over time`.
- [ ] **Step 2:** `npm test -w server` → FAIL.
- [ ] **Step 3:** Implement schema, room, index.
- [ ] **Step 4:** `npm test -w server` → PASS. Also `npm run start -w server` then `curl -s localhost:2567/health` → `{"ok":true,"players":0}`.
- [ ] **Step 5:** Commit `feat: Colyseus salon room with seats, chat, emotes, shared cat`.

---

### Task 4: Client net layer (online / offline session, interpolation)

**Files:**
- Create: `client/src/net/connection.ts`, `client/src/net/interpolation.ts`, `client/test/interpolation.test.ts`, `client/test/connection.test.ts`
- Modify: `client/package.json` (dep `@colyseus/sdk`)

**Interfaces:**
- Produces:
  - `class SnapshotBuffer { push(t: number, s: {x: number; z: number; facing: number; speed: number}): void; sample(t: number): {x; z; facing; speed} | null }` — renders 100 ms in the past, linear interpolation, facing interpolated the short way round, holds the last snapshot when starved (no extrapolation beyond 250 ms).
  - `interface RemotePlayer { id: string; name: string; look: string; x: number; z: number; facing: number; speed: number; seatId: string; away: boolean }`
  - `interface Session { online: boolean; selfId: string; /** includes self */ players(): ReadonlyMap<string, RemotePlayer>; cat(): {x; z; facing; action} | null; onChat(cb): void; onEmote(cb): void; onCorrect(cb: (p: {x; z}) => void): void; onDenied(cb: (reason: string) => void): void; onCount(cb: (n: number) => void): void; sendMove(m: MoveMsg): void; sit(seatId: string): void; stand(): void; chat(text: string): void; emote(id: string): void; leave(): void }`
  - `connect(opts: { url: string; name: string; look: string; timeoutMs?: number }, deps?: { client?: unknown }): Promise<Session | { error: 'full' | 'name' | 'offline' }>` — `'offline'` after `timeoutMs` (default 4000) or connection error; `'full'` / `'name'` from server rejection messages.
  - `offlineSession(): Session` — `online: false`, no-ops for sends, empty players, cat null (client runs the cat locally as in M1).
  - Server URL: `?server=` param, else same origin (`ws(s)://location.host`).

- [ ] **Step 1: Write failing tests:** interpolation — `samples halfway between two snapshots`; `facing interpolates the short way across ±π`; `holds the last snapshot when starved`; connection — `connect falls back to offline when server unreachable` (injected client whose `joinOrCreate` never resolves → `{error:'offline'}` within timeout); `connect reports full and name errors` (injected rejects with the server's messages).
- [ ] **Step 2:** `npm test -w client` → FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat: client session (online/offline) and snapshot interpolation`.

---

### Task 5: Join screen, remote avatars, shared seats and cat

**Files:**
- Create: `client/src/ui/join.ts`, `client/src/net/remote.ts`
- Modify: `client/src/main.ts`, `client/src/avatar/avatar.ts` (tint option), `client/src/ui/hud.css`

**Interfaces:**
- Consumes: `Session`, `SnapshotBuffer`, `LOOKS`, `AvatarView`.
- Produces:
  - `showJoin(root: HTMLElement, defaults: {name: string; look: string}): Promise<{ name: string; look: string }>` — Turkish: title "Kahvehaneye hoş geldin", input placeholder "Adın", look swatches with labels, button "İçeri gir"; Enter submits; validates with `sanitizeName` (error "Bir isim yaz"); remembers last name/look in localStorage (`kh.name`, `kh.look`, try/catch).
  - `AvatarView` gains option `tint?: string` (multiplies the mannequin's base colour; future real characters ignore it).
  - `class RemotePlayers { constructor(scene, makeAvatar: (look: string) => AvatarView); update(session: Session, nowMs: number, dt: number): void }` — creates/removes views as players join/leave (excluding self), feeds `SnapshotBuffer`, applies seat pose when `seatId` set, renders name tags (canvas-text `Sprite` above head, 0.28 m tall, always facing camera; grey + "(uzakta)" when `away`).
  - main.ts flow: load world → `showJoin` → `connect` → on `'full'` show "Salon dolu (15/15)" with retry button; on `'name'` back to join; on `'offline'` show the small banner "Çevrimdışı — tek başına geziyorsun" and continue single-player. Online: send `move` at 10 Hz (only when changed by > 1 cm / 0.02 rad), occupied seats = remote players' `seatId`s (passed to `nearestSeat`), E/Otur sends `sit` and sits locally optimistically, reverts on `'denied'` with toast "Bu koltuk dolu"; `'correct'` snaps local avatar; cat rendered from `session.cat()` (local cat brain only offline); top bar shows player count "Salonda N kişi".

- [ ] **Step 1:** Manual-first task (UI wiring; logic is covered by Tasks 2–4). Implement join screen, tint, RemotePlayers, wiring.
- [ ] **Step 2:** Run `npm test` (all green) and `npm run build`.
- [ ] **Step 3:** Run server + preview; open two Playwright pages; verify each sees the other's name tag and movement (screenshot `docs/superpowers/m2/two-players.png`).
- [ ] **Step 4:** Commit `feat: join screen and remote players`.

---

### Task 6: Chat and emotes

**Files:**
- Create: `client/src/ui/chat.ts`
- Modify: `client/src/main.ts`, `client/src/net/remote.ts` (bubbles), `client/src/ui/hud.css`, `client/src/input/keyboard.ts` (Enter opens chat; typing suspends movement keys — already ignores keys when an input is focused)

**Interfaces:**
- Produces:
  - `class ChatPanel { constructor(root: HTMLElement, cb: { onSend(text: string): void; onEmote(id: string): void }); add(msg: {name: string; text: string; self: boolean}): void; system(text: string): void }` — bottom-left above the joystick on touch, collapsible ("Sohbet"), last 50 messages, input placeholder "Bir şey yaz… (Enter)", emote bar with the 6 `EMOTES`; messages rendered with `textContent` only.
  - Chat bubbles: `RemotePlayers.bubble(playerId: string, text: string, kind: 'chat' | 'emote')` — sprite above the name tag, 4 s for chat (first 60 chars), 3 s for emote (large emoji); own messages show over own avatar too.
  - System lines: "<isim> salona girdi", "<isim> ayrıldı".
  - Denied rate limit → system line "Biraz yavaş 🙂".

- [ ] **Step 1:** Implement; keyboard: `Enter` focuses chat input, `Escape` blurs.
- [ ] **Step 2:** `npm test` green; `npm run build`.
- [ ] **Step 3:** Covered end-to-end by Task 7.
- [ ] **Step 4:** Commit `feat: text chat and emotes`.

---

### Task 7: Two-player end-to-end test, dev/start scripts, deploy config

**Files:**
- Create: `e2e/multi.mjs`, `render.yaml`, `docs/superpowers/m2/README.md` (Turkish: how to run locally, how to deploy on Render free or Oracle VM, known limits)
- Modify: root `package.json` (`dev`: server + client concurrently via `npm-run-all2` or two `&`-free spawns; `start`: build then `npm run start -w server`; `smoke:multi`), `client/vite.config.ts` (dev proxy `/colyseus`, ws → `localhost:2567` if needed)

**Interfaces:**
- Consumes: everything above. Production: one process (`npm start`) serves the client and the room on `$PORT`.

- [ ] **Step 1:** Write `e2e/multi.mjs`: starts the server (serving the built client) on a free port; two browser contexts with `?debug&still&q=low`; both join ("Ayşe" look `hardal`, "Mehmet" look `lacivert`); asserts: each sees 2 players (`__kh.session().players().size === 2`; `players()` includes self); A moves 2 m → within 1 s B's view of A moved > 1.5 m; A sits on `sofa-l` → B's `nearestSeat` excludes it and B's sit attempt on it is denied; A sends chat "Merhaba" → B's chat panel contains "Ayşe" and "Merhaba"; A emote `cay` → B sees an emote bubble; A closes → B sees 1 player within 15 s. Screenshot `docs/superpowers/m2/two-players.png`.
- [ ] **Step 2:** Run `npm run build && npm run smoke:multi` → all OK.
- [ ] **Step 3:** Re-run M1 `npm run smoke` (offline path still works with no server: expect "Çevrimdışı" banner and ALL OK).
- [ ] **Step 4:** `render.yaml`: one free web service, `buildCommand: npm ci && npm run build`, `startCommand: npm run start -w server`, `healthCheckPath: /health`, Node 20.
- [ ] **Step 5:** Commit `test: two-player e2e; deploy config and M2 notes`; push.
