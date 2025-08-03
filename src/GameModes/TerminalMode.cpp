// src/GameModes/TerminalMode.cpp

#include "GameModes/TerminalMode.h"

// Costruttore
TerminalMode::TerminalMode(HardwareManager* hardware, NetworkManager* network, AppState* appState, MainMenuDisplayFunction displayFunc)
    : _hardware(hardware),
      _network(network),
      _appStatePtr(appState),
      _mainMenuDisplayFunc(displayFunc) {
}

void TerminalMode::enter() {
    Serial.println("Entrato in Modalita' Terminale");
    _network->sendStatus("event:mode_enter;mode:terminal;");
    
    _hardware->clearLcd();
    _hardware->printLcd(0, 1, "MODALITA' TERMINALE");
    _hardware->printLcd(0, 2, "In attesa di comandi");
    _hardware->setStripColor(50, 50, 255); // Colore blu per indicare lo stato
    _hardware->clearOled1();
    _hardware->clearOled2();
}

void TerminalMode::loop() {
    // In futuro, qui verrà gestita la ricezione e l'esecuzione dei comandi
    
    // Per ora, si può uscire con il pulsante 1 per tornare al menu
    if (_hardware->wasButton1Pressed()) {
        exit();
        *_appStatePtr = APP_STATE_MAIN_MENU;
        _mainMenuDisplayFunc();
    }
}

void TerminalMode::exit() {
    Serial.println("Uscito da Modalita' Terminale");
    _network->sendStatus("event:mode_exit;mode:terminal;");
    _hardware->turnOffStrip();
}