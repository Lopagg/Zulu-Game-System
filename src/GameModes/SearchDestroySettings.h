// src/GameModes/SearchDestroySettings.h

#ifndef SEARCH_DESTROY_SETTINGS_H
#define SEARCH_DESTROY_SETTINGS_H

#include <Arduino.h>
#include <Preferences.h>

class SearchDestroySettings {
public:
    SearchDestroySettings();

    // Metodi per salvare e caricare i parametri
    void saveParameters();
    void loadParameters();

    // Metodi getter
    int getBombTime();
    String getArmingPin();
    String getDisarmingPin();
    int getArmingTime();
    int getDefuseTime();
    bool getUseArmingPin();
    bool getUseDisarmingPin();

    // Metodi setter
    void setBombTime(int time);
    void setArmingPin(const String& pin);
    void setDisarmingPin(const String& pin);
    void setArmingTime(int time);
    void setDefuseTime(int time);
    void setUseArmingPin(bool value);
    void setUseDisarmingPin(bool value);

private:
    // Variabili membro per le impostazioni
    int _bombTime;
    String _armingPin;
    String _disarmingPin;
    int _armingTime;
    int _defuseTime;
    bool _useArmingPin;
    bool _useDisarmingPin;

    Preferences preferences;
};

#endif // SEARCH_DESTROY_SETTINGS_H