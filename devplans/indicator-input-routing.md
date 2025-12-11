---
description: universal indicator input routing between price, volume, and other indicators across panes
---

## Context

- **Repo**: lightweight-charts / indicator-examples.
- **Current behavior**:
  - Most indicators take their input implicitly from the main price series (usually `close`), sometimes from volume.
  - Overlays (e.g., EMA, Bollinger Bands) are generally bound to the main price pane; oscillators (e.g., RSI) live in dedicated panes.
  - There is no generic way to:
    - Route an indicator's input to *another* indicator (e.g., Bollinger Bands of RSI 14 vs RSI 28).
    - Route an indicator to volume or other non-price feeds.
    - Move an indicator (or overlay) between panes/lanes while preserving its input wiring.
- **Goal**: design a universal, pane-aware indicator input routing system that works for price, volume, and indicator-on-indicator chains.

## High-level goals

- **Universal input sources**
  - Any indicator can choose its input from:
    - Price (OHLC, derived price lines).
    - Volume and volume-like series.
    - Outputs of other indicators (e.g., RSI, EMA, MACD signal line).
- **Pane-aware overlays**
  - Overlays should be attachable to any pane/lane (e.g., Bollinger Band of RSI sits in the RSI pane).
  - Moving a host indicator (e.g., RSI 14) between panes should carry its dependent overlays/indicators with it, or at least keep them logically linked.
- **Configurable routing UI**
  - Clear UX in the demo(s) to:
    - Choose an indicator's input at creation time.
    - Change it later (e.g., BB from `RSI 14` to `RSI 28`).
    - Move indicators between panes without breaking their inputs.
- **Engine-agnostic design**
  - Core routing model should not depend on ECharts vs. lightweight-charts.
  - ECharts terminal and future native demos should share the same conceptual model.

## Functional requirements

- **Indicator as node in a graph**
  - Each indicator instance is a node with:
    - Stable `id`.
    - `type` (RSI, EMA, BB, MACD, etc.).
    - Parameters (periods, multipliers, etc.).
    - `inputs`: list of input references (price/volume/indicator).
    - `paneId` / `laneId` describing where it renders.
- **Input reference abstraction**
  - Represent inputs as structured refs, not raw arrays:
    - `kind`: `"price" | "volume" | "indicator" | "custom"`.
    - `sourceId`:
      - For `price`/`volume`: the series key (e.g., `main-price`, `main-volume`).
      - For `indicator`: the `id` of the producing indicator instance.
    - `component` / `path`:
      - For candles: `close`, `open`, `high`, `low`, `hl2`, etc.
      - For indicators with multiple outputs (MACD, Ichimoku): which line/component.
- **Evaluation order**
  - Indicator computation engine should:
    - Treat the indicator list as a directed acyclic graph (DAG).
    - Topologically sort indicators based on their `inputs`.
    - Detect and reject cycles early (e.g., A depends on B which depends on A).
- **Pane and scale handling**
  - Distinguish:
    - **Pane**: vertical section of the chart (main price, RSI, MACD, etc.).
    - **Lane**: sub-lane inside a pane if needed (e.g., multiple oscillators sharing a pane).
  - Allow an indicator to specify:
    - `preferredPaneType`: `"price" | "oscillator" | "volume" | "inherit"`.
    - Default pane assignment rule:
      - If input is a price/volume series, attach as overlay or sub-pane depending on indicator type.
      - If input is an indicator, default to the same pane as the input.
- **Moving indicators between panes**
  - Moving an indicator should:
    - Update its `paneId` / `laneId`.
    - Optionally offer to move its dependents (e.g., BB built on RSI).
    - Preserve all input references and computed dependencies.
- **Volume and non-price series**
  - Support indicators that:
    - Take raw volume as input (e.g., moving average of volume).
    - Take composite series (e.g., typical price, VWAP) as inputs.
  - Ensure volume-based indicators can live in either the main pane or their own volume pane.

## Design sketch

### 1. Indicator graph model

- Introduce a central in-memory model, e.g.:

```ts
interface IndicatorNode {
  id: string;
  type: string; // "rsi", "ema", "bb", "macd", etc.
  params: Record<string, unknown>;
  inputs: IndicatorInputRef[];
  paneId: string; // e.g., "main", "osc-1", "osc-2"
  laneId?: string; // optional within a pane
}

interface IndicatorInputRef {
  kind: "price" | "volume" | "indicator" | "custom";
  sourceId: string; // price/volume key or indicator id
  component?: string; // e.g., "close", "value", "macd", "signal", "hist"
}
```

- Maintain a registry of:
  - Base series nodes (price, volume, any synthetic price modes) as implicit sources.
  - Indicator nodes as configured by the demo UI.
- Provide a helper to:
  - Validate the graph (no cycles, all sources resolvable).
  - Compute an execution order given the active time range and timeframe.

### 2. Input source abstraction & discovery

- Maintain a catalog of possible inputs for the UI:
  - **Price series**: `close`, `open`, `high`, `low`, `hl2`, `hlc3`, etc.
  - **Volume series**: raw volume, volume MA, VWAP (if treated as input).
  - **Indicators**: one entry per indicator node, with human label and type.
- Provide a function like `listAvailableInputs()` scoped to the current chart:
  - Returns objects with:
    - `id`, `label`, `kind`, `paneId`.
    - Optional `components` when an indicator exposes multiple outputs.
- Use this list to populate dropdowns in:
  - Indicator creation dialog.
  - Indicator settings / edit panel.

### 3. Pane / lane model

- Standardize pane metadata, e.g.:

```ts
interface PaneConfig {
  id: string;
  kind: "price" | "volume" | "oscillator";
  label: string;
  order: number;
}
```

- **Default pane rules**:
  - Price-based overlays (MA, BB, Donchian, Ichimoku, etc.) → main price pane by default.
  - Oscillators (RSI, Stoch, MACD, CCI, etc.) → new or existing oscillator pane.
  - Indicator-on-indicator:
    - Default to the same pane as the source indicator.
    - Allow override via UI to move to another pane.
- **Pane movement semantics**:
  - Drag-and-drop or context menu to move an indicator to another pane.
  - When moving an indicator that has dependents, offer choices:
    - Move dependents with it (maintain visual grouping).
    - Keep dependents in place but still referencing the moved indicator.

### 4. UI and UX flows

- **Creating an indicator**:
  - Step 1: choose indicator type (RSI, BB, etc.).
  - Step 2: set parameters (period, multipliers).
  - Step 3: choose input source from `listAvailableInputs()`:
    - Price (default).
    - Volume.
    - Another indicator (e.g., `RSI 14`, `RSI 28`).
  - Step 4: choose pane behavior:
    - "Auto" (use default rules).
    - Explicit pane (main / specific oscillator lane).
- **Editing an indicator**:
  - In the settings popup, always show an **Input source** field:
    - Changing it rewires the graph and triggers recompute.
    - Example: BB input changed from `Price (Close)` to `RSI 14`.
- **Moving between panes/lanes**:
  - Allow:
    - Drag indicator label between pane headers.
    - Or a `Move to pane...` action in the context menu.
  - Ensure BB-of-RSI stays visually tied to the RSI pane by default.

### 5. Engine integration

- **Indicator computation layer**:
  - Expose a function (conceptually) like `computeIndicators(graph, baseSeries, timeRange)`.
  - Handle:
    - Resolving each node's inputs from base series or previously computed nodes.
    - Caching results per timeframe/range to avoid recomputation.
- **Rendering integration**:
  - Map `paneId` / `laneId` to ECharts grids or lightweight-charts panes.
  - For each indicator node:
    - Decide series type (line, band, histogram, scatter, etc.).
    - Attach to the appropriate y-axis (price, oscillator, volume) per `paneId`.

## Design choices

- **Option A (recommended): Central indicator graph + shared input abstraction**
  - Pros:
    - Single source of truth for indicator definitions, inputs, and panes.
    - Scales well to complex indicator-on-indicator chains.
    - Easier to port between demos (ECharts, native lightweight-charts, Pine loader).
  - Cons:
    - Requires refactoring existing demos to use the shared graph model.
    - Slightly higher conceptual complexity for contributors.

- **Option B: Per-demo, ad-hoc input routing**
  - Pros:
    - Less up-front refactor; can be done locally in the ECharts terminal first.
    - Easier to spike quickly for a single demo.
  - Cons:
    - Logic duplicated across demos with subtle divergences.
    - Harder to maintain and extend when adding more complex chains.

- **Option C: Embed routing logic in each indicator implementation**
  - Pros:
    - Minimal abstraction; each indicator knows how to fetch its data.
  - Cons:
    - Very hard to express chains (BB-of-RSI-of-price) consistently.
    - Tightly couples indicator math with chart plumbing.

## Phased implementation plan

1. **Model & validation (graph only)**
   - Implement `IndicatorNode`, `IndicatorInputRef`, and `PaneConfig` types.
   - Build functions to:
     - Register base series and indicator nodes.
     - Validate inputs and detect cycles.
     - Produce an evaluation order.

2. **Wire ECharts terminal to the graph model**
   - Refactor existing indicators to be declared as `IndicatorNode`s.
   - Replace direct calls (e.g., `computeEMA(priceLine)`) with graph-driven evaluation.
   - Ensure current behavior (price-based inputs, fixed panes) is preserved.

3. **Expose input selection in the UI**
   - Add `Input source` control to indicator creation and settings.
   - Implement `listAvailableInputs()` based on the current graph.
   - Allow:
     - BB of price.
     - BB of RSI 14.
     - BB of RSI 28.
     - Other indicator-on-indicator combinations.

4. **Pane and lane controls**
   - Implement `paneId` / `laneId` on nodes and map them to chart panes.
   - Add UI to move indicators between panes.
   - Ensure dependent indicators (e.g., BB-of-RSI) follow sensible defaults when their input is moved.

5. **Refinement and extension**
   - Add volume and non-price inputs (e.g., volume MA, VWAP) as first-class options.
   - Tune default pane assignment rules for clarity.
   - Consider visual cues for chained indicators (e.g., small chain icon, breadcrumbs).

6. **Optional: Share model with other demos (Pine loader, native lightweight-charts)**
   - Reuse the graph model in the Pine loader and any native lightweight-charts demos.
   - Allow Pine-defined indicators to become nodes with configurable inputs and panes.

## Open questions / decisions

### 1. Scaling mismatches (price vs volume vs oscillators)

- **Option S1: Dedicated y-axis per pane, rely on autoscale (recommended)**
  - Pros:
    - Simple and close to current behavior in the ECharts terminal.
    - Works naturally for indicator-on-indicator chains that share a pane.
    - Minimal additional logic; keeps indicator math in original units.
  - Cons:
    - If a pane mixes very different magnitudes (e.g., price + volume-derived series), one series can appear visually squashed.

- **Option S2: Implicit normalization for some inputs (0–1, 0–100, z-score)**
  - Pros:
    - Makes it easier to compare very different series on the same pane.
    - Useful for correlation/relative-strength style overlays.
  - Cons:
    - Hides true units; Bollinger Bands on a normalized series no longer map to intuitive price or volume levels.
    - Adds complexity and potential confusion for users who expect raw values.

- **Option S3: Per-indicator scale modes ("raw" vs "normalized")**
  - Pros:
    - Maximum flexibility; lets users opt-in to normalization for special cases.
    - Can be rolled out only for selected indicators that benefit from it.
  - Cons:
    - More UI surface and conditional logic.
    - Easy to create hard-to-understand combinations without clear visual cues.

**(Recommendation)**: Start with **Option S1** only (dedicated y-axis per pane, autoscale). Design the pane/y-axis model so that **Option S3** could be added later if a strong use-case appears.

### 2. Indicator exposure (which components are legal inputs)

- **Option E1: Conservative exposure of primary outputs (recommended starting point)**
  - Behavior:
    - Expose only the primary numeric output of each indicator as a valid input
      (e.g., RSI line, MACD main line, OBV line, VWAP line).
  - Pros:
    - Simple, compact input lists.
    - Minimizes odd combinations (e.g., BB of MACD histogram) that are hard to interpret.
    - Easier to document and test initially.
  - Cons:
    - Limits more advanced use-cases (e.g., routing into MACD histogram or ADX DI lines).

- **Option E2: Full exposure with expert-only toggle**
  - Behavior:
    - Expose all numeric outputs from multi-component indicators (MACD line/signal/hist, ADX/+DI/-DI, Ichimoku lines, etc.).
  - Pros:
    - Maximum flexibility, closer to Pine-style freedom.
    - Enables niche but powerful combinations for advanced users.
  - Cons:
    - Very noisy input dropdowns.
    - Many combinations will be statistically valid but visually or semantically confusing.

- **Option E3: Per-indicator curated exposure list**
  - Behavior:
    - Each indicator type defines which of its components are exposed, potentially tagged as "primary" vs "advanced".
  - Pros:
    - Fine-grained control; can grow over time without breaking existing behavior.
    - Keeps UI relatively clean while still allowing advanced options.
  - Cons:
    - Requires metadata per indicator type and discipline to keep it updated.

**(Recommendation)**: Implement **Option E1** now and structure the indicator metadata so that **Option E3** can be layered on later (e.g., by adding per-indicator exposure flags). Avoid **E2** for the initial implementation to keep the demo understandable.

### 3. Graph scope (where the indicator graph lives)

- **Option G1: Per-chart-instance graph (recommended)**
  - Behavior:
    - Each rendered chart/terminal instance owns its own indicator graph.
  - Pros:
    - Matches mental model: layout and routing belong to a specific chart.
    - Avoids accidental coupling when multiple charts are open.
    - Makes serialization/loading per layout straightforward.
  - Cons:
    - Duplicates similar graphs if multiple charts intentionally share the same setup.

- **Option G2: Per-symbol graph**
  - Behavior:
    - Graph keyed by symbol, shared across all charts showing that symbol.
  - Pros:
    - Potentially convenient if the same symbol layout is always reused.
  - Cons:
    - Hard to reconcile when two charts of the same symbol intentionally diverge.
    - Requires extra rules for when symbol/layout conflicts occur.

- **Option G3: Global demo-wide graph**
  - Behavior:
    - Single graph shared across the entire demo.
  - Pros:
    - Simplest if there is exactly one chart.
  - Cons:
    - Does not scale to multiple charts or terminals.
    - Couples otherwise independent views too tightly.

**(Recommendation)**: Use **Option G1** (per-chart-instance). If needed later, add export/import of graphs so users can clone a layout between symbols or charts without changing the core scope model.

### 4. Persistence (saving routing and pane layout)

- **Option P1: No persistence, in-memory only**
  - Pros:
    - Minimal implementation; focuses on core routing behavior first.
  - Cons:
    - Layout and routing are lost on refresh; inconvenient for deeper experiments.

- **Option P2: URL-based ephemeral persistence (query string / hash)**
  - Behavior:
    - Serialize indicator graph + pane layout into the URL so it can be restored on load.
  - Pros:
    - Easy to share example setups via URL.
    - No server or storage dependencies; good for demos.
  - Cons:
    - URL length limits for complex layouts.
    - Requires careful encoding/decoding and versioning.

- **Option P3: Local storage–backed named presets (recommended once base is stable)**
  - Behavior:
    - Allow saving/loading named configurations into `localStorage` (or similar).
  - Pros:
    - Survives page reloads without needing a backend.
    - Lets users maintain several personal layouts.
  - Cons:
    - Not shareable across browsers/machines without an explicit export.

- **Option P4: Server-side persistence**
  - Pros:
    - Best long-term story for collaborative or account-based layouts.
  - Cons:
    - Out of scope for this repo; requires backend infrastructure.

**(Recommendation)**: Start with **Option P1** (no persistence) while building and stabilizing the routing model. Design the graph data structures so that **P2** (URL-based) or **P3** (local presets) can be added later without breaking existing code.

## Recent changes

- 2025-12-10: Initial plan for a universal indicator input routing system, including indicator graph model, input abstraction, pane-aware overlays, and phased implementation steps.
