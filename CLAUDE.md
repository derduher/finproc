# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Always prefix commands with `export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 24` — the project requires Node v24.**

```bash
pnpm dev              # dev server on :5173
pnpm build            # tsc -b && vite build
pnpm lint             # eslint .
pnpm test             # vitest run (one-shot)
pnpm test:watch       # vitest (watch mode)
pnpm test:coverage    # vitest run --coverage
pnpm typecheck        # tsc --noEmit

# Run a single test file
pnpm test src/sim/montecarlo.test.ts

# Run tests matching a name pattern
pnpm test --run -t "seed determinism"
```

## Architecture

### Data flow

```
URL (?s=… &u=…)
  └─ useUrlSync (lz-string decompress → Zod validate)
       ├─ inputs state (scenario name, accounts, markets segments, expenses, strategy)
       └─ ui state (aesthetic, theme, density, displayMode)
            └─ useSimulation hook
                 ├─ IDB cache lookup (idb-keyval, djb2 hash key)
                 │    └─ hit → instant result, stale=false
                 └─ miss → simulate() via worker/simulator.ts
                       └─ runMonteCarlo → IDB cache → React state
                             └─ progress events: parse → sample → project → aggregate
```

### Layer responsibilities

| Layer | Files | Role |
|---|---|---|
| Schema | `src/schema/index.ts` | Zod schemas, branded types (`Money`, `AgeYears`), `defaultInputs()` |
| Math | `src/math/index.ts` | Pure functions: PRNG (mulberry32), Box-Muller, percentile, RMD table, tax gross-up, format |
| Simulation | `src/sim/` | `account.ts` (SimAccount class) → `projection.ts` (single run) → `montecarlo.ts` (1,000 runs) → `sensitivity.ts` (OAT ±20%) → `cashflow.ts` (aggregated series) → `insights.ts` (rule-based cards) |
| Worker | `src/worker/simulator.ts` | Comlink `expose({ simulate })` — also imported directly in tests (no actual Worker). Emits `ProgressEvent` via `onProgress` callback. |
| Storage | `src/storage/` | `cache.ts` (IDB via idb-keyval), `urlState.ts` (lz-string compress/decompress for both inputs and ui prefs) |
| Hooks | `src/hooks/` | `useSimulation` (cache-first, exposes `progress`), `useUrlSync` (500ms debounce), `useScenarios` (IDB, max 4) |
| State | `src/store.ts` | Zustand store: `inputs`, `ui.{activeStep, displayMode, aesthetic, theme, density, lastCommittedAt}`. Actions: `patchInputs`, `patchPerson`, `setActiveStep`, `setAesthetic`, `setTheme`, `setDensity` |
| UI | `src/ui/` | Steps 0–5, charts (raw SVG), frame chrome (TopBar, StepRail, PreviewRail, MobileHeader), loading states |

### Schema additions (hi-fi alignment)

- **`scenarioName`** — `inputs.scenarioName: string` defaults to `"Baseline plan"`. Shown in TopBar chip.
- **Employer match** — `Account.employerMatch?: { type: 'flat', annualAmount } | { type: 'percent', matchPercent, upToPercent }`. Affects `SimAccount` balance monthly, gated by `contributionEndAge`.
- **Contribution mode + frequency** — `Account.contributionType: 'flat'|'percent'` and `Account.contributionFrequency: 'weekly'|'semi-monthly'|'monthly'`. Converted to monthly internally.
- **Multi-segment breakpoints** — `inputs.segments: Array<{ startAge, stockGrowthMin, stockGrowthMax, inflationMin, inflationMax }>`. Replaces the old single-segment fields. Default: one segment from `currentAge`. `runMonteCarlo` picks the segment whose `startAge ≤ age < nextStartAge`.
- **Cost basis** — `Account.costBasis?: number`. Optional initial cost-basis for taxable accounts.
- **Aggregated cashflow series** — `MonteCarloResult.yearlyResults` rows include `contributionsMedian`, `socialSecurityMedian`, `withdrawalsMedian` (median across runs). Used by `HiCashflow`.
- **Worker progress events** — `simulate(inputs, onProgress?)` emits `{ stage: 'parse'|'sample'|'project'|'aggregate', done: number, total: number }`. `useSimulation` exposes `progress` to the loading UI. In tests, the direct import path accepts `onProgress = undefined`.

### Simulation internals

- **`SimAccount`** tracks `balance` and `costBasis` separately. Contributions are gated by `contributionEndAge`; withdrawals by `withdrawalStartAge`. RMDs apply at age 73+ using IRS Uniform Lifetime divisors. `zero()` is called when the projection flags depletion.
- **`runSingleProjection`** loops month-by-month.
  - **Pre-retirement salary covers expenses**: while `currentAge < max(contributionEndAge)`, the simulation subtracts `salary × (1 - marginalRate) - contributions` from `netNeed`. Without this, a working person with locked retirement accounts would be falsely flagged depleted on day one.
  - **Depletion criterion**: depletion only fires when there's an actual unmet need *and* the total portfolio balance can't cover it. A withdrawal lockout (e.g. all accounts have `withdrawalStartAge > currentAge`) is treated as a silent shortfall, not depletion. Once depletion is flagged, all accounts are zeroed for the remainder of the projection (per spec §3.3) — `totalBalance` reads as 0 in every subsequent yearly result.
  - **Float epsilon**: depletion uses `shortfall > 0.01` and `totalAvailable < shortfall - 0.01` to avoid false positives from tax gross-up round-trips.
- **`runMonteCarlo`** uses `mulberry32(seed)` PRNG; draws rates once per breakpoint segment per run via Box-Muller. A single-segment input starting at `currentAge` produces identical results to the old single-draw path (determinism pin).
- **Withdrawal strategies**: `TaxOptimal` (taxable → traditional → Roth), `Proportional`, `UserDefined`.
- **Insight rules** (`src/sim/insights.ts`): pure functions `(inputs, result) → InsightCard[]`. Current rules: tax-strategy delta, healthcare gap (62→65), "retire 1 year later" delta.

### UI shell (responsive)

- `Frame.tsx` renders TopBar + StepRail (left, 240px) + main area + PreviewRail (right, 296px) + MobileHeader.
- CSS classes `shell-desktop-only` / `shell-mobile-only` toggle visibility at `@media (max-width: 768px)`. **No JS resize listener.**
- `isMobile()` (`src/ui/shared/isMobile.ts`) reads `window.matchMedia('(max-width: 768px)').matches` once at render time — used for inline responsive style props (PipeEditor flex-direction, metrics grid columns).
- Design tokens: three aesthetics (`warm` / `cool` / `mono`) × two themes (`light` / `dark`) via `data-aesthetic` / `data-theme` attributes on the root `.hf` element.
- Density: `data-density="comfortable|compact"` on root `.hf`.
- Animations: `.flow-dash` and `.flow-pulse` are disabled under `@media (prefers-reduced-motion: reduce)`.

### Key constraints / gotchas

- **React Compiler** (`babel-plugin-react-compiler`) is active — do not add `useMemo`/`useCallback` manually. The compiler handles memoisation.
- **No Recharts** — all charts (`HiFanChart`, `HiTornado`, `HiCashflow`) are hand-rolled SVG React components in `src/ui/charts/`.
- **Coverage threshold**: 90% stmt/func/line, 89% branch — measured only for `src/{math,schema,sim,storage,hooks,store.ts}`. UI components are excluded.
- **`simulate` in tests**: `src/worker/simulator.ts` exports `simulate` as a plain async function. Tests mock it with `vi.mock('../worker/simulator')` — no actual Worker is spawned.
- **One RNG draw per segment per run**: `runMonteCarlo` draws rates for each segment at the start of each run via Box-Muller, consuming deterministic draws even for future segments. This preserves the determinism pin test.

## Original specification

The original product requirements and implementation plan are preserved in [`docs/retirement-projection-spec.md`](docs/retirement-projection-spec.md). This document describes the intended scope, simulation model, UI requirements, and phased build plan.

**Note:** The implementation has been aligned to the hi-fi design bundle. Known remaining divergences:

| Spec / Old Actual | Current |
|---|---|
| Recharts for charts | Raw SVG components (`HiFanChart`, `HiTornado`, `HiCashflow`) |
| Real/nominal toggle transforms cached values | Nominal values stored; `displayMode` toggle is wired to chart labels but chart paths remain nominal |
| Scenario comparison overlay | Scenarios saved/loaded via `useScenarios`; "Branch scenario" button in ResultsStep footer; no side-by-side comparison view |
| No worker progress events | `simulate(inputs, onProgress?)` emits 4-stage progress; `useSimulation` surfaces `progress` to `LoadingState` |
| UI components not tested | React Testing Library tests added for non-presentational behavior (responsive layout, interactive charts, insight rules) |

When in doubt, the actual code takes precedence over the spec.
