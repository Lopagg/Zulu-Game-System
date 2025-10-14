// src/NetworkManager.cpp

#include "NetworkManager.h"

// --- Lista delle reti Wi-Fi conosciute ---
// Aggiungi qui tutte le reti a cui vuoi che il dispositivo si connetta.
// Puoi aggiungerne quante ne vuoi.
struct WifiCredential {
    const char* ssid;
    const char* password;
};

const WifiCredential knownNetworks[] = {
    {"MELONE", "wirelessmelone"},               // Rete casa
    {"", ""},       //
    {"S20Lorenzo", "Satana666"}   // hotspot
};
const int numKnownNetworks = sizeof(knownNetworks) / sizeof(knownNetworks[0]);

// --- MODIFICA: L'hostname del server ora è definito qui ---
const char* SERVER_HOSTNAME = "zuluserver.ddns.net";

// Costruttore
NetworkManager::NetworkManager() :
    _udpPort(1234) // Inizializza solo la porta
{
    // Le credenziali non vengono più inizializzate qui
}

void NetworkManager::initialize(HardwareManager* hardware) {
    Serial.println("--- Inizializzazione Rete (Multi-WiFi) ---");
    hardware->clearLcd();
    hardware->printLcd(0, 1, "Scansione Reti WiFi");
    
    WiFi.mode(WIFI_STA);
    WiFi.disconnect(); // Assicura di partire da uno stato pulito
    delay(100);

    Serial.println("Avvio scansione reti...");
    int numVisibleNetworks = WiFi.scanNetworks();
    Serial.printf("Trovate %d reti.\n", numVisibleNetworks);

    if (numVisibleNetworks == 0) {
        hardware->printLcd(0, 2, "Nessuna rete trovata!");
        return; // O entra in un loop di attesa
    }

    // Cerca una corrispondenza tra le reti conosciute e quelle visibili
    bool connected = false;
    for (int i = 0; i < numKnownNetworks; i++) {
        for (int j = 0; j < numVisibleNetworks; j++) {
            if (strcmp(knownNetworks[i].ssid, WiFi.SSID(j).c_str()) == 0) {
                Serial.printf("Rete conosciuta trovata: %s. Tento la connessione...\n", knownNetworks[i].ssid);
                hardware->clearLcd();
                hardware->printLcd(0, 1, "Trovata Rete:");
                hardware->printLcd(0, 2, knownNetworks[i].ssid);

                WiFi.begin(knownNetworks[i].ssid, knownNetworks[i].password);

                // Attendi la connessione con un timeout di 10 secondi
                int attempts = 20;
                while (WiFi.status() != WL_CONNECTED && attempts > 0) {
                    delay(500);
                    Serial.print(".");
                    attempts--;
                }

                if (WiFi.status() == WL_CONNECTED) {
                    connected = true;
                    goto connection_success; // Salta fuori da entrambi i loop
                } else {
                    Serial.println(" Connessione fallita. Provo la prossima.");
                    WiFi.disconnect();
                }
            }
        }
    }

connection_success:
    if (connected) {
        Serial.println("\nCONNESSO!");
        Serial.print("Indirizzo IP: ");
        Serial.println(WiFi.localIP());

        hardware->clearLcd();
        hardware->printLcd(6, 1, "Connesso!");
        hardware->printLcd(4, 2, WiFi.localIP().toString());
        delay(2000);

        _udp.begin(_udpPort);
        Serial.print("In ascolto su porta UDP: ");
        Serial.println(_udpPort);
    } else {
        Serial.println("\nNessuna rete WiFi conosciuta trovata.");
        hardware->clearLcd();
        hardware->printLcd(0, 1, "Nessuna Rete Nota");
        hardware->printLcd(0, 2, "Trovata!");
    }
    Serial.println("---------------------------");
}

void NetworkManager::update() {
    int packetSize = _udp.parsePacket();
    if (packetSize) {
        _lastSenderIP = _udp.remoteIP();
        char incomingPacket[255];
        int len = _udp.read(incomingPacket, 255);
        if (len > 0) {
            incomingPacket[len] = 0;
        }
        _lastMessage = String(incomingPacket);
        Serial.printf("Ricevuto pacchetto da %s: %s\n", _lastSenderIP.toString().c_str(), _lastMessage.c_str());
    }
}

String NetworkManager::getReceivedMessage() {
    if (_lastMessage != "") {
        String msg = _lastMessage;
        _lastMessage = "";
        return msg;
    }
    return "";
}

void NetworkManager::sendStatus(const char* status) {
    IPAddress remote_addr;
    if (WiFi.hostByName(SERVER_HOSTNAME, remote_addr)) {
        _udp.beginPacket(remote_addr, _udpPort);
        _udp.print(status);
        _udp.endPacket();
    } else {
        Serial.println("ERRORE: Impossibile risolvere l'hostname del server!");
    }
}