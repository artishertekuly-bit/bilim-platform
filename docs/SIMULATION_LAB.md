# Simulation Lab

Interactive, deterministic learning models inside Bilim. The first simulation is
**"Көшпелілердің маусымдық көші"** (seasonal migration of Kazakh nomads, Kazakhstan history, grades 5–8).
Decision record: D92 in `architect/v2/README.md`.

## Architecture

```
src/modules/simulation-lab/
  domain/        pure TypeScript + zod. No React, no Three.js, no I/O, no randomness.
    schema.ts                    SimulationMeta / parameter / output schemas
    nomad-seasons/model.ts       the deterministic model (simulateNomadSeasons)
    nomad-seasons/content.ts     learner-facing Kazakh copy
    nomad-seasons/meta.ts        registry metadata
    nomad-seasons/summary.ts     compact experiment summary for the tutor and saved attempts
  registry/      code-only registry; validates every entry at load; React.lazy entry per slug
  renderers/     React Three Fiber scene, 2D SVG fallback, WebGL probe, error boundary
  components/    pages (/lab, /lab/:slug), stage, chart, hooks, the simulation entry component
  services/      Supabase RPC client (attempts) and the tutor bridge
```

Rules that keep the layers honest:

- The domain layer never imports React or Three.js. Renderers only draw what the model returns.
- The registry is static code. The database stores a slug as a key; nothing is loaded or executed
  from database values.
- The render loop (`useFrame`) mutates refs only. React state never changes inside it.
- three.js is downloaded only when the 3D renderer mounts (`lazy(() => import('NomadScene3D'))`).
  Learners on the 2D map never download it.

### Learning flow

Objective → prediction (required before playback) → lab (3D/2D stage, timeline, parameters) →
live metrics, herd chart and season table → knowledge check → discussion with the AI tutor.

### The nomad seasons model

Three model years of four seasons, starting at spring (Наурыз). Each season:

1. grass regrows on every pasture by a seasonal rate (half rate when a pasture is under 25 %);
2. the herd grazes the pasture chosen for that season; in winter only part of the grass is reachable
   under snow, and in a жұт winter (year 2, optional) an ice crust cuts that share to 40 %;
3. below 70 % of needs the herd loses animals; in a well-fed spring it gains 15 % (төл).

All units are abstract ("sheep units" and "grass units"); the UI labels it as a simplified
educational model, not historical statistics. Rounding is applied at every step, so the same
input always produces the same output. Out-of-range input throws a `ZodError`.

## Infrastructure boundaries

- Rendering and the model run 100 % in the browser. No frames, ticks or parameters are streamed to
  Render, and nothing is written to Render's ephemeral disk.
- The AI tutor is the existing `/api/tutor/v1` endpoint. The lab passes a ready-made message through
  router state; the tutor page puts it in the composer and the learner presses send. The message
  carries a compact JSON summary (parameters, model outputs, prediction, check answer) and asks the
  tutor to explain, not to recalculate or change the numbers. Nothing is sent, and nothing is billed,
  without the learner's own action.

## Database and RLS

Migration: `supabase/migrations/20261126090400_simulation_lab.sql` (additive only).

| Table | Purpose | Access |
|---|---|---|
| `simulations` | catalogue key per registry slug, subject, grades, current version | `authenticated` reads published rows |
| `simulation_attempts` | one row per finished run with a submitted check | owner reads own rows; a teacher reads rows of students in their classes; no direct writes |
| `simulation_assets` | metadata for future GLB/texture/audio files | `authenticated` reads rows of published simulations; writes by the service role only |

RPCs (security definer, `search_path` pinned, `anon` revoked):

- `save_simulation_attempt(slug, version, params, outputs, hypothesis, check_answer, check_correct)`
  takes the user id from `auth.uid()` only, checks the simulation is published, bounds payload size
  (params ≤ 4 KB, outputs ≤ 8 KB) and rate (30 attempts per 10 minutes per user).
- `my_simulation_stats()` returns the caller's attempt count and last attempt per simulation.
- `_me_teacher_of(student)` is the RLS helper around `_teacher_has_student`.

Attempts are deleted with the account (`on delete cascade` from `auth.users`).
The `service_role` key is never used in the frontend.

## Asset licence policy (future GLB pipeline)

The first simulation uses procedural meshes only: no external models, textures or fonts.
When real assets arrive:

- files live in a Supabase Storage bucket `simulation-assets/<slug>/...`, served through the CDN,
  read-only for signed-in users; there is no learner or teacher upload path;
- every file needs a `simulation_assets` row: MIME type (`model/gltf-binary`, WebP/PNG/JPEG, MP3/OGG),
  size ≤ 15 MB, SHA-256, author, source URL and licence (`CC0-1.0`, `CC-BY-4.0` with attribution,
  or `own-work`); rows are added by the service role after a manual licence check;
- models should be Draco/Meshopt compressed GLB, ≤ 2 MB for phones.

## Performance budget

- Lab route chunk (model, UI, 2D map): small; three.js, R3F and drei load only for the 3D scene.
- `dpr` capped at `[1, 1.5]`, `powerPreference: 'low-power'`, no shadows, ≤ 90 instanced herd meshes,
  260 snow points in winter only.
- The render loop stops while the tab is hidden; with `prefers-reduced-motion` the scene renders on
  demand only and the camp jumps instead of travelling.
- Devices with ≤ 2 GB RAM or ≤ 2 CPU cores start in the 2D map; learners can switch with
  "Жеңіл режим (2D)" (stored per device in `localStorage`).
- WebGL missing, a lost context or a scene error switches to the 2D map with a notice.

## Accessibility

- All controls are native buttons, selects and range inputs (keyboard and touch friendly, ≥ 44 px).
- The stage is focusable: `←`/`→` step, `Space` plays/pauses, `Home`/`End` jump.
- The stage has a text description and a polite live region; the chart has a table view.

## Running locally

```powershell
npm install
npx playwright install chromium   # once, for E2E
npm run dev                        # http://localhost:8080/lab (signed in) or /dev/lab/nomad-seasons (dev harness)
npm run typecheck
npm run lint
npm run test                       # Vitest: model, validation, rounding, registry schema, summary
npm run test:e2e                   # Playwright: desktop + mobile, keyboard, 2D fallback, no-WebGL
npm run build
```

`/dev/lab/:slug` exists only in the dev server (`import.meta.env.DEV`): it renders a simulation without
the app shell, sign-in or saving, so E2E tests need no accounts.

## Adding a simulation

1. Add `domain/<slug>/model.ts` (pure, deterministic, zod-validated input) with Vitest tests.
2. Add `domain/<slug>/meta.ts` that satisfies `SimulationMetaSchema`.
3. Add the entry component and renderers, then register `{ meta, load }` in `registry/registry.ts`.
4. Add a `simulations` row with the same slug in a new migration.
