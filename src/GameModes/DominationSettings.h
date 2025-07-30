// src/GameModes/DominationSettings.h

#ifndef DOMINATION_SETTINGS_H
#define DOMINATION_SETTINGS_H

#include <Arduino.h>
#include <Preferences.h>

class DominationSettings {
public:
    DominationSettings();
    void saveParameters();
    void loadParameters();

    // Metodi getter
    int getGameDuration();
    int getCaptureTime();
    int getCountdownDuration(); // *** NUOVA FUNZIONE ***

    // Metodi setter
    void setGameDuration(int duration);
    void setCaptureTime(int time);
    void setCountdownDuration(int duration); // *** NUOVA FUNZIONE ***

private:
    // Variabili membro per le impostazioni
    int _gameDuration;
    int _captureTime;
    int _countdownDuration; // *** NUOVA VARIABILE ***

    Preferences preferences;
};

#endif // DOMINATION_SETTINGS_H