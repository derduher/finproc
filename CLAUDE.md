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
URL (?s=…)
  └─ useUrlSync (lz-string decompress → Zod validate)
       └─ Zustand store (inputs + ui state)
            └─ useSimulation hook
                 ├─ IDB cache lookup (idb-keyval, djb2 hash key)
                 │    └─ hit → instant result, stale=false
                 └─ miss → simulate() via worker/simulator.ts
                       └─ runMonteCarlo → IDB cache → React state
```

### Layer responsibilities

| Layer | Files | Role |
|---|---|---|
| Schema | `src/schema/index.ts` | Zod schemas, branded types (`Money`, `AgeYears`), `defaultInputs()` |
| Math | `src/math/index.ts` | Pure functions: PRNG (mulberry32), Box-Muller, percentile, RMD table, tax gross-up, format |
| Simulation | `src/sim/` | `account.ts` (SimAccount class) → `projection.ts` (single run) → `montecarlo.ts` (1,000 runs) → `sensitivity.ts` (OAT ±20%) |
| Worker | `src/worker/simulator.ts` | Comlink `expose({ simulate })` — also imported directly in tests (no actual Worker) |
| Storage | `src/storage/` | `cache.ts` (IDB via idb-keyval), `urlState.ts` (lz-string compress/decompress) |
| Hooks | `src/hooks/` | `useSimulation` (cache-first), `useUrlSync` (500ms debounce), `useScenarios` (IDB, max 4) |
| State | `src/store.ts` | Zustand store: `inputs`, `ui.activeStep`, `ui.displayMode`. Actions: `patchInputs`, `patchPerson`, `setActiveStep` |
| UI | `src/ui/` | Steps 0–5, charts (raw SVG), frame chrome, mobile, loading states |

### Simulation internals

- **`SimAccount`** tracks `balance` and `costBasis` separately. Contributions are gated by `contributionEndAge`; withdrawals by `withdrawalStartAge`. RMDs apply at age 73+ using IRS Uniform Lifetime divisors. `zero()` is called when the projection flags depletion.
- **`runSingleProjection`** loops month-by-month.
  - **Pre-retirement salary covers expenses**: while `currentAge < max(contributionEndAge)`, the simulation subtracts `salary × (1 - marginalRate) - contributions` from `netNeed`. Without this, a working person with locked retirement accounts would be falsely flagged depleted on day one.
  - **Depletion criterion**: depletion only fires when there's an actual unmet need *and* the total portfolio balance can't cover it. A withdrawal lockout (e.g. all accounts have `withdrawalStartAge > currentAge`) is treated as a silent shortfall, not depletion. Once depletion is flagged, all accounts are zeroed for the remainder of the projection (per spec §3.3) — `totalBalance` reads as 0 in every subsequent yearly result.
  - **Float epsilon**: depletion uses `shortfall > 0.01` and `totalAvailable < shortfall - 0.01` to avoid false positives from tax gross-up round-trips.
- **`runMonteCarlo`** uses `mulberry32(seed)` PRNG; draws rates once per breakpoint segment per run via Box-Muller. Breakpoint segments consume RNG draws for determinism even when not fully implemented per-year.
- **Withdrawal strategies**: `TaxOptimal` (taxable → traditional → Roth), `Proportional`, `UserDefined`.

### Key constraints / gotchas

- **React Compiler** (`babel-plugin-react-compiler`) is active — do not add `useMemo`/`useCallback` manually. The compiler handles memoisation.
- **No Recharts** — all charts (`HiFanChart`, `HiTornado`) are hand-rolled SVG React components in `src/ui/charts/`.
- **Coverage threshold**: 90% stmt/func/line, 89% branch — measured only for `src/{math,schema,sim,storage,hooks,store.ts}`. UI components are excluded.
- **`simulate` in tests**: `src/worker/simulator.ts` exports `simulate` as a plain async function. Tests mock it with `vi.mock('../worker/simulator')` — no actual Worker is spawned.

## Original specification

The original product requirements and implementation plan are preserved in [`docs/retirement-projection-spec.md`](docs/retirement-projection-spec.md). This document describes the intended scope, simulation model, UI requirements, and phased build plan.

**Note:** Several details differ from what was actually built. Known divergences:

| Spec | Actual |
|---|---|
| Recharts for charts | Raw SVG components (`HiFanChart`, `HiTornado`) |
| `/url` folder for URL sync | `src/hooks/useUrlSync.ts` + `src/storage/urlState.ts` |
| Real/nominal toggle transforms cached values | Nominal values stored; real display not yet wired to chart |
| Scenario comparison overlay | Scenarios saved/loaded via `useScenarios` but no comparison view |
| Worker progress events | Not implemented; single resolved promise |
| RTL tests for UI components | UI components not unit-tested (excluded from coverage) |

When in doubt, the actual code takes precedence over the spec.
