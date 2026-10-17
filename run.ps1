$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
Write-Host "Iniciando Lagoinha VS em http://localhost:3000 ..." -ForegroundColor Cyan
Start-Process "http://localhost:3000"
npm run dev
