@echo off
rem Compila o Windows Boost no Windows (requer Node.js 20+ instalado).
cd /d "%~dp0"
call npm install || goto :erro
call npm run dist || goto :erro
echo.
echo Pronto! Instalador e versao portatil estao na pasta "release".
pause
exit /b 0
:erro
echo.
echo Falhou. Veja as mensagens acima.
pause
exit /b 1
