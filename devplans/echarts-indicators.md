---
description: extend echarts-based terminal demo with additional indicators and chart types
---

## Current state

- **Demo**: `indicator-examples/src/terminal-echarts.js` used by `terminal.html`.
- **Price representations**:
  - Candlestick (primary series).
  - Price Line overlay (close price line, toggle `#toggle-price-line`).
  - Price Area overlay (filled area under close, toggle `#toggle-price-area`).
  - Chart type switcher chips (Candles / OHLC / Line / Area / Heikin) in header, wired via `chartMode` state.
- **Overlays**:
  - EMA 50 (default on, `#toggle-ema`).
  - EMA 20 (optional, `#toggle-ema20`).
  - EMA 100 (optional, `#toggle-ema100`).
  - SMA 20 (`#toggle-sma`).
  - Bollinger Bands (upper/lower/basis, `#toggle-bb`).
  - Ichimoku 9/26/52 cloud (`#toggle-ichimoku`).
  - Donchian price channel (upper/lower/mid, `#toggle-donchian`).
  - VWAP (`#toggle-vwap`).
  - Parabolic SAR (`#toggle-psar`).
  - Volume on secondary axis (`#toggle-volume`).
- **Oscillators**:
  - RSI 14 (`#toggle-rsi`).
  - Stochastic (14, 3) with %K/%D and derived KDJ J-line (`#toggle-stoch`, `#toggle-kdj`).
  - CCI 20 (`#toggle-cci`).
  - Williams %R 14 (`#toggle-wpr`).
  - Momentum 10 (`#toggle-mom`).
  - ROC 10 (`#toggle-roc`).
  - ATR % 14 (`#toggle-atr`).
  - ADX 14 with +DI/-DI (`#toggle-adx`).
  - MACD (12,26,9) with line, signal, histogram (`#toggle-macd`).
  - OBV line (`#toggle-obv`).

## How it works

- **Data**
  - Random-walk candles are generated once and downsampled per timeframe.
  - `convertToLineData` maps candles to `{ time, value: close }` for indicator math.
- **Indicator computation**
  - `computeEMA`, `computeSMA`, `computeBB`, `computeRSI`, `computeMACD`, `computeVolume` operate on line/candle arrays.
  - Results are mapped back onto the base candle timeline via `mapToBase`, `mapHistToBase`, `mapVolumeToBase`.
- **Chart layout**
  - Single ECharts instance with 1 main price+volume grid and a **dynamic number of oscillator grids** below it.
  - An `oscillatorGroups` array in `buildOption` collects enabled oscillators (RSI, Stoch/KDJ, CCI, BIAS, Momentum, ROC, ATR, ADX, WPR, MACD, OBV) and allocates one grid/xAxis/yAxis lane per group.
  - Price overlays (MAs, BB, Keltner, Donchian, Ichimoku, VWAP, PSAR, price line/area) always render on the main grid.
  - All x-axes share the same `categories` so zoom/scroll stays synchronized via a single `inside` dataZoom configured over all xAxis indices.
  - Y-axis type for the main pane toggles between linear/log via `logToggle`.
  - Timeframe & range controls are driven by buttons with `data-tf` / `data-range` attributes.

## Planned extensions / choices

-- **[choice] Add "heavier" indicators (e.g. ADX, Ichimoku, volume profile-like views)**
  - Pros: gets even closer to the richer ECharts gallery / trading terminals.
  - Cons: significantly more math and UI complexity; higher risk of clutter.

-- **[choice] Add alternative price chart modes (OHLC emulation, Renko-like, baseline area)**
  - Pros: showcases how to transform the candle feed into alternative price representations while reusing the multi-pane layout.
  - Cons: more derived-data logic; can be confusing on top of random-walk candles.

-- **[choice] Port indicator logic to native lightweight-charts demos**
  - Pros: shows how to implement this full indicator set without ECharts, directly on lightweight-charts series and panes.
  - Cons: larger surface area of changes; needs careful demo/api design and docs.

## Next concrete steps

1. **Decide** whether to prioritize (a) more advanced indicators (e.g. ADX, Ichimoku) or (b) more price modes (OHLC / Renko-like) for the ECharts terminal.
2. If adding more indicators, **follow the existing pattern** in `terminal-echarts.js`:
   - Compute on the line or candle series.
   - Map back to the base candle timeline via `mapToBase` / `mapHistToBase`.
   - Attach to either the price grid or an existing oscillator grid where it conceptually fits.
3. Start designing a **native lightweight-charts indicator page** that mirrors this ECharts terminal layout (main price + at least one oscillator pane), reusing the same indicator list and toggles where possible.
4. Optional: add a small preset system (e.g. "Trend", "Oscillators", "Volume") that flips groups of toggles on/off at once.

## Recent changes

- 2025-12-10: Wired the OBV checkbox (`#toggle-obv`) into the indicator change handlers so toggling OBV alone re-renders the chart and shows/hides the OBV line in the MACD/OBV pane.
- 2025-12-10: Tightened vertical spacing for RSI and MACD/OBV panes in `terminal-echarts.js` by reducing top grid margin and forcing their y-axes to use `dataMin`/`dataMax`, so oscillators sit closer to the center of their panes.
- 2025-12-10: Added a Heikin-Ashi chart mode (`data-mode="heikin"`) that renders derived candles while keeping all overlays/indicators in sync.
- 2025-12-10: Expanded overlays to include Donchian channels (`computeDonchian`), VWAP (`computeVWAP`), Parabolic SAR (`computeParabolicSAR`), and an Ichimoku 9/26/52 cloud (`computeIchimoku`), each with dedicated toggles.
- 2025-12-10: Expanded oscillators to include KDJ J, Momentum 10, ROC 10, Williams %R 14, ATR % 14, and ADX 14 (+DI/-DI), plus an organized indicator menu grouping overlays, volume, oscillators, and MACD.
 - 2025-12-10: Wired Donchian (`#toggle-donchian`) and Ichimoku (`#toggle-ichimoku`) checkboxes into the shared indicator change handler list so they re-render the chart immediately when toggled instead of only updating when another indicator is changed.
 - 2025-12-10: Converted the flat indicator dropdown into grouped, collapsible sections (Overlays, Volume, Oscillators, MACD) that start collapsed and can be expanded via a section header and caret in the `indicator-menu`.
 - 2025-12-10: Reworked the layout so each enabled oscillator group (RSI, Stoch/KDJ, CCI, BIAS, Momentum, ROC, ATR, ADX/+DI/-DI, WPR, MACD, OBV) gets its own grid/xAxis/yAxis lane via an `oscillatorGroups` helper in `buildOption`, while all price overlays remain on the main pane.
