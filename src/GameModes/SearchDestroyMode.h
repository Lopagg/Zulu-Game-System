// src/GameModes/SearchDestroyMode.h

#ifndef SEARCH_DESTROY_MODE_H
#define SEARCH_DESTROY_MODE_H

#include "GameMode.h"
#include "HardwareManager.h"
#include "NetworkManager.h"
#include "SearchDestroySettings.h"
#include "app_common.h"

class SearchDestroyMode : public GameMode {
public:
    SearchDestroyMode(HardwareManager* hardware, NetworkManager* network, SearchDestroySettings* settings, AppState* appState, MainMenuDisplayFunction displayFunc);

    void enter() override;
    void loop() override;
    void exit() override;

private:
    HardwareManager* _hardware;
    NetworkManager* _network;
    SearchDestroySettings* _settings;
    
    AppState* _appStatePtr;
    MainMenuDisplayFunction _mainMenuDisplayFunc;

    enum class ModeState {
        MODE_SUB_MENU,
        MENU_SETTINGS,
        EDIT_BOMB_TIME,
        EDIT_ARM_PIN,
        EDIT_DISARM_PIN,
        EDIT_ARM_TIME,
        EDIT_DEFUSE_TIME,
        EDIT_USE_ARM_PIN,
        EDIT_USE_DISARM_PIN,
        
        IN_GAME_CONFIRM,
        IN_GAME_AWAIT_ARM,
        IN_GAME_IS_ARMING,
        IN_GAME_ENTER_ARM_PIN,
        IN_GAME_ARMED,
        IN_GAME_COUNTDOWN,
        IN_GAME_IS_DEFUSING,
        IN_GAME_ENTER_DEFUSE_PIN,
        IN_GAME_DEFUSED,
        IN_GAME_ENDED
    };
    ModeState _currentState;

    String _currentInputBuffer;
    int _menuIndex;
    int _subMenuIndex;
    bool _tempBoolSelection;
    
    unsigned long _armingStartTime;
    unsigned long _armingSoundLastUpdate;
    unsigned long _defusingStartTime;
    
    DateTime _roundStartTime;
    unsigned long _stateChangeTime;
    int _lastDisplayedSeconds;

    bool _gameIsActive;

    // Funzioni di visualizzazione
    void displaySubMenu();
    void displaySettingsMenu();
    void displayEditScreen(const String& title, const String& currentValue, const String& unit);
    void displayBooleanEditScreen(const String& title, bool currentSelection);
    void displayConfirmScreen();
    void displayAwaitArmScreen();
    void displayArmingScreen(unsigned long progress);
    void displayEnterPinScreen(const String& title);
    void displayCountdownLayout();
    void updateCountdownDisplay(long remainingSeconds);
    void displayDefusingScreen(unsigned long progress);

    // Funzioni di gestione input
    void handleSubMenuInput(char key, bool btn1, bool btn2);
    void handleSettingsInput(char key, bool btn1, bool btn2);
    void handleEditInput(char key, bool btn1, bool btn2);
    void handleBooleanEditInput(char key, bool btn1, bool btn2);
    
    void handleInGame(char key, bool btn1_is_pressed, bool btn1_was_pressed, bool btn2_is_pressed, bool btn2_was_pressed);
    void handleArmedState();
    void handleCountdownState(char key, bool btn1_was_pressed, bool btn2_is_pressed, bool btn2_was_pressed);
    void handleIsDefusingInput(bool btn2_is_pressed);
    void handleEnterDefusePinInput(char key, bool btn1_was_pressed, bool btn2_was_pressed);
    
    void updateDisplayForCurrentState();

    void sendSettingsStatus();
};

#endif // SEARCH_DESTROY_MODE_H