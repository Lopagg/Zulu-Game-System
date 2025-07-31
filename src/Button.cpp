// src/Button.cpp

/**
 * @file Button.cpp
 * @brief Implementazione della classe Button.
 */

#include "Button.h"

// Imposta un ritardo anti-rimbalzo predefinito di 50 millisecondi.
const unsigned long DEFAULT_DEBOUNCE_DELAY = 50;

/**
 * @brief Costruttore: inizializza le variabili membro con i loro valori di partenza.
 * @param pin Il pin del pulsante passato durante la creazione dell'oggetto.
 */
Button::Button(int pin) :
    _pin(pin),
    _state(HIGH), // Buttons are typically pull-up, so HIGH when not pressed
    _lastReading(HIGH),
    _lastDebounceTime(0),
    _debounceDelay(DEFAULT_DEBOUNCE_DELAY),
    _wasPressedFlag(false),
    _wasReleasedFlag(false)
{}

/**
 * @brief Inizializza il pin hardware.
 * @details Configura il pin come input con una resistenza di pull-up interna attivata.
 * Questo significa che il pin leggerà HIGH quando il pulsante non è premuto
 * e LOW quando viene premuto (collegandolo a GND).
 */
void Button::init() {
    pinMode(_pin, INPUT_PULLUP);
    _state = digitalRead(_pin);
    _lastReading = _state;
}

/**
 * @brief Funzione principale che aggiorna lo stato del pulsante, applicando la logica di debounce.
 */
void Button::update() {

    // 1. Legge lo stato grezzo del pin (può contenere "rumore" dovuto ai rimbalzi).
    int reading = digitalRead(_pin);

    /** 2. Se la lettura è cambiata rispetto all'ultima, significa che potrebbe
     * esserci stato un cambio di stato (o un rimbalzo). Resetta il timer.
    */
    if (reading != _lastReading) {
        _lastDebounceTime = millis();
    }

    // 3. Controlla se è passato abbastanza tempo (debounceDelay) dall'ultimo cambio.
    if ((millis() - _lastDebounceTime) > _debounceDelay) {
        /** Se il tempo è passato e la lettura è stabile ma diversa dallo stato
        confermato, allora abbiamo un cambio di stato reale. */
        if (reading != _state) {
            // Se il pulsante è passato da ALTO a BASSO, è stato appena premuto.
            if (reading == LOW && _state == HIGH) {
                _wasPressedFlag = true;
                _wasReleasedFlag = false;
            }
            // Se il pulsante è passato da BASSO ad ALTO, è stato appena rilasciato.
            else if (reading == HIGH && _state == LOW) {
                _wasReleasedFlag = true;
                _wasPressedFlag = false;
            } else {
                _wasPressedFlag = false;
                _wasReleasedFlag = false;
            }
            _state = reading; // Aggiorna lo stato confermato.
        } else { // If the reading is the same as the debounced state, clear flags
            _wasPressedFlag = false;
            _wasReleasedFlag = false;
        }
    } else {
        /** In ogni ciclo, i flag degli eventi vengono resettati se lo stato è stabile
         * o se il tempo di debounce non è ancora passato. Questo assicura che
         * wasPressed() e wasReleased() ritornino 'true' solo per un singolo ciclo.
        */
        _wasPressedFlag = false;
        _wasReleasedFlag = false;
    }

    _lastReading = reading; // Salva l'ultima lettura grezza per il prossimo ciclo.
}

/**
 * @brief Ritorna lo stato stabile attuale del pulsante.
 */
bool Button::isPressed() {
    return _state == LOW;
}

/**
 * @brief Ritorna 'true' solo per un ciclo se è stato appena rilevato un evento di pressione.
 * @details Il flag viene letto e subito dopo resettato, in modo che la chiamata successiva
 * nello stesso loop (o nei successivi) ritorni 'false' fino a una nuova pressione.
 */
bool Button::wasPressed() {
    bool result = _wasPressedFlag;
    _wasPressedFlag = false;
    return result;
}

/**
 * @brief Ritorna 'true' solo per un ciclo se è stato appena rilevato un evento di rilascio.
 */
bool Button::wasReleased() {
    bool result = _wasReleasedFlag;
    _wasReleasedFlag = false;
    return result;
}