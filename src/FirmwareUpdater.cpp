#include "FirmwareUpdater.h"
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Update.h>

FirmwareUpdater::FirmwareUpdater(HardwareManager* hardware) : _hardware(hardware) {}

void FirmwareUpdater::checkForUpdates() {
    _hardware->clearLcd();
    _hardware->printLcd(0, 1, "Controllo aggiorn...");
    
    HTTPClient http;
    http.begin(_manifestUrl);
    int httpCode = http.GET();

    if (httpCode == HTTP_CODE_OK) {
        String payload = http.getString();
        http.end();

        JsonDocument doc;
        deserializeJson(doc, payload);
        
        const char* serverVersion = doc["version"];
        
        Serial.printf("Versione corrente: %s\n", FIRMWARE_VERSION);
        Serial.printf("Versione server: %s\n", serverVersion);

        if (strcmp(serverVersion, FIRMWARE_VERSION) > 0) {
            _hardware->clearLcd();
            _hardware->printLcd(0, 1, "Nuova vers. trovata!");
            _hardware->printLcd(0, 2, "Download in corso...");
            
            const char* firmwareUrl = doc["url"];
            
            // --- MODIFICA: Abilita il supporto per i redirect HTTP ---
            http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
            http.begin(firmwareUrl);

            int firmwareHttpCode = http.GET();
            if (firmwareHttpCode == HTTP_CODE_OK) {
                int contentLength = http.getSize();
                if (contentLength <= 0) {
                    Serial.println("Errore: Content-Length è zero o invalido.");
                    _hardware->printLcd(0, 3, "Errore: File vuoto!");
                    delay(3000);
                    return;
                }

                if (!Update.begin(contentLength)) {
                    Serial.printf("Errore Update.begin(): %u\n", Update.getError());
                    _hardware->printLcd(0, 3, "Errore OTA Iniziale!");
                    delay(3000);
                    return;
                }
                
                WiFiClient* stream = http.getStreamPtr();
                size_t written = Update.writeStream(*stream);

                // --- MODIFICA: Controllo sulla dimensione del file scaricato ---
                if (written != contentLength) {
                    Serial.printf("Errore: Scrittura fallita. Scritto %d di %d bytes\n", written, contentLength);
                    _hardware->printLcd(0, 3, "Errore Download!");
                    Update.abort();
                    delay(3000);
                    http.end();
                    return;
                }
                Serial.println("Scrittura completata con successo.");

                if (Update.end()) {
                    if (Update.isFinished()) {
                        _hardware->clearLcd();
                        _hardware->printLcd(2, 1, "AGGIORNAMENTO OK!");
                        _hardware->printLcd(4, 2, "Riavvio in corso...");
                        Serial.println("Aggiornamento completato. Riavvio.");
                        delay(2000);
                        ESP.restart();
                    }
                } else {
                    // --- MODIFICA: Mostra l'errore specifico sull'LCD ---
                    unsigned int errCode = Update.getError();
                    Serial.printf("Errore OTA durante Update.end(): %u\n", errCode);
                    char errStr[20];
                    sprintf(errStr, "Errore Fine: #%u", errCode);
                    _hardware->printLcd(0, 3, errStr);
                    delay(5000);
                }
            } else {
                Serial.printf("Errore HTTP durante il download del firmware: %d\n", firmwareHttpCode);
                _hardware->printLcd(0, 3, "Errore Download FW!");
                delay(3000);
            }
            http.end();
        } else {
            _hardware->printLcd(0, 2, "Nessun aggiornamento");
            delay(2000);
        }
    } else {
        Serial.printf("Errore HTTP durante il controllo del manifesto: %d\n", httpCode);
        _hardware->printLcd(0, 2, "Errore connessione!");
        delay(2000);
    }
}