// src/Button.h

#ifndef BUTTON_H
#define BUTTON_H

#include <Arduino.h>

class Button {
public:
    Button(int pin);
    void init();
    void update(); // Call this frequently in your loop()
    bool isPressed();
    bool wasPressed(); // True only for one cycle when button transitions from HIGH to LOW
    bool wasReleased(); // True only for one cycle when button transitions from LOW to HIGH

private:
    int _pin;
    int _state; // Current debounced state
    int _lastReading; // Last raw reading from the pin
    unsigned long _lastDebounceTime;
    unsigned long _debounceDelay; // Default debounce delay
    bool _wasPressedFlag; // Flag to indicate a new press (for wasPressed())
    bool _wasReleasedFlag; // Flag to indicate a new release (for wasReleased())
};

#endif // BUTTON_H