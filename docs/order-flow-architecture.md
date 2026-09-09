# Order Flow Architecture

## Purpose

The order-flow layer converts normalized Tick and five-level BidAsk events into reusable data for Volume Delta, Footprint, suspected iceberg orders, and absorption signals. The calculation layer is intentionally pure so the same code can be used by live streaming, historical search, and backtesting.

## Data flow

```text
Shioaji Tick SSE ─┐
                  ├─ normalizeTick / normalizeDepth
Shioaji BidAsk ───┘
                         │
                         ├─ alignTicksToDepth()
                         ├─ buildVolumeDelta()
                         ├─ buildFootprint()
                         └─ analyzeDepthTransitions()
                                  ├─ detectIcebergs()
                                  └─ detectAbsorption()

Collector SQLite/API ── historical adapter ── same pure functions

Chart UI:
  CandleChart ─────── K-bar markers and signal overlays
  FootprintPanel ──── price cells: buy × sell, delta, imbalance
  DeltaPanel ──────── per-bar delta and cumulative delta
  OrderFlowWorkbench ─ thresholds, confidence, time range, export/import
```

## Canonical data structures

`NormalizedTick` contains `eventTime`, `receivedAt`, price, quantity, and aggressor side. The current mapping is `tick_type=1` for aggressive buy, `tick_type=2` for aggressive sell, and any other value for unknown. Unknown volume remains visible in totals but is excluded from Delta.

`NormalizedDepth` contains at most five bid and five ask levels. Each level preserves side, rank, price, and displayed quantity. The event timestamp is the market source timestamp; `receivedAt` is retained for diagnosing delayed or reordered packets.

`OrderFlowBar` contains buy volume, sell volume, unknown volume, total volume, Delta, and cumulative Delta. `FootprintBar` extends it with price-level cells. Each cell contains buy volume, sell volume, unknown volume, total volume, Delta, and a buy/sell/none imbalance classification.

## Frontend component design

The first UI integration should be a separate `FootprintPanel` rather than modifying candlestick rendering. It receives a `FootprintBar` and renders a virtualized price table. A row displays:

```text
price | sellVolume | totalVolume | buyVolume | delta | imbalance
```

The row background opacity is proportional to `totalVolume / maxCellVolume`. Buy imbalance uses green, sell imbalance uses red, and unknown volume uses a neutral color. The selected K-bar is controlled by the existing chart crosshair; changing the crosshair requests or selects the corresponding `FootprintBar`.

`DeltaPanel` receives `OrderFlowBar[]` and renders a zero-centered histogram plus an optional cumulative line. It should not recalculate Delta in React render functions; calculations belong in a memoized adapter or a worker for large historical ranges.

`CandleChart` should only consume signal outputs for markers. A signal marker should include `time`, `price`, `direction`, `label`, `confidence`, and a stable ID. The chart must distinguish `suspected iceberg`, `buy absorption`, and `sell absorption` from ordinary large-order markers.

## Live update strategy

1. Keep a bounded rolling buffer of normalized ticks and depths for the active symbol.
2. Append new events in source-time order; use `receivedAt` to resolve ties.
3. Recompute only the active bar and the latest depth transition window.
4. Replace the last `FootprintBar` instead of appending duplicate bars.
5. On timeframe or symbol changes, discard the live buffer and rebuild from the selected historical range.
6. Never infer a confirmed fill from a single depth disappearance. Expose confidence and the evidence quantities.

## Historical adapter

The Collector API should return raw or normalized rows for a symbol and time range. The frontend adapter maps database rows into `RawTick` and `RawDepth`, then calls `analyzeOrderFlow()`. This keeps historical and live output identical and makes backtest comparisons reproducible.

## Performance boundaries

For a short live window, the pure functions can run on the main thread. For more than approximately 10,000 ticks or 1,000 depth snapshots, move the calculation into a Web Worker. Transfer plain arrays only; do not pass React state or chart instances into the worker.

## Evidence and limitations

Five-level snapshots do not identify an exchange order ID. A depth reduction is classified as executed only when matching aggressor-side Tick volume exists at the same price and interval. Otherwise it is classified as cancelled/uncertain. Iceberg and absorption outputs must therefore be labelled as suspected signals, with a confidence score and the evidence used for the score.
