// src/GameModes/SearchDestroySettings.cpp

#include "SearchDestroySettings.h"

// Costruttore
SearchDestroySettings::SearchDestroySettings() {
    loadParameters();
}

// Salva i parametri correnti nella memoria
void SearchDestroySettings::saveParameters() {
    preferences.begin("sd-settings", false);
    preferences.putInt("bombTime", _bombTime);
    preferences.putString("armingPin", _armingPin);
    preferences.putString("disarmingPin", _disarmingPin);
    preferences.putInt("armingTime", _armingTime);
    preferences.putInt("defuseTime", _defuseTime);
    preferences.putBool("useArmPin", _useArmingPin);
    preferences.putBool("useDisarmPin", _useDisarmingPin);
    preferences.end();
    Serial.println("Parametri salvati.");
}

// Carica i parametri dalla memoria
void SearchDestroySettings::loadParameters() {
    preferences.begin("sd-settings", true);
    _bombTime = preferences.getInt("bombTime", 10);
    _armingPin = preferences.getString("armingPin", "1234");
    _disarmingPin = preferences.getString("disarmingPin", "4321");
    _armingTime = preferences.getInt("armingTime", 5);
    _defuseTime = preferences.getInt("defuseTime", 10);
    _useArmingPin = preferences.getBool("useArmPin", true);
    _useDisarmingPin = preferences.getBool("useDisarmPin", true);
    preferences.end();
    Serial.println("Parametri caricati.");
}

// --- Metodi Getter ---
int SearchDestroySettings::getBombTime() { return _bombTime; }
String SearchDestroySettings::getArmingPin() { return _armingPin; }
String SearchDestroySettings::getDisarmingPin() { return _disarmingPin; }
int SearchDestroySettings::getArmingTime() { return _armingTime; }
int SearchDestroySettings::getDefuseTime() { return _defuseTime; }
bool SearchDestroySettings::getUseArmingPin() { return _useArmingPin; }
bool SearchDestroySettings::getUseDisarmingPin() { return _useDisarmingPin; }

// --- Metodi Setter ---
void SearchDestroySettings::setBombTime(int time) { _bombTime = time; }
void SearchDestroySettings::setArmingPin(const String& pin) { _armingPin = pin; }
void SearchDestroySettings::setDisarmingPin(const String& pin) { _disarmingPin = pin; }
void SearchDestroySettings::setArmingTime(int time) { _armingTime = time; }
void SearchDestroySettings::setDefuseTime(int time) { _defuseTime = time; }
void SearchDestroySettings::setUseArmingPin(bool value) { _useArmingPin = value; }
void SearchDestroySettings::setUseDisarmingPin(bool value) { _useDisarmingPin = value; }