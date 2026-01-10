// src/NetworkManager.cpp

#include "NetworkManager.h"

String deviceId = "";   // Variabile globale per il MAC Address

// --- Lista delle reti Wi-Fi conosciute ---
// Aggiungi qui tutte le reti a cui vuoi che il dispositivo si connetta.
// Puoi aggiungerne quante ne vuoi.
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

const char* SERVER_HOSTNAME = "zuluserver.ddns.net";

// Costruttore
NetworkManager::NetworkManager() : _udpPort(1234), _ipResolved(false) {}

void NetworkManager::initialize(HardwareManager* hardware) {
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
        // Configura l'ora: GMT+1 (3600 sec) e Ora Legale (+3600 sec)
        configTime(3600, 3600, "pool.ntp.org", "time.nist.gov");
        
        // Diamo tempo al sistema di ricevere il pacchetto NTP
        delay(2000); 
        
        // Chiediamo all'hardware manager di aggiornare l'RTC
        hardware->syncWithNTP();
        // -------------------
        
        _udp.begin(_udpPort);
        
        // Risolvi l'IP del server ORA, non durante il gioco
        resolveServerIP();

        JsonDocument bootDoc;
        bootDoc["mode"] = "MAIN MENU"; // Diciamo subito che siamo nel menu
        bootDoc["version"] = "1.0";
        sendEvent("BOOT_COMPLETE", bootDoc);

    } else {
        hardware->printLcd(0, 0, "WiFi Fallita!");
    }
}

void NetworkManager::resolveServerIP() {
    Serial.print("Risoluzione DNS server: ");
    Serial.println(SERVER_HOSTNAME);
    if (WiFi.hostByName(SERVER_HOSTNAME, _serverIP)) {
        _ipResolved = true;
        Serial.print("Server IP trovato: ");
        Serial.println(_serverIP);
    } else {
        _ipResolved = false;
        Serial.println("Errore DNS! Impossibile trovare il server.");
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
        // Controlliamo subito se è un comando di reset, indipendentemente dalla modalità attuale.
        
        JsonDocument doc;
        DeserializationError error = deserializeJson(doc, _lastMessage);

        if (!error) {
            // Verifichiamo se c'è un campo "cmd" uguale a "RESET"
            const char* cmd = doc["cmd"];
            if (cmd && strcmp(cmd, "RESET") == 0) {
                Serial.println("!!! GLOBAL SYSTEM RESET RECEIVED !!!");
                
                // Opzionale: Se hai accesso all'hardware manager qui (dovresti passarlo nel costruttore o update)
                // Altrimenti stampi solo su seriale e riavvii.
                
                delay(500); // Piccolo delay per assicurarsi che il log seriale esca
                ESP.restart();
            }
        }
        // ------------------------------------------------------
    }
}

// Invia un evento con dati complessi
void NetworkManager::sendEvent(const String& eventType, const JsonDocument& data) {
    if (!isConnected() || !_ipResolved) {
        // Riprova a risolvere se avevamo fallito
        if (isConnected() && !_ipResolved) resolveServerIP();
        if (!_ipResolved) return;
    }

    // 1. Crea il pacchetto JSON
    JsonDocument doc;
    doc["id"] = deviceId;      // Chi sono
    doc["type"] = eventType;   // Cosa è successo (es. "GAME_START")
    doc["payload"] = data;     // Dati extra (es. punteggi)

    // 2. Serializza in stringa
    String jsonString;
    serializeJson(doc, jsonString);

    // 3. Spedisci
    _udp.beginPacket(_serverIP, _udpPort);
    _udp.print(jsonString);
    _udp.endPacket();

    // Debug
    // Serial.print("TX: "); Serial.println(jsonString);
}

// Override per eventi semplici (senza payload dati)
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