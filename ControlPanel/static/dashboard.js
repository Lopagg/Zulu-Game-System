document.addEventListener('DOMContentLoaded', () => {
    
    const socket = io();
    socket.on('connect', () => {
        console.log('Dashboard connessa al server!');
    });

    const deviceListElement = document.getElementById('device-list');
    const startGameBtn = document.getElementById('start-game-btn');

    // Funzione per aggiornare la lista dei dispositivi
    socket.on('devices_update', (devices) => {
        console.log('Ricevuta lista dispositivi:', devices);
        if (!deviceListElement) return; // Sicurezza

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
    });

    // Funzionalità del pulsante "Avvia Partita"
    if (startGameBtn) {
        startGameBtn.addEventListener('click', () => {
            // Reindirizza alla pagina di controllo del gioco
            window.location.href = '/game_control';
        });
    }
});