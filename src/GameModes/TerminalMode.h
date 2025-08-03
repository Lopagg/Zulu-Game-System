// src/GameModes/TerminalMode.h

#ifndef TERMINAL_MODE_H
#define TERMINAL_MODE_H

#include "GameMode.h"
#include "HardwareManager.h"
#include "NetworkManager.h"
#include "app_common.h"

class TerminalMode : public GameMode {
public:
    TerminalMode(HardwareManager* hardware, NetworkManager* network, AppState* appState, MainMenuDisplayFunction displayFunc);

    void enter() override;
    void loop() override;
    void exit() override;

private:
    HardwareManager* _hardware;
    NetworkManager* _network;
    AppState* _appStatePtr;
    MainMenuDisplayFunction _mainMenuDisplayFunc;
};

#endif // TERMINAL_MODE_H