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
    _hardware->printOled1("INDIETRO", 2, 10, 25);
    _hardware->clearOled2();
}

void TerminalMode::loop() {
    String command = _network->getReceivedMessage();
    if (command != "") {
        parseCommand(command);
    }
    
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

void TerminalMode::parseCommand(String command) {
    Serial.print("Comando ricevuto in TerminalMode: ");
    Serial.println(command);

    if (command == "CMD:TEST_LEDS_RED") {
        _hardware->setStripColor(255, 0, 0);
    } else if (command == "CMD:TEST_LEDS_GREEN") {
        _hardware->setStripColor(0, 255, 0);
    }
}