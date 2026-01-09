// Connessione al server SocketIO (Flask)
const socket = io();

// Elementi DOM
const elTimer = document.getElementById('main-timer');
const elStatus = document.getElementById('game-status');
const elConnStatus = document.getElementById('connection-status');
const elDomPanel = document.getElementById('domination-panel');
const elScoreT1 = document.getElementById('score-t1');
const elScoreT2 = document.getElementById('score-t2');

// Variabile per tenere traccia dell'ultimo device ID attivo
let activeDeviceId = null;

// --- GESTIONE CONNESSIONE ---
socket.on('connect', () => {
    console.log("Connesso al server web!");
    elConnStatus.textContent = "ONLINE (WEB)";
    elConnStatus.classList.remove('offline');
    elConnStatus.classList.add('online');
});

socket.on('disconnect', () => {
    console.log("Disconnesso dal server web.");
    elConnStatus.textContent = "OFFLINE";
    elConnStatus.classList.remove('online');
    elConnStatus.classList.add('offline');
});

// --- RICEZIONE EVENTI DALL'ESP32 ---
socket.on('esp_event', (msg) => {
    // msg struttura: { parsed_data: {...}, device_ip_info: [...] }
    const data = msg.parsed_data;
    const type = data.type;
    const payload = data.payload || {}; // Assicura che payload esista
    
    // Salviamo l'ID per inviare comandi di ritorno
    if (data.id) activeDeviceId = data.id;

    console.log(`Evento [${type}] received:`, payload);

    switch(type) {
        case 'HEARTBEAT':
            // Possiamo usare questo per mostrare che il dispositivo è vivo
            break;

        case 'MODE_ENTER':
            handleModeEnter(payload.mode);
            break;

        case 'GAME_START':
            elStatus.textContent = "PARTITA IN CORSO";
            elStatus.style.color = "#00ff00";
            if (payload.duration_min) {
                elTimer.textContent = `${payload.duration_min}:00`;
            }
            break;

        case 'TIME_UPDATE':
            // Payload: { time_left: 120, t1_poss: 10, t2_poss: 5 }
            updateTimer(payload.time_left);
            if (payload.t1_poss !== undefined) {
                updateScores(payload.t1_poss, payload.t2_poss);
            }
            break;

        case 'GAME_END':
            // Payload: { winner: 1, reason: "TIME_EXPIRED" }
            handleGameEnd(payload);
            break;
            
        case 'COUNTDOWN_UPDATE':
             elTimer.textContent = `AVVIO: ${payload.time}`;
             elStatus.textContent = "COUNTDOWN...";
             break;
    }
});

// --- FUNZIONI DI AGGIORNAMENTO UI ---

function handleModeEnter(mode) {
    elStatus.textContent = `MODALITÀ: ${mode}`;
    
    // Mostra pannelli specifici in base alla modalità
    if (mode === 'DOMINATION') {
        elDomPanel.style.display = 'block';
    } else {
        elDomPanel.style.display = 'none';
    }
}

function updateTimer(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    // Formatta come MM:SS
    elTimer.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
}

function updateScores(t1, t2) {
    // Formatta i secondi in MM:SS per i punteggi
    const fmt = (s) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, '0')}`;
    };
    elScoreT1.textContent = fmt(t1);
    elScoreT2.textContent = fmt(t2);
}

function handleGameEnd(payload) {
    elStatus.textContent = "PARTITA TERMINATA";
    elStatus.style.color = "red";
    
    let winnerText = "PAREGGIO";
    if (payload.winner == 1 || payload.winner === "TERRORISTS") winnerText = "VINCE SQUADRA 1 (T)";
    if (payload.winner == 2 || payload.winner === "COUNTER_TERRORISTS") winnerText = "VINCE SQUADRA 2 (CT)";
    
    elTimer.textContent = winnerText;
}

// --- INVIO COMANDI ---
window.sendCommand = function(cmdString) {
    if (!activeDeviceId) {
        alert("Nessun dispositivo connesso rilevato!");
        return;
    }

    console.log("Invio comando:", cmdString);
    
    // Costruiamo il payload per la nostra API Flask
    // Nota: Il firmware si aspetta solo la stringa comando grezza per ora nel parsing JSON?
    // Nel firmware abbiamo fatto: if (command.indexOf("FORCE_END_GAME") >= 0)
    // Quindi inviamo una stringa semplice per compatibilità con quella riga specifica,
    // oppure un JSON se abbiamo aggiornato il parsing dei comandi nel main loop.
    // Per sicurezza, mandiamo la stringa "CMD:FORCE_END_GAME" che funziona sempre.
    
    const body = {
        target_id: activeDeviceId,
        command: "CMD:" + cmdString // "CMD:FORCE_END_GAME"
    };

    fetch('/api/send_command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    })
    .then(res => res.json())
    .then(data => console.log("Risposta server:", data))
    .catch(err => console.error("Errore invio:", err));
};