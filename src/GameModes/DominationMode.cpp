// src/GameModes/DominationMode.cpp

#include "DominationMode.h"

// Costruttore
DominationMode::DominationMode(HardwareManager* hardware, NetworkManager* network, DominationSettings* settings, AppState* appState, MainMenuDisplayFunction displayFunc)
    : _hardware(hardware),
      _network(network),
      _settings(settings),
      _appStatePtr(appState),
      _mainMenuDisplayFunc(displayFunc),
      _currentState(ModeState::MODE_SUB_MENU),
      _lastZoneState(ModeState::IN_GAME_NEUTRAL),
      _subMenuIndex(0),
      _menuIndex(0) {
}

void DominationMode::enter() {
    Serial.println("Entrato in modalita' Dominio");
    _currentState = ModeState::MODE_SUB_MENU;
    _subMenuIndex = 0;
    displaySubMenu();
    _hardware->setStripColor(0, 255, 255);
    _network->sendStatus("event:mode_enter;mode:domination;");
    sendSettingsStatus();
}

/**
 * @brief Funzione di ingresso diretto in partita, saltando menu e countdown.
 * @details Chiamata dalla Modalità Terminale, avvia direttamente la partita.
 */
void DominationMode::enterInGame() {
    Serial.println("Entrato in modalita' Dominio (remoto)");
    
    // Salta direttamente allo stato di gioco attivo
    _currentState = ModeState::IN_GAME_NEUTRAL;
    _lastZoneState = ModeState::IN_GAME_NEUTRAL;
    _gameStartTime = _hardware->getRTCTime();
    _lastGameSecond = -1;
    _team1PossessionTime = 0;
    _team2PossessionTime = 0;

    // Esegui effetti visivi e sonori di inizio partita
    _hardware->playTone(1500, 500);
    _hardware->setBrightness(255);
    _hardware->turnOffStrip();
    delay(100);
    _hardware->setStripColor(255, 255, 255);
    delay(500);
    _hardware->turnOffStrip();
    _hardware->setBrightness(80);

    // Disegna la schermata di gioco iniziale
    _hardware->clearLcd();
    _hardware->printLcd(4, 1, "ZONA NEUTRA");
    _hardware->printOled1("CONQUISTA", 2, 8, 25);
    _hardware->printOled2("CONQUISTA", 2, 8, 25);

    // Invia il messaggio di inizio partita
    char message[50];
    sprintf(message, "event:game_start;mode:domination;duration:%d", _settings->getGameDuration());
    _network->sendStatus(message);
}

void DominationMode::loop() {
    char key = _hardware->getKey();
    bool btn1_is_pressed = _hardware->isButton1Pressed();
    bool btn1_was_pressed = _hardware->wasButton1Pressed();
    bool btn2_is_pressed = _hardware->isButton2Pressed();
    bool btn2_was_pressed = _hardware->wasButton2Pressed();

    switch (_currentState) {
        case ModeState::MODE_SUB_MENU:
            handleSubMenuInput(key, btn1_was_pressed, btn2_was_pressed);
            break;
        case ModeState::MENU_SETTINGS:
            handleSettingsInput(key, btn1_was_pressed, btn2_was_pressed);
            break;
        case ModeState::EDIT_DURATION:
        case ModeState::EDIT_CAPTURE_TIME:
        case ModeState::EDIT_COUNTDOWN:
            handleEditInput(key, btn1_was_pressed, btn2_was_pressed);
            break;
        case ModeState::IN_GAME_CONFIRM:
            handleConfirmInput(btn1_was_pressed, btn2_was_pressed);
            break;
        case ModeState::IN_GAME_COUNTDOWN:
            handleCountdown();
            break;
        case ModeState::IN_GAME_NEUTRAL:
            handleNeutralState(btn1_is_pressed, btn2_is_pressed);
            break;
        case ModeState::CAPTURING_TEAM1:
        case ModeState::CAPTURING_TEAM2:
            handleCapturingState(btn1_is_pressed, btn2_is_pressed);
            break;
        case ModeState::TEAM1_CAPTURED:
            handleCapturedState(1, btn1_is_pressed, btn2_is_pressed);
            break;
        case ModeState::TEAM2_CAPTURED:
            handleCapturedState(2, btn1_is_pressed, btn2_is_pressed);
            break;
        case ModeState::GAME_OVER:
            handleGameOverState(btn1_was_pressed, btn2_was_pressed, key);
            break;
    }
}

void DominationMode::exit() {
    Serial.println("Uscito da modalita' Dominio");
    _network->sendStatus("event:mode_exit;mode:domination;");
    _settings->saveParameters();
    _hardware->turnOffStrip();
    _hardware->clearOled1();
    _hardware->clearOled2();
}

void DominationMode::displaySubMenu() {
    _hardware->clearLcd();
    _hardware->printLcd(0, 0, "DOMINIO");
    String menuItems[] = { "Inizia Partita", "Impostazioni" };
    for (int i = 0; i < 2; i++) {
        String prefix = (i == _subMenuIndex) ? "> " : "  ";
        _hardware->printLcd(0, i + 1, prefix + menuItems[i]);
    }
    _hardware->printOled1("INDIETRO", 2, 10, 25);
    _hardware->printOled2("CONFERMA", 2, 18, 25);
}

void DominationMode::handleSubMenuInput(char key, bool btn1, bool btn2) {
    String menuItems[] = { "Inizia Partita", "Impostazioni" };
    int numItems = 2;

    if (key == '2') {
        _hardware->playTone(800, 50);
        _subMenuIndex = (_subMenuIndex - 1 + numItems) % numItems;
        displaySubMenu();
    } else if (key == '8') {
        _hardware->playTone(600, 50);
        _subMenuIndex = (_subMenuIndex + 1) % numItems;
        displaySubMenu();
    }

    if (btn1) {
        _hardware->playTone(300, 70);
        exit(); 
        *_appStatePtr = APP_STATE_MAIN_MENU;
        _mainMenuDisplayFunc();
        return;
    }

    if (btn2) {
        _hardware->playTone(1200, 100);
        switch (_subMenuIndex) {
            case 0: // Inizia Partita
                _currentState = ModeState::IN_GAME_CONFIRM;
                displayConfirmScreen();
                break;
            case 1: // Impostazioni
                _currentState = ModeState::MENU_SETTINGS;
                _menuIndex = 0;
                displaySettingsMenu();
                break;
        }
    }
}

void DominationMode::displaySettingsMenu() {
    _hardware->clearLcd();
    _hardware->printLcd(0, 0, "IMPOSTAZIONI DOMINIO");
    String menuItems[] = { "Durata Partita", "Tempo Conquista", "Durata Countdown" };
    int numItems = 3;
    for (int i = 0; i < numItems; i++) {
        String prefix = (i == _menuIndex) ? "> " : "  ";
        _hardware->printLcd(0, i + 1, prefix + menuItems[i]);
    }
    _hardware->printOled1("INDIETRO", 2, 10, 25);
    _hardware->printOled2("CONFERMA", 2, 18, 25);
}

void DominationMode::handleSettingsInput(char key, bool btn1, bool btn2) {
    String menuItems[] = { "Durata Partita", "Tempo Conquista", "Durata Countdown" };
    int numItems = 3;

    if (key == '2') {
        _hardware->playTone(800, 50);
        _menuIndex = (_menuIndex - 1 + numItems) % numItems;
        displaySettingsMenu();
    } else if (key == '8') {
        _hardware->playTone(600, 50);
        _menuIndex = (_menuIndex + 1) % numItems;
        displaySettingsMenu();
    }

    if (btn1) {
        _hardware->playTone(300, 70);
        _currentState = ModeState::MODE_SUB_MENU;
        displaySubMenu();
        sendSettingsStatus();
        return;
    }

    if (btn2) {
        _hardware->playTone(1200, 100);
        _currentInputBuffer = "";
        switch (_menuIndex) {
            case 0: _currentState = ModeState::EDIT_DURATION; break;
            case 1: _currentState = ModeState::EDIT_CAPTURE_TIME; break;
            case 2: _currentState = ModeState::EDIT_COUNTDOWN; break;
        }
        updateDisplayForCurrentState();
    }
}

void DominationMode::displayEditScreen(const String& title, const String& currentValue, const String& unit) {
    _hardware->clearLcd();
    _hardware->printLcd(0, 0, title);
    _hardware->printLcd(0, 1, "Attuale: " + currentValue + unit);
    _hardware->printLcd(0, 2, "Nuovo: " + _currentInputBuffer + "_");
    _hardware->printLcd(0, 3, "P1:Annulla | P2:OK");
    _hardware->setStripColor(0, 0, 255);
    _hardware->printOled1("ANNULLA", 2, 22, 25);
    _hardware->printOled2("CONFERMA", 2, 18, 25);
}

void DominationMode::handleEditInput(char key, bool btn1, bool btn2) {
    if (btn1) {
        _hardware->playTone(300, 70);
        _currentState = ModeState::MENU_SETTINGS;
        displaySettingsMenu();
        _hardware->setStripColor(0, 255, 255);
        return;
    }
    
    bool displayNeedsUpdate = false;
    if (isdigit(key)) {
        _hardware->playTone(700, 30);
        _currentInputBuffer += key;
        displayNeedsUpdate = true;
    } else if (key == '*') {
        if (_currentInputBuffer.length() > 0) {
            _currentInputBuffer.remove(_currentInputBuffer.length() - 1);
        }
        displayNeedsUpdate = true;
    }

    if (btn2) {
        _hardware->playTone(1200, 100);
        if (_currentInputBuffer.length() > 0) {
            int value = _currentInputBuffer.toInt();
            if (_currentState == ModeState::EDIT_DURATION) {
                _settings->setGameDuration(value);
            } else if (_currentState == ModeState::EDIT_CAPTURE_TIME) {
                _settings->setCaptureTime(value);
            } else if (_currentState == ModeState::EDIT_COUNTDOWN) {
                _settings->setCountdownDuration(value);
            }
            _currentState = ModeState::MENU_SETTINGS;
            displaySettingsMenu();
            _hardware->setStripColor(0, 255, 255);
        } else {
            _currentState = ModeState::MENU_SETTINGS;
            displaySettingsMenu();
            _hardware->setStripColor(0, 255, 255);
        }
        return;
    }

    if (displayNeedsUpdate) {
        updateDisplayForCurrentState();
    }
}

void DominationMode::updateDisplayForCurrentState() {
    switch (_currentState) {
        case ModeState::EDIT_DURATION:
            displayEditScreen("Durata Partita", String(_settings->getGameDuration()), "min");
            break;
        case ModeState::EDIT_CAPTURE_TIME:
            displayEditScreen("Tempo Conquista", String(_settings->getCaptureTime()), "s");
            break;
        case ModeState::EDIT_COUNTDOWN:
            displayEditScreen("Durata Countdown", String(_settings->getCountdownDuration()), "s");
            break;
        default:
            break;
    }
}

void DominationMode::displayConfirmScreen() {
    _hardware->clearLcd();
    _hardware->printLcd(0, 1, "INIZIARE LA PARTITA?");
    _hardware->printLcd(0, 3, "P1:Annulla | P2:OK");
    _hardware->printOled1("ANNULLA", 2, 22, 25);
    _hardware->printOled2("INIZIA", 2, 28, 25);
}

void DominationMode::handleConfirmInput(bool btn1, bool btn2) {
    if (btn1) {
        _currentState = ModeState::MODE_SUB_MENU;
        displaySubMenu();
    }
    if (btn2) {
        _currentState = ModeState::IN_GAME_COUNTDOWN;
        _countdownStartTime = millis();
        _lastCountdownSecond = -1;

        char message[50];
        sprintf(message, "event:countdown_start;duration:%d;", _settings->getCountdownDuration());
        _network->sendStatus(message);

        _hardware->clearLcd();
        _hardware->printLcd(4, 1, "LA PARTITA");
        _hardware->printLcd(3, 2, "INIZIA TRA...");
        _hardware->setStripColor(255, 255, 255);
        _hardware->clearOled1();
        _hardware->clearOled2();
    }
}

void DominationMode::handleCountdown() {
    unsigned long countdownDuration = _settings->getCountdownDuration() * 1000;
    unsigned long elapsedTime = millis() - _countdownStartTime;
    
    if (elapsedTime >= countdownDuration) {
        _currentState = ModeState::IN_GAME_NEUTRAL;
        _lastZoneState = ModeState::IN_GAME_NEUTRAL;
        _gameStartTime = _hardware->getRTCTime();
        _lastGameSecond = -1;
        _team1PossessionTime = 0;
        _team2PossessionTime = 0;

        _hardware->playTone(1500, 500);
        _hardware->setBrightness(255);
        _hardware->turnOffStrip();
        delay(100);
        _hardware->setStripColor(255, 255, 255);
        delay(500);
        _hardware->turnOffStrip();
        _hardware->setBrightness(80);

        _hardware->clearLcd();
        _hardware->printLcd(4, 1, "ZONA NEUTRA");
        _hardware->printOled1("CONQUISTA", 2, 8, 25);
        _hardware->printOled2("CONQUISTA", 2, 8, 25);

        char message[50];
        sprintf(message, "event:game_start;mode:domination;duration:%d", _settings->getGameDuration());
        _network->sendStatus(message);

        return;
    }

    int remainingSeconds = (_settings->getCountdownDuration()) - (elapsedTime / 1000);
    if (remainingSeconds != _lastCountdownSecond) {
        String secStr = String(remainingSeconds);
        if(remainingSeconds < 10) {
            secStr = "0" + secStr;
        }
        _hardware->printLcd(9, 3, secStr);

        char message[50];
        sprintf(message, "event:countdown_update;time:%d;", remainingSeconds);
        _network->sendStatus(message);
        
        if (remainingSeconds > 3) {
            _hardware->playTone(800, 100);
        } else if (remainingSeconds > 0) {
            _hardware->playTone(1200, 150);
        }
        _lastCountdownSecond = remainingSeconds;
    }
}

void DominationMode::updateGameTimerOnRow(int row) {
    long totalSeconds = _settings->getGameDuration() * 60;
    TimeSpan elapsed = _hardware->getRTCTime() - _gameStartTime;
    long remainingSeconds = totalSeconds - elapsed.totalseconds();

    if (remainingSeconds < 0) {
        remainingSeconds = 0;
    }

    if (remainingSeconds == 0 && _currentState != ModeState::GAME_OVER) {
        _currentState = ModeState::GAME_OVER;
        _hardware->playTone(400, 1000);

        if (_team1PossessionTime > _team2PossessionTime) _winner = 1;
        else if (_team2PossessionTime > _team1PossessionTime) _winner = 2;
        else _winner = 0;

        char message[50];
        sprintf(message, "event:game_end;winner:%d", _winner);
        _network->sendStatus(message);

        _hardware->clearLcd();
        if (_winner == 1) _hardware->printLcd(2, 1, "VINCE SQUADRA 1!");
        else if (_winner == 2) _hardware->printLcd(2, 1, "VINCE SQUADRA 2!");
        else _hardware->printLcd(6, 1, "PAREGGIO!");
        
        char scoreBuffer[20];
        sprintf(scoreBuffer, "S1: %02lu:%02lu", (_team1PossessionTime / 1000) / 60, (_team1PossessionTime / 1000) % 60);
        _hardware->printLcd(6, 2, scoreBuffer);
        sprintf(scoreBuffer, "S2: %02lu:%02lu", (_team2PossessionTime / 1000) / 60, (_team2PossessionTime / 1000) % 60);
        _hardware->printLcd(6, 3, scoreBuffer);

        _hardware->printOled1("ESCI", 2, 35, 25);
        _hardware->printOled2("ESCI", 2, 35, 25);
        return;
    }

    if (remainingSeconds != _lastGameSecond) {
        int minutes = remainingSeconds / 60;
        int seconds = remainingSeconds % 60;
        char timeBuffer[10];
        sprintf(timeBuffer, "%02d : %02d", minutes, seconds);
        _hardware->printLcd(6, row, timeBuffer);

        char message[50];
        sprintf(message, "event:time_update;time:%ld", remainingSeconds);
        _network->sendStatus(message);

        if (remainingSeconds > 0 && remainingSeconds < totalSeconds && remainingSeconds % 60 == 0) {
            _hardware->playTone(1500, 150);
            _hardware->flashCurrentColor(2, 100);
        } else if (remainingSeconds == 60) {
            _hardware->playTone(1600, 80); delay(100); _hardware->playTone(1600, 80);
        } else if (remainingSeconds <= 10 && remainingSeconds > 3) {
            _hardware->playTone(800, 100);
            _hardware->flashCurrentColor(1, 100);
        } else if (remainingSeconds <= 3 && remainingSeconds > 0) {
            _hardware->playTone(1200, 150);
            _hardware->flashCurrentColor(1, 100);
        }
        
        _lastGameSecond = remainingSeconds;
    }
}

void DominationMode::handleNeutralState(bool btn1_is_pressed, bool btn2_is_pressed) {
    updateGameTimerOnRow(2);
    _hardware->updateBreathingEffect(255, 255, 255);
    
    if (btn1_is_pressed) {
        _currentState = ModeState::CAPTURING_TEAM1;
        _captureStartTime = millis();
        _captureSoundLastUpdate = 0;
        displayCapturingScreen(1);
        _network->sendStatus("event:capture_start;team:1;");
    }
    if (btn2_is_pressed) {
        _currentState = ModeState::CAPTURING_TEAM2;
        _captureStartTime = millis();
        _captureSoundLastUpdate = 0;
        displayCapturingScreen(2);
        _network->sendStatus("event:capture_start;team:2;");
    }
}

void DominationMode::displayCapturingScreen(int team) {
    _hardware->clearLcd();
    _hardware->printLcd(5, 1, "CONQUISTA!");
    if (team == 1) {
        _hardware->printOled1("CONQUISTA", 2, 8, 25);
        _hardware->clearOled2();
    } else {
        _hardware->clearOled1();
        _hardware->printOled2("CONQUISTA", 2, 8, 25);
    }
}

void DominationMode::handleCapturingState(bool btn1_is_pressed, bool btn2_is_pressed) {
    updateGameTimerOnRow(3);

    int teamCapturing = (_currentState == ModeState::CAPTURING_TEAM1) ? 1 : 2;
    bool isStillPressed = (teamCapturing == 1) ? btn1_is_pressed : btn2_is_pressed;

    if (!isStillPressed) {
        
        char message[50];
        sprintf(message, "event:capture_cancel;team:%d;", teamCapturing);
        _network->sendStatus(message);

        _currentState = _lastZoneState;
        if (_lastZoneState == ModeState::IN_GAME_NEUTRAL) {
            _hardware->clearLcd();
            _hardware->printLcd(4, 1, "ZONA NEUTRA");
            _hardware->printOled1("CONQUISTA", 2, 8, 25);
            _hardware->printOled2("CONQUISTA", 2, 8, 25);
        } else if (_lastZoneState == ModeState::TEAM1_CAPTURED) {
            _hardware->clearLcd();
            _hardware->printLcd(5, 1, "ZONA ROSSA");
            _hardware->clearOled1();
            _hardware->printOled2("CONQUISTA", 2, 8, 25);
        } else {
            _hardware->clearLcd();
            _hardware->printLcd(5, 1, "ZONA VERDE");
            _hardware->printOled1("CONQUISTA", 2, 8, 25);
            _hardware->clearOled2();
        }
        _hardware->noTone();
        return;
    }

    unsigned long captureDuration = _settings->getCaptureTime() * 1000;
    unsigned long elapsedTime = millis() - _captureStartTime;

    if (elapsedTime >= captureDuration) {
        _hardware->noTone();
        _hardware->playTone(1500, 80);
        delay(100);
        _hardware->playTone(1500, 80);

        char message[50];
        sprintf(message, "event:zone_captured;team:%d;", teamCapturing);
        _network->sendStatus(message);

        _lastPossessionUpdateTime = millis();
        if (teamCapturing == 1) {
            _currentState = ModeState::TEAM1_CAPTURED;
            _lastZoneState = ModeState::TEAM1_CAPTURED;
            _hardware->clearLcd();
            _hardware->printLcd(5, 1, "ZONA ROSSA");
            _hardware->clearOled1();
            _hardware->printOled2("CONQUISTA", 2, 8, 25);
        } else {
            _currentState = ModeState::TEAM2_CAPTURED;
            _lastZoneState = ModeState::TEAM2_CAPTURED;
            _hardware->clearLcd();
            _hardware->printLcd(5, 1, "ZONA VERDE");
            _hardware->printOled1("CONQUISTA", 2, 8, 25);
            _hardware->clearOled2();
        }
        return;
    }

    int barWidthChars = 16;
    int totalPixels = barWidthChars * 5;
    int progressPixels = map(elapsedTime, 0, captureDuration, 0, totalPixels);
    int fullChars = progressPixels / 5;
    int partialPixels = progressPixels % 5;

    _hardware->printLcd(2, 2, "");
    for (int i = 0; i < fullChars; i++) _hardware->writeCustomChar(4);
    if (partialPixels > 0 && fullChars < barWidthChars) _hardware->writeCustomChar(partialPixels - 1);
    for (int i = fullChars + (partialPixels > 0 ? 1 : 0); i < barWidthChars; i++) _hardware->printLcd(i + 2, 2, " ");

    uint8_t r = (teamCapturing == 1) ? 255 : 0;
    uint8_t g = (teamCapturing == 2) ? 255 : 0;
    int ledsToShow = map(elapsedTime, 0, captureDuration, 0, _hardware->getStripLedCount());
    
    for(int i=0; i < _hardware->getStripLedCount(); i++){
        if (i < ledsToShow) {
            _hardware->setPixelColor(i, r, g, 0);
        } else {
            if (_lastZoneState == ModeState::TEAM1_CAPTURED) {
                _hardware->setPixelColor(i, 255, 0, 0);
            } else if (_lastZoneState == ModeState::TEAM2_CAPTURED) {
                _hardware->setPixelColor(i, 0, 255, 0);
            } else { // IN_GAME_NEUTRAL
                _hardware->setPixelColor(i, 255, 255, 255);
            }
        }
    }
    _hardware->showStrip();

    if (millis() - _captureSoundLastUpdate > 50) {
        _captureSoundLastUpdate = millis();
        int frequency = map(elapsedTime, 0, captureDuration, 400, 1200);
        _hardware->updateTone(frequency);
    }
}

void DominationMode::handleCapturedState(int team, bool btn1_is_pressed, bool btn2_is_pressed) {
    updateGameTimerOnRow(2);
    
    uint8_t r = (team == 1) ? 255 : 0;
    uint8_t g = (team == 2) ? 255 : 0;
    _hardware->updateBreathingEffect(r, g, 0);

    unsigned long now = millis();
    if (team == 1) {
        _team1PossessionTime += now - _lastPossessionUpdateTime;
    } else {
        _team2PossessionTime += now - _lastPossessionUpdateTime;
    }
    _lastPossessionUpdateTime = now;

    char message[50];
    sprintf(message, "event:score_update;team1_score:%lu;team2_score:%lu;", _team1PossessionTime, _team2PossessionTime);
    _network->sendStatus(message);

    bool enemyButtonPressed = (team == 1) ? btn2_is_pressed : btn1_is_pressed;
    if (enemyButtonPressed) {
        _currentState = (team == 1) ? ModeState::CAPTURING_TEAM2 : ModeState::CAPTURING_TEAM1;
        _captureStartTime = millis();
        _captureSoundLastUpdate = 0;
        displayCapturingScreen((team == 1) ? 2 : 1);

        char startMsg[50];
        sprintf(startMsg, "event:capture_start;team:%d;", (team == 1) ? 2 : 1);
        _network->sendStatus(startMsg);

        return;
    }
}

void DominationMode::handleGameOverState(bool btn1_was_pressed, bool btn2_was_pressed, char key) {
    uint8_t r = 0, g = 0, b = 0;
    if (_winner == 1) { r = 255; }
    else if (_winner == 2) { g = 255; }
    else { r = 255; g = 255; b = 255; }
    _hardware->updateWinnerWaveEffect(r, g, b, 0.1, 1, 10);

    if (btn1_was_pressed || btn2_was_pressed || key != NO_KEY) {
        exit();
        *_appStatePtr = APP_STATE_MAIN_MENU;
        _mainMenuDisplayFunc();
    }
}

void DominationMode::sendSettingsStatus() {
    char message[100];
    sprintf(message, "event:settings_update;duration:%d;capture:%d;countdown:%d;",
            _settings->getGameDuration(),
            _settings->getCaptureTime(),
            _settings->getCountdownDuration());
    _network->sendStatus(message);
}