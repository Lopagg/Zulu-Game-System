// src/GameModes/TerminalMode.h

#ifndef TERMINAL_MODE_H
#define TERMINAL_MODE_H

#include "GameMode.h"
#include "HardwareManager.h"
#include "NetworkManager.h"
#include "app_common.h"
#include "GameModes/DominationSettings.h"
#include "GameModes/DominationMode.h"
#include "GameModes/SearchDestroySettings.h"
#include "GameModes/SearchDestroyMode.h"

class TerminalMode : public GameMode {
public:
    TerminalMode(HardwareManager* hardware, NetworkManager* network, AppState* appState, MainMenuDisplayFunction displayFunc, 
                 DominationSettings* domSettings, DominationMode* domMode,
                 SearchDestroySettings* sdSettings, SearchDestroyMode* sdMode);

    void enter() override;
    void loop() override;
    void exit() override;

private:
    HardwareManager* _hardware;
    NetworkManager* _network;
    AppState* _appStatePtr;
    MainMenuDisplayFunction _mainMenuDisplayFunc;
    DominationSettings* _domSettings;
    DominationMode* _domMode;
    SearchDestroySettings* _sdSettings;
    SearchDestroyMode* _sdMode;

    void parseCommand(String command);
};

#endif // TERMINAL_MODE_H