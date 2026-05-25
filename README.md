# Threadwell — retirement plot

A browser-only Monte Carlo retirement projection tool. Enter your accounts, market assumptions, and spending plan; get P10/P50/P90 portfolio trajectories, a success rate, and a sensitivity tornado showing which levers matter most.

## Quick start

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm test       # run all tests
pnpm build      # production bundle
```

## Architecture

### Data flow

```
URL (?s=…)
  └─ useUrlSync (lz-string decompress)
       └─ Zustand store (inputs)
            └─ useSimulation hook
                 ├─ IDB cache lookup (idb-keyval)
                 │    └─ hit → instant result (no loading flash)
                 └─ miss → simulate() [Web Worker via Comlink]
                       └─ runMonteCarlo (1,000 seeded runs)
                            └─ result → IDB cache + React state
```

### Folder structure

```
src/
  schema/       Zod schemas + branded types (Money, AgeYears)
  math/         Pure functions: compounding, PRNG, percentile, tax, RMD
  sim/          Account state machine, projection, Monte Carlo, sensitivity
  worker/       Web Worker entry + Comlink interface
  storage/      IDB cache (hash-keyed), URL state (lz-string)
  hooks/        useSimulation, useScenarios, useUrlSync
  ui/
    frame/      TopBar, StepRail, Frame (layout shell)
    steps/      6 wizard steps (Person → Results)
    charts/     HiFanChart, HiTornado (raw SVG, no Recharts)
    results/    ResultsStep, metric cards, stale badge
    mobile/     MobileChrome
    loading/    LoadingState, Spinner, StaleBadge
    shared/     Field, NumInput, Seg (segmented control)
  store.ts      Zustand store (inputs + UI state)
  App.tsx       Root: URL sync, step routing, mobile detection
```

### Simulation model

**Monte Carlo (1,000 runs)**
- Rates sampled once per breakpoint segment per run using mulberry32 PRNG
- Box-Muller transform converts P10/P90 market range to a normal distribution
- Per-run: `runSingleProjection` → year-end balances, depletion flag
- Aggregation: percentile(balances, 10/50/90) per year

**Account state machine** (`src/sim/account.ts`)
- Tracks balance + cost basis separately for taxable accounts
- Contribution phases gated by age; RMD floor applied at 73+ (IRS Uniform Lifetime Table)
- Mid-month contribution convention (half-month growth first month)

**Withdrawal strategies**
- `TaxOptimal`: taxable → traditional → Roth (minimises tax drag)
- `Proportional`: proportional draw across all accounts
- `UserDefined`: user-specified priority order

**Simplifications** (surfaced in UI as info tooltips)
- Flat marginal tax rate throughout (no bracket phaseouts, no AMT)
- One MC draw per breakpoint segment (not per-year)
- No Roth conversions modeled
- Inflation applied uniformly (no category-specific rates)

### IDB caching

`useSimulation` checks the IndexedDB cache before spawning a worker run. Cache key = djb2 hash of stable-sorted JSON of `SimulationInputs`. On cache hit, result is returned synchronously (no loading spinner). On miss, result is computed and stored. When inputs change, the previous result is shown with a `stale` dimming overlay while the new run completes.

### URL sharing

`compressToEncodedURIComponent` (lz-string) encodes `SimulationInputs` to a URL-safe string stored in `?s=`. Decompression validates through the Zod schema; invalid/missing params fall back to default inputs. URLs stay under 8,000 characters for all realistic inputs.

## Testing

```bash
pnpm test              # all tests (watch mode)
pnpm test --run        # one-shot run
pnpm test --run --coverage   # with coverage report
```

Coverage is measured for `src/{math,schema,sim,storage,hooks,store.ts}` (pure logic). UI components are excluded from the 90% threshold — they are exercised by integration/smoke tests.

| Module         | Tests                                                    |
| -------------- | -------------------------------------------------------- |
| `math/`        | Known-answer + fast-check property tests                 |
| `schema/`      | Zod validation, brand type checks                        |
| `sim/account`  | FV formula, basis tracking, RMD floor, phase gating      |
| `sim/projection` | Annuity, drain date, SS COLA, strategy order           |
| `sim/montecarlo` | Seed determinism, percentile ordering, memory budget   |
| `sim/sensitivity` | OAT ±20%, sort order, direction of effect            |
| `storage/`     | Cache key determinism, URL round-trip, lz-string         |
| `hooks/`       | useSimulation (cache hit/miss/stale), useUrlSync, useScenarios |
| `test/integration` | Full pipeline: URL → state → simulation → cache    |

## Design system

CSS variables in `src/ui/tokens.css` + component classes in `src/ui/styles.css`.

**Aesthetic**: warm (ochre `#b8753a` on cream `#faf7f1`, default) · cool · mono

**Fonts**: Newsreader (display) · Geist (body) · Geist Mono (numbers, `.num` class)

**Charts**: All charts are raw SVG React components — no Recharts. `HiFanChart` renders the P10/P50/P90 fan with dashed band borders. `HiTornado` renders centered horizontal bars sorted by absolute impact.

## CI

GitHub Actions: `pnpm install && pnpm lint && pnpm test --run --coverage && pnpm build`

## Decision log

| Decision | Reason |
| --- | --- |
| No Recharts | Pixel-perfect SVG fidelity with the hi-fi design; no charting-library CSS conflicts |
| React Compiler | Automatic memoisation; avoids manual `useMemo`/`useCallback` spread |
| mulberry32 PRNG | Zero-dependency, deterministic, fast; Mersenne Twister would be overkill |
| djb2 for cache key | Non-cryptographic, zero-dependency, plenty of distribution for this use case |
| lz-string for URL | Compact, URL-safe, browser-native; ~60% smaller than raw JSON |
| Flat tax rate | Accurate progressive modeling would require annual income reconstruction — out of scope |
| One MC draw per segment | Per-year rate draws would require refactoring projection loop; segment-level draws are documented simplification |
