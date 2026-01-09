document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    
    // Stato locale
    let activeDeviceId = null;
    let activeMode = 'waiting'; 
    let gameTimerInterval = null;
    let actionInterval = null;

    // Riferimenti UI
    const elStatusIndicator = document.getElementById('connection-status-indicator');
    const elStatusText = document.getElementById('connection-status-text');
    const elWaitingView = document.getElementById('waiting-view');
    const elDomView = document.getElementById('domination-view');
    const elSdView = document.getElementById('sd-view');
    const logList = document.getElementById('log-list');

    // --- GESTIONE CONNESSIONE SOCKET ---
    socket.on('connect', () => {
        console.log('[WS] Connesso al server.');
        elStatusIndicator.className = 'connection-status status-online';
        elStatusText.textContent = 'SERVER ONLINE (IN ATTESA DATI)';
    });

    socket.on('disconnect', () => {
        console.log('[WS] Disconnesso.');
        elStatusIndicator.className = 'connection-status status-offline';
        elStatusText.textContent = 'SERVER OFFLINE';
    });

    // --- CUORE DEL SISTEMA: Ricezione Eventi ---
    socket.on('esp_event', (msg) => {
        // Estraiamo i dati dal formato JSON standard
        const raw = msg.parsed_data || {};
        const type = raw.type || '';
        const payload = raw.payload || {};
        const deviceId = raw.id;

        // Log di debug a schermo
        addLog(`[RX] ${type} da ${deviceId}`);

        // 1. AUTO-RILEVAMENTO DISPOSITIVO
        // Appena riceviamo QUALSIASI messaggio, consideriamo il dispositivo attivo
        if (!activeDeviceId) {
            activeDeviceId = deviceId;
            elStatusText.textContent = `CONNESSO A: ${deviceId}`;
            elWaitingView.classList.add('hidden'); // Nascondi schermata attesa
            console.log(`[SYS] Dispositivo rilevato: ${deviceId}`);
        }

        // 2. GESTIONE CAMBIO MODALITÀ (MODE_ENTER)
        if (type === 'MODE_ENTER') {
            handleModeChange(payload.mode);
            return;
        }

        // 3. INOLTRO A GESTORI SPECIFICI
        if (activeMode === 'domination') {
            handleDominationEvent(type, payload);
        } else if (activeMode === 'sd') {
            handleSdEvent(type, payload);
        }
        
        // Gestione eventi generici (es. inizio gioco immediato)
        if (type === 'GAME_START') {
             // Se non siamo già nella vista giusta, forziamo un refresh basato sull'ultima modalità nota o default
             // Ma idealmente MODE_ENTER dovrebbe essere arrivato prima.
        }
    });

    // --- LOGICA DI VISUALIZZAZIONE ---

    function handleModeChange(modeStr) {
        // Normalizza la stringa (es. "SEARCH_AND_DESTROY" o "sd" -> "sd")
        let mode = modeStr ? modeStr.toLowerCase() : '';
        if (mode === 'search_and_destroy') mode = 'sd';

        console.log(`[UI] Cambio modalità a: ${mode}`);
        
        // Nascondi tutto
        elWaitingView.classList.add('hidden');
        elDomView.classList.add('hidden');
        elSdView.classList.add('hidden');

        // Mostra la vista giusta
        if (mode === 'domination') {
            activeMode = 'domination';
            elDomView.classList.remove('hidden');
        } else if (mode === 'sd') {
            activeMode = 'sd';
            elSdView.classList.remove('hidden');
        } else {
            // Menu principale o altro
            activeMode = 'menu';
            elWaitingView.classList.remove('hidden');
            document.querySelector('#waiting-view h2').textContent = "DISPOSITIVO NEL MENU";
            document.querySelector('#waiting-view p').textContent = "Seleziona una modalità dal dispositivo.";
        }
    }

    // --- GESTORE DOMINIO ---
    function handleDominationEvent(type, data) {
        const elTimer = document.getElementById('domination-timer');
        const elState = document.getElementById('domination-game-state');
        
        if (type === 'TIME_UPDATE') {
            if (data.time_left !== undefined) elTimer.textContent = formatTime(data.time_left);
            if (data.t1_poss !== undefined) document.getElementById('score-team1').textContent = formatTime(data.t1_poss);
            if (data.t2_poss !== undefined) document.getElementById('score-team2').textContent = formatTime(data.t2_poss);
        }
        else if (type === 'GAME_START') {
            elState.textContent = "PARTITA IN CORSO";
            elState.style.color = "#00ff00";
        }
        else if (type === 'CAPTURE_START') {
            const teamName = data.team == 1 ? "ROSSA" : "VERDE";
            elState.innerHTML = `CONQUISTA IN CORSO: <span class="team-${data.team == 1 ? 'red' : 'green'}">${teamName}</span>`;
        }
        else if (type === 'ZONE_CAPTURED') {
            const teamName = data.team == 1 ? "ROSSA" : "VERDE";
            elState.innerHTML = `ZONA CATTURATA DA <span class="team-${data.team == 1 ? 'red' : 'green'}">${teamName}</span>`;
        }
        else if (type === 'GAME_END') {
            elState.textContent = "FINE PARTITA";
            elTimer.textContent = data.winner == 1 ? "VINCE ROSSI" : (data.winner == 2 ? "VINCE VERDI" : "PAREGGIO");
        }
    }

    // --- GESTORE S&D ---
    function handleSdEvent(type, data) {
        const elTimer = document.getElementById('sd-game-timer');
        const elBombState = document.getElementById('sd-bomb-state');
        const elBombTimer = document.getElementById('sd-bomb-timer');

        if (type === 'TIME_UPDATE') {
            elTimer.textContent = formatTime(data.time);
        }
        else if (type === 'GAME_START') {
            elBombState.textContent = "CERCATE LA BOMBA";
            elBombTimer.textContent = "--:--";
        }
        else if (type === 'ARM_START') {
            elBombState.textContent = "INNESCO IN CORSO...";
        }
        else if (type === 'BOMB_ARMED') {
            elBombState.textContent = "BOMBA ATTIVA!";
            elBombState.style.color = "red";
        }
        else if (type === 'DEFUSE_START') {
            elBombState.textContent = "DISINNESCO IN CORSO...";
            elBombState.style.color = "orange";
        }
        else if (type === 'GAME_END') {
            elBombState.textContent = `VITTORIA: ${data.winner === 'TERRORISTS' ? 'TERRORISTI' : 'COUNTER-TERRORISTS'}`;
        }
    }

    // --- UTILS ---
    function formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    function addLog(text) {
        const li = document.createElement('li');
        li.textContent = text;
        if(logList) logList.prepend(li);
    }
    
    // Funzione globale per i pulsanti (se servono)
    window.sendCommand = function(cmd) {
        if (!activeDeviceId) return alert("Nessun dispositivo!");
        socket.emit('send_command', { target_id: activeDeviceId, command: "CMD:" + cmd });
    };
});