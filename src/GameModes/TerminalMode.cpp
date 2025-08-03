// src/GameModes/TerminalMode.cpp

#include "GameModes/TerminalMode.h"
#include <vector>

// Funzione helper per dividere la stringa dei comandi
std::vector<String> splitString(String str, char delimiter) {
    std::vector<String> result;
    int last = 0;
    for (int i = 0; i < str.length(); i++) {
        if (str.charAt(i) == delimiter) {
            result.push_back(str.substring(last, i));
            last = i + 1;
        }
    }
    result.push_back(str.substring(last));
    return result;
}

// Costruttore
TerminalMode::TerminalMode(HardwareManager* hardware, NetworkManager* network, AppState* appState, MainMenuDisplayFunction displayFunc, DominationSettings* domSettings, DominationMode* domMode)
    : _hardware(hardware),
      _network(network),
      _appStatePtr(appState),
      _mainMenuDisplayFunc(displayFunc),
      _domSettings(domSettings),
      _domMode(domMode) {
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

    std::vector<String> parts = splitString(command, ';');
    String cmd_event = "";

    for (const auto& part : parts) {
        if (part.startsWith("CMD:")) {
            cmd_event = part.substring(4);
            break;
        }
    }

    if (cmd_event == "SET_DOM_SETTINGS") {
        for (const auto& part : parts) {
            if (part.startsWith("DURATION:")) {
                _domSettings->setGameDuration(part.substring(9).toInt());
            } else if (part.startsWith("CAPTURE:")) {
                _domSettings->setCaptureTime(part.substring(8).toInt());
            } else if (part.startsWith("COUNTDOWN:")) {
                _domSettings->setCountdownDuration(part.substring(10).toInt());
            }
        }
        _domSettings->saveParameters();
        Serial.println("Impostazioni Dominio aggiornate da remoto.");
        _domMode->sendSettingsStatus();

    } else if (cmd_event == "START_DOM_GAME") {
        Serial.println("Avvio partita Dominio da remoto...");
        *_appStatePtr = APP_STATE_DOMINATION_MODE;
        _domMode->enterInGame();
    }
}