# Shioaji Pro 私有行情 Collector

Collector 連接已登入的 Shioaji Pro API，訂閱 Tick 與 BidAsk，將資料寫入 SQLite，並提供歷史大單查詢 API。Collector 不保存券商帳號、密碼或憑證，也不再需要 PostgreSQL 或 Docker。

## 本機執行

```powershell
pnpm install
Copy-Item .env.example .env
pnpm run build
pnpm start
```

預設資料庫為：

```text
./data/shioaji-market.sqlite
```

父目錄會自動建立。

`.env` 最重要的設定：

```env
SHIOAJI_BASE_URL=http://127.0.0.1:21322
DATABASE_URL=./data/shioaji-market.sqlite
COLLECTOR_HOST=127.0.0.1
COLLECTOR_PORT=8787
COLLECTOR_SYMBOLS=TXFR1
COLLECTOR_CONTRACTS_JSON=[{"security_type":"FUT","exchange":"TAIFEX","code":"TXFR1","target_code":null,"intraday_odd":false}]
```

先確認 Shioaji Pro API：

```powershell
curl.exe http://127.0.0.1:21322/api/v1/health
```

## Windows 11 Collector.exe

本專案使用 Node.js 22 SEA（Single Executable Application）將 Collector 打包為單一 Windows 執行檔。請在 Windows 11 x64，於本目錄執行：

```powershell
pnpm install
pnpm run build:windows
```

腳本會建立：

```text
dist/collector.exe
../src-tauri/binaries/collector-x86_64-pc-windows-msvc.exe
```

目前 Linux 環境不能直接產生 Windows `.exe`；必須在 Windows 11 或 GitHub Actions 的 `windows-latest` runner 執行上述指令。

## Tauri 啟動方式

Tauri 主程式啟動時會：

1. 開啟前端視窗；
2. 啟動 `collector-x86_64-pc-windows-msvc.exe`；
3. 將 SQLite 檔案位置指定到 Windows 使用者 AppData；
4. Collector 連接 Shioaji Pro 並開始收集；
5. Tauri 關閉時停止 Collector。

Tauri build 前，sidecar 必須存在於：

```text
src-tauri/binaries/collector-x86_64-pc-windows-msvc.exe
```

## API

健康檢查：

```text
GET http://127.0.0.1:8787/health
```

歷史大單：

```text
GET /api/private/depth-alerts?symbol=TXFR1&from=2026-09-09T00:00:00%2B08:00&to=2026-09-09T23:59:59%2B08:00&sides=bid,ask&levels=1,2,3,4,5&min_quantity=199
```

判斷規則仍為：

```text
上一筆數量 < 門檻，且目前數量 >= 門檻
```

回應格式維持既有前端契約，包含 `sourceDepthId`、`side`、`level`、`price`、`quantity`、`threshold`、`date`、`time` 與 `eventTime`。
