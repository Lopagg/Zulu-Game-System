// include/NetworkManager.h

#ifndef NETWORK_MANAGER_H
#define NETWORK_MANAGER_H

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>

class NetworkManager {
public:
    NetworkManager();
    void initialize();
    void update(); // Da chiamare nel loop principale

    void sendStatus(const char* status); // Esempio per inviare dati

private:
    const char* _ssid;
    const char* _password;

    WiFiUDP _udp;
    const int _udpPort;
    IPAddress _broadcastIP;
};

#endif // NETWORK_MANAGER_H