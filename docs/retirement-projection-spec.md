# Retirement Projection Tool — Requirements & Implementation Plan

> Handoff document for Claude Code. This combines the locked product requirements and the tests-first implementation plan.

---

# Part 1: Requirements

## 1. Scope and constraints

- Single-page web application, browser-only
- USD only
- All input state shareable via compressed query parameters
- Computed projections cached in IndexedDB
- Mobile-first responsive design
- Spouse/joint planning deferred to v2
- No PDF/print export in v1

## 2. Inputs

### 2.1 Person

- Current age
- `MAX_AGE` (configurable; default 95)
- Annual salary (current year dollars)
- Salary growth rate (default: equal to inflation)
- Marginal income tax rate (used for traditional withdrawals)
- Long-term capital gains rate (assumed for taxable account gains)

### 2.2 Accounts (one or more)

Each account has:
- Name (free text)
- Type: `taxable`, `traditional` (401k/IRA), `roth`
- Initial balance
- Initial cost basis (taxable only; defaults to initial balance)
- Contribution: either flat dollar amount **or** percent of salary
- Contribution frequency: weekly, semi-monthly, monthly
- Contribution end age (when contributions stop for this account)
- Withdrawal start age (when account becomes eligible for drawdown)
- Employer match (traditional 401k only): either
  - Percent match up to percent of salary (e.g., "100% match up to 6% of salary"), OR
  - Flat annual dollar amount

A non-blocking note displays IRS contribution limits; enforcement is left to the user.

### 2.3 Growth and inflation breakpoints

- Initial stock growth rate (annual, nominal) — min and max
- Initial inflation rate (annual) — min and max
- Zero or more breakpoints, each with: starting age, new stock growth (min/max), new inflation (min/max)
- Breakpoint semantics: "starting at age N" — new rates apply from the start of that age-year through the next breakpoint or `MAX_AGE`

### 2.4 Expenses

- Annual expense amount (current year dollars; inflation-adjusted forward)
- Social Security: annual amount in today's dollars, claiming age, auto-applies COLA at the prevailing inflation rate
- One-time expenses (zero or more), each with:
  - Date (calendar year or age)
  - Amount (present dollars; inflated to event date)
  - Optional recurring follow-on amount (present dollars, annual, inflated from event date forward — e.g., mortgage payments after a house purchase)

### 2.5 Strategy

Withdrawal strategy (single select):
1. **Tax-optimal**: taxable → traditional → roth
2. **Proportional**: drawn proportionally from all eligible accounts
3. **User-defined order**: explicit priority list

### 2.6 Default values

- Stock growth: 7% nominal (4% / 10% as MC P10/P90)
- Inflation: 3% (2% / 4% as MC P10/P90)
- Safe withdrawal reference: 4% (informational; not enforced)
- `MAX_AGE`: 95

## 3. Simulation model

### 3.1 Compounding and contributions

- Monthly compounding from an annual input rate using the standard conversion: `monthly_rate = (1 + annual)^(1/12) - 1`
- Mid-month contribution convention: contributions accumulated within a month are applied at month 15 (half-month of growth that month)
- Weekly contributions aggregate as ~4.33/month; semi-monthly as 2/month

### 3.2 Phases

Per-account contribution end age and withdrawal start age replace the global "inflection point" concept. An account may be in contribution, holding (between end and start), or withdrawal phase independently of others.

### 3.3 Withdrawal logic

Each year, required cash outflow = (inflated annual expenses + active one-time expenses + active recurring follow-ons) − Social Security (if claimed).

Withdrawals are sourced according to the selected strategy, only from accounts past their withdrawal start age. Each withdrawal type incurs tax:
- Traditional: gross-up by `1 / (1 - marginal_rate)` to net the required cash
- Roth: no tax
- Taxable: realize gains proportionally. Cost basis tracked at aggregate level. Realized gain per dollar withdrawn = `(balance - basis) / balance`. Tax = realized gain × LTCG rate. Gross-up the withdrawal to net the required cash.

Balances floor at zero. If combined portfolio reaches zero before `MAX_AGE`, the run is marked **failed** and the portfolio remains at zero for the remainder of the projection.

### 3.4 RMDs

Starting at age 73, traditional accounts have a minimum forced withdrawal each year using IRS Uniform Lifetime Table divisors. RMD applies as a floor on traditional withdrawals — if the chosen strategy already withdraws more from traditional that year, no additional action; otherwise, the shortfall is withdrawn from traditional and added to that year's cash (or, if expenses are already covered, moved to a taxable bucket with cost basis equal to amount moved).

### 3.5 Monte Carlo

- 1,000 runs per projection
- Each run samples stock growth and inflation independently from a normal distribution per active breakpoint segment, with min/max interpreted as the 10th/90th percentiles (σ derived accordingly)
- Sampling is per-segment, not per-year (one draw per breakpoint window per run); documented as a deliberate simplification
- Seeded PRNG (`mulberry32`); seed is part of the cache key
- Run executes in a Web Worker to keep UI responsive
- Outputs P10, P50, P90 of combined portfolio value per year

### 3.6 Success rate

A run "succeeds" if the combined portfolio never hits zero before `MAX_AGE`. Success rate = (successful runs / total runs) × 100%.

### 3.7 Sensitivity analysis

One-at-a-time (OAT) method. Each varied input is perturbed ±20% holding others at baseline; success rate delta is recorded. Inputs varied:
- Stock growth (initial segment)
- Inflation (initial segment)
- Total annual contribution amount (across all accounts)
- Retirement age (proxied as average contribution end age)
- Annual expenses
- Marginal tax rate (optional toggle)

Results displayed as a tornado chart sorted by absolute impact.

## 4. Output

### 4.1 Primary chart

Line plot, X-axis = year (with current age annotation), Y-axis = combined portfolio value. Three series: P10, P50, P90 of Monte Carlo runs. P10–P90 rendered as a shaded band, P50 as a solid line.

Real-vs-nominal toggle transforms the displayed values using cumulative inflation along the median path; the underlying cached results are stored in nominal terms only.

If the portfolio hits zero, a separate "shortfall" series shows annual unmet expenses (expenses − Social Security) from that point forward.

### 4.2 Headline metrics

- Success rate (%)
- Median ending balance (toggle real/nominal)
- P10 ending balance
- Age at portfolio depletion (if any, median across failing runs)

### 4.3 Sensitivity tornado chart

Horizontal bar chart, one bar per input, length proportional to impact on success rate. Sorted descending by absolute impact.

### 4.4 What-if comparison

Up to 4 independent saved scenarios, each a full snapshot of inputs. Comparison view overlays P50 lines and shows a metrics table.

### 4.5 Number formatting

Abbreviated currency:
- `< $1,000` → `$X` (no decimals)
- `< $1,000,000` → `$X.XK` (one decimal)
- `< $1,000,000,000` → `$X.XM` (one decimal)
- `≥ $1,000,000,000` → `$X.XB` (one decimal)

Use `Intl.NumberFormat` as base; apply custom abbreviation layer.

## 5. Persistence

### 5.1 Inputs — query parameters

Inputs serialized to JSON, compressed (LZ-string `compressToEncodedURIComponent`), placed in a single query param. When the URL exceeds ~8000 chars, surface a non-blocking warning that the link is not shareable; offer "copy as JSON" as a fallback export.

### 5.2 Outputs — IndexedDB

Cache key = hash of all inputs that affect the simulation (excludes display-only state like real/nominal toggle). Cached value: full nominal Monte Carlo result set (P10/P50/P90 series, success rate, per-run end states for sensitivity reuse). Display transforms (real/nominal) computed on the fly.

What-if scenarios stored in IndexedDB by user-assigned name.

## 6. Documented simplifications

These are deliberate v1 limitations to surface in the UI or docs:

- Stock growth and inflation are sampled independently in Monte Carlo (historically correlated)
- One Monte Carlo draw per breakpoint segment per run, not per year
- Taxable cost basis tracked at aggregate level, not per lot
- Traditional contributions do not reduce current-year taxable income in the model
- IRS contribution limits not enforced
- Single filer assumptions for tax rates (joint deferred to v2)
- Tax brackets not modeled — flat marginal rate applied to all traditional withdrawals
- Social Security taxation not modeled (treated as fully tax-free)
- State taxes not modeled
- Healthcare costs (Medicare, ACA gap pre-65) not separately modeled — user must include in expenses
- Money represented as JavaScript float64 with rounding at display/persistence boundaries

## 7. Out of scope for v1

Spouse/joint planning, dynamic tax-bracket-aware withdrawal optimization, Roth conversion modeling, healthcare cost modules, real estate as asset (only as expense), inheritance/legacy planning, HSA accounts, pension income, per-lot capital gains tracking, PDF/print export.

---

# Part 2: Technical Decisions

## Stack

- **Build**: Vite + React + TypeScript (strict mode)
- **Styling**: Tailwind CSS (mobile-first)
- **State**: Zustand
- **Validation**: Zod (runtime + TS type inference)
- **Charts**: Recharts
- **Worker**: Vite native worker imports + Comlink
- **IndexedDB wrapper**: idb-keyval
- **URL compression**: lz-string
- **PRNG**: mulberry32 (inline) — seeded for reproducibility
- **Testing**: Vitest + React Testing Library + fast-check (property-based)
- **Lint/format**: ESLint + Prettier
- **Package manager**: pnpm
- **CI**: GitHub Actions

## Architecture conventions

- **Money**: JavaScript `number` (float64) with explicit rounding at display and persistence boundaries. Documented precision policy.
- **Time**: absolute month index from simulation start as primary; calendar year and age derived for display. Horizon = `(MAX_AGE - currentAge) × 12` months.
- **Determinism**: Monte Carlo seed is part of cache key. Same inputs + same seed = bit-identical output.
- **Per-year recording**: simulation runs monthly but records only year-end balances for output (memory budget: 1000 runs × 70 years × 8 bytes ≈ 560KB).
- **Worker message contract** (via Comlink): main thread calls `worker.simulate(inputs)`; worker streams progress events and returns final `SimulationResult`.
- **Branded types**: `Money`, `AgeYears`, `MonthIndex` to prevent unit confusion at TS level.
- **Error philosophy**: fail-loud at form level (toast/inline errors), fail-silent in worker (graceful degradation, error surfaced as state).

## Performance targets

- Deterministic single projection (no MC): < 50ms
- Full Monte Carlo (1000 runs): < 3s mid-range laptop, < 8s mobile (browser emulation)
- Sensitivity analysis (12 perturbation runs): < 30s with cache reuse
- Initial bundle: < 500KB gzipped

## Quality targets

- Test coverage: ≥ 90%
- WCAG AA accessibility
- Browser support: last 2 versions of evergreen browsers (Chrome, Firefox, Safari, Edge)
- Mobile testing via browser devtools emulation

## Folder structure

```
/src
  /schema      — Zod schemas, branded types
  /math        — pure math functions (compounding, tax, RMD, percentile, PRNG)
  /sim         — simulation orchestration (Account, runSingleProjection, runMonteCarlo, runSensitivity)
  /worker      — Web Worker entry, Comlink interface
  /storage     — IndexedDB cache, URL state
  /url         — query-param sync hook
  /hooks       — useSimulation, useScenarios, useUrlSync
  /ui          — React components
  /test        — shared test utilities, fixtures
```

---

# Part 3: Implementation Plan (Tests-First)

Every phase except Phase 0 is tests-first. Tests are written and failing before implementation begins. Coverage target ≥ 90% enforced in CI.

## Phase 0: Project scaffolding

No tests yet — get the skeleton running.

- Vite + React + TS project initialized, strict mode on
- Tailwind configured with mobile-first defaults
- ESLint + Prettier configured
- Vitest + RTL configured; sample test passes
- Folder structure created per above
- All dependencies installed
- GitHub Actions CI: runs `pnpm install`, `pnpm lint`, `pnpm test --coverage`, `pnpm build` on push and PR
- Coverage threshold ≥ 90% enforced in `vitest.config.ts`

**Exit criteria:** `pnpm test`, `pnpm dev`, `pnpm build`, and CI all pass on initial commit.

## Phase 1: Schema and types

**Tests first:**
- Zod schemas validate good inputs, reject bad ones (negative ages, withdrawal start before contribution end, breakpoints out of order, percent values outside 0–100, min > max on growth/inflation)
- Type inference produces expected TS types
- Default-fill function returns valid schema instance
- Branded types prevent cross-unit assignment at compile time (verified via type-test files)

**Implementation:**
- `Person`, `Account`, `Breakpoint`, `OneTimeExpense`, `SimulationInputs`, `SimulationResult` schemas
- Default values codified
- Branded types `Money`, `AgeYears`, `MonthIndex`

## Phase 2: Pure math layer

**Tests first:**
- `annualToMonthlyRate`: 12% annual → 0.9489% monthly (within ε), edge cases at 0% and negative rates
- `inflate(amount, fromYear, toYear, rate)`: round-trips with deflate
- `formatMoneyAbbreviated`: 999 → "$999", 1500 → "$1.5K", 1_234_567 → "$1.2M", 1_500_000_000 → "$1.5B"
- `boxMullerNormal(mean, sigma, rng)`: 10k samples have mean within 2% of input, sigma within 5%
- `percentile(values, p)`: known sorted inputs return exact percentile
- `mulberry32(seed)`: same seed produces same sequence; different seeds diverge
- `rmdDivisor(age)`: returns IRS Uniform Lifetime Table values for ages 73–120
- `taxableWithdrawalGrossUp(netNeeded, balance, basis, ltcgRate)`: net delivered matches `netNeeded`
- `traditionalWithdrawalGrossUp(netNeeded, marginalRate)`: same invariant
- Property test (fast-check): gross-up then apply tax = original net

**Implementation:** pure functions matching test contracts.

## Phase 3: Account state machine

**Tests first:**
- Apply monthly growth: balance over N months matches FV formula
- Mid-month contribution: contribution gets half a month of growth in its first month
- Multi-frequency contribution: weekly (4.33/mo), semi-monthly (2/mo), monthly (1/mo) aggregate correctly
- Cost basis tracking: contributions add to basis 1:1, growth does not, proportional withdrawal reduces basis correctly
- Employer match percent-of-salary: "100% up to 6%" on $100K salary = $6K/yr, applied monthly
- Employer match flat: distributed monthly
- Contribution phase ends at `contributionEndAge`
- Withdrawal locked before `withdrawalStartAge`
- Balance floors at 0; over-withdrawal returns actual withdrawn
- Property test: balance is monotonically non-decreasing during pure contribution phase with positive growth

**Implementation:** `Account` reducer with `applyMonth`, `contribute`, `withdraw`, `getBalance`, `getBasis`.

## Phase 4: Simulation orchestration

**Tests first (known-answer scenarios):**
- Zero growth, zero inflation, $1000/mo, 10 years, no withdrawals → $120,000 exactly
- Single Roth, 7% nominal growth, $500/mo for 30 years → matches FV annuity formula within rounding
- Single traditional, 25% marginal, $40K/yr net need → $53,333 gross withdrawn
- Portfolio drains in known year given high expense / low balance
- RMD floor: traditional at age 73, $1M balance, no other withdrawal need → $36,496 forced withdrawal (1M / 27.4)
- Tax-optimal strategy drains taxable before traditional before Roth
- Proportional strategy draws match account balance ratios
- One-time expense at age 50, $50K present dollars, 3% inflation → inflated amount at correct month
- Recurring follow-on applies from event date forward, inflation-adjusted
- Social Security starts at claim age with COLA
- Breakpoint at age 65 changes growth rate for subsequent months
- User-defined withdrawal order respected when accounts have funds

**Implementation:** `runSingleProjection(inputs, sampledRates, seed)` deterministic function returning yearly endpoint balances and success flag.

## Phase 5: Monte Carlo

**Tests first:**
- 1000 runs with same seed → identical output bit-for-bit
- 1000 runs with sigma=0 → all runs identical; P10=P50=P90
- Normal sampling per segment: median run growth ≈ mean of input distribution
- Percentile aggregation: P50 of 1000 runs at each year matches independent calculation
- Success rate = (runs where balance never hits 0) / total runs
- Memory: result object < 1MB for 1000 runs × 70 years

**Implementation:** `runMonteCarlo(inputs, runCount=1000, baseSeed)` returning `{ p10, p50, p90, successRate, perRunEndStates }`.

## Phase 6: Worker boundary

**Tests first (with mocked worker where appropriate):**
- Comlink wrapper: `worker.simulate(inputs)` returns expected result
- Progress events fire during run
- Cancellation: starting a new run cancels in-flight prior run
- Errors in worker propagate as rejected promises with structured error info

**Implementation:** Vite-native `?worker` import, Comlink-exposed simulator, main-thread `useSimulation` hook.

## Phase 7: Storage layer

**Tests first — IndexedDB cache:**
- Cache key derivation: same simulation inputs → same hash
- Different inputs → different hash
- Display-only state (real/nominal toggle) doesn't affect hash
- Get/set round-trip preserves data
- Cache miss returns null

**Tests first — URL state:**
- Round-trip: serialize then deserialize returns original input
- Compression: representative 5KB JSON → < 2KB encoded
- URL length check: `isShareable()` returns correct boolean
- Malformed query param: returns default state, doesn't throw

**Implementation:** `cache.ts` (idb-keyval), `urlState.ts` (lz-string compress/decompress + length check).

## Phase 8: Sensitivity analysis

**Tests first:**
- Perturb single input ±20%, baseline unchanged
- OAT runs reuse base MC where possible (baseline cached)
- Output sorted by absolute impact descending
- Zero-sensitivity input → ~0 impact

**Implementation:** `runSensitivity(inputs)` orchestrating 12 perturbation runs, returning tornado chart data.

## Phase 9: State management

**Tests first:**
- Zustand store: mutations update state correctly
- Selectors return memoized values
- URL sync hook: state change updates query param (debounced 500ms in real usage; tests use immediate)
- URL sync hook: initial load reads query param into state
- Scenario save/load: round-trips correctly through IndexedDB
- Max 4 scenarios enforced

**Implementation:** Zustand store, `useUrlSync`, `useScenarios`, `useSimulation` hooks.

## Phase 10: UI components

**Tests first (RTL):**
- `<PersonInputs />`: renders, accepts input, validates, calls store
- `<AccountList />`: add/remove/edit; account-type fields conditionally render
- `<BreakpointEditor />`: enforces ordering, min ≤ max
- `<OneTimeExpenseList />`: add/remove, optional recurring follow-on toggle
- `<WithdrawalStrategyPicker />`: three options; user-defined shows priority list
- `<ProjectionChart />`: renders Recharts with mock data; real/nominal toggle transforms displayed values
- `<HeadlineMetrics />`: displays success rate, median ending balance, abbreviated correctly
- `<SensitivityChart />`: tornado chart bars sorted by impact
- `<ScenarioDrawer />`: save/load/compare, max 4 enforced
- `<ShareLink />`: copy works, warns when URL too long
- Mobile layout (browser devtools emulation): stacked single column at default viewport, sidebar+main at `lg`

**Implementation:** components with mobile-first Tailwind, WCAG AA color contrast, ARIA labels, keyboard nav.

## Phase 11: Integration

**Tests first (full app rendered):**
- Enter inputs → projection appears (use shortened horizon in tests for speed)
- Toggle real/nominal → values change, no recomputation (cache hit verified)
- Change input → projection recomputes
- Save scenario → appears in drawer; load scenario → inputs restored
- Share link → URL contains compressed state → loading URL restores state
- Invalid input → form shows error, projection not triggered
- Worker error → error surfaced to UI, app remains usable

## Phase 12: Polish

- Loading states during computation
- Empty states (no accounts, no projection yet)
- Stale-result indicator while recomputing
- Accessibility audit (WCAG AA): focus order, ARIA labels, color contrast on bands
- Bundle analysis; code-split Recharts if needed to hit 500KB
- Documented simplifications surfaced via info tooltips on assumptions
- README with architecture overview, dev setup, and decision log

---

# Part 4: Definition of Done (v1)

- All phases complete with passing tests
- Coverage ≥ 90% (enforced in CI)
- Bundle ≤ 500KB gzipped
- Monte Carlo (1000 runs) completes within performance targets
- WCAG AA passes via automated audit
- Mobile layout verified in browser devtools emulation at 375px, 768px, 1024px viewports
- All documented simplifications surfaced in UI
- README and decision log committed
- CI green on main
