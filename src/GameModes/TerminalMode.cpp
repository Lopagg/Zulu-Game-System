// src/GameModes/TerminalMode.cpp

#include "GameModes/TerminalMode.h"
#include <ArduinoJson.h>

// Costruttore
TerminalMode::TerminalMode(HardwareManager* hardware, NetworkManager* network, AppState* appState, MainMenuDisplayFunction displayFunc)
    : _hardware(hardware),
      _network(network),
      _appStatePtr(appState),
      _mainMenuDisplayFunc(displayFunc) {
}

void TerminalMode::enter() {
    Serial.println("Entrato in Modalita' Terminale (Thin Client V2)");
    
    JsonDocument doc;
    doc["mode"] = "TERMINAL";
    _network->sendEvent("MODE_ENTER", doc);
    
    _hardware->clearLcd();
    _hardware->printLcd(0, 1, "MODALITA' TERMINALE");
    _hardware->printLcd(0, 2, "In attesa di comandi");
    _hardware->setStripColor(50, 50, 255); // Colore blu
    _hardware->printOled1("INDIETRO", 2, 10, 25);
    _hardware->clearOled2();
    
    _lastInputTime = millis();
}

void TerminalMode::loop() {
    // 1. GESTIONE INPUT HARDWARE VERSO IL SERVER (Event-Driven)
    handleInput();

    // 2. RICEZIONE COMANDI DI RENDERING DAL SERVER
    String message = _network->getReceivedMessage();
    
    if (message != "") {
        JsonDocument doc;
        DeserializationError error = deserializeJson(doc, message);

        if (!error) {
            parseCommand(doc);
        } else {
            Serial.print("Errore parsing JSON in TerminalMode: ");
            Serial.println(error.c_str());
        }
    }
}

void TerminalMode::handleInput() {
    char key = _hardware->getKey();
    bool btn1_pressed = _hardware->isButton1Pressed();
    bool btn2_pressed = _hardware->isButton2Pressed();
    bool btn1_was_pressed = _hardware->wasButton1Pressed();
    bool btn2_was_pressed = _hardware->wasButton2Pressed();

    // USCITA DI EMERGENZA LATO HARDWARE (Premi P1 + P2 insieme)
    if (btn1_pressed && btn2_pressed) {
        delay(2000); // Aspetta 2 secondi
        if (_hardware->isButton1Pressed() && _hardware->isButton2Pressed()) {
            _hardware->playTone(1500, 500);
            exit();
            *_appStatePtr = APP_STATE_MAIN_MENU;
            _mainMenuDisplayFunc();
            return;
        }
    }

    if (millis() - _lastInputTime > 100) { 
        if (key != NO_KEY || btn1_was_pressed || btn2_was_pressed || btn1_pressed || btn2_pressed) {
            JsonDocument doc;
            if (key != NO_KEY) doc["key"] = String(key);
            if (btn1_was_pressed) doc["btn1"] = "click";
            else if (btn1_pressed) doc["btn1"] = "hold";
            if (btn2_was_pressed) doc["btn2"] = "click";
            else if (btn2_pressed) doc["btn2"] = "hold";

            _network->sendEvent("TERMINAL_INPUT", doc);
            _lastInputTime = millis();
        }
    }
}

void TerminalMode::exit() {
    Serial.println("Uscito da Modalita' Terminale");
    
    JsonDocument doc;
    doc["mode"] = "TERMINAL";
    _network->sendEvent("MODE_EXIT", doc);
    
    _hardware->turnOffStrip();
    _hardware->noTone();
    _hardware->clearOled1();
    _hardware->clearOled2();
}

/**
 * @brief Interpreta i comandi JSON di RENDERING ricevuti dal server.
 */
void TerminalMode::parseCommand(JsonDocument& doc) {
    const char* cmd = doc["cmd"]; 
    if (!cmd) return;

    if (strcmp(cmd, "UPDATE_UI") == 0) {
        
        // 1. AGGIORNAMENTO LCD
        if (doc.containsKey("lcd_0")) {
            _hardware->printLcd(0, 0, "                    "); // Pulisce la riga
            _hardware->printLcd(0, 0, doc["lcd_0"].as<String>());
        }
        if (doc.containsKey("lcd_1")) {
            _hardware->printLcd(0, 1, "                    ");
            _hardware->printLcd(0, 1, doc["lcd_1"].as<String>());
        }
        if (doc.containsKey("lcd_2")) {
            _hardware->printLcd(0, 2, "                    ");
            _hardware->printLcd(0, 2, doc["lcd_2"].as<String>());
        }
        if (doc.containsKey("lcd_3")) {
            _hardware->printLcd(0, 3, "                    ");
            _hardware->printLcd(0, 3, doc["lcd_3"].as<String>());
        }
        if (doc.containsKey("clear_lcd") && doc["clear_lcd"] == true) {
            _hardware->clearLcd();
        }

        // 2. AGGIORNAMENTO OLED
        if (doc.containsKey("oled_1")) {
            _hardware->printOled1(doc["oled_1"].as<String>(), 2, 10, 25);
        }
        if (doc.containsKey("oled_2")) {
            _hardware->printOled2(doc["oled_2"].as<String>(), 2, 10, 25);
        }
        if (doc.containsKey("clear_oled") && doc["clear_oled"] == true) {
            _hardware->clearOled1();
            _hardware->clearOled2();
        }

        // 3. AGGIORNAMENTO LED
        if (doc.containsKey("led_r") && doc.containsKey("led_g") && doc.containsKey("led_b")) {
            _hardware->setStripColor(doc["led_r"], doc["led_g"], doc["led_b"]);
        }
        if (doc.containsKey("led_off") && doc["led_off"] == true) {
            _hardware->turnOffStrip();
        }

        // 4. SUONI (Buzzer Asincrono per non bloccare il terminale)
        if (doc.containsKey("sound_freq") && doc.containsKey("sound_dur")) {
            _hardware->playToneAsync(doc["sound_freq"], doc["sound_dur"]);
        }
        if (doc.containsKey("sound_off") && doc["sound_off"] == true) {
            _hardware->noTone();
        }

    } 
    // Fallback: comandi di sistema
    else if (strcmp(cmd, "RETURN_TO_MENU") == 0) {
        exit();
        *_appStatePtr = APP_STATE_MAIN_MENU;
        _mainMenuDisplayFunc();
    }
}