@echo off
cd /d "%~dp0"
set "AGENTATION_CORS_ORIGINS=http://localhost:5173,http://100.87.48.41:5173,http://srv-soporte.taila71364.ts.net:5173"
npx -y agentation-mcp server --host 0.0.0.0
