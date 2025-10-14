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

    if (httpCode != HTTP_CODE_OK) {
        http.end();
        _hardware->clearLcd();
        _hardware->printLcd(0, 1, "Errore Manifesto!");
        char errStr[20];
        sprintf(errStr, "Codice HTTP: %d", httpCode);
        _hardware->printLcd(0, 2, errStr);
        delay(4000);
        return;
    }

    String payload = http.getString();
    http.end();

    JsonDocument doc;
    if (deserializeJson(doc, payload) != DeserializationError::Ok) {
        _hardware->printLcd(0, 2, "Errore JSON!");
        delay(3000);
        return;
    }
    
    const char* serverVersion = doc["version"];
    Serial.printf("Versione corrente: %s, Versione server: %s\n", FIRMWARE_VERSION, serverVersion);

    if (strcmp(serverVersion, FIRMWARE_VERSION) > 0) {
        _hardware->clearLcd();
        _hardware->printLcd(0, 1, "Nuova vers. trovata!");
        _hardware->printLcd(0, 2, "Download in corso...");
        
        const char* firmwareUrl = doc["url"];
        
        http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
        http.begin(firmwareUrl);
        int firmwareHttpCode = http.GET();

        if (firmwareHttpCode != HTTP_CODE_OK) {
            http.end();
            _hardware->printLcd(0, 3, "Errore Download FW!");
            Serial.printf("Errore HTTP download: %d\n", firmwareHttpCode);
            delay(3000);
            return;
        }

        int contentLength = http.getSize();
        if (contentLength <= 0) {
            http.end();
            _hardware->printLcd(0, 3, "Errore: File vuoto!");
            delay(3000);
            return;
        }

        if (!Update.begin(contentLength)) {
            http.end();
            _hardware->clearLcd();
            _hardware->printLcd(0, 1, "ERRORE OTA!");
            _hardware->printLcd(0, 2, "Partizioni errate?");
            Serial.printf("Update.begin() fallito. Errore: %u\n", Update.getError());
            delay(5000);
            return;
        }
        
        WiFiClient* stream = http.getStreamPtr();
        size_t written = Update.writeStream(*stream);

        if (written != contentLength) {
            http.end();
            Update.abort();
            _hardware->clearLcd();
            _hardware->printLcd(0, 1, "ERRORE SCRITTURA!");
            _hardware->printLcd(0, 2, "Download fallito.");
            Serial.printf("Scrittura fallita. Scritto %d di %d bytes\n", written, contentLength);
            delay(5000);
            return;
        }

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
            unsigned int errCode = Update.getError();
            _hardware->clearLcd();
            _hardware->printLcd(0, 1, "ERRORE FINALE!");
            char errStr[20];
            sprintf(errStr, "Verifica fallita: #%u", errCode);
            _hardware->printLcd(0, 2, errStr);
            Serial.printf("Errore OTA durante Update.end(): %u\n", errCode);
            delay(5000);
        }
        
        http.end();

    } else {
        _hardware->printLcd(0, 2, "Nessun aggiornamento");
        delay(2000);
    }
}