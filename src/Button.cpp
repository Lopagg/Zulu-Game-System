// src/Button.cpp

#include "Button.h"

// Default debounce delay in milliseconds
const unsigned long DEFAULT_DEBOUNCE_DELAY = 50;

Button::Button(int pin) :
    _pin(pin),
    _state(HIGH), // Buttons are typically pull-up, so HIGH when not pressed
    _lastReading(HIGH),
    _lastDebounceTime(0),
    _debounceDelay(DEFAULT_DEBOUNCE_DELAY),
    _wasPressedFlag(false),
    _wasReleasedFlag(false)
{}

void Button::init() {
    pinMode(_pin, INPUT_PULLUP); // Assuming pull-up resistors for the buttons
    _state = digitalRead(_pin);
    _lastReading = _state;
}

void Button::update() {
    // Read the raw input pin state
    int reading = digitalRead(_pin);

    // If the reading has changed, reset the debounce timer
    if (reading != _lastReading) {
        _lastDebounceTime = millis();
    }

    // If enough time has passed (debounceDelay) since the last change
    // and the reading is stable
    if ((millis() - _lastDebounceTime) > _debounceDelay) {
        // If the current reading is different from the debounced state
        if (reading != _state) {
            // Check for state transitions
            if (reading == LOW && _state == HIGH) { // Button just pressed (LOW because INPUT_PULLUP)
                _wasPressedFlag = true;
                _wasReleasedFlag = false; // Ensure release flag is false on press
            } else if (reading == HIGH && _state == LOW) { // Button just released
                _wasReleasedFlag = true;
                _wasPressedFlag = false; // Ensure press flag is false on release
            } else { // Should not happen with only two states (HIGH/LOW)
                _wasPressedFlag = false;
                _wasReleasedFlag = false;
            }
            _state = reading; // Update the debounced state
        } else { // If the reading is the same as the debounced state, clear flags
            _wasPressedFlag = false;
            _wasReleasedFlag = false;
        }
    } else { // Not debounced yet, clear flags
        _wasPressedFlag = false;
        _wasReleasedFlag = false;
    }

    _lastReading = reading; // Save the current raw reading for the next iteration
}

bool Button::isPressed() {
    return _state == LOW; // Return true if the debounced state is LOW (pressed)
}

bool Button::wasPressed() {
    // Return true only if the button just transitioned from HIGH to LOW (pressed this cycle)
    bool result = _wasPressedFlag;
    _wasPressedFlag = false; // Clear the flag after reading it
    return result;
}

bool Button::wasReleased() {
    // Return true only if the button just transitioned from LOW to HIGH (released this cycle)
    bool result = _wasReleasedFlag;
    _wasReleasedFlag = false; // Clear the flag after reading it
    return result;
}