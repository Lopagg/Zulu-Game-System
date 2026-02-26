#include "FoxhuntMode.h"
#include <Keypad.h>

// Costruttore
FoxhuntMode::FoxhuntMode(HardwareManager* hardware, NetworkManager* network, AppState* appState, MainMenuDisplayFunction displayFunc)
    : _hardware(hardware), 
      _network(network), 
      _appStatePtr(appState), 
      _mainMenuDisplayFunc(displayFunc) {
}

void FoxhuntMode::enter() {
    Serial.println("Entrato in modalita' FOXHUNT");
    
    _currentState = FoxhuntState::WAIT_NFC;
    _enteredCode = "";
    _dualButtonStartTime = 0;
    
    _prevKey1State = _hardware->isKey1Turned(); 
    _prevKey2State = _hardware->isKey2Turned();

    _hardware->clearLcd();
    _hardware->printLcd(0, 0, "--- INFILTRAZIONE --");
    _hardware->printLcd(0, 1, "IDENTITA' RICHIESTA ");
    _hardware->printLcd(0, 2, " > PASSA TESSERA <  ");
    _hardware->setStripColor(0, 0, 255); 
    
    // SETUP OLED INIZIALE
    _hardware->printOled1("ESCI", 2, 35, 25);
    _hardware->clearOled2();
    
    sendTelemetry();
}

void FoxhuntMode::exit() {
    Serial.println("Uscito da FOXHUNT");
    _hardware->turnOffStrip();
    _hardware->clearLcd();
    
    // PULISCE GLI OLED ALL'USCITA DELLA MODALITÀ
    _hardware->clearOled1();
    _hardware->clearOled2();
}

void FoxhuntMode::loop() {
    bool btn1_pressed = _hardware->wasButton1Pressed();
    bool btn2_pressed = _hardware->wasButton2Pressed();
    bool is_btn1_held = _hardware->isButton1Pressed();
    bool is_btn2_held = _hardware->isButton2Pressed();

    // Ora che il loop non è più bloccato dall'NFC, l'uscita sarà istantanea
    if ((btn1_pressed || is_btn1_held) && _currentState == FoxhuntState::WAIT_NFC) {
        _hardware->playTone(300, 70);
        exit();
        *_appStatePtr = APP_STATE_MAIN_MENU;
        _mainMenuDisplayFunc();
        return;
    }

    switch (_currentState) {
        
        case FoxhuntState::WAIT_NFC: {
            // Timer non bloccante: scansioniamo la tessera solo ogni 150 millisecondi.
            // Nel resto del tempo il processore "vola" e legge i tasti all'istante!
            static unsigned long lastNfcScan = 0;
            if (millis() - lastNfcScan > 150) {
                lastNfcScan = millis();
                
                // Diamo al chip NFC solo 30 millisecondi di tempo per rispondere
                String uid = _hardware->readRFID(30); 
                
                if (uid != "Nessuna card trovata" && uid != "") {
                    if (uid == _validTag1 || uid == _validTag2) {
                        
                        _hardware->clearOled1();
                        _hardware->clearOled2();
                        
                        _hardware->playTone(1500, 150);
                        _hardware->clearLcd();
                        _hardware->printLcd(0, 0, " ACCESSO CONSENTITO ");
                        _hardware->printLcd(0, 2, "    PREPARARSI A    ");
                        _hardware->printLcd(0, 3, "SBLOCCO CHIAVE 1... ");
                        
                        delay(2000); 
                        
                        _currentState = FoxhuntState::MINIGAME_KEY_1;
                        _animStartTime = millis(); 
                        _prevKey1State = _hardware->isKey1Turned(); 
                        sendTelemetry();
                    } else {
                        _hardware->printLcd(0, 3, "TESSERA NON VALIDA! ");
                        _hardware->playTone(200, 500); 
                        delay(1500);
                        _hardware->printLcd(0, 2, " > PASSA TESSERA <  ");
                        _hardware->printLcd(0, 3, "                    "); 
                    }
                }
            }
            break;
        }

        case FoxhuntState::MINIGAME_KEY_1: {
            runSliderMinigame(1, 255, 0, 0);
            break;
        }
        
        case FoxhuntState::MINIGAME_KEY_2: {
            runSliderMinigame(2, 0, 255, 0);
            break;
        }

        case FoxhuntState::WAIT_PIN: {
            char key = _hardware->getKey();
            if (key != NO_KEY) {
                _hardware->playTone(700, 30); 
                
                if (key == '*' || key == '#') {
                    _enteredCode = ""; 
                } else {
                    _enteredCode += key;
                }
                
                String displayStr = "INPUT: " + _enteredCode;
                while (displayStr.length() < 20) { displayStr += " "; }
                _hardware->printLcd(0, 3, displayStr);

                if (_enteredCode.length() == 4) {
                    if (_enteredCode == _targetCode) {
                        
                        _hardware->printOled1("INNESCA", 2, 28, 25);
                        _hardware->printOled2("INNESCA", 2, 28, 25);
                        
                        _hardware->playTone(1000, 80); 
                        _hardware->playTone(1200, 80); 
                        _hardware->playTone(1500, 100);
                        
                        _hardware->clearLcd();
                        _hardware->printLcd(0, 0, "OVERRIDE ACCETTATO. ");
                        _hardware->printLcd(0, 2, "  PREMI ENTRAMBI I  ");
                        _hardware->printLcd(0, 3, "TASTI PER 5 SECONDI ");
                        _hardware->setStripColor(255, 100, 0); 
                        _currentState = FoxhuntState::WAIT_DUAL_BTN;
                        sendTelemetry();
                    } else {
                        _hardware->playTone(200, 500); 
                        _hardware->printLcd(0, 3, "ERRATO. RIPROVA.    ");
                        delay(1500);
                        _enteredCode = "";
                        _hardware->printLcd(0, 3, "INPUT:              ");
                    }
                }
            }
            break;
        }

        case FoxhuntState::WAIT_DUAL_BTN: {
            if (is_btn1_held && is_btn2_held) {
                if (_dualButtonStartTime == 0) {
                    _dualButtonStartTime = millis(); 
                }
                
                unsigned long elapsed = millis() - _dualButtonStartTime;
                int remaining = 5 - (elapsed / 1000);
                
                char buf[21];
                sprintf(buf, "INNESCANDO: %d sec   ", remaining);
                _hardware->printLcd(0, 3, String(buf));
                
                if ((millis() / 200) % 2 == 0) _hardware->setStripColor(255, 100, 0);
                else _hardware->turnOffStrip();
                
                if (elapsed >= 5000) { 
                    
                    _hardware->clearOled1();
                    _hardware->clearOled2();
                    
                    _hardware->playTone(1500, 150);
                    _currentState = FoxhuntState::ARMED_COUNTDOWN;
                    _countdownStartTime = millis();
                    _hardware->clearLcd();
                    sendTelemetry();
                }
            } else {
                if (_dualButtonStartTime != 0) {
                    _dualButtonStartTime = 0; 
                    _hardware->printLcd(0, 3, "SEQUENZA INTERROTTA ");
                    _hardware->playTone(200, 500); 
                    _hardware->setStripColor(255, 100, 0); 
                    delay(1500);
                    _hardware->printLcd(0, 3, "TASTI PER 5 SECONDI ");
                }
            }
            break;
        }

        case FoxhuntState::ARMED_COUNTDOWN: {
            unsigned long elapsed = millis() - _countdownStartTime;
            int timeLeft = 5 - (elapsed / 1000);
            
            char buf[21];
            sprintf(buf, "DETONAZIONE IN: %-2d  ", timeLeft);
            _hardware->printLcd(0, 1, " !!! INNESCATA !!!  ");
            _hardware->printLcd(0, 2, String(buf));
            
            if ((millis() / 100) % 2 == 0) {
                _hardware->setStripColor(255, 0, 0);
            } else {
                _hardware->turnOffStrip();
            }
            
            if (elapsed % 1000 < 100) {
                _hardware->updateTone(1500);
            } else {
                _hardware->noTone();
            }

            if (elapsed >= 5000) {
                for(int i=0; i<3; i++) {
                    _hardware->setBrightness(255);
                    _hardware->setStripColor(255, 255, 255); _hardware->playTone(2000, 50);
                    _hardware->setStripColor(255, 100, 0); _hardware->playTone(1000, 80);
                    _hardware->setStripColor(255, 0, 0); _hardware->playTone(400, 100);
                }
                _hardware->playTone(150, 3000); 
                
                _currentState = FoxhuntState::EXPLODED;
                
                _hardware->printOled1("ESCI", 2, 35, 25);
                
                _hardware->clearLcd();
                _hardware->printLcd(0, 1, "    *** BOOM *** ");
                _hardware->printLcd(0, 2, "INFILTRATI VINCITORI");
                _hardware->setStripColor(255, 0, 0); 
                sendTelemetry();
            }
            break;
        }

        case FoxhuntState::EXPLODED: {
            if (btn1_pressed || is_btn1_held) {
                _hardware->playTone(300, 70);
                exit();
                *_appStatePtr = APP_STATE_MAIN_MENU;
                _mainMenuDisplayFunc();
            }
            break;
        }
    }
}

void FoxhuntMode::runSliderMinigame(int keyNumber, uint8_t r, uint8_t g, uint8_t b) {
    unsigned long elapsed = millis() - _animStartTime;
    unsigned long cycleTime = ANIM_DURATION + WINDOW_DURATION;
    
    bool currentKey = (keyNumber == 1) ? _hardware->isKey1Turned() : _hardware->isKey2Turned();
    bool prevKey = (keyNumber == 1) ? _prevKey1State : _prevKey2State;
    
    bool justTurned = (currentKey == true && prevKey == false);
    
    if (keyNumber == 1) _prevKey1State = currentKey;
    else _prevKey2State = currentKey;

    int totalLeds = _hardware->getStripLedCount();
    int centerLed = totalLeds / 2;
    
    for(int i = 0; i < totalLeds; i++) {
        _hardware->setPixelColor(i, 0, 0, 0);
    }
    
    _hardware->setPixelColor(centerLed, 0, 0, 255); 

    if (elapsed < ANIM_DURATION) {
        _hardware->printLcd(0, 1, (keyNumber == 1) ? "SBLOCCO CHIAVE 1... " : "SBLOCCO CHIAVE 2... ");
        _hardware->printLcd(0, 2, "ATTENDI IL SEGNALE! ");
        
        float progress = (float)elapsed / (float)ANIM_DURATION;
        int ledsToLight = progress * centerLed; 
        
        for (int i = 0; i <= ledsToLight; i++) {
            _hardware->setPixelColor(i, r, g, b); 
            _hardware->setPixelColor((totalLeds - 1) - i, r, g, b); 
        }
        
        _hardware->showStrip(); 
        
        if (justTurned) {
            _hardware->playTone(200, 500); 
            _hardware->printLcd(0, 2, "TROPPO PRESTO!      ");
            delay(1500);
            _animStartTime = millis(); 
            
            if (keyNumber == 1) _prevKey1State = true; 
            else _prevKey2State = true;
        }
        
    } else if (elapsed >= ANIM_DURATION && elapsed <= cycleTime) {
        _hardware->printLcd(0, 2, " >>> GIRA ORA! <<<  ");
        
        for (int i = 0; i < totalLeds; i++) _hardware->setPixelColor(i, r, g, b);
        
        _hardware->showStrip();
        
        if (justTurned) {
            _hardware->playTone(1200, 100); 
            _hardware->clearLcd();
            
            if (keyNumber == 1) {
                _hardware->printLcd(0, 0, " CHIAVE 1 ACCETTATA ");
                delay(1500);
                _currentState = FoxhuntState::MINIGAME_KEY_2;
                _animStartTime = millis();
                _prevKey2State = _hardware->isKey2Turned();
                sendTelemetry();
            } else {
                _hardware->printLcd(0, 0, " CHIAVE 2 ACCETTATA ");
                delay(1500);
                
                randomSeed(millis());
                _targetCode = String(random(1000, 10000));
                
                _currentState = FoxhuntState::WAIT_PIN;
                _hardware->clearLcd();
                _hardware->printLcd(0, 0, " BYPASS CHIAVI OK.  ");
                _hardware->printLcd(0, 1, "  CODICE SBLOCCO:   ");
                
                String targetStr = "> " + _targetCode + " <";
                int padding = (20 - targetStr.length()) / 2;
                String padStr = "";
                for(int i=0; i<padding; i++) padStr += " ";
                _hardware->printLcd(0, 2, padStr + targetStr + padStr);
                
                _hardware->printLcd(0, 3, "INPUT:              ");
                _hardware->turnOffStrip(); 
                sendTelemetry();
            }
        }
        
    } else {
        _hardware->playTone(200, 500); 
        _hardware->printLcd(0, 2, "TEMPO SCADUTO!      ");
        _hardware->turnOffStrip();
        delay(1500);
        _animStartTime = millis(); 
    }
}

void FoxhuntMode::sendTelemetry() {
    JsonDocument doc;
    doc["mode"] = "FOXHUNT";
    
    switch(_currentState) {
        case FoxhuntState::WAIT_NFC: doc["state"] = "ATTESA TESSERA"; break;
        case FoxhuntState::MINIGAME_KEY_1: doc["state"] = "HACKING CHIAVE 1"; break;
        case FoxhuntState::MINIGAME_KEY_2: doc["state"] = "HACKING CHIAVE 2"; break;
        case FoxhuntState::WAIT_PIN: doc["state"] = "INSERIMENTO PIN"; break;
        case FoxhuntState::WAIT_DUAL_BTN: doc["state"] = "ATTESA INNESCO (5S)"; break;
        case FoxhuntState::ARMED_COUNTDOWN: doc["state"] = "DETONAZIONE IN CORSO"; break;
        case FoxhuntState::EXPLODED: doc["state"] = "BOMBA ESPLOSA"; break;
        default: doc["state"] = "INIT"; break;
    }
    
    _network->sendEvent("FH_UPDATE", doc);
}