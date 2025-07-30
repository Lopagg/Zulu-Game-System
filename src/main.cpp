// src/main.cpp

#include <Arduino.h>
#include <SPI.h> 
#include "nvs_flash.h"

#include "app_common.h"
#include "HardwareManager.h"
#include "NetworkManager.h"
#include "melodies.h"
#include "GameModes/MusicRoomMode.h"
#include "GameMode.h" 
#include "GameModes/SearchDestroyMode.h"
#include "GameModes/SearchDestroySettings.h"
#include "GameModes/DominationMode.h"
#include "GameModes/DominationSettings.h"

// --- Istanze Globali ---
HardwareManager hardware;
NetworkManager networkManager;
SearchDestroySettings* sdSettings = nullptr;
SearchDestroyMode* sdMode = nullptr;
DominationSettings* domSettings = nullptr;
DominationMode* domMode = nullptr;
MusicRoomMode* musicRoomMode = nullptr;

// --- Dichiarazioni Anticipate ---
void displayMainMenu();
AppState currentAppState = APP_STATE_WELCOME;

// --- Stato e Menu Globale ---
int mainMenuIndex = 0;
// *** AGGIUNTA OPZIONE AL MENU ***
String mainMenuOptions[] = { "Cerca & Distruggi", "Dominio", "Stanza dei Suoni", "Test Hardware" };
int numMainMenuOptions = sizeof(mainMenuOptions) / sizeof(mainMenuOptions[0]);

// --- Dichiarazioni Funzioni di Stato ---
void handleWelcomeState();
void handleMainMenuState();
void handleTestHardwareState();

// --- SETUP ---

void setup() {
    Serial.begin(115200);

    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
      ESP_ERROR_CHECK(nvs_flash_erase());
      ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);
    Serial.println("NVS Inizializzato.");

    sdSettings = new SearchDestroySettings();
    sdMode = new SearchDestroyMode(&hardware, &networkManager, sdSettings, &currentAppState, displayMainMenu);

    domSettings = new DominationSettings();
    domMode = new DominationMode(&hardware, &networkManager, domSettings, &currentAppState, displayMainMenu);

    musicRoomMode = new MusicRoomMode(&hardware, &currentAppState, displayMainMenu);

    hardware.initialize();
    networkManager.initialize();
    Serial.println("Avvio del sistema completato.");

    char startupMessage[100];
    sprintf(startupMessage, "event:device_online;status:ready;version:%s;", FIRMWARE_VERSION);
    networkManager.sendStatus(startupMessage);

}

// --- LOOP ---

void loop() {
    hardware.updateButtons();
    hardware.updateMidiTune();
    networkManager.update();

    if (currentAppState == APP_STATE_WELCOME || currentAppState == APP_STATE_MAIN_MENU) {
        hardware.updateRainbowEffect();
    }

    switch (currentAppState) {
        case APP_STATE_WELCOME:
            handleWelcomeState();
            break;
        case APP_STATE_MAIN_MENU:
            handleMainMenuState();
            break;
        case APP_STATE_SEARCH_DESTROY_MODE:
            sdMode->loop();
            break;
        case APP_STATE_DOMINATION_MODE:
            domMode->loop();
            break;
        case APP_STATE_MUSIC_ROOM:
            musicRoomMode->loop();
            break;
        case APP_STATE_TEST_HARDWARE:
            handleTestHardwareState();
            break;
    }
}

// --- Implementazione Funzioni di Gestione Stati ---

void handleWelcomeState() {
    static bool firstEntry = true;
    static unsigned long welcomeStartTime = 0;

    if (firstEntry) {
        Serial.println("STATO: Entrato in Welcome Screen");
        firstEntry = false;
        welcomeStartTime = millis();
        hardware.clearLcd();
        hardware.printLcd(2, 1, "ZULU GAME SYSTEM");
        String versionString = "Alpha ver. ";
        versionString += FIRMWARE_VERSION;
        hardware.printLcd(2, 2, versionString);
        
        DateTime now = hardware.getRTCTime();
        char buffer[20];
        sprintf(buffer, "%02d/%02d/%02d %02d:%02d:%02d", 
                now.day(), now.month(), now.year() % 100,
                now.hour(), now.minute(), now.second());
        hardware.printLcd(1, 3, buffer);
    }
    
    if (millis() - welcomeStartTime > 3000) {
        firstEntry = true;
        currentAppState = APP_STATE_MAIN_MENU;
        displayMainMenu();
        networkManager.sendStatus("event:status_update;current_screen:main_menu;");
    }
}

void displayMainMenu() {
    Serial.println("DISPLAY: Menu Principale");
    hardware.clearLcd();
    hardware.printLcd(0, 0, "MENU PRINCIPALE");
    
    int maxRows = hardware.getLcdRows() - 1;
    int startIdx = 0;
    if (mainMenuIndex >= maxRows) {
        startIdx = mainMenuIndex - maxRows + 1;
    }

    for (int i = 0; i < maxRows; i++) {
        int currentItemIndex = startIdx + i;
        if (currentItemIndex < numMainMenuOptions) {
            String prefix = (currentItemIndex == mainMenuIndex) ? "> " : "  ";
            hardware.printLcd(0, i + 1, prefix + mainMenuOptions[currentItemIndex]);
        }
    }

    hardware.printLcd(19, 1, " "); 
    hardware.printLcd(19, 3, " ");
    if (startIdx > 0) {
        hardware.printLcd(19, 1, "^");
    }
    if (startIdx + maxRows < numMainMenuOptions) {
        hardware.printLcd(19, 3, "v");
    }
    
    hardware.clearOled1();
    hardware.printOled2("CONFERMA", 2, 18, 25);
}

void handleMainMenuState() {
    char key = hardware.getKey();
    bool btn1_pressed = hardware.wasButton1Pressed();
    bool btn2_pressed = hardware.wasButton2Pressed();

    if (key == '2') {
        Serial.println("INPUT: Tasto SU (2) premuto");
        hardware.playTone(800, 50);
        mainMenuIndex = (mainMenuIndex - 1 + numMainMenuOptions) % numMainMenuOptions;
        displayMainMenu();
    } else if (key == '8') {
        Serial.println("INPUT: Tasto GIU (8) premuto");
        hardware.playTone(600, 50);
        mainMenuIndex = (mainMenuIndex + 1) % numMainMenuOptions;
        displayMainMenu();
    }
    
    if (btn1_pressed) {
        Serial.println("INPUT: Pulsante 1 (Indietro) premuto");
        hardware.playTone(300, 70);
    }

    if (btn2_pressed) {
        Serial.println("INPUT: Pulsante 2 (Conferma) premuto");
        hardware.playTone(1200, 100);
        switch (mainMenuIndex) {
            case 0:
                Serial.println("TRANSIZIONE: Main Menu -> Cerca & Distruggi");
                currentAppState = APP_STATE_SEARCH_DESTROY_MODE;
                sdMode->enter();
                break;
            case 1:
                Serial.println("TRANSIZIONE: Main Menu -> Dominio");
                currentAppState = APP_STATE_DOMINATION_MODE;
                domMode->enter();
                break;
            case 2:
                Serial.println("TRANSIZIONE: Main Menu -> Stanza dei Suoni");
                currentAppState = APP_STATE_MUSIC_ROOM;
                musicRoomMode->enter();
                break;
            case 3:
                Serial.println("TRANSIZIONE: Main Menu -> Test Hardware");
                networkManager.sendStatus("event:mode_enter;mode:testhw;");
                currentAppState = APP_STATE_TEST_HARDWARE;
                hardware.clearLcd();
                hardware.printLcd(0, 0, "Test Hardware");
                hardware.printLcd(0, 1, "Pulsante 1");
                hardware.printLcd(0, 2, "per uscire");
                hardware.setStripColor(255, 255, 255);
                hardware.printOled1("INDIETRO", 2, 10, 25);
                hardware.printOled2("TEST", 2, 35, 25);
                break;
        }
    }
}

void handleTestHardwareState() {
    static bool firstEntry = true;
    if(firstEntry){
        Serial.println("STATO: Entrato in Test Hardware");
        firstEntry = false;
    }

    char key = hardware.getKey();
    bool btn1_pressed = hardware.wasButton1Pressed();
    bool btn2_pressed = hardware.wasButton2Pressed();

    if (key != NO_KEY) {
        Serial.print("INPUT: Tasto Tastierino '");
        Serial.print(key);
        Serial.println("' premuto");
        hardware.playTone(700, 40);
        hardware.clearLcd();
        hardware.printLcd(0, 0, "Test Hardware");
        hardware.printLcd(0, 1, "Tasto premuto:");
        hardware.printLcd(8, 2, String(key));
        
        if (key == '1') hardware.setStripColor(255, 0, 0);
        if (key == '2') hardware.setStripColor(0, 255, 0);
        if (key == '3') hardware.setStripColor(0, 0, 255);
    }

    if (btn2_pressed) {
        Serial.println("INPUT: Pulsante 2 (Conferma) premuto");
        hardware.playTone(1200, 100);
        hardware.clearLcd();
        hardware.printLcd(0, 0, "Test Hardware");
        hardware.printLcd(0, 1, "Pulsante 2 OK!");
    }

    if (btn1_pressed) {
        Serial.println("INPUT: Pulsante 1 (Indietro) premuto");
        hardware.playTone(300, 70);
        hardware.turnOffStrip();
        networkManager.sendStatus("event:mode_exit;mode:testhw;");
        Serial.println("TRANSIZIONE: Test Hardware -> Main Menu");
        currentAppState = APP_STATE_MAIN_MENU;
        firstEntry = true;
        displayMainMenu();
    }
}