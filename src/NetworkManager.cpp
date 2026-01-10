#include "NetworkManager.h"
#include <ArduinoJson.h>

String deviceId = "";   // Variabile globale per il MAC Address

// --- Lista delle reti Wi-Fi conosciute ---
struct WifiCredential {
    const char* ssid;
    const char* password;
};

const WifiCredential knownNetworks[] = {
    {"MELONE", "wirelessmelone"},               // Rete casa
    {"Som🅱️​rero🔆", "cristone"},       // telefono ceri
    {"S20Lorenzo", "Satana666"}   // hotspot
};
const int numKnownNetworks = sizeof(knownNetworks) / sizeof(knownNetworks[0]);

// Il tuo server DDNS
const char* SERVER_HOSTNAME = "zuluserver.ddns.net";

// Costruttore
NetworkManager::NetworkManager() : _udpPort(12345), _ipResolved(false), _hardware(nullptr) {}

void NetworkManager::initialize(HardwareManager* hardware) {
    // Salviamo il riferimento all'hardware per usarlo anche in update() (es. per il Reset)
    _hardware = hardware;

    Serial.println("--- Inizializzazione Rete (JSON Edition) ---");
    hardware->clearLcd();
    hardware->printLcd(0, 0, "Scansione WiFi...");

    WiFi.mode(WIFI_STA);
    WiFi.disconnect();
    delay(100);

    int n = WiFi.scanNetworks();
    if (n == 0) {
        hardware->printLcd(0, 1, "Nessuna rete!");
        return;
    }

    bool connected = false;
    for (int i = 0; i < numKnownNetworks; i++) {
        for (int j = 0; j < n; j++) {
            if (strcmp(knownNetworks[i].ssid, WiFi.SSID(j).c_str()) == 0) {
                hardware->clearLcd();
                hardware->printLcd(0, 0, "Connessione a:");
                hardware->printLcd(0, 1, knownNetworks[i].ssid);
                
                WiFi.begin(knownNetworks[i].ssid, knownNetworks[i].password);
                
                int attempts = 0;
                while (WiFi.status() != WL_CONNECTED && attempts < 20) {
                    delay(500);
                    Serial.print(".");
                    attempts++;
                }

                if (WiFi.status() == WL_CONNECTED) {
                    connected = true;
                    goto connection_success;
                }
            }
        }
    }

connection_success:
    if (connected) {
        deviceId = WiFi.macAddress();
        hardware->clearLcd();
        hardware->printLcd(0, 0, "WiFi OK!");
        hardware->printLcd(0, 1, WiFi.localIP().toString());
        Serial.printf("\nConnesso! IP: %s, MAC: %s\n", WiFi.localIP().toString().c_str(), deviceId.c_str());

        // --- SEZIONE NTP ---
        hardware->printLcd(0, 1, "Sync Orario...");
        configTime(3600, 3600, "pool.ntp.org", "time.nist.gov");
        delay(2000); 
        hardware->syncWithNTP();
        
        _udp.begin(_udpPort);
        
        // Risoluzione IP Server
        resolveServerIP();

        // Invia evento di BOOT (Presentazione al sistema)
        JsonDocument bootDoc;
        bootDoc["mode"] = "MAIN MENU"; 
        bootDoc["version"] = "1.0";
        sendEvent("BOOT_COMPLETE", bootDoc);

    } else {
        hardware->printLcd(0, 0, "WiFi Fallita!");
    }
}

void NetworkManager::resolveServerIP() {
    Serial.print("Risoluzione DNS server: ");
    Serial.println(SERVER_HOSTNAME);
    
    // Prova a risolvere il nome a dominio
    if (WiFi.hostByName(SERVER_HOSTNAME, _serverIP)) {
        _ipResolved = true;
        Serial.print("Server IP trovato: ");
        Serial.println(_serverIP);
    } else {
        _ipResolved = false;
        Serial.println("Errore DNS! Impossibile trovare il server.");
        if (_hardware) _hardware->printLcd(0, 1, "DNS Error!");
    }
}

void NetworkManager::update() {
    int packetSize = _udp.parsePacket();
    if (packetSize) {
        char incomingPacket[512];
        int len = _udp.read(incomingPacket, 512);
        if (len > 0) incomingPacket[len] = 0;
        
        _lastMessage = String(incomingPacket);
        _lastSenderIP = _udp.remoteIP();
        
        Serial.printf("RX [%s]: %s\n", _lastSenderIP.toString().c_str(), _lastMessage.c_str());

        // --- INTERCETTAZIONE COMANDI GLOBALI (SYSTEM LEVEL) ---
        JsonDocument doc;
        DeserializationError error = deserializeJson(doc, _lastMessage);

        if (!error) {
            // Cerca il comando RESET
            const char* cmd = doc["cmd"];
            if (cmd && strcmp(cmd, "RESET") == 0) {
                Serial.println("!!! GLOBAL SYSTEM RESET RECEIVED !!!");
                
                // Feedback visivo (ora funziona perché abbiamo salvato _hardware)
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
    // Se il DNS non è risolto o la connessione è caduta, riprova
    if (!isConnected() || !_ipResolved) {
        if (isConnected()) resolveServerIP();
        if (!_ipResolved) return; // Se fallisce ancora, non inviare nulla
    }

    // 1. Crea il pacchetto JSON
    JsonDocument doc;
    doc["id"] = deviceId;
    doc["type"] = eventType;
    // Copia i dati del payload (deep copy per sicurezza)
    doc["payload"] = data;

    // 2. Serializza
    String jsonString;
    serializeJson(doc, jsonString);

    // 3. Invia
    _udp.beginPacket(_serverIP, _udpPort);
    _udp.print(jsonString);
    _udp.endPacket();
    
    // Serial.println("TX: " + jsonString); // Decommenta per debug intenso
}

// Override per eventi semplici
void NetworkManager::sendEvent(const String& eventType) {
    JsonDocument emptyDoc;
    sendEvent(eventType, emptyDoc);
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