// src/HardwareManager.cpp

/**
 * @file HardwareManager.cpp
 * @brief Implementazione della classe HardwareManager.
 */

#include "HardwareManager.h" // Collegamento al file .h
#include <Wire.h> // Libreria per I2C. Qui si inizializzano i bus

// RIASSUNTO PIN ESP32
    // Lato sinistro: VIN (5V), GND, D13, D12, D14, D27, D26, D25, D33, D32, D35, D34, VN, VP, EN
    // Lato destro: 3V3, GND, D15, D4, RX2 (D16), TX2 (D17), D5, D18, D19, D21, TX0, RX0, D22, D23

/** --- Configurazione Hardware Globale ---
In questa sezione vengono definiti tutti i parametri hardware del progetto
(indirizzi, pin, dimensioni, ecc.) usando delle macro. Questo rende il
 codice più leggibile e facile da modificare in futuro. */
#define LCD_ADDRESS 0x27
#define OLED_ADDRESS 0x3C // Per entrambi
#define LCD_COLS    20
#define LCD_ROWS    4
#define OLED_RES_X 128
#define OLED_RES_Y 64

// Bus I2C n.1 (principale)
#define I2C_SDA_PIN 21
#define I2C_SCL_PIN 22

// Bus I2C n.2 (secondario per OLED 2)
#define I2C_SDA2_PIN 18
#define I2C_SCL2_PIN 19

#define BUTTON1_PIN 32
#define BUTTON2_PIN 33
#define BUZZER_PIN  23
#define LED_STRIP_PIN   13
#define LED_STRIP_COUNT 60 // Numero di LED della striscia

// Mappa e pin del tastierino numerico 4x4.
const byte ROWS = 4;
const byte COLS = 4;
char hexaKeys[ROWS][COLS] = {
  {'1', '2', '3', 'A'},
  {'4', '5', '6', 'B'},
  {'7', '8', '9', 'C'},
  {'*', '0', '#', 'D'}
};
byte rowPins[ROWS] = {27, 26, 25, 14};
byte colPins[COLS] = {4, 5, 16, 17};

/**
 * @brief Costruttore della classe.
 * @details Viene eseguito quando viene creato l'oggetto 'hardware' in main.cpp.
 * Usa la lista di inizializzazione per creare tutti gli oggetti dei componenti
 * passando loro i parametri di configurazione (pin, indirizzi, ecc.).
 * Nel corpo, inizializza le variabili di stato per le animazioni.
 */
HardwareManager::HardwareManager() :
    _lcd(LCD_ADDRESS, LCD_COLS, LCD_ROWS),
    _keypad(makeKeymap(hexaKeys), rowPins, colPins, ROWS, COLS),
    _button1(BUTTON1_PIN),
    _button2(BUTTON2_PIN),
    _strip(LED_STRIP_COUNT, LED_STRIP_PIN, NEO_GRB + NEO_KHZ800),
    _rtc(),
    _oled1(OLED_RES_X, OLED_RES_Y, &Wire, -1),
    _i2c_2(1), // Inizializza il secondo bus I2C con ID 1
    _oled2(OLED_RES_X, OLED_RES_Y, &_i2c_2, -1)

{
    // Inizializza le variabili di stato per la gestione interna
    _currentMidiTune = nullptr;
    _midiTuneLength = 0;
    _currentMidiNoteIndex = 0;
    _midiNoteStartTime = 0;
    _isMidiNotePlaying = false;

    _lcdCols = LCD_COLS;
    _lcdRows = LCD_ROWS;
    _buzzerPin = BUZZER_PIN;
    _buzzerChannel = 0;
    _rainbowLastUpdate = 0;
    _rainbowFirstPixelHue = 0;
    _breathingLastUpdate = 0;
    _breathingBrightness = 0.0;
    _breathingUp = true;
    _waveLastUpdate = 0;
    _waveCenter = 0;

    _nfc_i2c = nullptr;
    _nfc = nullptr; 
}

/**
 * @brief Inizializza tutti i componenti hardware.
 * @details Questa funzione viene chiamata una sola volta nel setup() del programma principale.
 * Esegue la sequenza di avvio per ogni componente: avvia i bus di comunicazione,
 * inizializza i display, configura i pin e controlla che tutto funzioni correttamente.
 * Se l'RTC non viene trovato, blocca il programma per segnalare un errore critico.
 */
void HardwareManager::initialize() {
    Serial.println("--- Inizializzazione Hardware ---");
    Serial.print("Inizializzazione I2C Bus 1 (Pin 21, 22)... ");
    // Avvia il bus I2C principale per LCD, RTC e OLED1
    Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
    Serial.println("OK.");
    
    Serial.print("Inizializzazione I2C Bus 2 (Pin 14, 12)... ");
    // Avvia il secondo bus I2C per l'OLED2
    _i2c_2.begin(I2C_SDA2_PIN, I2C_SCL2_PIN);
    Serial.println("OK.");

    Serial.print("Inizializzazione LCD... ");
    _lcd.init(); _lcd.backlight(); _lcd.clear();
    Serial.println("OK.");
    
    createProgressBarChars();

    // Inizializzazione del lettore RFID/NFC
    Serial.print("Inizializzazione Lettore PN532... ");
    _nfc_i2c = new PN532_I2C(Wire); // Usa il bus I2C principale
    _nfc = new PN532(*_nfc_i2c);
    
    _nfc->begin();
    delay(50);
    
    uint32_t versiondata = _nfc->getFirmwareVersion();
    if (!versiondata) {
        Serial.println("ERRORE: Modulo PN532 non trovato!");
        printLcd(0, 1, "Errore Lettore");
        printLcd(0, 2, "RFID!");
        while(1) delay(10);
    }
    Serial.print("Trovato chip PN5"); Serial.println((versiondata >> 24) & 0xFF, HEX);
    Serial.print("Firmware ver. "); Serial.print((versiondata >> 16) & 0xFF, DEC);
    Serial.print('.'); Serial.println((versiondata >> 8) & 0xFF, DEC);
    _nfc->SAMConfig();
    Serial.println("OK.");
    
    Serial.print("Inizializzazione OLED 1 (Bus 1)... ");
    if(!_oled1.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS)) {
        Serial.println("ERRORE!");
    } else {
        Serial.println("OK.");
        _oled1.clearDisplay();
        _oled1.display();
    }
    
    Serial.print("Inizializzazione OLED 2 (Bus 2)... ");
    if(!_oled2.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS)) {
        Serial.println("ERRORE!");
    } else {
        Serial.println("OK.");
        _oled2.clearDisplay();
        _oled2.display();
    }
    
    // Configura il canale PWM per il buzzer/altoparlante
    Serial.print("Configurazione LEDC per Buzzer... ");
    ledcSetup(_buzzerChannel, 5000, 8); 
    ledcAttachPin(_buzzerPin, _buzzerChannel); // Collega il pin una sola volta
    ledcWrite(_buzzerChannel, 0); // Assicura che sia spento all'avvio
    Serial.println("OK.");
    
    // Inizializza i pulsanti
    Serial.print("Inizializzazione Pulsanti... ");
    _button1.init(); _button2.init();
    Serial.println("OK.");

    Serial.print("Inizializzazione Striscia LED... ");
    _strip.begin();
    _strip.setBrightness(80);
    _strip.show();
    Serial.println("OK.");

    // Inizializza l'RTC
    Serial.print("Inizializzazione RTC (DS1307)... ");
    if (!_rtc.begin()) {
        Serial.println("ERRORE: modulo RTC non trovato!");
        printLcd(0, 0, "Errore RTC!");
        while (1) delay(10);
    }
    Serial.println("OK.");
    DateTime now = _rtc.now();
    Serial.printf("Ora RTC: %04d/%02d/%02d %02d:%02d:%02d\n", now.year(), now.month(), now.day(), now.hour(), now.minute(), now.second());

    if (!_rtc.isrunning()) {
        Serial.println("ATTENZIONE: RTC non in funzione! Imposto data/ora...");
        _rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
    }

    Serial.println("--- HARDWARE INIZIALIZZATO ---");
}

// --- GESTIONE INPUT ---
// Le seguenti funzioni servono a leggere lo stato dei pulsanti e del tastierino.
// Sono "wrapper" che nascondono i dettagli delle librerie sottostanti.

void HardwareManager::updateButtons() { 
    _button1.update();
    _button2.update();
}

bool HardwareManager::wasButton1Pressed() { return _button1.wasPressed(); }
bool HardwareManager::wasButton2Pressed() { return _button2.wasPressed(); }
char HardwareManager::getKey() { return _keypad.getKey(); }
bool HardwareManager::isButton1Pressed() { return _button1.isPressed(); }
bool HardwareManager::isButton2Pressed() { return _button2.isPressed(); }

// --- GESTIONE OUTPUT LED ---
void HardwareManager::updateRainbowEffect() {
    if (millis() - _rainbowLastUpdate < 25) return;
    _rainbowLastUpdate = millis();
    for (int i = 0; i < LED_STRIP_COUNT; i++) {
        int pixelHue = _rainbowFirstPixelHue + static_cast<int>(i * (65536.0f / LED_STRIP_COUNT));
        _strip.setPixelColor(i, _strip.gamma32(_strip.ColorHSV(pixelHue)));
    }
    _strip.show();
    _rainbowFirstPixelHue = (_rainbowFirstPixelHue + 256) % 65536;
}
void HardwareManager::updateBreathingEffect(uint8_t r, uint8_t g, uint8_t b) {
    if(millis() - _breathingLastUpdate < 25) { return; }
    _breathingLastUpdate = millis();
    if(_breathingUp) {
        _breathingBrightness += 0.02;
        if(_breathingBrightness >= 1.0) { _breathingBrightness = 1.0; _breathingUp = false; }
    } else {
        _breathingBrightness -= 0.02;
        if(_breathingBrightness <= 0.2) { _breathingBrightness = 0.2; _breathingUp = true; }
    }
    uint8_t R = r * _breathingBrightness;
    uint8_t G = g * _breathingBrightness;
    uint8_t B = b * _breathingBrightness;
    setStripColor(R, G, B);
}
void HardwareManager::setStripColor(uint8_t r, uint8_t g, uint8_t b) {
    _strip.fill(_strip.Color(r, g, b));
    _strip.show();
}
void HardwareManager::setPixelColor(uint16_t pixel, uint8_t r, uint8_t g, uint8_t b) {
    if (pixel < _strip.numPixels()) {
        _strip.setPixelColor(pixel, _strip.Color(r, g, b));
    }
}
void HardwareManager::showStrip() { _strip.show(); }
void HardwareManager::turnOffStrip() { _strip.clear(); _strip.show(); }
void HardwareManager::setBrightness(uint8_t brightness) { _strip.setBrightness(brightness); _strip.show(); }
int HardwareManager::getStripLedCount() {
    return LED_STRIP_COUNT;
}
void HardwareManager::flashCurrentColor(int count, int duration) {
    uint32_t pixels[LED_STRIP_COUNT];
    for(int i=0; i < LED_STRIP_COUNT; i++) {
        pixels[i] = _strip.getPixelColor(i);
    }
    uint8_t originalBrightness = _strip.getBrightness();
    
    setBrightness(255);
    for (int i = 0; i < count; i++) {
        _strip.show(); // Mostra i colori attuali a massima luminosità
        delay(duration);
        turnOffStrip();
        if (i < count - 1) {
            delay(500);
        }
    }
    
    // Ripristina i pixel originali
    for(int i=0; i < LED_STRIP_COUNT; i++) {
        _strip.setPixelColor(i, pixels[i]);
    }
    _strip.show();
    setBrightness(originalBrightness);
}

void HardwareManager::updateWinnerWaveEffect(uint8_t r, uint8_t g, uint8_t b, float base_brightness, float peak_brightness, int wave_width) {
    if(millis() - _waveLastUpdate < 50) { return; }
    _waveLastUpdate = millis();

    for(int i = 0; i < _strip.numPixels(); i++) {
        int distance = abs(i - _waveCenter);
        if (distance > _strip.numPixels() / 2) {
            distance = _strip.numPixels() - distance;
        }

        float brightness = base_brightness;
        if (distance <= wave_width) {
            brightness = map(distance, 0, wave_width, peak_brightness * 100, base_brightness * 100) / 100.0;
        }
        
        _strip.setPixelColor(i, r * brightness, g * brightness, b * brightness);
    }
    _strip.show();

    _waveCenter++;
    if (_waveCenter >= _strip.numPixels()) {
        _waveCenter = 0;
    }
}

// --- GESTIONE RTC ---
DateTime HardwareManager::getRTCTime() { return _rtc.now(); }

// --- GESTIONE LCD ---
void HardwareManager::printLcd(int col, int row, const String& text) { _lcd.setCursor(col, row); _lcd.print(text); }
void HardwareManager::clearLcd() { _lcd.clear(); }

// --- GESTIONE BUZZER E MELODIE ---
void HardwareManager::playTone(unsigned int frequency, unsigned long duration) {
    ledcWriteTone(_buzzerChannel, frequency);
    if (duration > 0) {
        delay(duration);
        noTone();
    }
}
void HardwareManager::noTone() {
    ledcWrite(_buzzerChannel, 0); // Imposta il duty cycle a 0 per il silenzio assoluto
}
void HardwareManager::updateTone(unsigned int frequency) {
    if (frequency == 0) {
        noTone();
    } else {
        ledcWriteTone(_buzzerChannel, frequency);
    }
}

void HardwareManager::playMidiTune(const int notes[][3], int length) {
    _currentMidiTune = notes;
    _midiTuneLength = length;
    _currentMidiNoteIndex = 0;
    _midiNoteStartTime = millis();
    _isMidiNotePlaying = false; // Iniziamo con una pausa se c'è
}

void HardwareManager::updateMidiTune() {
    if (_currentMidiTune == nullptr) {
        return; // Nessuna melodia da suonare
    }

    unsigned long currentMillis = millis();
    const int* currentNoteData = _currentMidiTune[_currentMidiNoteIndex];
    int note = currentNoteData[0];
    int toneDuration = currentNoteData[1];
    int pauseDuration = currentNoteData[2];

    if (!_isMidiNotePlaying) {
        // Fase di suono della nota
        if (note != 0) { // Se non è una pausa
            updateTone(note);
        }
        _isMidiNotePlaying = true;
    }

    if (currentMillis - _midiNoteStartTime >= toneDuration) {
        // Fine della fase di suono
        noTone();
        if (currentMillis - _midiNoteStartTime >= (unsigned long)toneDuration + pauseDuration) {
            // Fine anche della pausa, passa alla nota successiva
            _currentMidiNoteIndex++;
            if (_currentMidiNoteIndex >= _midiTuneLength) {
                // Melodia finita
                _currentMidiTune = nullptr;
                return;
            }
            _midiNoteStartTime = currentMillis;
            _isMidiNotePlaying = false; // Ricomincia il ciclo per la nuova nota
        }
    }
}

void HardwareManager::stopMidiTune() {
    _currentMidiTune = nullptr;
    _midiTuneLength = 0;
    _currentMidiNoteIndex = 0;
    noTone();
}

bool HardwareManager::isMidiTunePlaying() {
    return _currentMidiTune != nullptr;
}

// --- GETTERS ---
int HardwareManager::getLcdRows() { return _lcdRows; }
int HardwareManager::getLcdCols() { return _lcdCols; }

// --- FUNZIONI PER LA PROGRESS BAR ---
void HardwareManager::createProgressBarChars() {
    byte p1[]={B10000,B10000,B10000,B10000,B10000,B10000,B10000,B10000};
    byte p2[]={B11000,B11000,B11000,B11000,B11000,B11000,B11000,B11000};
    byte p3[]={B11100,B11100,B11100,B11100,B11100,B11100,B11100,B11100};
    byte p4[]={B11110,B11110,B11110,B11110,B11110,B11110,B11110,B11110};
    byte p5[]={B11111,B11111,B11111,B11111,B11111,B11111,B11111,B11111};
    _lcd.createChar(0, p1); _lcd.createChar(1, p2); _lcd.createChar(2, p3);
    _lcd.createChar(3, p4); _lcd.createChar(4, p5);
}
void HardwareManager::writeCustomChar(uint8_t charIndex) { _lcd.write(byte(charIndex)); }

// --- FUNZIONI PER GLI OLED ---
void HardwareManager::clearOled1() {
    _oled1.clearDisplay();
    _oled1.display();
}
void HardwareManager::printOled1(const String& text, int size, int x, int y) {
    _oled1.clearDisplay();
    _oled1.setTextSize(size);
    _oled1.setTextColor(SSD1306_WHITE);
    _oled1.setCursor(x, y);
    _oled1.println(text);
    _oled1.display();
}
void HardwareManager::clearOled2() {
    _oled2.clearDisplay();
    _oled2.display();
}
void HardwareManager::printOled2(const String& text, int size, int x, int y) {
    _oled2.clearDisplay();
    _oled2.setTextSize(size);
    _oled2.setTextColor(SSD1306_WHITE);
    _oled2.setCursor(x, y);
    _oled2.println(text);
    _oled2.display();
}

/**
 * @brief Legge l'UID di una card RFID/NFC in modo persistente per un dato timeout.
 * @param timeout Il tempo massimo in millisecondi per cui cercare una card.
 * @return Una stringa con l'UID in formato esadecimale, o un messaggio di errore.
 */
String HardwareManager::readRFID(uint16_t timeout) {
    uint8_t success;
    uint8_t uid[] = { 0, 0, 0, 0, 0, 0, 0 };
    uint8_t uidLength;

    unsigned long startTime = millis();
    // *** MODIFICA: Cicla finché non trova una card o scade il tempo ***
    while (millis() - startTime < timeout) {
        // Tenta di leggere una card con un breve timeout per non bloccare il ciclo
        success = _nfc->readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLength, 50);

        if (success) {
            String uidString = "";
            for (uint8_t i = 0; i < uidLength; i++) {
                if (uid[i] < 0x10) uidString += "0";
                uidString += String(uid[i], HEX);
                if (i < uidLength - 1) uidString += ":";
            }
            uidString.toUpperCase();
            return uidString;
        }
    }
    
    // Se il ciclo finisce senza aver trovato nulla
    return "Nessuna card trovata";
}