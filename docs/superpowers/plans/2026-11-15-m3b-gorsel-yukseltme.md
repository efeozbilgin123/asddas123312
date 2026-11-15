# M3b — Görsel Yükseltme Implementation Plan

> Executed inline. Owner: "ev PS1 grafikleri gibi" → wants the salon to look rich and cozy.

**Goal:** The salon stops looking flat/low-fi: sharper textures, soft contact shadows, warm glow, a fuller kahvehane with real props, and a night view through the window — without breaking phones.

**Architecture:** A small post-processing stack (`EffectComposer`: render → GTAO (ambient occlusion) → bloom → output/SMAA) chosen per quality preset; 2k texture set wired for `high`; more Poly Haven CC0 props placed in `shared/src/layout.ts` (colliders where walkable space is affected, reachability test keeps every seat reachable); a wall kilim and a backgammon board using generated textures; window shows a night HDRI.

## Global Constraints
- CC0 assets only (Poly Haven) + own generated textures; credits regenerate.
- Phones (`medium`) must stay ≥ 30 FPS target: no GTAO on medium; bloom only. `low`: no post-processing.
- Every seat stays reachable (existing flood-fill test); no prop collider overlaps another (existing test).
- First-render download budget stays ≈ current (new props deferred).

## Tasks
1. **Quality → render pipeline:** `client/src/world/postfx.ts` `createPostFx(renderer, scene, camera, preset) → { render(), setSize(w,h) }`; presets gain `ao: boolean`, `bloom: boolean`, `aa: 'msaa'|'smaa'|'none'`. Test: `quality.test.ts` preset values (high: ao+bloom, medium: bloom, low: none).
2. **Sharper materials:** wire `textureRes` (`high` loads 2k), anisotropy = renderer max, floor/walls use roughness+normal at stronger scale; tone mapping exposure retuned. Visual check.
3. **Kahvehane props:** add CC0 props (radio, books, vases, candle holders, lanterns, clock, jugs, plates, plants, extra frames, bench) to manifest (deferred) + layout; wall kilim (`make-kilim.mjs --variant wall`) and a backgammon board texture (`scripts/make-tavla.mjs`) on a coffee table. Tests: existing layout tests + reachability stay green.
4. **Night window + lights:** night HDRI behind the window, warmer lamp falloff, two wall sconces (oil lamps on wall shelves) with soft light. Visual check from 4 viewpoints, screenshots in `docs/superpowers/m3/`.
