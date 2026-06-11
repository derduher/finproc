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
- **Bond asset class** — `Account.stockAllocation?: number` (0–1, omitted = 100% stocks) blends each account's monthly growth between the stock and bond rate streams. `inputs.bondGrowthMin/Max` is a single global P10–P90 band (`DEFAULT_BOND_BAND` = 2–6% when omitted), not per breakpoint. Historical stress tests replay all three streams (`HISTORICAL_SERIES` carries 10-year Treasury total returns); the band drives the Monte Carlo and years outside the replayed window.
- **Guardrails spending floor** — `ProjectionResult.minSpendMultiplier` (lowest spend level reached per run) and `MonteCarloResult.spendFloorP10` (P10 across runs). ResultsStep shows the floor under the guardrails policy so a "success" that survived by cutting spending is visible.
- **Worker progress events** — `simulate(inputs, onProgress?)` emits `{ stage: 'parse'|'sample'|'project'|'aggregate', done: number, total: number }`. `useSimulation` exposes `progress` to the loading UI. In tests, the direct import path accepts `onProgress = undefined`.

### Simulation internals

- **`SimAccount`** tracks `balance` and `costBasis` separately. Contributions are gated by `contributionEndAge` (clamped to `person.retirementAge` by the projection); withdrawals by `withdrawalStartAge`. Flat contribution amounts and flat employer matches are in today's dollars — indexed by the realized price level. `zero()` is called when the projection flags depletion.
- **`person.retirementAge` is the single retirement definition**: salary stops there, contributions can't outlive the paycheck (`contributionEndAge` is clamped to it), and the solvers/insights bump it via `withRetirementAge` so all gates move together.
- **Rate sampling (`buildRateSchedule`)** has two layers with distinct meanings:
  - **Epistemic (per run)**: the user's P10–P90 band is uncertainty about the *long-run average*; one standardized draw per stream per run shifts the whole run's mean. A pessimistic run is pessimistic in every segment (shared draw, scaled by each segment's sigma).
  - **Market (per year)**: calibrated `ANNUAL_VOLATILITY` (stock 17%, inflation 2.5%, bond 7% — matched to the app's own 1928–2023 series) with AR(1) persistence (`DEFAULT_PERSISTENCE`) and a negative stock↔inflation correlation (`DEFAULT_RATE_CORRELATION`). This is what makes sequence-of-returns risk real; it exists even when the band is a point (min = max).
  - The band reads as CAGR: the arithmetic per-year mean gets `+σ²/2` volatility-drag compensation. Draws are clamped so a tail draw can never reach −100%.
- **`runSingleProjection`** loops month-by-month.
  - **Working-year taxes are progressive**: take-home = salary − pre-tax (traditional) contributions − progressive federal tax (same brackets as the withdrawal phase, in real dollars) − 7.65% FICA on gross. `person.marginalTaxRate`/`ltcgRate` remain in the schema for URL back-compat but the engine no longer reads them.
  - **Surplus take-home is banked**: take-home (plus net SS) above the year's spending is deposited into a taxable account (the same cash sink that receives excess RMDs) and reported as contributions — an under-spender accumulates wealth instead of evaporating it.
  - **Early-withdrawal penalty**: traditional draws before age 60 (integer-year proxy for 59½) pay the extra 10%, including in the gross-up. Roth is modeled penalty-free (basis-first simplification); rule-of-55/72(t) exceptions are not modeled.
  - **SS provisional-income thresholds are fixed nominal** (as in law): the bases are divided by the realized price level, so real SS taxation creeps up under inflation while the brackets stay real-indexed.
  - **RMDs** start at the cohort's age — 73, or 75 for those born 1960+ (`rmdStartAge`, assuming sim start 2026) — using IRS Uniform Lifetime divisors; net proceeds are reinvested in taxable.
  - **Depletion criterion**: depletion only fires when there's an actual unmet need *and* the total portfolio balance can't cover it. A withdrawal lockout (e.g. all accounts have `withdrawalStartAge > currentAge`) is treated as a silent shortfall, not depletion. Once depletion is flagged, all accounts are zeroed for the remainder of the projection (per spec §3.3) — `totalBalance` reads as 0 in every subsequent yearly result.
  - **Float epsilon**: depletion uses `shortfall > 0.01` and `totalAvailable < shortfall - 0.01` to avoid false positives from tax gross-up round-trips.
- **`runMonteCarlo`** uses `mulberry32(seed)` PRNG — same seed, bit-identical results. Insights/sensitivity reuse the seed (common random numbers) and gate claims with `monteCarloDeltaSignificant`.
- **Withdrawal strategies**: `TaxOptimal` (taxable → traditional → Roth), `Proportional`, `UserDefined`.
- **Insight rules** (`src/sim/insights.ts`): pure functions `(inputs, result) → InsightCard[]`. Current rules: tax-strategy delta, healthcare gap (62→65), "retire 1 year later" delta (bumps `person.retirementAge` via `withRetirementAge`).

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
- **RNG draw order matters**: `buildRateSchedule` consumes three epistemic draws (stock, inflation, bond) at the start of each run, then three per-year draws. Changing the order changes every seeded result, so treat additions to the draw sequence as a breaking change for any pinned expectations.
- **The user's market band is NOT per-year volatility**: segment sigmas from P10–P90 are epistemic (long-run average); per-year market noise is the separate `ANNUAL_VOLATILITY` constant. Never feed the band's sigma directly into yearly draws — that reproduces the old bug where a 4–10% band implied an asset that never has a down year.

## Original specification

The original product requirements and implementation plan are preserved in [`docs/retirement-projection-spec.md`](docs/retirement-projection-spec.md). This document describes the intended scope, simulation model, UI requirements, and phased build plan.

**Note:** The implementation has been aligned to the hi-fi design bundle. Known remaining divergences:

| Spec / Old Actual | Current |
|---|---|
| Recharts for charts | Raw SVG components (`HiFanChart`, `HiTornado`, `HiCashflow`) |
| Real/nominal toggle transforms cached values | Nominal values stored; `deflateResult` (`src/sim/displayMode.ts`) converts results to today's dollars at render time in ResultsStep / PreviewRail / MainScreen |
| Scenario comparison overlay | Scenarios saved/loaded via `useScenarios`; "Branch scenario" button in ResultsStep footer; no side-by-side comparison view |
| No worker progress events | `simulate(inputs, onProgress?)` emits 4-stage progress; `useSimulation` surfaces `progress` to `LoadingState` |
| UI components not tested | React Testing Library tests added for non-presentational behavior (responsive layout, interactive charts, insight rules) |

When in doubt, the actual code takes precedence over the spec.
