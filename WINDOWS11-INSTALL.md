# Windows 11 新電腦完整安裝指南

本指南適用於一台只安裝了：

- 永豐 Shioaji Pro 交易終端；
- Docker Desktop；

其餘環境尚未安裝的 Windows 11 電腦。

預設路徑：

```text
Collector：C:\Users\Leisu\shioaji-private-collector
前端：    C:\Users\Leisu\shioaji-pro-app
```

## A. 先準備完整套件

請不要只下載兩個 `.ps1`／`.bat` 檔案。完整套件必須包含：

```text
shioaji-pro-app\
├── WINDOWS11-INSTALL.md
├── scripts\
│   ├── install-and-start-shioaji.ps1
│   ├── install-and-start-shioaji.bat
│   └── start-shioaji-dev.ps1
├── private-collector\
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── .env.docker.example
│   ├── package.json
│   ├── pnpm-lock.yaml
│   ├── tsconfig.json
│   ├── src\
│   └── sql\
├── src\
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── tsconfig.json
├── vite.config.ts
├── index.html
└── approval.html
```

如果解壓後沒有 `private-collector`、`src` 或 `package.json`，代表下載的不是完整套件，不能執行安裝。

## B. 必須先開啟永豐 App

1. 開啟永豐 Shioaji Pro。
2. 登入帳號。
3. 確認可以正常看盤。
4. 確認行情狀態為 LIVE。
5. 保持永豐 App 開啟。

在 PowerShell 的**任意路徑**執行：

```powershell
curl.exe http://127.0.0.1:21322/api/v1/health
```

如果 API port 不是 21322，請不要直接執行一鍵腳本；先確認永豐 App 使用的 API port，並修改 Collector `.env` 的 `SHIOAJI_BASE_URL`。

## C. Docker Desktop

啟動 Docker Desktop，等待狀態顯示 Docker Engine 正常運作。

在 PowerShell 的**任意路徑**執行：

```powershell
docker version
docker compose version
```

`docker version` 必須同時有：

```text
Client
Server
```

## D. 執行一鍵安裝與啟動

將完整套件解壓到任意暫存位置，例如：

```text
C:\Users\Leisu\Downloads\shioaji-pro-app
```

用檔案總管開啟：

```text
C:\Users\Leisu\Downloads\shioaji-pro-app\scripts
```

雙擊：

```text
install-and-start-shioaji.bat
```

腳本會自動：

1. 檢查 Docker Desktop；
2. 使用 winget 安裝 Node.js 22 LTS（若尚未安裝）；
3. 啟用或安裝 pnpm；
4. 將完整 Collector 複製到 `C:\Users\Leisu\shioaji-private-collector`；
5. 將前端複製到 `C:\Users\Leisu\shioaji-pro-app`；
6. 建立並開啟 Collector `.env`；
7. 設定前端 `.env.local`；
8. 執行 `pnpm install`；
9. 執行 `docker compose up -d --build`；
10. 等待 Collector health；
11. 開啟新的 PowerShell 視窗啟動 Vite；
12. 開啟瀏覽器 `http://127.0.0.1:5173`。

### 第一次執行可能需要兩次

如果腳本剛使用 winget 安裝 Node.js，請：

1. 關閉目前 PowerShell／批次視窗；
2. 重新開啟 PowerShell；
3. 再次雙擊 `install-and-start-shioaji.bat`。

## E. 設定 Collector `.env`

腳本會建立：

```text
C:\Users\Leisu\shioaji-private-collector\.env
```

第一次建立時會自動用記事本開啟。請設定至少：

```env
POSTGRES_PASSWORD=請改成長且隨機的密碼
POSTGRES_USER=shioaji
POSTGRES_DB=shioaji_market
POSTGRES_PORT=5432
COLLECTOR_PORT=8787
COLLECTOR_CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173,tauri://localhost
SHIOAJI_BASE_URL=http://host.docker.internal:21322
COLLECTOR_SYMBOLS=TXFR1
COLLECTOR_CONTRACTS_JSON=[{"security_type":"FUT","exchange":"TAIFEX","code":"TXFR1","target_code":null,"intraday_odd":false}]
BATCH_SIZE=500
FLUSH_INTERVAL_MS=1000
RECONNECT_MIN_MS=1000
RECONNECT_MAX_MS=15000
```

儲存並關閉記事本後，重新執行：

```text
install-and-start-shioaji.bat
```

## F. 手動驗證 Collector

以下指令都在**Collector 路徑**執行：

```powershell
cd C:\Users\Leisu\shioaji-private-collector
```

查看服務：

```powershell
docker compose ps
```

預期：

```text
postgres     healthy
collector    healthy
```

查看日誌：

```powershell
docker compose logs --tail=100 collector
```

查看健康狀態：

```powershell
curl.exe http://127.0.0.1:8787/health
```

查看 Tick：

```powershell
docker compose exec -T postgres psql -U shioaji -d shioaji_market -c "SELECT count(*) AS tick_count FROM market_ticks;"
```

查看五檔：

```powershell
docker compose exec -T postgres psql -U shioaji -d shioaji_market -c "SELECT count(*) AS depth_count FROM market_depth_snapshots;"
```

## G. 手動啟動前端

以下指令都在**前端路徑**執行：

```powershell
cd C:\Users\Leisu\shioaji-pro-app
```

確認 `.env.local`：

```powershell
Get-Content .env.local
```

內容應為：

```env
VITE_PRIVATE_HISTORY_BASE=http://127.0.0.1:8787
```

如果尚未安裝依賴：

```powershell
pnpm install
```

啟動前端：

```powershell
pnpm dev --host 127.0.0.1
```

瀏覽器開啟：

```text
http://127.0.0.1:5173
```

## H. 停止服務

停止 Collector 與 PostgreSQL，指令在**Collector 路徑**執行：

```powershell
cd C:\Users\Leisu\shioaji-private-collector
docker compose stop
```

停止並移除 container、保留資料 volume：

```powershell
docker compose down
```

不要在沒有備份時執行：

```powershell
docker compose down -v
```

因為這會刪除歷史行情資料 volume。

Vite 則在它自己的 PowerShell 視窗按：

```text
Ctrl+C
```

## I. 常見錯誤

### 找不到 docker

請確認 Docker Desktop 已安裝並開啟，然後重新開啟 PowerShell。

### Docker 有 Client 沒有 Server

Docker Desktop 尚未完成啟動。等待 Docker Desktop 顯示 Engine ready。

### `curl 21322` 失敗

永豐 App 尚未開啟、尚未登入、行情未 LIVE，或 API port 不是 21322。

### Collector health 失敗

在 Collector 路徑執行：

```powershell
cd C:\Users\Leisu\shioaji-private-collector
docker compose logs --tail=200 collector
```

### 前端沒有歷史資料

確認：

```powershell
curl.exe http://127.0.0.1:8787/health
```

再確認前端路徑的 `.env.local`：

```powershell
cd C:\Users\Leisu\shioaji-pro-app
Get-Content .env.local
```

## J. 路徑總結

| 動作 | 執行路徑 |
|---|---|
| 永豐 API health | PowerShell 任意路徑 |
| Docker version | PowerShell 任意路徑 |
| `docker compose up` | `C:\Users\Leisu\shioaji-private-collector` |
| Collector logs | `C:\Users\Leisu\shioaji-private-collector` |
| PostgreSQL 查詢 | `C:\Users\Leisu\shioaji-private-collector` |
| `pnpm install` | `C:\Users\Leisu\shioaji-pro-app` |
| `pnpm dev` | `C:\Users\Leisu\shioaji-pro-app` |
| 前端瀏覽器 | `http://127.0.0.1:5173` |
