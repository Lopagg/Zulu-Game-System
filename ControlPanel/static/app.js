document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    
    // --- RIFERIMENTI DOM (Elementi dell'interfaccia) ---
    
    // Liste e Log
    const elDeviceList = document.getElementById('device-list');
    const elMiniLog = document.getElementById('mini-log');
    
    // Viste (Pannelli principali)
    const elViewGlobal = document.getElementById('view-global');
    const elViewInspector = document.getElementById('view-inspector');
    
    // Header Stats
    const elAssetCount = document.getElementById('asset-count');
    const elGlobalStatus = document.getElementById('global-status');
    const elMissionClock = document.getElementById('mission-clock');

    // Dashboard Widgets (Vista Globale)
    const elGlobalTimer = document.getElementById('global-timer-display');
    const elScoreA = document.getElementById('score-a');
    const elScoreB = document.getElementById('score-b');

    // Inspector Elements (Vista Dettaglio Asset)
    const elInspTitle = document.getElementById('inspector-title');
    const elInspMode = document.getElementById('insp-mode');
    const elInspState = document.getElementById('insp-state'); // Ora esiste nell'HTML!
    const elInspIp = document.getElementById('insp-ip');
    const elInspAliasInput = document.getElementById('insp-alias-input');
    
    const elInspFwVer = document.getElementById('insp-fw-ver');
    
    // Stato Locale dell'applicazione
    let activeInspectorId = null; // ID del dispositivo che stiamo guardando

    // --- OROLOGIO TATTICO ---
    setInterval(() => {
        const now = new Date();
        elMissionClock.textContent = now.toLocaleTimeString('it-IT', { hour12: false });
    }, 1000);

    // --- SOCKET.IO EVENTS (Comunicazione con il Server) ---

    socket.on('connect', () => {
        logSystem("LINK ESTABLISHED WITH SOP SERVER.");
        elGlobalStatus.textContent = "ONLINE";
        elGlobalStatus.classList.remove('status-alert');
        elGlobalStatus.classList.add('status-normal');
    });

    socket.on('disconnect', () => {
        logSystem("CONNECTION LOST - RETRYING...");
        elGlobalStatus.textContent = "OFFLINE";
        elGlobalStatus.classList.remove('status-normal');
        elGlobalStatus.classList.add('status-alert');
    });

    // 1. Aggiornamento Lista Dispositivi (Sidebar)
    socket.on('devices_update', (devices) => {
        updateDeviceList(devices);
    });

    // 2. Ricezione Eventi di Gioco (Timer, Punti, ecc.)
    socket.on('esp_event', (msg) => {
        handleGameEvent(msg);
    });

    // --- FUNZIONI UI ---

    function updateDeviceList(devices) {
        elDeviceList.innerHTML = ''; // Pulisci lista attuale
        elAssetCount.textContent = devices.length;

        if (devices.length === 0) {
            elDeviceList.innerHTML = '<li class="placeholder-msg">SCANNING NETWORK...</li>';
            return;
        }

        devices.forEach(device => {
            // Calcola classi CSS
            const isOnline = device.status === 'ONLINE';
            const cssClass = isOnline ? 'status-online' : 'status-offline';
            
            // Determina il nome da visualizzare (Alias o ID)
            const displayName = device.name || device.id;

            // Crea l'elemento lista
            const li = document.createElement('li');
            li.className = `device-item ${cssClass}`;
            if (device.id === activeInspectorId) li.classList.add('active'); // Mantiene evidenziato se selezionato
            
            li.innerHTML = `
                <div class="device-icon">ZGT</div>
                <div class="device-info">
                    <span class="device-id">${displayName}</span>
                    <span class="device-mode">${device.mode || 'UNKNOWN'}</span>
                </div>
            `;
            
            // Evento Click: Apre la scheda dettaglio
            li.addEventListener('click', () => {
                openInspector(device);
            });

            elDeviceList.appendChild(li);
            
            // Se stiamo guardando proprio questo device, aggiorniamo i dati in tempo reale
            if (device.id === activeInspectorId) {
                updateInspectorData(device);
            }
        });
    }

    function openInspector(device) {
        activeInspectorId = device.id;
        
        // Imposta i dati iniziali nella scheda
        const displayName = device.name || device.id;
        elInspTitle.textContent = `${displayName} // CONFIG`;
        
        // Mette il nome nell'input box (se è diverso dall'ID)
        elInspAliasInput.value = (device.name === device.id) ? "" : device.name;
        
        updateInspectorData(device);
        
        // Gestione transizione vista (Nascondi Global -> Mostra Inspector)
        elViewGlobal.classList.remove('active');
        elViewGlobal.classList.add('hidden');
        
        elViewInspector.classList.remove('hidden');
        elViewInspector.classList.add('active');
        
        logSystem(`ACCESSING ZGT NODE: ${device.id}`);
    }

    function updateInspectorData(device) {
        // Aggiorna i campi di testo
        if(elInspMode) elInspMode.textContent = device.mode || 'N/A';
        if(elInspState) elInspState.textContent = device.status || 'UNKNOWN';
        if(elInspIp) elInspIp.textContent = device.ip || 'UNKNOWN';
        if(elInspFwVer) elInspFwVer.textContent = `FW_VER: ${device.version || '--'}`;
    }

    // --- GESTIONE PULSANTI ---

    // 1. Chiudi Inspector (Torna alla Dashboard)
    document.querySelector('.close-inspector-btn').addEventListener('click', () => {
        activeInspectorId = null;
        
        elViewInspector.classList.remove('active');
        elViewInspector.classList.add('hidden');
        
        elViewGlobal.classList.remove('hidden');
        elViewGlobal.classList.add('active');
        
        // Rimuovi highlight dalla sidebar
        document.querySelectorAll('.device-item').forEach(el => el.classList.remove('active'));
        
        logSystem("RETURNING TO GLOBAL OVERVIEW.");
    });

    // 2. Salva Alias (Rinomina)
    const btnSaveAlias = document.getElementById('save-alias-btn');
    if(btnSaveAlias) {
        btnSaveAlias.addEventListener('click', () => {
            if(!activeInspectorId) return;
            const newName = elInspAliasInput.value.trim();
            
            if(newName) {
                socket.emit('rename_device', { id: activeInspectorId, name: newName });
                logSystem(`ALIAS UPDATE REQUEST: ${newName}`);
            }
        });
    }

    // 3. Reset Hardware
    const btnHardReset = document.getElementById('hard-reset-btn');
    if(btnHardReset) {
        btnHardReset.addEventListener('click', () => {
            if(!activeInspectorId) return;
            
            if(confirm("CONFERMI RESET HARDWARE? L'asset andrà offline.")) {
                // Invia comando JSON puro
                const resetPayload = { cmd: "RESET" };
                socket.emit('send_command', { 
                    target_id: activeInspectorId, 
                    command: resetPayload 
                });
                logSystem(`SENDING KILL SIGNAL TO ${activeInspectorId}...`);
            }
        });
    }

    // --- GESTIONE EVENTI DI GIOCO (Timer ecc.) ---
    function handleGameEvent(msg) {
        const raw = msg.parsed_data || {};
        const type = raw.type;
        const payload = raw.payload || {};
        
        // Aggiorna Timer Globale
        if (type === 'TIME_UPDATE') {
            if (payload.time_left !== undefined) {
                const m = Math.floor(payload.time_left / 60);
                const s = payload.time_left % 60;
                elGlobalTimer.textContent = `${m}:${s.toString().padStart(2, '0')}`;
            }
            if (payload.t1_poss !== undefined) elScoreA.textContent = payload.t1_poss;
            if (payload.t2_poss !== undefined) elScoreB.textContent = payload.t2_poss;
        }
        
        // Log sistema (opzionale, per debug)
        if (type) {
            // logSystem(`EVENT: ${type}`); 
        }
    }

    // Funzione Utility per scrivere nel log a schermo
    function logSystem(text) {
        const div = document.createElement('div');
        div.textContent = `> ${text}`;
        elMiniLog.prepend(div);
    }
    
    // Espone la funzione sendCommand globalmente (per debug console browser)
    window.sendCommand = function(cmdObj) {
        if (!activeInspectorId) return console.warn("No active inspector");
        socket.emit('send_command', { target_id: activeInspectorId, command: cmdObj });
    };
});