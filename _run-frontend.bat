@echo off
REM El proxy de /api y /uploads apunta al tunel de la demo (ver _run-tunnel.bat).
set "VITE_API_TARGET=http://localhost:8080"
cd /d "%~dp0src\frontend"
npm run dev
