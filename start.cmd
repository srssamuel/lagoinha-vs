@echo off
cd /d "%~dp0"
echo Iniciando Lagoinha VS (Multitracks ^& Playback Player)...
start "" "http://localhost:3000"
call npm run dev
