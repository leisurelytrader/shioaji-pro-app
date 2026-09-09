$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if ($env:OS -ne 'Windows_NT') {
    throw 'This script must run on Windows 11 with Node.js 22 x64.'
}

pnpm run build:bundle
node --experimental-sea-config sea-config.json

$nodeExe = (Get-Command node.exe).Source
$workExe = Join-Path $Root 'dist/collector.exe'
Copy-Item $nodeExe $workExe -Force

$fuse = 'a' * 16
pnpm exec postject $workExe NODE_SEA_BLOB (Join-Path $Root 'dist/collector.blob') --sentinel-fuse $fuse --overwrite

$target = if ($env:TAURI_ENV_TARGET_TRIPLE) { $env:TAURI_ENV_TARGET_TRIPLE } else { 'x86_64-pc-windows-msvc' }
$destination = Join-Path (Split-Path $Root -Parent) ("src-tauri/binaries/collector-$target.exe")
New-Item -ItemType Directory -Force -Path (Split-Path $destination) | Out-Null
Copy-Item $workExe $destination -Force
Write-Host "Created $destination"
