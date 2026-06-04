# Retirement Projection — Methodology Review & Prioritized Fixes

> Status: review/proposal, 2026-05-31. Companion to [`retirement-projection-spec.md`](retirement-projection-spec.md).
> Purpose: capture where the current simulation methodology diverges from accepted practice,
> prioritize fixes, and flag the UX implications so the interface work can proceed in parallel.
>
> Our three product goals (from the brief):
> 1. Give users an **accurate** sense of their possible financial future.
> 2. Help them **understand the risks**.
> 3. Help them **understand how we reach our conclusions** (transparency).
>
> This doc grades the current implementation against those goals and against how the
> financial-planning field models the same problems.

---

## How a projection works today (baseline)

`runMonteCarlo` ([`src/sim/montecarlo.ts`](../src/sim/montecarlo.ts)) runs 1,000 samples →
each calls `runSingleProjection` ([`src/sim/projection.ts`](../src/sim/projection.ts)), a
month-by-month loop over `maxAge − currentAge` years → aggregated into per-year P10/P50/P90
bands, a binary success rate, and median ending/depletion figures.

**Key design choice:** each run draws **one** stock-growth rate and **one** inflation rate
([`montecarlo.ts:91`](../src/sim/montecarlo.ts)) and compounds that *single fixed rate every
month for the entire horizon* ([`projection.ts:103`](../src/sim/projection.ts)). A run
"succeeds" if the portfolio never hits $0 before `maxAge` ([`projection.ts:236`](../src/sim/projection.ts)).

**Reference scenario used throughout this doc** (40yo, $120k salary, $250k 401k + $80k Roth +
$100k brokerage, retire 65, $80k expenses, SS $30k @ 67, tax-optimal):

```
successRate = 60.4%   medianEnd = $2.9M   p10End = $0   medianDepleteAge = 83
age 95 band: p10 = $0   p50 = $2.9M   p90 = $34.4M
```

That result — 60% "success" yet the median *survivor* dies with $2.9M unspent, while the P90 is
a fictional $34M — is the symptom that drives most of the findings below.

---

## Priority summary

Status legend: ✅ done · ◑ partial · ⬜ not started.

| # | Pri | Status | Finding | Goal hit | Effort |
|---|-----|--------|---------|----------|--------|
| 1 | **P0** | ✅ | One return draw per run → no sequence-of-returns risk; fake fat right tail. **Done: per-year sampling**, now with serial correlation (#1b). | Accuracy, Risk | L |
| 1b | **P1** | ✅ | Per-year draws were IID — no autocorrelation, so crashes didn't persist (IID *understates* sequence risk). **Done: AR(1) serial correlation** on standardized return/inflation shocks — persistence reshapes the *path* while preserving each segment's marginal P10/P90. (Parametric AR(1) rather than historical block-bootstrap, which would discard the user's own return assumptions.) | Accuracy, Risk | M |
| 1c | **P1** | ✅ | Flows inflated by a single year's draw raised to `y` (`(1+iᵧ)^y`) instead of the realized cumulative price level `∏(1+iₖ)` — only equal under constant inflation. Introduced spurious year-to-year expense swings + upward bias once per-year sampling landed. **Done: carry a cumulative price level; all present-dollar flows convert by it.** | Accuracy, Risk | S |
| 2 | **P0** | ✅ | Binary "success rate" hides magnitude + timing of failure and rewards over-saving — engine outputs built (sustainable-spend solver, surplus + shortfall-by-percentile distributions, sample paths); **v2 UI reframe shipped** (sustainable-spend hero, two-sided risk/surplus, demoted success %, solve-for-age/spend/saving) | Risk, Transparency | M (sim) / L (UX) |
| 3 | **P1** | ✅ | RMD cash is destroyed, not spent/reinvested; RMD block gated behind `netNeed>0` | Accuracy | S |
| 4 | **P1** | ✅ | Employer match wrongly subtracted from take-home pre-retirement | Accuracy | S |
| 5 | **P1** | ✅ | Traditional dollars effectively double-taxed (contrib not pre-tax, then grossed-up on exit) | Accuracy | M |
| 6 | **P1** | ✅ | Insights @100 runs / sensitivity @200–400 runs report deltas inside MC noise | Risk, Transparency | S |
| 7 | **P2** | ⬜ | "Retirement age" tornado bar actually perturbs `currentAge`; contribution-amount row missing | Transparency | S |
| 8 | **P2** | ✅ | Flat marginal tax, SS tax-free, no 0% LTCG bracket, no bracket-filling. **Done: progressive withdrawal-phase tax** — standard deduction + statutory ordinary brackets, partial SS taxation (provisional income), 0/15/20% LTCG stacked on ordinary income; filing-status aware; brackets track inflation. | Accuracy | M |
| 9 | **P2** | ⬜ | Independent inflation/return sampling; no valuation-aware starting return | Accuracy | M |
| 10 | **P2** | ⬜ | Deterministic `maxAge` = no longevity risk distribution | Risk | M |
| 11 | **P2** | ✅ | Flat-real lifetime spending; no dynamic/guardrail withdrawals | Accuracy, Risk | M |
| 12 | **P3** | ⬜ | Frozen nominal IRS limits, no catch-up; mid-month convention not implemented | Accuracy | S |

Effort: S ≈ <½ day, M ≈ 1–3 days, L ≈ multi-day with test rework.

---

## P0 — Foundational

### 1. One return draw per run removes the dominant risk

**Problem.** Each run locks a single growth/inflation rate for the whole horizon, so every path
is a smooth exponential. Consequences:
- **Sequence-of-returns risk — the single most important retirement risk — cannot be
  represented at all.** Two retirees with identical *average* returns but different *order*
  (a crash early in retirement) produce identical results here. Real plans fail on bad
  sequences, not bad averages.
- **Manufactured right tail.** A run that draws 10% compounds 10% for 55 straight years →
  the $34.4M P90 above. Not a plausible future; an artifact of the sampling design.
- **The fan-chart band is not path uncertainty.** It reflects dispersion *across* constant-rate
  universes, which users misread as "how bumpy my path could be."

**Evidence.** `boxMullerNormal` called once per run ([`montecarlo.ts:91`](../src/sim/montecarlo.ts));
constant `monthlyGrowthRate` applied every month ([`projection.ts:103`](../src/sim/projection.ts)).
Spec frames this as a "deliberate simplification" ([spec §3.5/§6](retirement-projection-spec.md)) —
but it removes a risk rather than simplifying one that's otherwise present.

**What the field does** (least → most sophisticated):
- **IID annual draws** — independent return each year. The *minimum* bar; restores sequence risk.
- **Block bootstrap** — draw consecutive 3–5yr blocks from history; preserves autocorrelation,
  volatility clustering, inflation↔return correlation. Pragmatic best practice.
- **Resampled historical sequences** (Vanguard Nest Egg) — stitch real historical years in
  random order; no distributional assumption.
- **Regime-switching / fat-tailed (Student's-t)** — research-grade; models crisis states and
  the negative skew that a normal distribution misses.

Quantified stakes: moving from naive-normal to fat-tails + regime + autocorrelation roughly
**doubles failure rates (~11% → ~22–28%)** at a 4% withdrawal in published comparisons.

**Recommendation.** Ship **per-year IID sampling first** (smallest change that restores
sequence risk), structured so a **block-bootstrap** path can replace the draw later without
touching `projection.ts`. Concretely: change the rate source from a single `SampledRates` to a
per-year (or per-month) generator the projection pulls from each step. Keep the existing
single-draw path available behind a flag for the determinism-pin tests during migration.

**UX implication.** Once paths can be bad, the fan chart should optionally show a few **example
paths** (including a bad-sequence one), not just smoothed bands. Add an assumption tooltip:
"returns vary year to year; early losses hurt more than late ones."

**✅ Done (per-year IID).** Monte Carlo now draws an independent return + inflation for each
year from that year's active segment ([`montecarlo.ts` `buildSegments`/`activeSegment`](../src/sim/montecarlo.ts)),
and `runSingleProjection` consumes a per-year `SampledRates[]` schedule
([`projection.ts`](../src/sim/projection.ts)). Sequence-of-returns risk is now representable —
proven by a projection test where the same returns in reversed order produce different outcomes.
Impact on the reference scenario (40yo, retire 65, $80k expenses):

| | Single-draw (before) | Per-year (now) |
|---|---|---|
| Age-95 P90 | $34.4M (fiction) | $5.5M |
| Age-65 band width | 3.0× | 1.1× (accumulation averages out) |
| Median depletion age | 83 | 92 |

The band is now narrow during accumulation and widens through retirement — the correct shape.

**✅ Follow-up done (#1b — serial correlation).** The per-year draws are no longer IID.
`buildRateSchedule` ([`montecarlo.ts`](../src/sim/montecarlo.ts)) carries a standardized AR(1)
state for each stream across the horizon — `zₜ = ρ·zₜ₋₁ + √(1−ρ²)·εₜ`, converted to a rate by the
active segment's `mean + σ·z`. Because `zₜ` stays marginally `N(0,1)`, each year's distribution
(the user's P10/P90 spread) is preserved exactly; only the *path* gains correlation. Defaults:
`stock = 0.15` (annual equity returns are near a random walk, but bear/bull runs persist and IID
let a crash year stand alone), `inflation = 0.65` (realized inflation is strongly persistent — the
1970s lasted a decade). `ρ = 0` reproduces the prior IID path bit-for-bit. This is a **parametric**
AR(1), deliberately chosen over a historical block-bootstrap, which would override the user-supplied
return/inflation assumptions that drive the whole model. As a side benefit it partly addresses the
inflation-persistence half of #9. Validated by a long-horizon test pinning the realized lag-1
autocorrelation and the preserved marginal mean/σ.

---

### 2. Binary success rate hides magnitude and timing

**Problem.** "Success = never hits $0 before `maxAge`" ([`projection.ts:236`](../src/sim/projection.ts)):
- **$1 left and $5M left are both "success"; broke-at-94 and broke-at-66 are both "failure."**
  A cliff with no gradient.
- **It rewards over-saving and never flags it.** In the reference scenario the median *survivor*
  dies with $2.9M unspent — potentially a decade of extra work or needless frugality — and the
  tool calls it a win. As Kitces puts it, *"a 100% probability of success is exactly a 100%
  probability of underspending."*
- **It says nothing about how badly or how late** failures occur — the two dimensions a user
  most needs to act.

**What the field does.**
- Report **magnitude of failure** (shortfall $/yr and total) and **timing** (distribution of
  depletion ages), not just a pass/fail count.
- **Reframe as over-spend vs under-spend** — two-sided risk, including the surplus as its own
  inefficiency.
- **Adjustment-based framing** — a failure is "a mid-course course-correction may be needed,"
  not "you go broke." A 50–70% plan can be fine *if the user will flex spending*.

**Recommendation (sim side).** The data largely exists already — surface it:
- Emit the **depletion-age distribution** (we already collect `depleteAges`; expose P10/P50/P90
  of it, not just median).
- Emit a **shortfall series** (annual unmet need after depletion) — spec §4.1 envisioned this.
- Emit **surplus/legacy distribution** (ending-balance percentiles) framed as "money left over,"
  to expose over-saving.
- Add a **max-sustainable-spend** solver (binary search on `annualExpenses` for a target
  confidence) — the actionable inverse of success rate.

**UX implication (handled separately).** Lead with *spending you can sustain* and *what happens
if markets disappoint* rather than a single percentage. Show magnitude + timing. Treat the
surplus as a visible outcome, not a hidden "win." This is the biggest UX rework and depends on
the P0 sim outputs above.

---

## P1 — Correctness bugs (small, high-confidence)

### 3. RMD cash evaporates
`acc.withdraw(rmd, …)` ([`projection.ts:213-224`](../src/sim/projection.ts)) ignores its return
value — the forced withdrawal is neither spent, counted as income, nor moved to taxable
(spec §3.4 says move excess to taxable). It's deleted. Worse, the RMD block sits **inside
`if (netNeed > 0)`**, so years where SS+salary cover expenses skip RMDs entirely. Net effect:
traditional-heavy portfolios are silently drained with no benefit, biasing against them and
inflating the apparent edge of Roth / tax-optimal. **Fix:** move RMD out of the `netNeed` guard;
route the post-tax RMD proceeds to the taxable account (new basis = amount moved) or to current
spending.

### 4. Employer match subtracted from take-home
Pre-retirement disposable income is `afterTaxSalary − yearContributions`
([`projection.ts:168-176`](../src/sim/projection.ts)), and `annualContribution` *includes the
employer match* ([`account.ts:150`](../src/sim/account.ts)). The match isn't paid from the
paycheck, so this understates working-years cash flow and triggers unnecessary taxable
drawdowns while still employed. **Fix:** subtract only employee contributions from take-home.

### 5. Traditional dollars double-taxed
Traditional contributions don't reduce current-year taxable income (spec §6), so salary is taxed
at the full marginal rate *including* money going into the 401k — then the same dollars are
grossed-up for tax *again* on withdrawal ([`projection.ts:354`](../src/sim/projection.ts)). This
distorts the core value proposition of a traditional account. **Fix:** treat traditional
employee contributions as pre-tax when computing working-years take-home (reduce taxable salary
by the contribution before applying `marginalTaxRate`).

### 6. Insights/sensitivity run counts are inside the noise band
`computeInsights` defaults to **100 runs** ([`insights.ts:101`](../src/sim/insights.ts));
`runSensitivity` uses **200–400** ([`sensitivity.ts:122`](../src/sim/sensitivity.ts)). Measured
noise: success rate was 66% @100 runs vs 60.4% @1000 (seed swing at 1000 runs is only ~±1pp). So
the "one more year of work: 60%→63%" insight ([`insights.ts:88`](../src/sim/insights.ts)) is a
3pp delta *computed at 100 runs* — i.e. noise. Several tornado bars (SS at ±1.2–1.5pp) are noise
too. **Fix:** raise run counts for any reported delta, and/or gate on a significance threshold
(e.g. require |delta| > 2× the seed-to-seed std error before showing a card/bar). Common random
numbers across perturbations (already done — all use `inputs.seed`) help and should stay.

### 1c. Flows used a snapshot inflation rate, not the realized cumulative path
After the per-year sampling upgrade (#1), `runMonteCarlo` draws an independent inflation rate
for every year, but the projection still inflated flows with
`inflate(base, 0, y, inflationᵧ) = base × (1 + inflationᵧ)^y` — **year `y`'s single draw raised to
`y`** ([`projection.ts:193`](../src/sim/projection.ts) and the SS / one-time lines). This equals the
realized price level `∏ₖ₌₀…ʸ⁻¹(1+inflationₖ)` only when inflation is constant (the old single-draw
model, where it was exact). With varying draws it re-bases the whole elapsed period to the latest
year's number, so:
- **Spurious volatility** — at `y=30`, a 4% draw gives ×3.24 vs a 2% draw ×1.81; modeled expenses
  lurch year to year instead of tracking a smooth price level, so "flat real spending" wasn't flat.
- **Upward bias** — `E[(1+iᵧ)^y]` carries an extra ≈ `e^(y²σ²/2)` over the true cumulative mean
  (~+3% on expenses by year 30, growing with horizon).

Returns were unaffected (compounded month-by-month on balances); only the inflation of *flows* used
the shortcut. **Fix:** carry a running `cumInflation` price level through the year loop and convert
every present-dollar flow (expenses, Social Security, one-time + recurring costs) by it. This also
makes present-dollar SS hold its purchasing power from *today* rather than only from claim age.
Tested with a varying-per-year scenario pinning cumulative vs snapshot.

---

## P2 — Methodology depth

### 7. Sensitivity labels don't match what's perturbed
The "Retirement age" tornado bar perturbs `currentAge ±2`
([`sensitivity.ts:77-84`](../src/sim/sensitivity.ts)) — i.e. horizon length / current position,
not when the person retires (`contributionEndAge`/`withdrawalStartAge`). Mislabeled. The spec's
"total contribution amount" row (§3.7) was dropped and replaced by salary. **Fix:** perturb the
actual retirement age; restore a contribution-amount row.

### 8. Tax model is crude
Flat marginal rate on all traditional withdrawals — no standard deduction or bracket-filling
(overstates retirement tax, skews the tax-optimal-vs-proportional comparison the tool
promotes). SS treated fully tax-free ([`projection.ts:132`](../src/sim/projection.ts)) — points
the opposite way. No 0% LTCG bracket, aggregate basis only. **Fix (incremental):** at minimum a
standard-deduction offset + two-bracket fill on traditional withdrawals; partial SS taxation.

**✅ Done — progressive withdrawal-phase tax.** New [`sim/tax.ts`](../src/sim/tax.ts) holds the
2025 federal schedule (single + married): standard deduction, the seven ordinary brackets, the
0/15/20% LTCG breakpoints, and the Social Security provisional-income worksheet. The projection
threads a per-year **`TaxContext`** (today's dollars; `priceLevel` converts to/from nominal) through
the withdrawal helpers so each successive dollar is taxed at its correct marginal position —
brackets fill, the deduction is consumed once, and LTCG stacks on top of ordinary income.
Concretely:
- **Traditional withdrawals & RMDs** gross up against the progressive ordinary schedule instead of
  a flat rate. A ~$40k retiree draw now costs roughly a 7% effective rate (deduction + 10/12%
  brackets), not the old 25% — the dominant correction (it was overstating retirement tax).
- **Social Security** is partly taxable (up to 85%) via the provisional-income rule; the benefit's
  spendable cash is reduced by the tax on its taxable portion, which then seeds the year's ordinary
  income so traditional withdrawals stack above it.
- **Taxable accounts** realize LTCG at 0/15/20% by stacking the gain on the year's taxable income —
  so a low-income retiree fills the 0% bracket first.
- Brackets are expressed in **today's dollars** and scaled by the realized price level, so a
  constant *real* spend stays in a constant real bracket (this also pre-empts the #12 "frozen
  nominal limits" artifact for taxes).

The working-years take-home math still uses the single `person.marginalTaxRate` (that's the #5
accumulation-phase lever, unchanged). Filing status is a new optional `person.filingStatus`
(defaults to `single`, matching the single-person model); surfacing it in the Advanced drawer is a
small follow-up. **Approximations documented in code:** provisional income for SS uses an estimate
of the year's portfolio draw (avoids a fixed-point loop through the balance-mutating withdrawal
pass), and LTCG stacking uses ordinary income realized *so far* in the withdrawal order rather than
the year's final total. State income tax remains out of scope.

### 9. Independent inflation + non-valuation-aware returns
Inflation and returns sampled independently though historically correlated (persistent high
inflation ↔ depressed real returns; 1970s). And "use the historical average return" is itself a
known optimism bias at high valuations (CAPE). **Fix:** correlate inflation/return draws
(falls out naturally from block-bootstrap in #1); add guidance/tooltip that historical-average
defaults skew optimistic.

### 10. Deterministic `maxAge` = no longevity risk
`maxAge` is a hard death date; 95→100 swung success 60.4%→55.7% in testing — an arbitrary input
materially drives the headline. The field's rigorous answer is **stochastic mortality** (draw
age-at-death from actuarial tables each run) though it's uncommon even in commercial tools. Note
also the known fixed-horizon artifact: the final simulated year is treated as 1 year when
survivors have years of remaining life expectancy. **Fix (phased):** near-term, present horizon
as an *assumption with a sensitivity* ("plan to 95 vs 100"); longer-term, optional stochastic
mortality.

### 11. Flat-real spending; no guardrails
The retiree spends the same real amount whether the portfolio booms or crashes, which both
overstates ruin risk and understates achievable spending. The dominant modern approach is
**dynamic guardrails (Guyton-Klinger)**: cut ~10% when the withdrawal rate drifts >~20% above
target, raise when below — letting retirees start higher (5–5.5% vs 4%) at comparable success and
converting "ruin" into "a temporary pay cut." **Fix:** add an optional guardrail withdrawal
strategy alongside the existing static one.

---

## P3 — Cleanups

### 12. Misc
- IRS limits frozen in nominal 2026 dollars with no COLA growth and no 50+ catch-up
  ([`irsLimits.ts:11`](../src/sim/irsLimits.ts)) — `contributeMax` contributions shrink in real
  terms over a 55-yr horizon. **Fix:** grow limits with assumed inflation; add catch-up.
- "Mid-month contribution" convention is documented but not implemented — growth is applied
  *before* the contribution each month ([`account.ts:78-91`](../src/sim/account.ts)), i.e.
  end-of-month behavior. Minor; reconcile code with spec §3.1 (or update the spec).

---

## Suggested sequencing

1. **P1 bug fixes (#3, #4, #5, #6)** — small, high-confidence, improve accuracy immediately and
   are independent of the bigger redesigns. Land first.
2. **P0 #1 (per-year sampling)** — the prerequisite for honest risk. Do IID first behind a flag,
   keep determinism-pin tests green, then layer block-bootstrap.
3. **P0 #2 (richer outputs)** — depletion-age distribution, shortfall series, surplus, max-spend
   solver. Feeds the separate UX rework.
4. **P2 depth (#7–#11)** as capacity allows; #7 is a quick win, #11 (guardrails) is the
   highest-value modeling upgrade after #1.

## Cross-cutting transparency principle

For every simplification we keep, **surface it as an assumption with a known bias direction**,
not a silent default — e.g. "returns assume the historical average (optimistic at today's
valuations)", "taxes use a flat marginal rate (overstates retirement tax)", "plan ends at a
fixed age (ignores longevity risk)". This directly serves goal #3 and is cheap to add alongside
each fix.

## Sources

- [When Monte Carlo Fails — Quant Decoded](https://quantdecoded.com/en/when-monte-carlo-fails-retirement-planning-pitfalls)
- [Bootstrap Simulation for Financial Planning — Portfolio Optimizer](https://portfoliooptimizer.io/blog/bootstrap-simulation-with-portfolio-optimizer-usage-for-financial-planning/)
- [Vanguard Nest Egg methodology — Bogleheads](https://www.bogleheads.org/forum/viewtopic.php?t=141402)
- [Reframing Retirement Risk as Over/Under-Spending — Kitces](https://www.kitces.com/blog/retirement-income-risk-monte-carlo-probability-sucess-over-under-spend/)
- [Probability + Magnitude of Success — Kitces](https://www.kitces.com/blog/multidimensional-abstraction-to-communicate-monte-carlo-simulation-probability-and-magnitude-of-success/)
- [A 50% Monte Carlo Success Can Work — Kitces](https://www.kitces.com/blog/monte-carlo-retirement-projection-probability-success-adjustment-minimum-odds/)
- [Guyton-Klinger / Risk-Based Guardrails — Kitces](https://www.kitces.com/blog/guyton-klinger-guardrails-retirement-income-rules-risk-based/)
- [Combining Stochastic Simulations and Actuarial Withdrawals — FPA](https://www.financialplanningassociation.org/article/combining-stochastic-simulations-and-actuarial-withdrawals-one-model)
- [How to Estimate "The End" of Retirement — FPA](https://www.financialplanningassociation.org/article/journal/AUG21-how-estimate-end-retirement)
