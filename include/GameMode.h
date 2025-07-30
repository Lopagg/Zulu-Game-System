// include/GameMode.h

#ifndef GAME_MODE_H
#define GAME_MODE_H

// La classe base GameMode definisce l'interfaccia comune per tutte le modalità di gioco.
class GameMode {
public:
    // Il costruttore predefinito.
    GameMode() {}

    // Dichiarazione di un distruttore virtuale per assicurare la corretta deallocazione
    // quando si lavora con puntatori polimorfici.
    virtual ~GameMode() {}

    // Metodi virtuali puri che le classi derivate devono implementare.
    // Questi metodi definiscono il ciclo di vita di una modalità di gioco.
    virtual void enter() = 0; // Chiamato quando la modalità viene attivata
    virtual void loop() = 0;  // Chiamato ripetutamente mentre la modalità è attiva
    virtual void exit() = 0;  // Chiamato quando la modalità viene disattivata
};

#endif // GAME_MODE_H