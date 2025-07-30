// src/NetworkManager.cpp

#include "NetworkManager.h"

// *** MODIFICA QUI CON LE TUE CREDENZIALI WIFI ***
const char* WIFI_SSID = "MELONE";
const char* WIFI_PASSWORD = "wirelessmelone";

// Costruttore
NetworkManager::NetworkManager() :
    _ssid(WIFI_SSID),
    _password(WIFI_PASSWORD),
    _udpPort(1234) // Porta standard per la comunicazione
{
}

void NetworkManager::initialize() {
    Serial.println("--- Inizializzazione Rete ---");
    WiFi.mode(WIFI_STA); // Imposta l'ESP32 come client WiFi
    WiFi.begin(_ssid, _password);

    Serial.print("Connessione a WiFi [");
    Serial.print(_ssid);
    Serial.print("]...");

    // Attendi la connessione
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }

    Serial.println(" CONNESSO!");
    Serial.print("Indirizzo IP: ");
    Serial.println(WiFi.localIP());

    // Imposta l'indirizzo di broadcast
    _broadcastIP = WiFi.localIP();
    _broadcastIP[3] = 255; // Es: se l'IP è 192.168.1.7, il broadcast è 192.168.1.255

    // Inizia ad ascoltare sulla porta UDP
    _udp.begin(_udpPort);
    Serial.print("In ascolto su porta UDP: ");
    Serial.println(_udpPort);
    Serial.println("---------------------------");
}

void NetworkManager::update() {
    // Questa funzione gestirà i dati in entrata in futuro
    int packetSize = _udp.parsePacket();
    if (packetSize) {
        // ... (qui inseriremo la logica per leggere i pacchetti in arrivo) ...
        Serial.print("Ricevuto pacchetto UDP di dimensione ");
        Serial.println(packetSize);
    }
}

void NetworkManager::sendStatus(const char* status) {
    _udp.beginPacket(_broadcastIP, _udpPort);
    _udp.print(status);
    _udp.endPacket();
    Serial.print("Inviato pacchetto di stato: ");
    Serial.println(status);
}