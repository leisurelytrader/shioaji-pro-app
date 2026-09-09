# Private market history API contract

The existing Shioaji Pro frontend remains the display and interaction layer. A separate local market collector should subscribe to the same Shioaji SSE feed and persist **raw Tick events** and **raw five-level bid/ask snapshots**. The frontend must query those raw snapshots again for every historical threshold entered by the user; it must not depend only on alerts generated with the live threshold.

## Historical large-order search

```http
GET /api/private/depth-alerts?symbol=TXFR1&from=2026-09-07T08:45:00+08:00&to=2026-09-07T13:45:00+08:00&sides=bid,ask&levels=1,2,3,4,5&min_quantity=199
```

The response is:

```json
{
  "items": [
    {
      "id": "depth-event-id",
      "code": "TXFR1",
      "side": "ask",
      "level": 1,
      "price": 21850,
      "quantity": 205,
      "threshold": 199,
      "date": "2026-09-07",
      "time": "09:15:32.123456",
      "eventTime": 1788736532123,
      "eventType": "cross-above",
      "sourceDepthId": 12345
    }
  ],
  "total": 1
}
```

The endpoint should evaluate the submitted threshold against stored raw snapshots. It should support a future `event_mode` parameter such as `snapshot-match`, `cross-above`, `appear`, and `disappear`. Results should be ordered by event time and deduplicated by symbol, side, level, and threshold crossing.

## Raw storage minimum

A depth snapshot should store the symbol, trading date, event timestamp, source date/time, five bid prices and quantities, five ask prices and quantities, and receive timestamp. A Tick record should store the symbol, source date/time, event timestamp, trade price, volume, total volume, tick type, and receive timestamp. Both tables should be indexed by `(symbol, event_time)` and partitioned by trading date when the data volume requires it.

The collector should write in batches rather than issuing one database transaction per SSE event. It should also retain the `Asia/Taipei` timezone and a separate `trading_date`, because the 15:00–05:00 night session crosses the civil-date boundary.

## Frontend integration

`src/lib/large-order.ts` exposes the frontend query contract and publishes returned items to the same event store used by the live detector. `CandleChart` renders both live and historical events through the existing lightweight-charts marker layer, snapping each event to its containing candle.

The current public repository is frontend-only. This endpoint is intentionally a contract for the private collector/backend and will return an error until that service is running.
