---
description: Implement per-indicator parameter+style popups in Terminal demo
---

1. Ensure all indicator parameters are exposed via global settings inputs
   - MAs: EMA (3 lengths), SMA
   - Bands/channels: Bollinger (length, mult), Donchian, Keltner (EMA len, ATR len, mult)
   - Oscillators: RSI, Stoch (len, smoothing), CCI, BIAS, Williams %R, Momentum, ROC
   - Vol/Trend: ATR, ADX (+DI / -DI), OBV (no params), VWAP (no params)
   - Complex: Ichimoku (conv/base/spanB/displacement), MACD (fast/slow/signal)
   - Price modes: Range/Renko/Kagi box/reversal sizes
   - Stop: PSAR step / max step

2. Wire settings into compute layer
   - Implement `getIndicatorSettings()` reading from DOM inputs with sane fallbacks
   - Feed settings into all compute* functions in `buildOption()`
   - Map computed points back to price data via `mapToBase` helpers

3. Implement reusable indicator popup in HTML
   - Add `#indicator-popup` with header (title, close button) and body container
   - Add base CSS for positioning, theming, and small form controls

4. Build popup config map in JS
   - `indicatorPopupConfigsBySeries: Record<string, {title, fields[]}>`
   - One entry per ECharts series `name`
     - e.g. `"EMA 50"`, `"BB Upper"`, `"RSI"`, `"MACD Hist"`, `"BIAS 20"`, `"Parabolic SAR"`, `"Price"`, `"Price Line"`, `"Price Area"`, `"VWAP"`, `"OBV"`
   - `fields[]` points at global DOM inputs for that indicator (or [] if param-less)

5. Popup open/close behavior
   - Track last hovered indicator series via `chart.on('mousemove')`
     - store `lastIndicatorSeriesName`, `lastIndicatorSeriesType`, `lastIndicatorSeriesTime`
   - On `chart.on('dblclick')`:
     - resolve `seriesName` / `seriesType` from params or last hover (within small time window)
     - if series has popup config → open per-indicator popup
     - else → fall back to global `#indicator-settings` panel
   - Clicking outside popup or on its close button closes popup
   - Opening Display or global settings panels closes popup

6. Parameter editing in popup
   - `openIndicatorPopup(config, domEvent, seriesName, seriesType)`
     - Build parameter rows by cloning metadata from `config.fields[]`
     - Wire `change` events to write back into underlying global inputs
     - Call `render()` on each change
   - Add "Reset to defaults" button
     - For each field, restore `input.defaultValue` to both global + popup input
     - Clear any style overrides for that series
     - Call `render()`

7. Style overrides design
   - Maintain `seriesStyleOverrides: Record<string, SeriesStyleOverride>`
   - `SeriesStyleOverride` supports:
     - Lines: `lineColor`, `lineWidth`, `lineOpacity`, `lineDash`
     - Areas (Price Area, Ichimoku Spans): `areaColor`, `areaOpacity`
     - Candlestick Price: `upColor`, `downColor`
     - PSAR scatter: `markerColor`, `markerOpacity`
   - Helper `hexToRgb(hex)` for CSS color composition
   - `applySeriesStyleOverrides(series[])` walks each ECharts series and merges overrides into `lineStyle`, `areaStyle`, `itemStyle`

8. Style section in popup
   - In `openIndicatorPopup` after parameters:
     - Create `Style` subsection when `seriesName` and `seriesType` are known
     - For `type === 'line'`:
       - color picker (line color)
       - width numeric input
       - opacity numeric 0–1
       - dash `<select>`: default / solid / dashed / dotted
       - if `name` supports area: Price Area, Ichimoku Span A/B → area color + opacity
     - For `type === 'candlestick'` & name `"Price"`:
       - up color
       - down color
     - For `type === 'scatter'` & name `"Parabolic SAR"`:
       - dot color
       - dot opacity
   - All inputs update `seriesStyleOverrides[seriesName]` and call `render()`

9. Apply styles during render
   - In `buildOption()` after constructing `series` and appending oscillator groups:
     - call `applySeriesStyleOverrides(series)` before returning the option

10. Ensure coverage for all series
   - Overlays in main pane: Price, EMA 50/20/100, SMA 20, BB Upper/Lower/Basis, Keltner Upper/Lower/Basis, Ichimoku Tenkan/Kijun/Span A/B/Chikou, VWAP, Parabolic SAR, Donchian Upper/Lower/Mid, Price Line, Price Area
   - Oscillators via `oscillatorGroups`: RSI, Stoch %K/%D, KDJ J, CCI 20, BIAS 20, Momentum 10, ROC 10, Williams %R (14), ATR % 14, ADX 14, +DI 14, -DI 14, MACD (line, signal, hist), OBV
   - For each `series.name` above, ensure there is an `indicatorPopupConfigsBySeries` entry (fields either param inputs or [])

11. Coordinate with price modes (Range/Renko/Kagi)
   - Inputs: `setting-range-size`, `setting-renko-box-size`, `setting-kagi-reversal-size`
   - `getIndicatorSettings` should read these and `buildOption()` should route base data through `buildRangeBars` / `buildRenkoBricks` / `buildKagiLines` based on `chartMode`
   - Ensure all indicator computations run off transformed `data` so popups still control derived indicators in alternative modes

12. Testing checklist
   - Double-click on every visible series opens its popup (or global settings if no config)
   - Parameter changes via popup recompute and re-render indicator
   - Style changes via popup update chart visuals immediately
   - Reset button restores both parameters and styles to defaults
   - Display menu & global settings panel continue to function and properly coexist with popups
   - Alternative price modes (Range/others) still work with per-indicator popups

13. Status / notes
   - Core per-indicator parameter+style popups are implemented for all existing overlays/oscillators plus newer ones (DMA, TRIX, VR).
   - Price popup also exposes Range/Renko/Kagi settings; transforms feed all indicator calculations.
   - Volume and MACD Hist have bar-style controls; VWAP/OBV are style-only.
   - 3D chart mode reuses the same underlying settings but currently only exposes configuration via the global settings panel, not dedicated 3D popups.
