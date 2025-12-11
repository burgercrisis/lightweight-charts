---
description: extend echarts-based terminal demo with additional indicators and chart types
---

## Current state

- **Demo**: `indicator-examples/src/terminal-echarts.js` used by `terminal.html`.
- **Price representations**:
  - Candlestick (primary series).
  - Price Line overlay (close price line, toggle `#toggle-price-line`).
  - Price Area overlay (filled area under close, toggle `#toggle-price-area`).
  - Chart type switcher chips (Candles / OHLC / Line / Area / Heikin / Range / Renko / Kagi) in header, wired via `chartMode` state.
  - 3D main chart mode (`data-mode="3d"`) that renders the primary price and overlay series as 3D lines on a `grid3D` coordinate system while keeping volume as a 2D underlay in the main pane and all oscillator panes in 2D.
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
  - DMA (10, 50) difference of fast/slow SMA (`#toggle-dma`).
  - TRIX (18, 9) triple-EMA momentum with signal line (`#toggle-trix`).
  - ATR % 14 (`#toggle-atr`).
  - ADX 14 with +DI/-DI (`#toggle-adx`).
  - MACD (12,26,9) with line, signal, histogram (`#toggle-macd`).
  - OBV line (`#toggle-obv`).
  - VR 26 volume ratio oscillator (`#toggle-vr`, lives in the Volume group but renders in its own oscillator pane).

- **3D inspector**:
  - Floating 3D indicator pane (`#chart-3d-indicator`, toggle `#toggle-3d-indicator`) rendered by a separate ECharts instance using `grid3D` / `line3D`, with X/Y/Z axis mapping dropdowns in the indicator settings `3D chart` tab.

## How it works

- **Data**
  - Random-walk candles are generated once as a 5-minute series spanning roughly 5 years (≈525k bars) by default in `terminal-echarts.js`, with history capped at 600k bars so streaming stays bounded.
  - Per-timeframe views (`5m`, `15m`, `1h`, `4h`, `1d`) are produced by aggregating the single 5-minute base feed into higher-timeframe OHLCV candles using fixed factors (3, 12, 48, 288 respectively).
  - `convertToLineData` maps candles to `{ time, value: close }` for indicator math.
  - Bottom-bar range presets (`all`, `1d`, `7d`, `30d`, `180d`) operate on that base series: `all` returns the full available history, while the other presets map to last-N-bar windows that are further clipped by `getDynamicMaxBars` based on viewport width and the current performance preset. On startup the demo uses timeframe `5m` with range `30d` selected.
- **Indicator computation**
  - `computeEMA`, `computeSMA`, `computeBB`, `computeRSI`, `computeMACD`, `computeVolume` operate on line/candle arrays.
  - Results are mapped back onto the base candle timeline via `mapToBase`, `mapHistToBase`, `mapVolumeToBase`.
- **Chart layout**
  - Single ECharts instance with 1 main price+volume grid and a **dynamic number of oscillator grids** below it.
  - An `oscillatorGroups` array in `buildOption` collects enabled oscillators (RSI, Stoch/KDJ, CCI, BIAS, Momentum, ROC, DMA, TRIX, ATR, ADX, WPR, MACD, OBV, VR) and allocates one grid/xAxis/yAxis lane per group.
  - Price overlays (MAs, BB, Keltner, Donchian, Ichimoku, VWAP, PSAR, price line/area) always render on the main grid.
  - All x-axes share the same `categories` so zoom/scroll stays synchronized via a single `inside` dataZoom configured over all xAxis indices.
  - Y-axis type for the main pane toggles between linear/log via `logToggle`.
  - Timeframe & range controls are driven by buttons with `data-tf` / `data-range` attributes.
  - Grid height allocation uses a single dominant main pane plus zero or more oscillator panes: when no oscillators are enabled, the main price+volume grid occupies almost the full vertical span; when oscillator groups are enabled, the main grid keeps at least ~50% of the available height and the remainder is divided across oscillator lanes without exceeding the overall 100% height.

## 3D chart modes

- **Main 3D mode (`data-mode="3d"`)** 
  - Controlled by the existing chart mode chips; when selected, `chartMode === '3d'` sets a `use3dMain` flag inside `buildOption`.
  - Disables 2D price/overlay series on the main pane (except for the 2D volume underlay) and adds `grid3D`, `xAxis3D`, `yAxis3D`, `zAxis3D` plus a set of `line3D` series for:
    - Price (using the same close-based `lineValues` as the 2D price line).
    - EMA 50 / EMA 20 / EMA 100, SMA 20.
    - Bollinger Bands (upper/lower/basis) and Keltner channels (upper/lower/basis).
  - The Z axis is driven by a configurable indicator chosen via the `"3D chart"` tab in the settings panel (`#setting-3d-main-z-source`), currently supporting:
    - `rsi.14`, `ema.50`, `macd.line`, `obv`, `atr.14`, `adx.14`.
  - A helper (`build3DSeriesData`) converts Y and Z series into `[index, y, z]` triples so the 3D view stays aligned with the current time/range window, and `zAxis3D.min/max` are derived from the chosen indicator range.
  - Volume remains a 2D bar series on the main grid (secondary y-axis), and all oscillator panes keep their existing 2D layout and behavior.
  - Zoom and scroll are still driven by the shared `inside` dataZoom on the 2D x-axes; when switching modes (e.g. 2D → 3D → 2D) the current zoom window is preserved via a small `dataZoom` state snapshot in `render()`.

- **3D inspector pane**
  - Implemented as a second ECharts instance bound to `#chart-3d-indicator`, rendered as a floating window in the bottom-right of the main chart.
  - Toggled via the "3D inspector" checkbox (`#toggle-3d-indicator`) inside the indicator menu. When enabled, `render3dIndicator()` builds a separate option and shows the pane; disabling it hides the container and clears the 3D instance.
  - Uses the same sliced candle feed as the main chart:
    - `getTimeframeData()` → `applyRangeToData()` → optional Range/Renko/Kagi transforms.
    - Respects the `MAX_RENDER_BARS` / `getDynamicMaxBars` window and the streaming tail, so performance characteristics match the main view.
  - Axis mapping:
    - X/Y/Z are chosen via three selects in the `3D chart` tab:
      - `#setting-3d-indicator-x`, `#setting-3d-indicator-y`, `#setting-3d-indicator-z`.
    - Supported keys include time/index, price fields (close/high/low), raw volume, and several mapped indicator series (RSI 14, EMA 50, MACD line/hist, OBV, ATR 14, ADX 14).
    - A lightweight registry maps these keys to numeric arrays; `[x,y,z]` triples are then assembled and fed into a single `line3D` series.
  - Axis ranges are automatically computed per render from the visible data, and a dedicated tooltip shows the numeric values for the currently hovered 3D point using the chosen axis keys.
  - Changing timeframe, range, price mode (Candles/Heikin/Range/Renko/Kagi), or performance preset will re-run the same data pipeline and re-render the 3D inspector on the next `render()`.

## Planned extensions / choices

-- **[choice] Add "heavier" indicators (e.g. ADX, Ichimoku, volume profile-like views)**
  - Pros: gets even closer to the richer ECharts gallery / trading terminals.
  - Cons: significantly more math and UI complexity; higher risk of clutter.

-- **[choice] Add alternative price chart modes (OHLC emulation, Renko-like, baseline area)**
  - Pros: showcases how to transform the candle feed into alternative price representations while reusing the multi-pane layout.
  - Cons: more derived-data logic; can be confusing on top of random-walk candles.
  - Current: OHLC, Heikin-Ashi, a Range mode that aggregates candles into synthetic fixed-range bars, and a Renko mode that builds ATR-sized bricks from price moves, all via helpers in `terminal-echarts.js`. Future: explore Kagi-style modes built on the same transformation pattern.

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
5. **Terminal-only cleanup**: once we confirm no remaining dependencies, remove the legacy indicator demo HTML/TS files, dedupe helpers (e.g., `sample-data`, `mapping-helpers`, `price-modes-helpers`), and keep `terminal.html` + `terminal-echarts.js` as the only public entry point.

## Recent changes

- 2025-12-10: Wired the OBV checkbox (`#toggle-obv`) into the indicator change handlers so toggling OBV alone re-renders the chart and shows/hides the OBV line in the MACD/OBV pane.
- 2025-12-10: Tightened vertical spacing for RSI and MACD/OBV panes in `terminal-echarts.js` by reducing top grid margin and forcing their y-axes to use `dataMin`/`dataMax`, so oscillators sit closer to the center of their panes.
- 2025-12-10: Added a Heikin-Ashi chart mode (`data-mode="heikin"`) that renders derived candles while keeping all overlays/indicators in sync.
- 2025-12-10: Expanded overlays to include Donchian channels (`computeDonchian`), VWAP (`computeVWAP`), Parabolic SAR (`computeParabolicSAR`), and an Ichimoku 9/26/52 cloud (`computeIchimoku`), each with dedicated toggles.
- 2025-12-10: Expanded oscillators to include KDJ J, Momentum 10, ROC 10, Williams %R 14, ATR % 14, and ADX 14 (+DI/-DI), plus an organized indicator menu grouping overlays, volume, oscillators, and MACD.
- 2025-12-10: Wired Donchian (`#toggle-donchian`) and Ichimoku (`#toggle-ichimoku`) checkboxes into the shared indicator change handler list so they re-render the chart immediately when toggled instead of only updating when another indicator is changed.
- 2025-12-10: Converted the flat indicator dropdown into grouped, collapsible sections (Overlays, Volume, Oscillators, MACD) that start collapsed and can be expanded via a section header and caret in the `indicator-menu`.
- 2025-12-10: Reworked the layout so each enabled oscillator group (RSI, Stoch/KDJ, CCI, BIAS, Momentum, ROC, ATR, ADX/+DI/-DI, WPR, MACD, OBV) gets its own grid/xAxis/yAxis lane via an `oscillatorGroups` helper in `buildOption`, while all price overlays remain on the main pane.
- 2025-12-10: Added a Range chart mode (`data-mode="range"`) to the ECharts terminal header that uses a `buildRangeBars` helper in `terminal-echarts.js` to aggregate the current timeframe data into synthetic range bars, with bar size configurable via a "Range bar size" field in the indicator settings panel.
- 2025-12-10: Added a Renko chart mode (`data-mode="renko"`) that uses a `buildRenkoBricks` helper to construct ATR-based Renko bricks from the current timeframe data, with an optional "Renko box size" override in the Price modes settings section.
- 2025-12-10: Added a Kagi chart mode (`data-mode="kagi"`) that uses a `buildKagiLines` helper to construct direction-filtered Kagi steps from the current timeframe data, with an optional "Kagi reversal size" override and an ATR-style default when unset.
- 2025-12-10: Documented the newly added VR, DMA, and TRIX indicators, their dropdown placement, oscillator behavior, and settings wiring in the ECharts terminal devplan.
- 2025-12-10: Made double-click to open indicator settings more reliable in `terminal-echarts.js` by tracking the last hovered indicator series name on `mousemove` and using it as a fallback in the `chart.on('dblclick', ...)` handler when ECharts reports the click on the generic price/empty series instead of the intended indicator.
- 2025-12-10: Noted that the `indicator-examples` dev server uses Vite with `server.port = 3003` and `server.open = true`, so running `pnpm dev` in that folder automatically opens `http://localhost:3003/` in the browser without needing to click the IDE's port link.
- 2025-12-10: Updated `indicator-examples/index.html` so visiting `http://localhost:3003/` redirects directly to `http://localhost:3003/src/terminal.html` (terminal-style demo) instead of the generic `src/` index.
- 2025-12-10: Pinned the ECharts axis tooltip in `terminal-echarts.js` to a fixed position near the top-left of the main chart pane (just right of the sidebar `+` tool) so the per-bar stats panel renders as a stable overlay instead of moving around with the crosshair.
- 2025-12-10: Reworked the terminal tooltip formatter so the fixed overlay shows a single line for Price (price/open/close/lowest/highest) followed by one line per indicator (grouping multi-line overlays like Bollinger, Keltner, Donchian, MACD, Ichimoku, ADX), with all numeric values formatted to 6 decimal places.
 - 2025-12-10: Switched the terminal demo's synthetic data generator to produce approximately 50 years of 5-minute candles by default and aligned the 15m/1h/4h/1d timeframe downsampling factors with that 5-minute base (3, 12, 48, 288).
 - 2025-12-10: Made the terminal tooltip overlay background fully transparent (no border) so only the text appears over the chart near the top-left corner.
 - 2025-12-10: Added ECharts-style VR 26, DMA (10, 50), and TRIX (18, 9) indicators to the terminal demo: checkboxes in the Volume/Oscillators dropdown sections, numeric controls in the indicator settings panel, dedicated oscillator panes via `oscillatorGroups`, entries in `indicatorPopupConfigsBySeries` so double-click opens focused parameter popups, and inclusion in the grouped tooltip formatter.
 - 2025-12-10: Introduced a simple "windowed" rendering model in `terminal-echarts.js`: the synthetic base feed is capped to ~20k 5-minute candles and `applyRangeToData` enforces a dynamic tail window based on viewport width (via `getDynamicMaxBars`, clamped by `MAX_RENDER_BARS`), so all ranges (including "All") only render slightly more data than fits on screen. This keeps indicator computations and ECharts option construction fast enough to feel like a streamed feed while preserving smooth zoom/scroll within that window.
 - 2025-12-10: Enabled incremental streaming in the ECharts terminal demo: a timer appends new synthetic candles to the mutable `baseData` every second (`STREAM_INTERVAL_MS`), caps history at ~50k bars (`MAX_HISTORY_BARS`), and relies on the `MAX_RENDER_BARS` window so each frame only processes a recent tail, making the feed feel live while preserving performance.
- 2025-12-10: Fixed Renko mode so overlays (EMAs, SMA, Bollinger, price line/area, MACD hist, volume) no longer appear as hard step functions by switching `mapToBase`/`mapHistToBase`/`mapVolumeToBase` from time-based mapping to index-based suffix alignment, which preserves one indicator sample per synthetic brick even when multiple bricks share the same timestamp.
- 2025-12-10: Updated `buildRenkoBricks` so each synthetic brick gets a unique monotonically increasing `time` (derived from the first bar's time plus an integer brick index) instead of reusing the source candle's timestamp, making Renko data self-contained and safer to reuse independently of the original feed.
 - 2025-12-10: Added `indicator-examples/tests/synthetic-modes.test.mjs`, a Node `node:test` suite that covers `buildRangeBars`/`buildRenkoBricks`/`buildKagiLines` and the mapping helpers (`mapToBase`/`mapHistToBase`/`mapVolumeToBase`) to guard against regressions in synthetic price modes and Renko/Range/Kagi indicator alignment.
 - 2025-12-10: Added a "Go live" bottom-bar button (`#go-live`) that dispatches an ECharts `dataZoom` action to reset the main x-axis zoom to `[start: 0, end: 100]` on the current tail window, so after scrolling back in history you can jump straight back to the live edge of the streamed feed.
 - 2025-12-10: Added a pause/resume stream toggle (`#stream-toggle`) in the bottom bar that starts/stops the shared streaming interval (`startStream`/`stopStream`), flipping its label between "Pause" and "Resume" and its `active` class, so you can freeze the chart for inspection and then resume live updates.
 - 2025-12-10: Added performance presets (`#perf-preset` select with Light/Normal/Heavy) that adjust the dynamic window size (`perfPxPerBar`, `perfMinBars`) and the streaming interval (`streamIntervalMs`), restarting the stream when changed so users can trade off history depth vs. smoothness according to their machine.
- 2025-12-10: Added a 3D main chart mode (`data-mode="3d"`) that uses `echarts-gl` to replace the 2D price/overlay pane with a `grid3D` + `line3D` representation whose Z axis is mapped from a selectable indicator (RSI 14, EMA 50, MACD line, OBV, ATR 14, ADX 14), while keeping the volume underlay and all oscillator panes in 2D.
- 2025-12-10: Added a floating 3D inspector pane (`#chart-3d-indicator`, toggle `#toggle-3d-indicator`) backed by a second ECharts instance, with X/Y/Z axis mapping dropdowns (`#setting-3d-indicator-x`, `#setting-3d-indicator-y`, `#setting-3d-indicator-z`) that can target price, volume, and indicator series, all sharing the same timeframe/range window and streaming behavior as the main chart.
- 2025-12-10: Extended the indicator settings panel with a `3D chart` tab that contains the main 3D Z-axis source select (`#setting-3d-main-z-source`) and the 3D inspector axis-mapping controls, wiring all of them so changes immediately re-render the relevant 3D views.
   148→ - 2025-12-11: Replaced naive index-based timeframe downsampling in `getTimeframeData` with an `aggregateCandlesByFactor` helper that builds true higher-timeframe OHLCV+volume candles from the single 5-minute base feed, eliminating artificial gaps/spikes between 15m/1h/4h/1d views.
   149→ - 2025-12-11: Locked the main price y-axis in `buildOption` to a padded `[min,max]` range computed from the current timeframe/range data (`paddedMin`/`paddedMax`), so horizontal zoom/scroll via `dataZoom` no longer rescales the vertical axis while still letting the pane use nearly the full available height.
   150→ - 2025-12-11: Further refined the fixed y-axis range to sample only the most recent portion of the timeframe/range window (minimum 60 bars or ~35% of the slice) before computing 2nd/98th percentile bounds, preventing low-timeframe views (5m/15m/1h/4h) from flattening when older price extremes differ greatly from the current region.
- 2025-12-11: Replaced the previous y-axis clamping logic (which still applied stale `[min,max]` pairs when the sampled slice produced `NaN` or huge ranges) with a shared `computeVisiblePriceRange` helper that (a) samples the active tail window, (b) uses quantiles + padding, (c) guards log-scale lower bounds, and (d) only applies fixed min/max when both are finite. The same range is now reused for the 3D mode's `yAxis3D`, eliminating the zero-pinned price labels and empty lower pane in the terminal screenshot.
