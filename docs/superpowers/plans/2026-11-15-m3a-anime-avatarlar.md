# M3a — Anime Avatarlar (VRM + fizik + kendi avatarını yükle) Implementation Plan

> Executed inline (superpowers:executing-plans). Owner asked for this after M2 ("anime karakterleri ekle, fizikleri de olsun").

**Goal:** Players pick an anime VRM avatar (two bundled, permissively licensed) or upload their own `.vrm`; hair/skirt/body physics via VRM spring bones; everyone in the salon sees each player's chosen avatar.

**Architecture:** `@pixiv/three-vrm` loads VRM; Xbot's Mixamo idle/walk/run clips are retargeted to each VRM's normalized humanoid; sit stays procedural (world-axis bend on normalized leg bones). The avatar id travels in join options and in `PlayerState.avatar`. Uploaded avatars are stored on the server by content hash (`$AVATAR_DIR`, outside the repo) and served back to other players.

**Spec:** `docs/superpowers/specs/2026-11-15-kahvehane-sosyal-lobi-design.md` §8.3 (owner's later request extends it with anime avatars; custom uploads are private to the salon).

## Global Constraints
- Bundled models only with licences that allow redistribution: `VRM1_Constraint_Twist_Sample` (pixiv, credit unnecessary), `Seed-san` (VirtualCast, VRM Public License 1.0, credit required → CREDITS.md + in-game credit line).
- No ripped/copyrighted game characters added by us; uploads are the uploader's responsibility and never committed.
- Uploads: `.vrm` (glTF binary magic `glTF`), ≤ 30 MB, stored as `<sha256>.vrm`, at most 200 files (oldest evicted), max 5 uploads / 10 min per IP.
- UI copy Turkish. Mannequin (tinted by look) stays as a fallback and for users who prefer it.

## Review Focus
1. Upload of a non-VRM / huge / spoofed file → rejected with a Turkish message; server never crashes; nothing served as HTML (`nosniff`, `application/octet-stream`).
2. A player joins with `avatar: "custom:<hash>"` that doesn't exist on the server → server falls back to `mannequin`; other clients never get stuck loading.
3. A VRM fails to load in someone's browser → that player is shown as the mannequin, the rest of the scene keeps running.
4. Many players with heavy VRMs → each distinct model is downloaded/parsed once and cloned per player (VRM clone via `SkeletonUtils` + `VRMUtils`), physics per instance.
5. Sitting with a VRM → legs bend forward at the hips/knees, avatar not sunk into the seat (per-seat heights already exist).

## Tasks
1. **Protocol + server avatar field** — `shared/src/protocol.ts`: `BUILTIN_AVATARS = ['twist','seed','mannequin']`, `sanitizeAvatar(raw, exists: (hash) => boolean): string` (`custom:<64 hex>` only if exists, else builtin or `'mannequin'`); `PlayerState.avatar`; join uses it. Tests: shared protocol tests, server join test with unknown custom → mannequin.
2. **Avatar store + HTTP** — `server/src/avatarStore.ts` (`AvatarStore(dir)`: `save(buf) → hash | error`, `has(hash)`, `path(hash)`, eviction), `server/src/http.ts` (`createHttpApp(store, clientDist)`: `POST /avatars` raw body ≤ 30 MB, `GET /avatars/:hash.vrm`, `/health`, static client), `index.ts` uses it. Tests with real HTTP (vitest + fetch on an ephemeral port): valid upload → 200 `{id}`; not glTF → 400; too big → 413; rate limit → 429; GET unknown → 404; GET known → bytes with `nosniff`.
3. **Retarget map** — `client/src/avatar/retarget.ts`: `MIXAMO_TO_VRM` bone map + `retargetClip(clip, srcRoot, vrm) → AnimationClip` (three-vrm's documented Mixamo method: rest-pose world rotations, hips height scale, VRM0 axis flip). Unit test for the name mapping (`mixamorigLeftUpLeg` → `leftUpperLeg`, unknown bones dropped).
4. **VRM avatar view** — `client/src/avatar/vrmAvatar.ts`: `VrmAvatarView` with the same API as `AvatarView` (`root`, `update(state, dt, seat)`), plays retargeted clips, procedural sit on normalized bones, `vrm.update(dt)` for spring bones; `client/src/avatar/library.ts`: loads/caches each avatar source once, returns a per-player instance or `null` (→ mannequin).
5. **Join screen + upload UI + wiring** — avatar cards (Twist, Seed-san, Manken, "Kendi VRM'in…" file input with upload progress/errors), `look` still tints the mannequin; main.ts/remote.ts build views via the library; name tag height from the model. Smoke + multi e2e stay green; screenshot two VRM players.
