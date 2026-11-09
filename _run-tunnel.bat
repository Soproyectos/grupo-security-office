@echo off
REM Tunel SSH a la copia DEMO en la VPS (contenedor gs-test-demo-web, 172.20.0.4:80).
REM Expone la web+API demo en http://localhost:8080. Cierra la ventana para detenerlo.
:loop
ssh -i "%USERPROFILE%\.ssh\grupo_security_vps" -o BatchMode=yes -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes -N -L 127.0.0.1:8080:172.20.0.4:80 dev@57.131.50.38
echo Tunel caido. Reintentando en 5 segundos...
timeout /t 5 /nobreak >nul
goto loop
