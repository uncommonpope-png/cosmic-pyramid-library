# GENESIS BUILD LAW — P106/P107/P108

## P106 — Probe-Free Verification
The verification path is **push → GitHub Pages → one-shot live URL check**. Local servers and browser automation caused instability and are not the definition of done.

Use:

```powershell
node scripts/verify-live-url.cjs
```

Optional:

```powershell
$env:GENESIS_LIVE_URL = "https://uncommonpope-png.github.io/cosmic-pyramid-library/"
node scripts/verify-live-url.cjs
```

The script fetches the live page once, checks for boot/build-law markers, prints JSON, then exits.

## P107 — Multi-Agent Boot Contract
All agents use the same readiness gates:

- `window.Genesis.bootReady` — Promise resolves once critical readiness + first frame/backstop are true.
- `window.__GENESIS_BOOT_READY` — boolean for simple probes.
- `genesis:boot-ready` — browser event with `{ reason, boot }` detail.

Do not invent new fixed-time waits. Do not rely on an 8-second timeout. Read the boot contract.

## P108 — Local Server Ban
Do not run local persistent servers on Craig's PC. Do not run Playwright unless Craig explicitly authorizes. If a script is needed, it must be one-shot and exit.

## Rollback
All build-law changes are isolated to:

- `AGENTS.md`
- `docs/GENESIS_BUILD_LAW.md`
- `scripts/verify-live-url.cjs`
- boot contract lines in `index.html`

Revert the commit if the boot contract causes a page issue.
