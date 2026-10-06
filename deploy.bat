@echo off
set SERVER_USER=lopag
set SERVER_IP=zuluserver.ddns.net
set REMOTE_DIR=/home/lopag/Zulu-Game-System/

echo [1/2] Scaricamento aggiornamenti da GitHub sul server...
:: Entra nella cartella sul server e fa il git pull
ssh %SERVER_USER%@%SERVER_IP% "cd %REMOTE_DIR% && git pull origin main"

echo [2/2] Riavvio dei servizi Python...
:: Riavvia Flask e il Bridge UDP
ssh %SERVER_USER%@%SERVER_IP% "sudo systemctl restart controlpanel"

echo.
echo === DEPLOY COMPLETATO ===