// src/GameModes/DominationSettings.cpp

#include "DominationSettings.h"

DominationSettings::DominationSettings() {
    loadParameters();
}

void DominationSettings::saveParameters() {
    preferences.begin("dom-settings", false);
    preferences.putInt("gameDuration", _gameDuration);
    preferences.putInt("captureTime", _captureTime);
    preferences.putInt("countdown", _countdownDuration); // Salva il nuovo parametro
    preferences.end();
    Serial.println("Parametri Dominio salvati.");
}

void DominationSettings::loadParameters() {
    preferences.begin("dom-settings", true);
    _gameDuration = preferences.getInt("gameDuration", 15);
    _captureTime = preferences.getInt("captureTime", 10);   // Default aggiornato a 10 secondi
    _countdownDuration = preferences.getInt("countdown", 10); // Carica il nuovo parametro (default 10)
    preferences.end();
    Serial.println("Parametri Dominio caricati.");
}

// Implementazione Getter
int DominationSettings::getGameDuration() { return _gameDuration; }
int DominationSettings::getCaptureTime() { return _captureTime; }
int DominationSettings::getCountdownDuration() { return _countdownDuration; }

// Implementazione Setter
void DominationSettings::setGameDuration(int duration) { _gameDuration = duration; }
void DominationSettings::setCaptureTime(int time) { _captureTime = time; }
void DominationSettings::setCountdownDuration(int duration) { _countdownDuration = duration; }