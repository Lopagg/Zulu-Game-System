// src/NetworkManager.cpp

#include "NetworkManager.h"
#include "app_common.h"
#include <ArduinoJson.h>
#include <ArduinoOTA.h>
#include <esp_wifi.h>
#include <TelnetStream.h>
#include <WiFiManager.h>

String deviceId = "";   // Variabile globale per il MAC Address
extern NetworkManager networkManager; // Referenza all'istanza creata in main.cpp per la callback

// Il tuo server DDNS
const char* SERVER_HOSTNAME = "zuluserver.ddns.net";
const int MQTT_PORT = 1883;

// --- CALLBACK MQTT GLOBALE ---
// Viene richiamata in automatico ogni volta che arriva un comando dal server sul topic ascoltato
void mqttCallback(char* topic, byte* payload, unsigned int length) {
    if (length > 511) return; // Prevenzione Buffer Overflow
    
    char incomingBuffer[512];
    memcpy(incomingBuffer, payload, length);
    incomingBuffer[length] = '\0';
    
    // Passa il messaggio alla nostra classe NetworkManager
    networkManager.setReceivedMessage(String(incomingBuffer));
}

// Costruttore
NetworkManager::NetworkManager() : _hardware(nullptr) {
    _mqttClient.setClient(_espClient);
}

void NetworkManager::initialize(HardwareManager* hardware) {
    // Salviamo il riferimento all'hardware per usarlo anche in update() (es. per il Reset)
    _hardware = hardware;

    Serial.println("--- Inizializzazione Rete (MQTT) ---");
    Serial.print("Firmware Version: ");
    Serial.println(FIRMWARE_VERSION);

    hardware->clearLcd();
    hardware->printLcd(0, 0, "Avvio Rete...");
    hardware->printLcd(0, 1, "AP: ZULU-TERMINAL");

    // 1. Accendi l'antenna in modalità Station
    WiFi.mode(WIFI_STA);

    // 3. Ora puoi scollegarti da vecchie sessioni e avviare la scansione
    WiFi.disconnect();
    delay(100);

    WiFiManager wm;
    wm.setConfigPortalTimeout(180); 

    if (!wm.autoConnect("ZULU-TERMINAL")) {
        hardware->clearLcd();
        hardware->printLcd(0, 0, "Timeout Rete!");
        hardware->printLcd(0, 1, "Riavvio in corso...");
        delay(3000);
        ESP.restart();
    }

    deviceId = WiFi.macAddress();

    TelnetStream.begin();
    TelnetStream.println("\n\n=== LOG DI RETE ATTIVATI ===");
    TelnetStream.printf("Dispositivo connesso: %s\n", WiFi.localIP().toString().c_str());

    // --- STAMPA IP VISIBILE ---
    hardware->clearLcd();
    hardware->printLcd(0, 0, "WiFi OK!");
    hardware->printLcd(0, 1, "IP: " + WiFi.localIP().toString());
    Serial.printf("\nConnesso! IP: %s, MAC: %s\n", WiFi.localIP().toString().c_str(), deviceId.c_str());
    
    // delay(2000); // Lascia l'IP a schermo per 2 secondi

    // --- SEZIONE NTP ---
    hardware->clearLcd();
    hardware->printLcd(0, 0, "WiFi OK!");
    hardware->printLcd(0, 1, "Sync Orario...");
    configTime(3600, 3600, "pool.ntp.org", "time.nist.gov");
    // delay(2000); 
    hardware->syncWithNTP();
    
    // --- CONFIGURAZIONE MQTT ---
    // Impostiamo un timeout molto basso (2 secondi) per evitare freeze prolungati
    _mqttClient.setServer(SERVER_HOSTNAME, MQTT_PORT);
    _mqttClient.setCallback(mqttCallback);
    _mqttClient.setBufferSize(512);

    // --- AVVIO OTA SOLO SE CONNESSO ---
    ArduinoOTA.setHostname("ZULU-TERMINAL");
    ArduinoOTA.begin();
}

void NetworkManager::reconnectMQTT() {
    Serial.print("Tentativo di connessione MQTT...");
    
    // Creazione dell'LWT (Last Will and Testament)
    char willTopic[64];
    snprintf(willTopic, sizeof(willTopic), "zulu/telemetry/%s", deviceId.c_str());
    
    char willPayload[128];
    snprintf(willPayload, sizeof(willPayload), "{\"id\":\"%s\", \"type\":\"MODE_EXIT\", \"payload\":{\"mode\":\"OFFLINE\"}}", deviceId.c_str());
    
    if (_mqttClient.connect(deviceId.c_str(), "admin", "admin", willTopic, 1, true, willPayload)) {
        Serial.println("Connesso al Broker!");
        
        // Si iscrive al topic generico e a quello specifico per questo nodo
        _mqttClient.subscribe("zulu/cmd/broadcast");
        
        char myTopic[64];
        snprintf(myTopic, sizeof(myTopic), "zulu/cmd/%s", deviceId.c_str());
        _mqttClient.subscribe(myTopic);
        
        // Invia evento di BOOT
        JsonDocument bootDoc;
        bootDoc["mode"] = "MAIN MENU"; 
        bootDoc["version"] = FIRMWARE_VERSION;
        sendEvent("DEVICE_ONLINE", bootDoc);
        
    } else {
        Serial.print("Fallito, rc=");
        Serial.print(_mqttClient.state());
        Serial.println(" riprova al prossimo giro.");
    }
}

void NetworkManager::update() {
    ArduinoOTA.handle();

    // Mantiene viva la connessione MQTT in modo NON BLOCCANTE
    if (WiFi.status() == WL_CONNECTED) {
        if (!_mqttClient.connected()) {
            static unsigned long lastReconnectAttempt = 0;
            // Tenta la riconnessione SOLO una volta ogni 5 secondi
            if (millis() - lastReconnectAttempt > 5000) {
                lastReconnectAttempt = millis();
                reconnectMQTT();
            }
        } else {
            _mqttClient.loop(); // Gestisce la ricezione dei pacchetti se connesso
        }
    }

    if (_lastMessage != "") {
        Serial.printf("RX MQTT: %s\n", _lastMessage.c_str());

        // --- INTERCETTAZIONE COMANDI GLOBALI (SYSTEM LEVEL) ---
        JsonDocument doc;
        DeserializationError error = deserializeJson(doc, _lastMessage);

        if (!error) {
            const char* cmd = doc["cmd"];
            if (cmd && strcmp(cmd, "RESET") == 0) {
                Serial.println("!!! GLOBAL SYSTEM RESET RECEIVED !!!");
                
                if (_hardware) {
                    _hardware->clearLcd();
                    _hardware->printLcd(0, 0, "SYSTEM RESET");
                    _hardware->printLcd(0, 1, "Riavvio...");
                }
                delay(1000); 
                ESP.restart();
            }
        }
    }
}

void NetworkManager::sendEvent(const String& eventType, const JsonDocument& data) {
    if (!isConnected() || !_mqttClient.connected()) {
        return; 
    }

    JsonDocument doc;
    doc["id"] = deviceId;
    doc["type"] = eventType;
    doc["payload"] = data;

    char jsonBuffer[512];
    serializeJson(doc, jsonBuffer);

    char topicBuffer[64];
    snprintf(topicBuffer, sizeof(topicBuffer), "zulu/telemetry/%s", deviceId.c_str());

    _mqttClient.publish(topicBuffer, jsonBuffer);
}

void NetworkManager::sendEvent(const String& eventType) {
    JsonDocument emptyDoc;
    sendEvent(eventType, emptyDoc);
}

void NetworkManager::setReceivedMessage(String msg) {
    _lastMessage = msg;
}

String NetworkManager::getReceivedMessage() {
    if (_lastMessage != "") {
        String msg = _lastMessage;
        _lastMessage = ""; 
        return msg;
    }
    return "";
}

bool NetworkManager::isConnected() {
    return WiFi.status() == WL_CONNECTED;
}