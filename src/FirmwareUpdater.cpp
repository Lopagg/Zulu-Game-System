// src/FirmwareUpdater.cpp

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

        // Confronto delle versioni
        if (strcmp(serverVersion, FIRMWARE_VERSION) > 0) {
            _hardware->printLcd(0, 2, "Nuova vers. trovata!");
            _hardware->printLcd(0, 3, "Download in corso...");
            
            const char* firmwareUrl = doc["url"];
            
            http.begin(firmwareUrl);
            int firmwareHttpCode = http.GET();
            if (firmwareHttpCode == HTTP_CODE_OK) {
                int contentLength = http.getSize();
                if (!Update.begin(contentLength)) {
                    _hardware->printLcd(0, 3, "Errore OTA!");
                    Serial.println("Errore Update.begin");
                    return;
                }
                
                WiFiClient* stream = http.getStreamPtr();
                size_t written = Update.writeStream(*stream);

                if (written == contentLength) {
                    Serial.println("Scrittura completata.");
                }

                if (Update.end()) {
                    Serial.println("Aggiornamento OK.");
                    if (Update.isFinished()) {
                        _hardware->clearLcd();
                        _hardware->printLcd(2, 1, "AGGIORNAMENTO OK!");
                        _hardware->printLcd(4, 2, "Riavvio in corso...");
                        delay(2000);
                        ESP.restart();
                    }
                } else {
                    _hardware->printLcd(0, 3, "Errore Update.end!");
                    Serial.printf("Errore OTA: %u\n", Update.getError());
                }
            }
            http.end();
        } else {
            _hardware->printLcd(0, 2, "Nessun aggiornamento");
            delay(2000);
        }
    } else {
        _hardware->printLcd(0, 2, "Errore connessione!");
        Serial.printf("Errore HTTP: %d\n", httpCode);
        delay(2000);
    }
}