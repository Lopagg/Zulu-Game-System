// src/main.cpp

/**
 * @file main.cpp
 * @brief File di ingresso principale del firmware.
 * @details Questo file contiene le funzioni setup() e loop() che sono il cuore
 * di ogni programma Arduino. Gestisce l'inizializzazione di tutti i sistemi,
 * la creazione degli oggetti per le modalità di gioco e la macchina a stati
 * principale che controlla quale modalità è attualmente in esecuzione.
 */

#include <Arduino.h>
#include <SPI.h> 
#include "nvs_flash.h"

// Inclusione di tutti i file di intestazione necessari
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
#include "GameModes/TerminalMode.h"

/** --- Istanze Globali --- 
 * Vengono creati gli oggetti principali che verranno usati in tutto il programma.
 * 'hardware' e 'networkManager' sono oggetti concreti.
 * Le modalità di gioco e le loro impostazioni sono puntatori, verranno creati
 * dinamicamente nella funzione setup().
*/
HardwareManager hardware;
NetworkManager networkManager;
SearchDestroySettings* sdSettings = nullptr;
SearchDestroyMode* sdMode = nullptr;
DominationSettings* domSettings = nullptr;
DominationMode* domMode = nullptr;
MusicRoomMode* musicRoomMode = nullptr;
TerminalMode* terminalMode = nullptr;

/** --- Dichiarazioni Anticipate ---
 * Prototipo di funzione per displayMainMenu(). Permette di usare la funzione
 * prima della sua effettiva implementazione nel file, risolvendo l'ordine di lettura del compilatore.
 */
void displayMainMenu();

/** Variabile di stato globale che tiene traccia della modalità corrente.
 * All'avvio, viene impostata sulla schermata di benvenuto.
*/
AppState currentAppState = APP_STATE_WELCOME;

// --- Stato e Menu Globale ---
// Variabili per la gestione del menu principale.
int mainMenuIndex = 0;
String mainMenuOptions[] = { "Cerca & Distruggi", "Dominio", "Stanza dei Suoni", "Mod. Terminale", "Test Hardware" };
int numMainMenuOptions = sizeof(mainMenuOptions) / sizeof(mainMenuOptions[0]);

// --- Variabili per il sottomenu di Test Hardware ---
enum TestHardwareSubState {
    TEST_MAIN,
    TEST_KEYS
};
TestHardwareSubState currentTestSubState = TEST_MAIN;

// --- Dichiarazioni Funzioni di Stato ---
// Prototipi per le funzioni che gestiscono gli stati non legati a una classe specifica.
void displayMainMenu();
void handleWelcomeState();
void handleMainMenuState();
void handleTestHardwareState();
void displayTestHardwareMainMenu();
void displayKeyTestMenu();

// --- SETUP ---
/**
 * @brief Funzione di setup, eseguita una sola volta all'avvio del dispositivo.
 * @details Inizializza la comunicazione seriale, la memoria NVS per le impostazioni,
 * crea gli oggetti per le modalità di gioco e inizializza l'hardware e la rete.
 */
void setup() {
    Serial.begin(115200);

    // Inizializzazione della NVS (Non-Volatile Storage), necessaria per la libreria Preferences.
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
      ESP_ERROR_CHECK(nvs_flash_erase());
      ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);
    Serial.println("NVS Inizializzato.");

    // Creazione dinamica degli oggetti per le impostazioni e le modalità di gioco.
    // Viene passato un puntatore (&) all'hardware, alla rete e allo stato globale,
    // in modo che tutte le modalità possano interagire con gli stessi componenti.
    sdSettings = new SearchDestroySettings();
    sdMode = new SearchDestroyMode(&hardware, &networkManager, sdSettings, &currentAppState, displayMainMenu);

    domSettings = new DominationSettings();
    domMode = new DominationMode(&hardware, &networkManager, domSettings, &currentAppState, displayMainMenu);

    musicRoomMode = new MusicRoomMode(&hardware, &currentAppState, displayMainMenu);

    terminalMode = new TerminalMode(&hardware, &networkManager, &currentAppState, displayMainMenu, domSettings, domMode, sdSettings, sdMode);

    // Inizializzazione dei componenti fisici e della connessione di rete.
    hardware.initialize();
    networkManager.initialize(&hardware); 
    Serial.println("Avvio del sistema completato.");

    // Invia un messaggio di avvio sulla rete.
    char startupMessage[100];
    sprintf(startupMessage, "event:device_online;status:ready;version:%s;", FIRMWARE_VERSION);
    networkManager.sendStatus(startupMessage);

}

// --- LOOP ---

/**
 * @brief Funzione di loop, eseguita continuamente dopo il setup().
 * @details È il cuore del programma. Ad ogni ciclo, aggiorna i componenti di input,
 * le animazioni e la rete. Utilizza una macchina a stati (switch-case) basata su
 * 'currentAppState' per delegare il controllo alla funzione o all'oggetto corretto.
 */
void loop() {
    hardware.updateButtons();
    hardware.updateMidiTune();
    networkManager.update();

    // Esegue l'animazione arcobaleno solo quando si è nei menu.
    if (currentAppState == APP_STATE_WELCOME || currentAppState == APP_STATE_MAIN_MENU) {
        hardware.updateRainbowEffect();
    }

    // Macchina a stati principale.
    switch (currentAppState) {
        case APP_STATE_WELCOME:
            handleWelcomeState();
            break;
        case APP_STATE_MAIN_MENU:
            handleMainMenuState();
            break;
        case APP_STATE_SEARCH_DESTROY_MODE:
            sdMode->loop(); // Delega il controllo alla modalità C&D
            break;
        case APP_STATE_DOMINATION_MODE:
            domMode->loop();    // Delega il controllo alla modalità Dominio
            break;
        case APP_STATE_MUSIC_ROOM:
            musicRoomMode->loop();  // Delega il controllo alla Stanza dei Suoni
            break;
        case APP_STATE_TERMINAL_MODE:
            terminalMode->loop();   // Delega il controllo alla Modalità Terminale
            break;
        case APP_STATE_TEST_HARDWARE:
            handleTestHardwareState();
            break;
    }

    if (hardware.isKey1Turned())
    {
        Serial.println("KEY 1 TURNED ON");
    }
    
}

// --- Implementazione Funzioni di Gestione Stati ---

/**
 * @brief Gestisce la logica della schermata di benvenuto.
 * @details Mostra un messaggio di benvenuto, la versione del firmware e l'ora per 3 secondi,
 * dopodiché passa automaticamente allo stato del menu principale.
 */
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
        networkManager.sendStatus("event:mode_enter;mode:main_menu;");
    }
}

/**
 * @brief Disegna il menu principale sull'LCD.
 * @details Pulisce lo schermo e disegna le opzioni del menu, mostrando un cursore (>)
 * sulla voce attualmente selezionata e le frecce di scorrimento se necessario.
 */
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

/**
 * @brief Gestisce la logica del menu principale.
 * @details Legge l'input dal tastierino per navigare nel menu e dal pulsante di conferma
 * per selezionare una modalità. Quando una modalità viene selezionata, cambia lo stato
 * globale 'currentAppState' e chiama il metodo enter() della modalità scelta.
 */
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
                Serial.println("TRANSIZIONE: Main Menu -> Modalita' Terminale");
                currentAppState = APP_STATE_TERMINAL_MODE;
                terminalMode->enter();
                break;
            case 4:
                Serial.println("TRANSIZIONE: Main Menu -> Test Hardware");
                networkManager.sendStatus("event:mode_enter;mode:testhw;");
                currentAppState = APP_STATE_TEST_HARDWARE;
                currentTestSubState = TEST_MAIN; // Imposta il sottomenu iniziale
                displayTestHardwareMainMenu(); // Disegna il menu del test
                break;
        }
    }
}

/**
 * @brief Disegna la schermata principale del Test Hardware.
 */
void displayTestHardwareMainMenu() {
    hardware.clearLcd();
    hardware.printLcd(0, 0, "Test Hardware");
    hardware.printLcd(0, 1, "A: RFID B: Chiavi");
    hardware.printLcd(0, 2, "1,2,3 Colori LED");
    hardware.setStripColor(255, 255, 255);
    hardware.printOled1("INDIETRO", 2, 10, 25);
    hardware.printOled2("TEST", 2, 35, 25);
}

/**
 * @brief Disegna la schermata per il test delle chiavi.
 */
void displayKeyTestMenu() {
    hardware.clearLcd();
    hardware.printLcd(0, 0, "Test Interruttori");
    hardware.printLcd(0, 2, "Chiave 1:");
    hardware.printLcd(0, 3, "Chiave 2:");
    hardware.printOled1("INDIETRO", 2, 10, 25);
    hardware.clearOled2();
}

/**
 * @brief Gestisce la logica della modalità di test hardware e dei suoi sottomenù.
 */
void handleTestHardwareState() {
    char key = hardware.getKey();
    bool btn1_pressed = hardware.wasButton1Pressed();
    bool btn2_pressed = hardware.wasButton2Pressed();

    if (currentTestSubState == TEST_MAIN) {
        // --- LOGICA DEL MENU PRINCIPALE DI TEST ---

        if (key != NO_KEY) {
            Serial.printf("INPUT: '%c' premuto\n", key);
            hardware.playTone(700, 40);

            if (key == 'A') {
                hardware.printLcd(0, 1, "                    "); // Pulisce la riga
                hardware.printLcd(0, 1, "Avvicina una card...");
                String uid = hardware.readRFID(5000); // Timeout di 5s
                displayTestHardwareMainMenu(); // Ridisegna il menu dopo il test
                hardware.printLcd(0, 2, "UID:");
                hardware.printLcd(0, 3, uid);
            } else if (key == 'B') {
                // Passa al sottomenu di test delle chiavi
                currentTestSubState = TEST_KEYS;
                displayKeyTestMenu();
            } else {
                hardware.printLcd(0, 1, "Tasto premuto: " + String(key) + "   ");
                if (key == '1') hardware.setStripColor(255, 0, 0);
                if (key == '2') hardware.setStripColor(0, 255, 0);
                if (key == '3') hardware.setStripColor(0, 0, 255);
            }
        }

        if (btn2_pressed) {
            Serial.println("INPUT: Pulsante 2 (Conferma) premuto");
            hardware.playTone(1200, 100);
            hardware.printLcd(0, 1, "Pulsante 2 OK!");
        }

        if (btn1_pressed) {
            // Esce dalla modalità Test Hardware
            Serial.println("INPUT: Pulsante 1 (Indietro) premuto");
            hardware.playTone(300, 70);
            hardware.turnOffStrip();
            networkManager.sendStatus("event:mode_exit;mode:testhw;");
            Serial.println("TRANSIZIONE: Test Hardware -> Main Menu");
            currentAppState = APP_STATE_MAIN_MENU;
            displayMainMenu();
        }

    } else if (currentTestSubState == TEST_KEYS) {
        // --- LOGICA DEL SOTTOMENU TEST CHIAVI ---
        
        bool key1_state = hardware.isKey1Turned();
        bool key2_state = hardware.isKey2Turned();

        // Aggiorna LCD
        hardware.printLcd(10, 2, key1_state ? "ON " : "OFF");
        hardware.printLcd(10, 3, key2_state ? "ON " : "OFF");

        // Aggiorna LED Striscia
        int half_leds = hardware.getStripLedCount() / 2;
        // Chiave 1 - Prima metà (Verde)
        for (int i = 0; i < half_leds; i++) {
            hardware.setPixelColor(i, key1_state ? 0 : 0, key1_state ? 255 : 0, 0);
        }
        // Chiave 2 - Seconda metà (Blu)
        for (int i = half_leds; i < hardware.getStripLedCount(); i++) {
            hardware.setPixelColor(i, 0, 0, key2_state ? 255 : 0);
        }
        hardware.showStrip();

        if (btn1_pressed) {
            // Torna al menu principale di test
            Serial.println("INPUT: Pulsante 1 (Indietro) premuto");
            hardware.playTone(300, 70);
            currentTestSubState = TEST_MAIN;
            displayTestHardwareMainMenu();
        }
    }
}