// File: static/dashboard.js (Versione con Debug Avanzato)

document.addEventListener('DOMContentLoaded', () => {
    console.log('[DEBUG] 1. DOMContentLoaded - La pagina HTML è stata caricata.');

    try {
        const socket = io();
        console.log('[DEBUG] 2. Oggetto socket creato con successo.');

        socket.on('connect', () => {
            console.log('[DEBUG] 3. Connessione WebSocket al server STABILITA.');
        });

        const deviceListElement = document.getElementById('device-list');
        if (deviceListElement) {
            console.log('[DEBUG] 4. Elemento "device-list" trovato nella pagina.');
        } else {
            console.error('[ERRORE] 4. Elemento "device-list" NON trovato! Controlla l\'ID nell\'HTML.');
            return; // Interrompe l'esecuzione se l'elemento fondamentale manca
        }
        
        const startGameBtn = document.getElementById('start-game-btn');
        if (startGameBtn) {
            console.log('[DEBUG] 5. Pulsante "start-game-btn" trovato.');
        } else {
            console.error('[ERRORE] 5. Pulsante "start-game-btn" NON trovato!');
        }

        // Questo è il listener che dovrebbe ricevere i dati
        socket.on('devices_update', (devices) => {
            console.log('[DEBUG] 6. RICEVUTO evento "devices_update" dal server!');
            console.log('Dati ricevuti:', devices);

            deviceListElement.innerHTML = ''; // Pulisce la lista
            
            if (!devices || devices.length === 0) {
                deviceListElement.innerHTML = '<li>Nessun dispositivo online al momento.</li>';
                return;
            }

            devices.forEach(device => {
                const li = document.createElement('li');
                const statusClass = device.status === 'ONLINE' ? 'team-green' : 'team-red';
                let deviceName = device.id;
                if (device.mode === 'terminal') {
                    deviceName = `Terminale (${device.id})`;
                }
                li.innerHTML = `Dispositivo: <strong>${deviceName}</strong> - Stato: <span class="${statusClass}">${device.status}</span> - Modalità: <em>${device.mode || 'N/A'}</em>`;
                deviceListElement.appendChild(li);
            });
            console.log('[DEBUG] 7. Lista dispositivi aggiornata sulla pagina.');
        });

        if (startGameBtn) {
            startGameBtn.addEventListener('click', () => {
                console.log('[DEBUG] Pulsante "Avvia Partita" cliccato.');
                window.location.href = '/game_control';
            });
        }
        
        console.log('[DEBUG] Fine dello script di inizializzazione. In attesa di eventi...');

    } catch (e) {
        console.error('[ERRORE FATALE] Si è verificato un errore durante l\'inizializzazione dello script:', e);
    }
});