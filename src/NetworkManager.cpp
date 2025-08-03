// src/NetworkManager.cpp

/**
 * @file NetworkManager.cpp
 * @brief Implementazione della classe NetworkManager.
 */

#include "NetworkManager.h"

// --- Configurazione Rete ---
// Qui vengono definite le credenziali della rete WiFi a cui il dispositivo si connetterà.
// DEVONO essere modificate con i dati della rete del campo da gioco.
const char* WIFI_SSID = "MELONE";
const char* WIFI_PASSWORD = "wirelessmelone";

// Costruttore
NetworkManager::NetworkManager() :
    _ssid(WIFI_SSID),
    _password(WIFI_PASSWORD),
    _udpPort(1234) // Porta standard per la comunicazione
{
}

/**
 * @brief Inizializza la connessione WiFi e il servizio UDP.
 * @details Questa funzione viene eseguita all'avvio. Tenta ripetutamente di
 * connettersi alla rete WiFi specificata e, una volta connesso, calcola
 * l'indirizzo di broadcast e si mette in ascolto per i pacchetti UDP in arrivo.
 */
void NetworkManager::initialize(HardwareManager* hardware) {
    Serial.println("--- Inizializzazione Rete ---");
    
    // Mostra il messaggio iniziale sull'LCD
    hardware->clearLcd();
    hardware->printLcd(0, 1, "Ricerca Rete WiFi...");
    hardware->printLcd(0, 2, _ssid);

    WiFi.mode(WIFI_STA);
    WiFi.begin(_ssid, _password);

    Serial.print("Connessione a WiFi [");
    Serial.print(_ssid);
    Serial.print("]...");

    int dotCount = 0;
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
        
        // Animazione puntini sull'LCD
        String dots = "";
        for(int i = 0; i < dotCount; i++) { dots += "."; }
        hardware->printLcd(0, 3, dots + "   "); // Aggiunge spazi per cancellare i puntini precedenti
        dotCount = (dotCount + 1) % 4;
    }

    Serial.println(" CONNESSO!");
    Serial.print("Indirizzo IP: ");
    Serial.println(WiFi.localIP());

    // Mostra il messaggio di successo sull'LCD
    hardware->clearLcd();
    hardware->printLcd(6, 1, "Connesso!");
    hardware->printLcd(4, 2, WiFi.localIP().toString());
    delay(2000); // Mostra il messaggio per 2 secondi

    _broadcastIP = WiFi.localIP();
    _broadcastIP[3] = 255;

    _udp.begin(_udpPort);
    Serial.print("In ascolto su porta UDP: ");
    Serial.println(_udpPort);
    Serial.println("---------------------------");
}

/**
 * @brief Aggiorna il listener UDP. Da chiamare in loop.
 * @details Controlla se è arrivato un pacchetto di dati. Se sì, lo legge.
 * Al momento stampa solo un messaggio a scopo di debug, ma in futuro
 * qui verrà implementata la logica per interpretare i comandi in arrivo.
 */
void NetworkManager::update() {
    int packetSize = _udp.parsePacket();
    if (packetSize) {
        Serial.print("Ricevuto pacchetto UDP di dimensione ");
        Serial.println(packetSize);
        // (Logica futura per la gestione dei comandi ricevuti)
    }
}

/**
 * @brief Invia un pacchetto UDP in broadcast.
 * @param status Il messaggio di testo da inviare.
 * @details Costruisce un pacchetto UDP, lo indirizza all'IP di broadcast
 * e lo invia. Usato da tutte le modalità di gioco per comunicare lo stato.
 */
void NetworkManager::sendStatus(const char* status) {
    _udp.beginPacket(_broadcastIP, _udpPort);
    _udp.print(status);
    _udp.endPacket();
    Serial.print("Inviato pacchetto di stato: ");
    Serial.println(status);
}