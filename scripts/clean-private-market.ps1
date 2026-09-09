param(
    [switch]$Apply
)

$ErrorActionPreference = 'Stop'

# This script targets only the custom Shioaji Private Market app.
# It deliberately does NOT stop or delete the official Shioaji Pro app.
$processNames = @('Shioaji Private Market', 'shioaji-private-market', 'collector')
$paths = @(
    "$env:APPDATA\tw.shioaji.private-market",
    "$env:LOCALAPPDATA\tw.shioaji.private-market",
    "$env:LOCALAPPDATA\Shioaji Private Market",
    "$env:APPDATA\Shioaji Private Market"
) | Select-Object -Unique

Write-Host 'Targets (custom app only):' -ForegroundColor Cyan
foreach ($path in $paths) {
    if (Test-Path -LiteralPath $path) { Write-Host "  $path" }
}

Write-Host ''
Write-Host 'Running matching processes:' -ForegroundColor Cyan
$running = Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $processNames -contains $_.ProcessName -or
    $processNames -contains $_.MainWindowTitle
}
$running | Select-Object Id, ProcessName, MainWindowTitle | Format-Table -AutoSize

if (-not $Apply) {
    Write-Host 'Dry run only. Nothing was changed.' -ForegroundColor Yellow
    Write-Host 'To stop custom processes and remove custom app data, run:'
    Write-Host '  powershell -ExecutionPolicy Bypass -File .\clean-private-market.ps1 -Apply'
    exit 0
}

foreach ($process in $running) {
    try {
        Write-Host "Stopping custom process $($process.ProcessName) (PID $($process.Id))"
        Stop-Process -Id $process.Id -Force -ErrorAction Stop
    } catch {
        Write-Warning "Could not stop PID $($process.Id): $($_.Exception.Message)"
    }
}

Start-Sleep -Milliseconds 500
foreach ($path in $paths) {
    if (Test-Path -LiteralPath $path) {
        Write-Host "Removing custom data: $path"
        Remove-Item -LiteralPath $path -Recurse -Force
    }
}

Write-Host ''
Write-Host 'Custom Shioaji Private Market data and processes were removed.' -ForegroundColor Green
Write-Host 'The official Shioaji Pro installation and its account data were not touched.' -ForegroundColor Green
Write-Host 'Uninstall the old custom app from Windows Settings > Apps > Installed apps if it is still listed.'
