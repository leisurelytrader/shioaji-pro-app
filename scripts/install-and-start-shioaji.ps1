[CmdletBinding()]
param(
    [string]$CollectorRoot = "C:\Users\Leisu\shioaji-private-collector",
    [string]$FrontendRoot = "C:\Users\Leisu\shioaji-pro-app",
    [switch]$SkipNodeInstall,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Step([string]$Message) { Write-Host "`n[shioaji] $Message" -ForegroundColor Cyan }
function Warn([string]$Message) { Write-Host "[shioaji] WARNING: $Message" -ForegroundColor Yellow }
function Fail([string]$Message) { Write-Host "`n[shioaji] ERROR: $Message" -ForegroundColor Red; exit 1 }
function RequireCommand([string]$Name, [string]$Hint) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) { Fail "$Name is not installed. $Hint" }
}

$BundleRoot = Split-Path -Parent $PSScriptRoot
$FrontendSource = $BundleRoot
$CollectorSource = Join-Path $FrontendSource 'private-collector'

Step 'Checking Docker Desktop and Docker Compose'
RequireCommand 'docker' 'Install and start Docker Desktop first.'
docker version --format '{{.Server.Version}}' 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { Fail 'Docker Engine is not running. Start Docker Desktop and try again.' }
docker compose version 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { Fail 'Docker Compose is not available. Update Docker Desktop.' }

Step 'Checking or installing Node.js 22'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    if ($SkipNodeInstall) { Fail 'Node.js is not installed. Install Node.js 22 LTS and try again.' }
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host 'Installing Node.js LTS with winget. UAC may appear.'
        winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
        if ($LASTEXITCODE -ne 0) { Fail 'Node.js installation failed. Install Node.js 22 LTS from https://nodejs.org/.' }
        Warn 'Node.js was installed. Close this window, open a new PowerShell, and run the BAT again.'
        exit 0
    }
    Fail 'Node.js and winget are unavailable. Install Node.js 22 LTS from https://nodejs.org/.'
}
Write-Host "Node.js: $(node --version)"

Step 'Checking pnpm'
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    npm install --global pnpm
    if ($LASTEXITCODE -ne 0) { Fail 'pnpm installation failed. Run npm install --global pnpm as Administrator.' }
}
Write-Host "pnpm: $(pnpm --version)"

Step 'Checking package files'
if (-not (Test-Path $CollectorSource)) { Fail "Missing private-collector directory in bundle: $CollectorSource" }
if (-not (Test-Path (Join-Path $FrontendSource 'package.json'))) { Fail "Missing frontend package.json: $FrontendSource" }
New-Item -ItemType Directory -Force -Path $CollectorRoot | Out-Null
New-Item -ItemType Directory -Force -Path $FrontendRoot | Out-Null
Copy-Item (Join-Path $CollectorSource '*') $CollectorRoot -Recurse -Force
Copy-Item (Join-Path $FrontendSource 'src') $FrontendRoot -Recurse -Force
foreach ($Directory in @('e2e','public','modules')) {
    $SourceDirectory = Join-Path $FrontendSource $Directory
    if (Test-Path $SourceDirectory) { Copy-Item $SourceDirectory $FrontendRoot -Recurse -Force }
}
foreach ($File in @('package.json','pnpm-lock.yaml','pnpm-workspace.yaml','tsconfig.json','vite.config.ts','index.html','approval.html','playwright.config.ts','SHIOAJI_VERSION')) {
    $Source = Join-Path $FrontendSource $File
    if (Test-Path $Source) { Copy-Item $Source $FrontendRoot -Force }
}
foreach ($Config in (Get-ChildItem (Join-Path $FrontendSource 'tsconfig*.json') -ErrorAction SilentlyContinue)) {
    Copy-Item $Config.FullName $FrontendRoot -Force
}

Step 'Creating Collector environment file'
$CollectorEnv = Join-Path $CollectorRoot '.env'
if (-not (Test-Path $CollectorEnv)) {
    $Example = Join-Path $CollectorRoot '.env.docker.example'
    if (-not (Test-Path $Example)) { Fail "Missing .env.docker.example: $Example" }
    Copy-Item $Example $CollectorEnv
    Warn "Created $CollectorEnv. Set POSTGRES_PASSWORD, save, close Notepad, then run this BAT again."
    Start-Process notepad.exe -ArgumentList $CollectorEnv -Wait
}
$PasswordLine = Get-Content $CollectorEnv | Where-Object { $_ -match '^\s*POSTGRES_PASSWORD\s*=' } | Select-Object -First 1
$PasswordValue = ($PasswordLine -replace '^\s*POSTGRES_PASSWORD\s*=\s*', '').Trim().Trim('"').Trim("'")
if ([string]::IsNullOrWhiteSpace($PasswordValue) -or $PasswordValue -eq 'replace-with-a-long-random-password') { Fail "Set a real POSTGRES_PASSWORD in $CollectorEnv before continuing." }
$PortLine = Get-Content $CollectorEnv | Where-Object { $_ -match '^\s*COLLECTOR_PORT\s*=' } | Select-Object -First 1
$CollectorPort = ($PortLine -replace '^\s*COLLECTOR_PORT\s*=\s*', '').Trim().Trim('"').Trim("'")
if ([string]::IsNullOrWhiteSpace($CollectorPort)) { $CollectorPort = '8787' }
if ($CollectorPort -notmatch '^\d+$') { Fail "COLLECTOR_PORT must be a number in $CollectorEnv." }

Step 'Creating frontend environment file'
Set-Content (Join-Path $FrontendRoot '.env.local') "VITE_PRIVATE_HISTORY_BASE=http://127.0.0.1:$CollectorPort" -Encoding UTF8

Step 'Checking Shioaji Pro API'
try {
    $Health = Invoke-RestMethod 'http://127.0.0.1:21322/api/v1/health' -TimeoutSec 5
    Write-Host "Shioaji API status=$($Health.status), version=$($Health.version)" -ForegroundColor Green
} catch {
    Warn 'Cannot connect to http://127.0.0.1:21322. Keep Shioaji Pro open, logged in, and LIVE.'
}

Step 'Installing frontend dependencies'
Push-Location $FrontendRoot
try { pnpm install --ignore-scripts } finally { Pop-Location }

Step 'Starting PostgreSQL and Collector'
Push-Location $CollectorRoot
try {
    docker compose up -d --build
    if ($LASTEXITCODE -ne 0) { Fail 'docker compose failed. Run docker compose logs --tail=200 collector.' }
} finally { Pop-Location }

Step 'Waiting for Collector health'
$Ready = $false
for ($i = 1; $i -le 30; $i++) {
    try {
        $Result = Invoke-RestMethod "http://127.0.0.1:$CollectorPort/health" -TimeoutSec 2
        if ($Result.ok -eq $true) { $Ready = $true; break }
    } catch { }
    Start-Sleep -Seconds 2
    Write-Host '.' -NoNewline
}
Write-Host ''
if (-not $Ready) {
    Push-Location $CollectorRoot
    try { docker compose logs --tail=100 collector } finally { Pop-Location }
    Fail 'Collector did not become healthy within 60 seconds.'
}

Step 'Starting Vite frontend'
$Command = "Set-Location -LiteralPath '$FrontendRoot'; pnpm dev --host 127.0.0.1"
Start-Process powershell.exe -ArgumentList @('-NoExit','-ExecutionPolicy','Bypass','-Command',$Command) -WorkingDirectory $FrontendRoot
Start-Sleep -Seconds 3
if (-not $NoBrowser) { Start-Process 'http://127.0.0.1:5173' }
Write-Host "`n[shioaji] Startup complete" -ForegroundColor Green
Write-Host "Frontend: http://127.0.0.1:5173"
Write-Host "Collector: http://127.0.0.1:$CollectorPort/health"
Write-Host "Collector path: $CollectorRoot"
Write-Host "Frontend path: $FrontendRoot"
