// include/HardwareManager.h

#ifndef HARDWARE_MANAGER_H
#define HARDWARE_MANAGER_H

// Inclusione librerie

#include <Arduino.h>
#include <LiquidCrystal_I2C.h>
#include <Keypad.h>
#include "Button.h" // Classe definita nel file per la logica debouncing pulsanti
#include <Adafruit_NeoPixel.h> // Striscia LED
#include "RTClib.h"
#include <Adafruit_SSD1306.h> // Schermi OLED

// Creazione della classe

class HardwareManager {
public:
    HardwareManager(); // Costruttore: assegna valori iniziali alle variabili
    void initialize(); // Codice di avvio dei componenti, chiamata nel setup()

    // Funzioni LCD
    void printLcd(int col, int row, const String& text);
    void clearLcd();
    int getLcdRows();
    int getLcdCols();
    void createProgressBarChars();
    void writeCustomChar(uint8_t charIndex);

    // Funzioni schermi OLED
    void clearOled1();
    void printOled1(const String& text, int size = 1, int x = 0, int y = 0);
    void clearOled2();
    void printOled2(const String& text, int size = 1, int x = 0, int y = 0);

    // Funzioni Tastiera e Pulsanti
    char getKey();
    void updateButtons();
    bool wasButton1Pressed();
    bool wasButton2Pressed();
    bool isButton1Pressed(); 
    bool isButton2Pressed();

    // Funzioni Striscia LED
    void setStripColor(uint8_t r, uint8_t g, uint8_t b);
    void setPixelColor(uint16_t pixel, uint8_t r, uint8_t g, uint8_t b); 
    void showStrip();
    void turnOffStrip();
    void updateRainbowEffect();
    void updateBreathingEffect(uint8_t r, uint8_t g, uint8_t b);
    void setBrightness(uint8_t brightness);
    int getStripLedCount();
    void flashCurrentColor(int count, int duration);
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