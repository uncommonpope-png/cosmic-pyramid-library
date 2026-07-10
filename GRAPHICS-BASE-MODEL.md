# CPL — Graphics Base Model

**Version:** Base Model (Steps 1+2 of the graphics enhancement pass)
**World:** `cosmic-pyramid-library/index.html` (Three.js r128, served via `python -m http.server 8000`)
**Status:** ✅ Verified — "looks beautiful" (Pope, Jul 2026)

This document locks in the rendering pipeline as the **base graphics model** for the Cosmic Pyramid Library. Every setting below is live in `index.html`. Further passes (e.g. SMAA + SSAO) build ON this base.

---

## Render Pipeline (in order)

1. **Renderer** (`WebGLRenderer({ antialias: true })`)
   - `setPixelRatio(min(devicePixelRatio, 2))`
   - `shadowMap.enabled = true`, `type = PCFSoftShadowMap`
   - `toneMapping = ACESFilmicToneMapping`
   - `toneMappingExposure = 0.55`
2. **IBL Environment** (image-based lighting)
   - `PMREMGenerator` + `RoomEnvironment` → `scene.environment`
   - Gives metallic GLBs (Porsche, Cadillac, showroom) real reflections; soft ambient bounce for the whole city.
3. **Postprocessing chain** (`EffectComposer`)
   - `RenderPass(scene, camera)`
   - `UnrealBloomPass` — strength `0.45`, radius `0.5`, threshold `0.5`
   - `ShaderPass(VignetteShader)` — offset `0.85`, darkness `0.7`
   - `ShaderPass(GammaCorrectionShader)` — **LAST**; linear→sRGB so colors are correct through the composer.
4. **Render loop** calls `effectComposer.render()` (not `renderer.render`).

> ⚠️ Do NOT also set `renderer.outputEncoding = sRGBEncoding` — that double-corrects and washes the image white. Gamma is handled by the final pass only.

---

## Tuning Notes

| Setting | Value | Reason |
|---|---|---|
| Tone mapping | ACES Filmic | cinematic, no blown highlights (was Reinhard) |
| Exposure | 0.55 | IBL roughly doubled ambient; dropped from 1.0 to compensate |
| Bloom strength | 0.45 | eased from 0.7 after IBL added glow |
| Bloom threshold | 0.5 | only bright emissives/neon bloom |
| Vignette | offset 0.85 / dark 0.7 | subtle edge falloff |

---

## Performance / Load Notes

- **Slow first load is asset size streaming over HTTP, NOT the graphics code.** Heaviest: `world.glb` (66 MB), `misc/unequal_marriage-1.glb` (17.7 MB), `mercedes` (20 MB). GLB fetch fails on `file://` (CORS) — must serve over HTTP.
- Heavy Porsches (40–46 MB, in `porsche-extra/`) are **deferred** — batch-loading them crashes the tab.
- Candidate future optimizations: lazy-load, downscale `world.glb`, drop pixel-ratio cap on low-end GPUs.

---

## Soul Guns (Seshat Second Brain)

- `SKILL - graphics-color` — ACES + sRGB gamma pipeline
- `SKILL - graphics-ibl` — PMREM/RoomEnvironment IBL
- Cluster: `DOUR-BIBLE` → Library World section; catalog `neodownloadable` (SECTION 15); asset registry `CPL ASSET MAP`

## Next (not in base model)

- Step 3: `SMAA` + `SSAO` post passes (pending — verify one at a time per black-screen protocol)
- GSK bridge: this world is a standalone front-end; not yet connected to GSK core.
