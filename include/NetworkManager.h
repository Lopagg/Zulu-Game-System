// include/NetworkManager.h

/**
 * @file NetworkManager.h
 * @brief Dichiarazione della classe NetworkManager per la gestione della connettività WiFi e della comunicazione UDP.
 * @details Questa classe astrae tutta la logica di rete. Si occupa di connettere
 * l'ESP32 a una rete WiFi e fornisce metodi semplici per inviare e ricevere
 * messaggi di stato tramite il protocollo UDP Broadcast.
 */

#ifndef NETWORK_MANAGER_H
#define NETWORK_MANAGER_H

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include "HardwareManager.h"

/**
 * @class NetworkManager
 * @brief Gestisce la connessione WiFi e la comunicazione UDP.
 * @details Un unico oggetto di questa classe viene creato in main.cpp per gestire
 * tutte le operazioni di rete, assicurando che ci sia un solo punto di
 * controllo per la comunicazione.
 */
class NetworkManager {
public:
    /**
     * @brief Costruttore. Inizializza i parametri di rete di base.
     */
    NetworkManager();
    /**
     * @brief Inizializza la connessione WiFi e il servizio UDP.
     * @details Tenta di connettersi alla rete WiFi specificata. Se ha successo,
     * configura e avvia un listener UDP sulla porta predefinita. Questa funzione
     * è bloccante finché la connessione WiFi non viene stabilita.
     * Va chiamata una sola volta nel setup().
     */
    void initialize(HardwareManager* hardware);
    /**
     * @brief Aggiorna lo stato del listener di rete.
     * @details Da chiamare ad ogni ciclo del loop() principale. Controlla se sono
     * arrivati nuovi pacchetti UDP sulla rete e in futuro gestirà la loro
     * elaborazione.
     */
    void update();
    /**
     * @brief Invia un messaggio di stato in broadcast sulla rete.
     * @param status Una stringa di caratteri (C-style string) contenente il messaggio da inviare.
     * @details Il messaggio viene inviato a tutti i dispositivi sulla stessa rete locale
     * che sono in ascolto sulla porta UDP corretta.
     */
    void sendStatus(const char* status);

    String getReceivedMessage();

private:
    // Credenziali per la rete WiFi.
    const char* _ssid;
    const char* _password;
    // Oggetto per la gestione del protocollo UDP.
    WiFiUDP _udp;
    // Porta UDP su cui il dispositivo invia e riceve i dati.
    const int _udpPort;
    // Indirizzo IP di broadcast calcolato dopo la connessione.
    IPAddress _broadcastIP;

    IPAddress _lastSenderIP;
    String _lastMessage;
};

#endif // NETWORK_MANAGER_H