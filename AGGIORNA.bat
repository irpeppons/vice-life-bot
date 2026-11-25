@echo off
chcp 65001 >nul
title VICE LIFE BOT - AGGIORNAMENTO
echo Spengo il bot...
taskkill /FI "WINDOWTITLE eq VICE LIFE BOT*" /T /F >nul 2>&1
timeout /t 2 /nobreak >nul
echo Cerco l'ultimo aggiornamento scaricato...
powershell -NoProfile -Command "$z = Get-ChildItem -Path $env:USERPROFILE\Downloads,$env:USERPROFILE\Desktop,$env:USERPROFILE\OneDrive -Recurse -Filter 'AGGIORNAMENTO-BOT*.zip' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime | Select-Object -Last 1; if ($z) { Expand-Archive -Force $z.FullName '%~dp0'; Remove-Item $z.FullName; Write-Host ('OK AGGIORNATO con ' + $z.Name) } else { Write-Host 'Nessun aggiornamento trovato: scarica prima lo zip.' }"
echo Riavvio il bot...
start "" "%~dp0AVVIA.bat"
timeout /t 5
