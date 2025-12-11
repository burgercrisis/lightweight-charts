---
description: design and implement time-series forecasting-based indicators (ARIMA/SARIMA) with settings and evaluation metrics
---

## Context

- **Repo**: lightweight-charts
- **Goal**: introduce time-series forecasting methods as separate, opt-in indicators with configurable settings and clear evaluation metrics.
- **Scope**: focus initially on ARIMA and SARIMA models, with room to add other classical and ML-based forecasters later.
- **Target demos**:
  - Existing terminal-style ECharts demo: `indicator-examples/src/terminal-echarts.js` + `terminal.html`.
  - Potential dedicated forecasting page (e.g. `forecasting.html`) to avoid cluttering the main terminal.

## Indicator concepts

Treat each forecasting method as its own logical "indicator" that can be toggled and configured, similar to EMA/MACD/etc.

- **ARIMA forecast (non-seasonal)**
  - Models autocorrelations in (optionally differenced) price series.
  - Produces a forecast path for a fixed horizon beyond the last observed bar.
  - Optional in-sample fitted line to visualize model fit over the training window.

- **SARIMA forecast (seasonal)**
  - Extends ARIMA with seasonal (P, D, Q, s) terms.
  - Suitable for data with clear daily/weekly/other seasonality.
  - Same outputs as ARIMA (forecast path + optional in-sample fit), but with seasonal structure.

- **Optional future extensions** (not in first implementation):
  - Exponential Smoothing / ETS.
  - Simple ML regressors (linear regression, tree-based models, basic RNN/LSTM stubs) for demonstration only.

## Visual design

- **Where forecasts appear**
  - As **overlays** on the main price pane (same time axis as candles/line), extending slightly into the future.
  - Forecast horizon visualized as a continuation of the close-price line, starting at the last observed bar.
  - Optional shaded confidence interval (e.g. 80% / 95%) rendered as a filled area around the forecast line.

- **Series mapping**
  - Input: line series built from candle closes (similar to how existing indicators use `convertToLineData`).
  - Output: one or more forecast series per indicator:
    - Forecast mean line.
    - Optional upper/lower confidence bounds.
    - Optional in-sample fitted line.

- **Separation from existing overlays**
  - Forecast series should use a distinct palette (e.g. dashed or semi-transparent lines) so they are clearly not "actual" prices.
  - Legend entries grouped under a "Forecasts" section in the indicator menu.

## Settings / configuration

All forecasting indicators share some core settings, with model-specific parameters on top.

- **Shared settings**
  - **Forecast horizon**: number of future steps to predict (e.g. 10–200 bars, default 50).
  - **Training window length**: how many past bars to use to fit each model (e.g. last 500–2000 bars, default tuned per timeframe).
  - **Update policy**:
    - Refit **on every timeframe change**.
    - Refit only when the user clicks "Recompute forecasts".
  - **Target series**:
    - Close price (default).
    - Optionally log-returns / percentage changes (advanced toggle).
  - **Confidence level**:
    - e.g. 80% and/or 95% intervals.

- **ARIMA-specific settings**
  - **Order (p, d, q)**: integer triple for AR lags, differencing, MA lags.
  - **Stationarity handling**:
    - Auto-select `d` using unit-root tests, or
    - Respect user-provided `d`.
  - **Maximum order bounds**: safety caps for p/q to prevent very slow fits.

- **SARIMA-specific settings**
  - **Non-seasonal order (p, d, q)**.
  - **Seasonal order (P, D, Q, s)**:
    - `s` = seasonal period (e.g. 24 for hourly-with-daily-seasonality, 7 for daily-with-weekly-seasonality).
  - **Seasonality detection** (optional): helper that proposes `s` based on autocorrelation/periodogram.

- **Evaluation settings**
  - **Holdout length**: number of bars at the end of the series to reserve as test set.
  - **Cross-validation style**:
    - Simple train/test split (single holdout).
    - Rolling forecast origin (multiple folds, optional for later).
  - **Displayed metrics**: user can choose which of MAE/MSE/RMSE/MAPE to show.

## Evaluation metrics

We want a clear, compact way to compare forecasting indicators on the same chart.

- **Metrics to compute**
  - **MAE (Mean Absolute Error)**: average absolute difference between forecast and actual.
  - **MSE (Mean Squared Error)**: average squared error (penalizes large deviations).
  - **RMSE (Root Mean Squared Error)**: square root of MSE; same units as price.
  - **MAPE (Mean Absolute Percentage Error)**: average absolute percentage error (watch out for near-zero prices).

- **UI representation**
  - Small table or list in the existing indicator settings/legend area:
    - One row per active forecast indicator.
    - Columns: MAE, RMSE, MAPE (optionally MSE hidden by default).
  - Optional color-coding (e.g. green = best metric among active forecasts).

- **Diagnostic plots** (optional later)
  - Residuals mini-plot for the selected forecast indicator.
  - Autocorrelation (ACF) of residuals to check remaining structure.

## Cross-validation and diagnostics

- **Rolling forecast origin (advanced)**
  - Implement as a mode in the settings:
    - Split the history into multiple train/test windows.
    - Refit the model at each origin and accumulate metrics.
  - UI: show aggregated metrics (average MAE/RMSE/MAPE) instead of only single-split values.

- **Residual analysis**
  - Compute residuals on the holdout set and/or the in-sample fit.
  - Display quick checks:
    - Mean close to zero.
    - No obvious autocorrelation in residual ACF.

## Integration strategy

- **API shape**
  - Define a common `ForecastIndicatorConfig` shape (even if only implicit in JS) with:
    - `id`, `label`, `modelType` (ARIMA/SARIMA/etc).
    - `sharedParams` (horizon, window, confidence, target series).
    - `modelParams` (p, d, q, P, D, Q, s, etc.).
  - Add forecast indicators to the same registry used for existing overlays/oscillators so they appear in menus and tooltips.

- **Rendering pipeline**
  - Use the same data generation and downsampling flow as other indicators.
  - For each active forecast indicator:
    1. Extract training slice from the base line series.
    2. Fit forecast model and produce future path + intervals.
    3. Map forecast timestamps onto the charts time axis (extending beyond last bar).
    4. Attach series to the main ECharts grid as additional line/area series.

## Implementation backend choices

-- **[choice] Where to host the forecasting UI (terminal vs separate page)**
  - **Option A: Extend existing terminal ECharts demo**
    - Pros: reuses existing indicator menus, panes, and synthetic data.
    - Cons: terminal becomes even more complex and crowded; harder to reason about performance.
  - **Option B: Create a dedicated forecasting demo page**
    - Pros: clean, focused example; easier to explain and test; can still reuse shared helpers.
    - Cons: one more demo to maintain; some duplication of layout code.
  - **(recommendation)**: Start with **Option B** (dedicated forecasting page) while keeping the indicator computation helpers reusable from the terminal demo.

-- **[choice] How to implement ARIMA/SARIMA math**
  - **Option A: Pure JS/TS implementation or light-weight library**
    - Pros: self-contained; runs entirely in the browser; easiest for users to inspect.
    - Cons: more math to maintain; limited feature set vs. mature statistical packages.
  - **Option B: Bridge to a backend (e.g. Python/statsmodels) via HTTP**
    - Pros: can rely on battle-tested ARIMA/SARIMA implementations and diagnostics.
    - Cons: requires a running backend; complicates the demo; not ideal for a self-contained example.
  - **Option C: Simplified/stub models for UI only**
    - Pros: minimal effort, showcases UI/indicator wiring even without full ARIMA.
    - Cons: not accurate; may confuse users expecting real forecasts.
  - **(recommendation)**: Aim for **Option A** (browser-side implementation or small dependency), potentially starting with Option C for initial UI wiring.

## Next concrete steps

1. **Decide** where the first forecasting demo lives:
   - Follow the recommendation to create a dedicated `forecasting.html` + JS/TS entry file, reusing the terminals layout helpers where possible.
2. **Define a forecast indicator registry** with entries for:
   - ARIMA forecast.
   - SARIMA forecast.
   - Shared and model-specific parameter defaults.
3. **Implement a minimal ARIMA-like forecast stub** (Option C) to:
   - Validate series mapping into the chart.
   - Wire up the settings UI (horizon, window length, basic (p, d, q)).
   - Render forecast line + optional confidence band.
4. **Replace stub with a real ARIMA/SARIMA implementation** (Option A):
   - Port or adopt a small JS ARIMA implementation.
   - Add seasonal terms and validation for SARIMA.
5. **Add evaluation metrics computation** over a holdout window:
   - Compute MAE/MSE/RMSE/MAPE for each active forecast indicator.
   - Render metrics in a compact table in the indicator settings/legend area.
6. **Add basic diagnostics** (residual summary, optional residual ACF plot).
7. **Document usage** in the demo README and update this devplan with concrete file names and recent changes once the first version ships.

## Recent changes

- (none yet; populate this section as forecasting indicators and demos are implemented).
