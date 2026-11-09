@echo off
setlocal EnableExtensions

REM Iniciador local seguro para Grupo Security (Windows).
REM Calcula la raiz desde la ubicacion del archivo para funcionar con doble clic.
set "REPO_ROOT=%~dp0"
set "BACKEND_DIR=%REPO_ROOT%src\backend"
set "FRONTEND_DIR=%REPO_ROOT%src\frontend"

REM Validar Node.js y npm.
where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js no esta instalado o no esta disponible en PATH.
    pause
    exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
    echo ERROR: npm no esta disponible en PATH.
    pause
    exit /b 1
)

REM Validar estructura y dependencias ya instaladas.
if not exist "%FRONTEND_DIR%\package.json" (
    echo ERROR: No se encuentra "%FRONTEND_DIR%\package.json".
    pause
    exit /b 1
)

if not exist "%FRONTEND_DIR%\node_modules\" (
    echo ERROR: Faltan dependencias del frontend.
    echo Ejecuta manualmente: cd /d "%FRONTEND_DIR%" ^&^& npm install
    pause
    exit /b 1
)

REM Detectar Windows Terminal: si esta disponible, se abre UNA sola ventana
REM con una pestaña por servicio. Si no, cae a ventanas cmd separadas.
where wt.exe >nul 2>&1
if errorlevel 1 (
    set "USE_WT=0"
) else (
    set "USE_WT=1"
)

REM Detectar procesos existentes sin detenerlos.
REM Nota: cada servicio se lanza via un .bat auxiliar (_run-*.bat) que hace su
REM propio "cd /d" al directorio correcto. Pasar el comando completo (con cd,
REM directorio y npm/npx) inline a "wt.exe ... cmd /k ..." rompe el parseo de
REM argumentos de Windows Terminal cuando hay varias comillas anidadas.
REM API/BD: copia DEMO en la VPS (gs-test-demo-*) por tunel SSH en localhost:8080.
REM No se conecta a produccion (gs-db/gs-api). Ver _run-tunnel.bat.
netstat -ano | findstr /R /C:":8080 .*LISTENING" >nul
if errorlevel 1 (
    echo Abriendo tunel SSH a la demo en puerto 8080...
    if "%USE_WT%"=="1" (
        start "" wt.exe -w 0 nt --title "Tunel demo" cmd /k "%REPO_ROOT%_run-tunnel.bat"
        timeout /t 2 /nobreak >nul
    ) else (
        start "Grupo Security - Tunel demo" cmd /k "%REPO_ROOT%_run-tunnel.bat"
    )
) else (
    echo El puerto 8080 ya esta en uso. No se abre otro tunel.
)

netstat -ano | findstr /R /C:":5173 .*LISTENING" >nul
if errorlevel 1 (
    echo Iniciando frontend en puerto 5173...
    if "%USE_WT%"=="1" (
        start "" wt.exe -w 0 nt --title "Frontend" cmd /k "%REPO_ROOT%_run-frontend.bat"
        timeout /t 2 /nobreak >nul
    ) else (
        start "Grupo Security - Frontend" /D "%FRONTEND_DIR%" cmd /k "npm run dev"
    )
) else (
    echo El puerto 5173 ya esta en uso. No se inicia otro frontend.
)

REM Agentation: servidor de anotaciones visuales (boton en el frontend, dev-only).
netstat -ano | findstr /R /C:":4747 .*LISTENING" >nul
if errorlevel 1 (
    echo Iniciando servidor Agentation en puerto 4747...
    if "%USE_WT%"=="1" (
        start "" wt.exe -w 0 nt --title "Agentation" cmd /k "%REPO_ROOT%_run-agentation.bat"
        timeout /t 2 /nobreak >nul
    ) else (
        start "Grupo Security - Agentation" /D "%REPO_ROOT%" cmd /k "npx -y agentation-mcp server"
    )
) else (
    echo El puerto 4747 ya esta en uso. No se inicia otro servidor Agentation.
)

REM Esperar un maximo de 45 segundos a que el backend responda HTTP 200.
echo Esperando el backend...
set "BACKEND_READY=0"

for /L %%I in (1,1,45) do (
    powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:8080/api/health' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 }; exit 1 } catch { exit 1 }" >nul 2>&1
    if not errorlevel 1 (
        set "BACKEND_READY=1"
        goto :backend_ready
    )
    timeout /t 1 /nobreak >nul
)

:backend_ready
if "%BACKEND_READY%"=="0" (
    echo ERROR: El backend no respondio HTTP 200 en 45 segundos.
    echo Revisa la ventana "Grupo Security - Backend".
    echo No se abrira el navegador.
    pause
    exit /b 1
)

REM Esperar un maximo de 20 segundos a que Vite responda.
echo Backend listo. Esperando el frontend...
set "FRONTEND_READY=0"

for /L %%I in (1,1,20) do (
    powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:5173/' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 }; exit 1 } catch { exit 1 }" >nul 2>&1
    if not errorlevel 1 (
        set "FRONTEND_READY=1"
        goto :frontend_ready
    )
    timeout /t 1 /nobreak >nul
)

:frontend_ready
if "%FRONTEND_READY%"=="0" (
    echo ERROR: El frontend no respondio HTTP 200 en 20 segundos.
    echo Revisa la ventana "Grupo Security - Frontend".
    echo No se abrira el navegador.
    pause
    exit /b 1
)

REM Abrir el navegador una vez que los dos servicios esten disponibles.
start "" "http://localhost:5173/"

echo.
echo ==========================================
echo Entorno local iniciado.
echo Frontend: http://localhost:5173/
echo API demo (tunel): http://localhost:8080/api/health
echo Agentation: boton flotante abajo a la derecha (servidor en :4747)
if "%USE_WT%"=="1" (
    echo Backend, Frontend y Agentation corren como pestañas en una sola ventana de Windows Terminal.
) else (
    echo Mantén abiertas las ventanas de backend, frontend y Agentation.
)
echo ==========================================
pause
exit /b 0