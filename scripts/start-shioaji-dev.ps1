[CmdletBinding()]
param(
    [string]$ProjectRoot = "",
    [switch]$NoBrowser,
    [switch]$NoViteInstall
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Step([string]$Message) {
    Write-Host "`n[shioaji] $Message" -ForegroundColor Cyan
}

function Fail([string]$Message) {
    Write-Host "`n[shioaji] ERROR: $Message" -ForegroundColor Red
    Write-Host "請修正後重新執行本腳本。" -ForegroundColor Yellow
    exit 1
}

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = Split-Path -Parent $PSScriptRoot
}

$ProjectRoot = (Resolve-Path $ProjectRoot).Path
$CollectorRoot = Join-Path $ProjectRoot "private-collector"
$FrontendEnv = Join-Path $ProjectRoot ".env.local"
$CollectorEnv = Join-Path $CollectorRoot ".env"
$ComposeFile = Join-Path $CollectorRoot "docker-compose.yml"

Write-Step "檢查專案路徑"
if (-not (Test-Path $CollectorRoot)) { Fail "找不到 Collector 目錄：$CollectorRoot" }
if (-not (Test-Path $ComposeFile)) { Fail "找不到 docker-compose.yml：$ComposeFile" }

Write-Step "檢查 Docker Desktop 與 Docker Compose"
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Fail "找不到 docker。請先安裝並啟動 Docker Desktop。" }
try {
    docker version --format '{{.Server.Version}}' 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail "Docker Engine 尚未啟動。請先開啟 Docker Desktop，等待 Engine ready。" }
} catch {
    Fail "無法連線到 Docker Engine。請先開啟 Docker Desktop。"
}
try {
    docker compose version 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail "找不到 docker compose。請更新 Docker Desktop。" }
} catch {
    Fail "無法執行 docker compose。"
}

Write-Step "檢查 Collector .env"
if (-not (Test-Path $CollectorEnv)) {
    $Example = Join-Path $CollectorRoot ".env.docker.example"
    if (Test-Path $Example) {
        Copy-Item $Example $CollectorEnv
        Write-Host "已從 .env.docker.example 建立 .env，請確認 POSTGRES_PASSWORD。" -ForegroundColor Yellow
    } else {
        Fail "找不到 Collector .env 或 .env.docker.example。"
    }
}
$EnvText = Get-Content $CollectorEnv -Raw
if ($EnvText -match "replace-with-a-long|請換成") {
    Fail "Collector .env 尚未設定真正的 POSTGRES_PASSWORD。"
}

Write-Step "建立前端環境變數"
$FrontendEnvContent = "VITE_PRIVATE_HISTORY_BASE=http://127.0.0.1:8787`r`n"
Set-Content -Path $FrontendEnv -Value $FrontendEnvContent -Encoding utf8
Write-Host "已設定 $FrontendEnv"

Write-Step "檢查永豐 Shioaji Pro API"
try {
    $Health = Invoke-RestMethod -Uri "http://127.0.0.1:21322/api/v1/health" -TimeoutSec 5
    if ($Health.status -ne "healthy") {
        Write-Host "Shioaji API 有回應，但 status 不是 healthy：$($Health.status)" -ForegroundColor Yellow
    } else {
        Write-Host "Shioaji API healthy，version=$($Health.version)" -ForegroundColor Green
    }
} catch {
    Write-Host "無法連線 Shioaji API 21322；Collector 仍會啟動，但不會收到行情。" -ForegroundColor Yellow
}

Write-Step "啟動 PostgreSQL 與 Collector"
Push-Location $CollectorRoot
try {
    docker compose up -d --build
    if ($LASTEXITCODE -ne 0) { Fail "docker compose 啟動失敗。請執行：docker compose logs --tail=200 collector" }
} finally {
    Pop-Location
}

Write-Step "等待 Collector health"
$Healthy = $false
for ($i = 1; $i -le 30; $i++) {
    try {
        $CollectorHealth = Invoke-RestMethod -Uri "http://127.0.0.1:8787/health" -TimeoutSec 2
        if ($CollectorHealth.ok -eq $true) {
            $Healthy = $true
            break
        }
    } catch { }
    Start-Sleep -Seconds 2
    Write-Host "." -NoNewline
}
Write-Host ""
if (-not $Healthy) {
    Write-Host "Collector health 尚未通過。最近日誌：" -ForegroundColor Yellow
    Push-Location $CollectorRoot
    try { docker compose logs --tail=80 collector } finally { Pop-Location }
    Fail "Collector 未在 60 秒內 ready。"
}
Write-Host "Collector healthy：http://127.0.0.1:8787/health" -ForegroundColor Green

Write-Step "啟動 Vite 前端"
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { Fail "找不到 pnpm。請先執行：npm install -g pnpm" }
if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) { Fail "找不到前端 package.json：$ProjectRoot" }

$ViteCommand = "Set-Location -LiteralPath '$ProjectRoot'; "
if (-not $NoViteInstall) { $ViteCommand += "pnpm install --ignore-scripts; " }
$ViteCommand += "pnpm dev --host 127.0.0.1"
Start-Process powershell.exe -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $ViteCommand) -WorkingDirectory $ProjectRoot

Start-Sleep -Seconds 3
Write-Host "Vite 啟動視窗已開啟：http://127.0.0.1:5173" -ForegroundColor Green

if (-not $NoBrowser) {
    Start-Process "http://127.0.0.1:5173"
}

Write-Host "`n[shioaji] 啟動完成" -ForegroundColor Green
Write-Host "前端：  http://127.0.0.1:5173"
Write-Host "Collector health：http://127.0.0.1:8787/health"
Write-Host "資料庫：PostgreSQL Docker volume shioaji-market-data"
Write-Host "`n停止服務：在 Collector 目錄執行 docker compose stop；關閉 Vite 視窗即可。"
