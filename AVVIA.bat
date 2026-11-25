@echo off
chcp 65001 >nul
title VICE LIFE BOT
cd /d "%~dp0"
:avvio
node index.js
if %errorlevel%==42 (
  echo.
  echo Aggiornamento installato, riavvio in corso...
  echo.
  goto avvio
)
echo.
echo Il bot si e' spento.
pause
