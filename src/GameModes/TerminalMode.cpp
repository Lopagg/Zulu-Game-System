// src/GameModes/TerminalMode.cpp

#include "GameModes/TerminalMode.h"
#include <ArduinoJson.h>

// Costruttore
TerminalMode::TerminalMode(HardwareManager* hardware, NetworkManager* network, AppState* appState, MainMenuDisplayFunction displayFunc, 
                         DominationSettings* domSettings, DominationMode* domMode,
                         SearchDestroySettings* sdSettings, SearchDestroyMode* sdMode)
    : _hardware(hardware),
      _network(network),
      _appStatePtr(appState),
      _mainMenuDisplayFunc(displayFunc),
      _domSettings(domSettings),
      _domMode(domMode),
      _sdSettings(sdSettings),
      _sdMode(sdMode) {
}

void TerminalMode::enter() {
    Serial.println("Entrato in Modalita' Terminale");
    
    JsonDocument doc;
    doc["mode"] = "TERMINAL";
    _network->sendEvent("MODE_ENTER", doc);
    
    _hardware->clearLcd();
    _hardware->printLcd(0, 1, "MODALITA' TERMINALE");
    _hardware->printLcd(0, 2, "In attesa di comandi");
    _hardware->setStripColor(50, 50, 255); // Colore blu per indicare lo stato
    _hardware->printOled1("INDIETRO", 2, 10, 25);
    _hardware->clearOled2();
}

void TerminalMode::loop() {
    String message = _network->getReceivedMessage();
    
    if (message != "") {
        // Tentiamo di decodificare il messaggio come JSON
        JsonDocument doc;
        DeserializationError error = deserializeJson(doc, message);

        if (!error) {
            parseCommand(doc);
        } else {
            Serial.print("Errore parsing JSON in TerminalMode: ");
            Serial.println(error.c_str());
        }
    }
    
    if (_hardware->wasButton1Pressed()) {
        exit();
        *_appStatePtr = APP_STATE_MAIN_MENU;
        _mainMenuDisplayFunc();
    }
}

void TerminalMode::exit() {
    Serial.println("Uscito da Modalita' Terminale");
    
    JsonDocument doc;
    doc["mode"] = "TERMINAL";
    _network->sendEvent("MODE_EXIT", doc);
    
    _hardware->turnOffStrip();
}

/**
 * @brief Interpreta i comandi JSON ricevuti dal server.
 * @param doc Il documento JSON contenente il comando e i parametri.
 */
void TerminalMode::parseCommand(JsonDocument& doc) {
    const char* cmd = doc["cmd"]; 
    
    if (!cmd) return;

    Serial.print("Comando JSON ricevuto: ");
    Serial.println(cmd);

    if (strcmp(cmd, "SET_DOM_SETTINGS") == 0) {
        // CORREZIONE: Usiamo doc["key"].is<T>() invece di containsKey
        
        if (doc["duration"].is<int>()) {
            _domSettings->setGameDuration(doc["duration"]);
        }
        if (doc["capture_time"].is<int>()) {
            _domSettings->setCaptureTime(doc["capture_time"]);
        }
        
        _domSettings->saveParameters();
        Serial.println("Impostazioni Dominio aggiornate da remoto.");
        _domMode->sendSettingsStatus();

    } else if (strcmp(cmd, "START_DOM_GAME") == 0) {
        Serial.println("Avvio partita Dominio da remoto...");
        
        JsonDocument resp;
        resp["target_mode"] = "DOMINATION";
        _network->sendEvent("REMOTE_START_ACK", resp);
        
        *_appStatePtr = APP_STATE_DOMINATION_MODE;
        _domMode->enterInGame();

    } else if (strcmp(cmd, "SET_SD_SETTINGS") == 0) {
        
        // CORREZIONE: Aggiornato sintassi per ArduinoJson 7
        if (doc["bomb_time"].is<int>()) _sdSettings->setBombTime(doc["bomb_time"]);
        if (doc["arm_time"].is<int>()) _sdSettings->setArmingTime(doc["arm_time"]);
        if (doc["defuse_time"].is<int>()) _sdSettings->setDefuseTime(doc["defuse_time"]);
        
        if (doc["use_arm_pin"].is<bool>()) _sdSettings->setUseArmingPin(doc["use_arm_pin"]);
        if (doc["use_defuse_pin"].is<bool>()) _sdSettings->setUseDisarmingPin(doc["use_defuse_pin"]);
        
        // Per le stringhe, controlliamo se è una stringa valida (const char*)
        if (doc["arm_pin"].is<const char*>()) {
            String pin = doc["arm_pin"].as<String>();
            _sdSettings->setArmingPin(pin);
        }
        if (doc["defuse_pin"].is<const char*>()) {
            String pin = doc["defuse_pin"].as<String>();
            _sdSettings->setDisarmingPin(pin);
        }
        
        _sdSettings->saveParameters();
        Serial.println("Impostazioni C&D aggiornate da remoto.");
        _sdMode->sendSettingsStatus();

    } else if (strcmp(cmd, "START_SD_GAME") == 0) {
        Serial.println("Avvio partita C&D da remoto...");
        
        JsonDocument resp;
        resp["target_mode"] = "SEARCH_AND_DESTROY";
        _network->sendEvent("REMOTE_START_ACK", resp);

        *_appStatePtr = APP_STATE_SEARCH_DESTROY_MODE;
        _sdMode->enterInGame();
    }
}