---
description: implement time series decomposition (trend/seasonality/residual) as three indicators with settings
---

## Context

- **Repo**: lightweight-charts / indicator-examples.
- **Existing demos**:
  - ECharts-based terminal demo documented in `devplans/echarts-indicators.md` with a rich set of overlays and oscillators.
  - Native lightweight-charts examples without explicit time-series decomposition.
- **Goal**: add a small, well-scoped **time series decomposition package** implemented as **three indicators**:
  - `TSD Trend` (trend component).
  - `TSD Seasonality` (seasonal component).
  - `TSD Residual` (irregular / noise component).
- In addition, plan an **STL-based decomposition set** (`STL Trend`, `STL Seasonality`, `STL Residual`) that mirrors the same structure but uses STL instead of moving-average decomposition.
- These should behave like normal indicators: toggleable, with parameter settings, series styling, and integration into tooltips and panes.

## Concept recap

- **Additive model** (default target):
  - `Y(t) = T(t) + S(t) + R(t)`
  - `Y(t)`: observed series (close price or chosen value).
  - `T(t)`: smooth trend.
  - `S(t)`: repeating seasonal pattern with period `P`.
  - `R(t)`: residual / noise once trend and seasonality are removed.
- **Multiplicative model** (optional extension):
  - `Y(t) = T(t) × S(t) × R(t)`
  - Typically used when the seasonal amplitude scales with the overall level.

--- **[choice] Decomposition model scope (additive-only vs additive+multiplicative)**
- **Additive-only**:
  - Pros: simpler math and UI; no log transforms or edge-case handling for non-positive values.
  - Cons: less accurate when seasonal swings strongly scale with price level.
- **Additive + multiplicative** (chosen):
  - Pros: more general; closer to classical textbooks.
  - Cons: requires working in log-space, safety checks for zero/negative prices, and more parameters in UI.
- **(decision)**: implement **both additive and multiplicative models** and expose a `model` switch in the indicator settings so users can toggle between them per indicator (defaulting to additive).

## Indicator design

### 1. TSD Trend (overlay)

- **What it shows**: smooth estimate of the underlying trend component `T(t)` of the close-price series.
- **Where it renders**: main price pane as a line overlay (similar to EMA/SMA).
- **Input series**:
  - Base: close price line derived from candles.
  - Works per timeframe; recomputed when timeframe changes (reuse existing line derivation logic).
- **Core parameters**:
  - `trendLength` (integer ≥ 3, default 50): window length in bars for the moving average.
  - `trendMethod` (enum: `"sma" | "ema"`, default `"sma"`): smoothing method.
  - `centered` (boolean, default `true`): whether to use a **centered** moving average (better decomposition) vs trailing.
  - `model` (enum: `"additive" | "multiplicative"`, default `"additive"`): decomposition model; multiplicative internally operates in log-space.
- **Rendering / styling**:
  - Single colored line (e.g., thick, smooth, distinct color from existing MAs).
  - Legend entry `TSD Trend (len=50)` showing current config.

### 2. TSD Seasonality (oscillator)

- **What it shows**: repeating seasonal pattern `S(t)` extracted after removing the trend.
- **Where it renders**: dedicated oscillator pane below price, centered around 0.
- **Input series**:
  - Detrended series `D(t) = Y(t) - T(t)` for additive model.
  - Assumes a **fixed period `P` in bars** (e.g., 96 bars if simulating intraday seasonality, or user-chosen).
- **Core parameters**:
  - `seasonPreset` (enum: `"daily" | "weekly" | "custom"`, default `"weekly"`): high-level seasonality horizon; controls the default `seasonLength` per timeframe (see table below).
  - `seasonLength` (integer ≥ 2, default derived from `seasonPreset`): number of bars per seasonal cycle; user-editable override.
  - `seasonSmoothing` (integer ≥ 1, default 1): optional small moving average over seasonal indices to smooth noise.
  - `normalizeSeasonality` (boolean, default `true`): normalize seasonal component to have mean 0 over a full period.
- **Rendering / styling**:
  - Line oscillator around 0; distinct color.
  - Optional zero line (thin grey) for context.
  - Legend entry `TSD Seasonality (P=96)`.

#### Season length presets per timeframe

- For the ECharts terminal timeframes, we treat the base series as 24/7 with 5-minute bars and derive bars per day from the shared downsampling factors.
- Presets:
  - **Daily**: one full day of bars.
  - **Weekly** (default): seven days of bars.
- Concrete defaults:

  | Timeframe | Bars per day | Daily `seasonLength` | Weekly `seasonLength` (default) |
  |----------|--------------|----------------------|---------------------------------|
  | 5m       | 288          | 288                  | 2016                            |
  | 15m      | 96           | 96                   | 672                             |
  | 1h       | 24           | 24                   | 168                             |
  | 4h       | 6            | 6                    | 42                              |
  | 1d       | 1            | 1                    | 7                               |

- Implementation details:
  - When `seasonPreset` is `"daily"` or `"weekly"`, `seasonLength` is set from this table and updated when the timeframe changes.
  - When `seasonPreset` is `"custom"`, `seasonLength` is user-controlled and does not auto-update with timeframe changes.

### 3. TSD Residual (oscillator)

- **What it shows**: irregular / noise component `R(t)` (what remains after removing trend and seasonality).
- **Where it renders**: its own dedicated oscillator pane, separate from the Seasonality pane.
- **Input series**:
  - `R(t) = Y(t) - T(t) - S(t)` for additive model.
- **Core parameters**:
  - `residualStdWindow` (integer ≥ 5, default 100): rolling window for estimating std-dev of residuals.
  - `standardizeResiduals` (boolean, default `true`): show residuals as z-scores instead of raw units.
  - `residualZThreshold` (float, default 2.0): level above which residuals are considered “anomalous”.
- **Rendering / styling**:
  - Line or histogram around 0.
  - Optional **highlighting**: markers or colored bars when `|z| ≥ residualZThreshold`.
  - Legend entry `TSD Residual (z, win=100)`.

--- **[choice] Pane layout for Seasonality/Residual**
- **Separate panes** (chosen):
  - Pros: visually distinct; easier to read each component; consistent y-scale.
  - Cons: consumes vertical space; more panes to manage.
- **Shared pane**:
  - Pros: compact; both components around 0, so sharing a y-axis is natural.
  - Cons: slightly busier pane; must style lines clearly.
- **(decision)**: use **two separate `TSD` oscillator panes**, one for Seasonality and one for Residual.

## Decomposition algorithm (additive & multiplicative, classical-style)

### Inputs

- `lineData`: array of `{ time, value }` from existing close-price line helpers.
- `config`:
  - `trendLength`, `trendMethod`, `centered`.
  - `seasonLength`, `seasonSmoothing`, `normalizeSeasonality`.
  - `residualStdWindow`, `standardizeResiduals`.
  - `model` ("additive" | "multiplicative").

### Steps

1. **Extract values**
   - `y[t] = lineData[t].value`.
   - Ignore or skip bars where price is `null`/`undefined`.

2. **Compute trend `T(t)`**
   - Use a **centered moving average** of length `trendLength`:
     - For each valid index `t`, average values from `t - k` to `t + k` (where `trendLength = 2k+1`), or handle even windows with one-sided compromise.
   - If `centered = false`, allow a trailing MA fallback.
   - For edges where a full window is not available, set trend to `null` (or use partial windows, but document choice).

3. **Compute detrended series `D(t)`**
   - For each `t` where `T(t)` is defined:
     - `D(t) = Y(t) - T(t)`.

4. **Estimate seasonal indices for period `P = seasonLength`**
   - For each position `k` in `[0, P-1]`:
     - Collect all `D(t)` such that `t mod P = k`.
     - Compute mean `S_k` of that bucket (skip `null` values).
   - If `seasonSmoothing > 1`, smooth the `S_k` array with a small MA.
   - If `normalizeSeasonality` is true, enforce that the average contribution over one cycle is 0 (for additive model) by subtracting the overall mean of `S_k`.

5. **Construct `S(t)` series**
   - For each index `t`, assign `S(t) = S_{t mod P}`.
   - Where `T(t)` or `Y(t)` is `null`, keep `S(t)` as `null`.

6. **Compute residual `R(t)`**
   - `R(t) = Y(t) - T(t) - S(t)` wherever all components are defined.

7. **Standardize residuals (optional)**
   - If `standardizeResiduals`:
     - Compute rolling mean and std-dev over a `residualStdWindow` window of `R(t)`.
     - Replace `R(t)` with `z(t) = (R(t) - mean_window) / std_window`.

8. **Map back to chart series**
   - Convert `T(t)`, `S(t)`, and `R(t)` back into `{ time, value }` arrays aligned with `lineData`.
   - For undefined points, use `null` so the chart breaks the line cleanly at edges.

- For `model = "multiplicative"`, apply the same steps in **log-space** on `yLog[t] = ln(Y(t))` (for positive prices only), then exponentiate the resulting components for display where appropriate; if prices are non-positive, fall back to the additive model.

-- **[choice] Handling edges and incomplete windows**
- **Strict (no padding)** (chosen):
  - Pros: mathematically honest; avoids misleading trend near edges.
  - Cons: visible gaps for first/last `trendLength/2` bars.
- **Padded / partial windows**:
  - Pros: continuous lines across full history.
  - Cons: less accurate near boundaries; could hide edge artifacts.
- **(decision)**: use **strict behavior** (no padded/partial windows) and document it in tooltip / README.

## Integration into existing demos

### Series / pane wiring (ECharts terminal)

- **New overlays / oscillators**:
  - Add `TSD Trend` as a price overlay series on the main grid.
  - Add `TSD Seasonality` and `TSD Residual` to **separate** oscillator groups (e.g. `"tsd-seasonality"` and `"tsd-residual"`) so each gets its own pane below price.
- **Indicator toggles**:
  - Add checkboxes in the indicator menu:
    - `#toggle-tsd-trend` (Overlays group).
    - `#toggle-tsd-seasonality` (Oscillators group).
    - `#toggle-tsd-residual` (Oscillators group).
  - Wire each into the shared indicator-change handler list so enabling/disabling re-renders immediately.
- **Settings panel**:
  - Add a `Time series decomposition` section with fields:
    - `Trend length`, `Trend method`, `Centered`.
    - `Season length`, `Season smoothing`, `Normalize seasonality`.
    - `Residual std window`, `Standardize residuals`, `Residual Z threshold`.
  - Follow the same `indicatorPopupConfigsBySeries` pattern so double-clicking on any TSD series opens a focused settings popup.
- **Tooltip integration**:
  - In the fixed overlay tooltip, add lines for:
    - `TSD Trend: value`.
    - `TSD Seasonality: value`.
    - `TSD Residual: value` (and maybe `z` if standardized).

### Native lightweight-charts examples (optional follow-up)

- Mirror the same logic using:
  - Line series overlays for trend.
  - Extra panes for seasonality/residual via additional chart instances or pane abstractions.
- Reuse the decomposition computation helpers from a shared module (`archive/helpers` or a new `indicator-examples/src/indicators/tsd.ts`).

## Testing and validation

- **Numerical checks**:
  - For additive model, verify approximately that `Y(t) ≈ T(t) + S(t) + R(t)` for all valid points.
  - For multiplicative model, verify approximately that `Y(t) ≈ T(t) × S(t) × R(t)` in linear space (equivalently, that `ln Y(t) ≈ ln T(t) + ln S(t) + ln R(t)` in log-space) wherever defined.
  - For the STL variant, run the same checks on synthetic data with known trend and seasonality and compare STL components against ground truth.
- **Visual checks**:
  - Use a simple sinusoidal-with-trend input and confirm that trend, seasonality, and residual align with expectations.
  - Check behavior across different timeframes and season lengths.
- **Performance**:
  - Ensure decomposition runs fast enough on the 50-year synthetic dataset by limiting `seasonLength` and keeping algorithms O(N).

## Next concrete steps

1. **Design API** for a `computeDecomposition(lineData, config)` helper that returns `{ trend, seasonal, residual }` arrays aligned with the existing indicator helpers.
2. **Implement decomposition** with centered moving average and simple seasonal indexing as described above, supporting both additive and multiplicative models (multiplicative via log-space).
3. **Wire the three indicators** (Trend overlay, Seasonality oscillator, Residual oscillator) into the ECharts terminal demo:
   - New toggles, settings, series definitions, oscillator group, and tooltip entries.
4. **Add basic tests and a synthetic demo mode** that feeds in a hand-crafted seasonal series to visually validate component separation.
5. **Add STL variant**:
   - Design and implement an STL-based decomposition variant (`STL Trend`, `STL Seasonality`, `STL Residual`) as a separate indicator set, reusing as much of the TSD UI and wiring as possible.

## Recent changes

- 2025-12-10: Added a sandboxed time series decomposition demo at `indicator-examples/src/indicators/time-series-decomposition/example/direct.html` using `computeDecomposition` over synthetic line data, with price+trend in one chart and seasonality+residual in a separate oscillator chart, fully isolated from the terminal ECharts demo.
