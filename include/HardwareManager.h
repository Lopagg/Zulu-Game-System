// include/HardwareManager.h

/**
 * @file HardwareManager.h
 * @brief Dichiarazione della classe HardwareManager, il punto di controllo centrale per tutto l'hardware.
 * @details Questa classe astrae la complessità dei singoli componenti hardware,
 * fornendo un'interfaccia semplice e unificata per il resto del programma.
 * Gestisce display, pulsanti, LED, suoni e l'orologio di sistema.
 */

#ifndef HARDWARE_MANAGER_H
#define HARDWARE_MANAGER_H

// Inclusione delle librerie necessarie per i componenti hardware
#include <Arduino.h>
#include <LiquidCrystal_I2C.h>
#include <Keypad.h>
#include "Button.h" // Classe definita nel file per la logica debouncing pulsanti
#include <Adafruit_NeoPixel.h> // Striscia LED
#include "RTClib.h"
#include <Adafruit_SSD1306.h> // Schermi OLED

/**
 * @class HardwareManager
 * @brief Gestisce tutte le interazioni con i componenti hardware fisici.
 * @details Un unico oggetto di questa classe viene creato nel main.cpp per garantire
 * che ci sia un solo "padrone" dell'hardware, evitando conflitti.
 */
class HardwareManager {
public:
    /**
     * @brief Costruttore. Prepara gli oggetti dei componenti con i loro parametri base.
     */
    HardwareManager();
    /**
     * @brief Inizializza tutto l'hardware. Chiamata una sola volta nel setup().
     */
    void initialize();

    // --- Funzioni di Output (Display, LED, Suoni) ---

    // Funzioni LCD
    /** @brief Stampa del testo sull'LCD a coordinate specifiche. */
    void printLcd(int col, int row, const String& text);
    /** @brief Pulisce completamente lo schermo LCD. */
    void clearLcd();
    int getLcdRows();
    int getLcdCols();
    void createProgressBarChars();
    void writeCustomChar(uint8_t charIndex);

    // Funzioni schermi OLED
    /** @brief Pulisce l'OLED 1. */
    void clearOled1();
    /** @brief Stampa testo sull'OLED 1 (associato al pulsante 1). */
    void printOled1(const String& text, int size = 1, int x = 0, int y = 0);
    /** @brief Pulisce l'OLED 2. */
    void clearOled2();
    /** @brief Stampa testo sull'OLED 2 (associato al pulsante 2). */
    void printOled2(const String& text, int size = 1, int x = 0, int y = 0);

    // Funzioni Tastiera e Pulsanti
    char getKey();
    void updateButtons();
    bool wasButton1Pressed();
    bool wasButton2Pressed();
    bool isButton1Pressed(); 
    bool isButton2Pressed();

    // Funzioni Striscia LED
    /** @brief Imposta tutti i LED della striscia su un colore uniforme. */
    void setStripColor(uint8_t r, uint8_t g, uint8_t b);
    /** @brief Imposta il colore di un singolo LED della striscia. */
    void setPixelColor(uint16_t pixel, uint8_t r, uint8_t g, uint8_t b); 
    /** @brief Aggiorna la striscia LED con i colori impostati nel buffer. */
    void showStrip();
    /** @brief Spegne la striscia a LED. */
    void turnOffStrip();
    /** @brief Aggiorna l'animazione "arcobaleno". Usata nei menu. */
    void updateRainbowEffect();
    /** @brief Aggiorna l'animazione "respirante". Usata durante il gioco. */
    void updateBreathingEffect(uint8_t r, uint8_t g, uint8_t b);
    /** @brief Cambia la luminosità della striscia a LED. */
    void setBrightness(uint8_t brightness);
    /** @brief Ritorna il numero di LED nella striscia. */
    int getStripLedCount();
    /** @brief Esegue un flash a massima luminosità del colore attuale. Usato per eventi di gioco. */
    void flashCurrentColor(int count, int duration);
    /** @brief Esegue un'animazione "a onda". Usata a fine partita. */
    void updateWinnerWaveEffect(uint8_t r, uint8_t g, uint8_t b, float base_brightness, float peak_brightness, int wave_width);

    // Funzione RTC
    DateTime getRTCTime();

    // Funzioni Buzzer
    void playTone(unsigned int frequency, unsigned long duration);
    void noTone();
    void updateTone(unsigned int frequency);
    void playMidiTune(const int notes[][3], int length); // Nuova funzione
    void updateMidiTune(); // Nuova funzione da chiamare nel loop
    void stopMidiTune();
    bool isMidiTunePlaying();

private:

    // Creazione oggetti
    LiquidCrystal_I2C _lcd;
    Keypad _keypad;
    Button _button1;
    Button _button2;
    Adafruit_NeoPixel _strip;
    RTC_DS1307 _rtc;
    
    // Oggetti per i due schermi OLED
    Adafruit_SSD1306 _oled1;
    Adafruit_SSD1306 _oled2;
    TwoWire _i2c_2;

    // Funzioni private
    unsigned long _rainbowLastUpdate;
    uint16_t _rainbowFirstPixelHue;
    unsigned long _breathingLastUpdate;
    float _breathingBrightness;
    bool _breathingUp;
    unsigned long _waveLastUpdate;
    int _waveCenter;

    int _buzzerPin;
    int _buzzerChannel;

    const int (*_currentMidiTune)[3]; // Puntatore a un array di 3 int
    int _midiTuneLength;
    int _currentMidiNoteIndex;
    unsigned long _midiNoteStartTime;
    bool _isMidiNotePlaying;

    int _lcdRows, _lcdCols;
};

#endif // HARDWARE_MANAGER_H