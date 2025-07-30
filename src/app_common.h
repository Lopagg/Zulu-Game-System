// src/app_common.h

#ifndef APP_COMMON_H
#define APP_COMMON_H

#define FIRMWARE_VERSION "0.2.1"

// Definizione degli stati dell'applicazione (ENUM)
enum AppState {
  APP_STATE_WELCOME,
  APP_STATE_MAIN_MENU,
  APP_STATE_TEST_HARDWARE,
  APP_STATE_SEARCH_DESTROY_MODE,
  APP_STATE_DOMINATION_MODE,
  APP_STATE_MUSIC_ROOM
};

// Tipo per la funzione displayMainMenu()
typedef void (*MainMenuDisplayFunction)();

#endif // APP_COMMON_H