# GeoMock Phase 4 - Start Script
# Reads OPENROUTER_API_KEY from .env and launches the Go backend + Vite frontend

$envFile = Join-Path $PSScriptRoot ".env"

if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match "^\s*([^#][^=]+)=(.+)$") {
            $key   = $matches[1].Trim()
            $value = $matches[2].Trim()
            [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
            Write-Host "[env] $key loaded" -ForegroundColor DarkCyan
        }
    }
} else {
    Write-Host "[error] .env file not found. Create one at: $envFile" -ForegroundColor Red
    exit 1
}

if (-not $env:OPENROUTER_API_KEY -or $env:OPENROUTER_API_KEY -eq "YOUR_KEY_HERE") {
    Write-Host "[error] OPENROUTER_API_KEY is not set in .env - open .env and paste your key." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "  GeoMock Phase 4 - Overseer AI Starting..." -ForegroundColor Cyan
Write-Host ""

# Start Vite frontend in a new window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\frontend'; npm run dev" -WindowStyle Normal

# Start Go backend in this window
Write-Host "[backend] Starting Go server on :8080 ..." -ForegroundColor Cyan
go run main.go
