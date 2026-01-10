document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    
    // Riferimenti UI (Nuovo Layout SOP)
    const elDeviceList = document.getElementById('device-list');
    const elMiniLog = document.getElementById('mini-log');
    
    // Viste
    const elViewGlobal = document.getElementById('view-global');
    const elViewInspector = document.getElementById('view-inspector');
    
    // Header Stats
    const elAssetCount = document.getElementById('asset-count');
    const elGlobalStatus = document.getElementById('global-status');
    const elMissionClock = document.getElementById('mission-clock');

    // Dashboard Widgets
    const elGlobalTimer = document.getElementById('global-timer-display');
    const elScoreA = document.getElementById('score-a');
    const elScoreB = document.getElementById('score-b');

    // Inspector Elements
    const elInspTitle = document.getElementById('inspector-title');
    const elInspMode = document.getElementById('insp-mode');
    const elInspState = document.getElementById('insp-state');
    const elInspIp = document.getElementById('insp-ip');
    
    // Stato Locale
    let activeInspectorId = null; // Quale ZGT stiamo ispezionando?
    
    // --- OROLOGIO TATTICO ---
    setInterval(() => {
        const now = new Date();
        elMissionClock.textContent = now.toLocaleTimeString('it-IT', { hour12: false });
    }, 1000);

    // --- SOCKET.IO EVENTS ---

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

    // Ricezione Lista Dispositivi (Sidebar)
    socket.on('devices_update', (devices) => {
        updateDeviceList(devices);
    });

    // Ricezione Eventi di Gioco (Aggiornamento Dashboard)
    socket.on('esp_event', (msg) => {
        handleGameEvent(msg);
    });

    // --- FUNZIONI UI ---

    function updateDeviceList(devices) {
        elDeviceList.innerHTML = '';
        elAssetCount.textContent = devices.length;

        if (devices.length === 0) {
            elDeviceList.innerHTML = '<li class="placeholder-msg">NO ASSETS DETECTED</li>';
            return;
        }

        devices.forEach(device => {
            const isOnline = device.status === 'ONLINE';
            const cssClass = isOnline ? 'status-online' : 'status-offline';
            
            // Usiamo il nome personalizzato se c'è, altrimenti l'ID
            const displayName = device.name || device.id;

            const li = document.createElement('li');
            li.className = `device-item ${cssClass}`;
            if (device.id === activeInspectorId) li.classList.add('active'); 
            
            li.innerHTML = `
                <div class="device-icon">ZGT</div>
                <div class="device-info">
                    <span class="device-id">${displayName}</span>
                    <span class="device-mode">${device.mode || 'UNKNOWN'}</span>
                </div>
            `;
            
            li.addEventListener('click', () => {
                openInspector(device);
            });

            elDeviceList.appendChild(li);
        });
    }

    function openInspector(device) {
        activeInspectorId = device.id;
        
        // Aggiorna UI Inspector
        const displayName = device.name || device.id;
        document.getElementById('inspector-title').textContent = `${displayName} // CONFIG`;
        document.getElementById('insp-alias-input').value = device.name === device.id ? "" : device.name;
        
        updateInspectorData(device);
        
        elViewGlobal.classList.add('hidden');
        elViewInspector.classList.remove('hidden');
    }
    
    // GESTIONE NUOVI PULSANTI
    
    // Salva Alias
    document.getElementById('save-alias-btn').addEventListener('click', () => {
        if(!activeInspectorId) return;
        const newName = document.getElementById('insp-alias-input').value;
        if(newName) {
            socket.emit('rename_device', { id: activeInspectorId, name: newName });
            logSystem(`ALIAS UPDATED: ${newName}`);
        }
    });

    // Reset Hardware
    document.getElementById('hard-reset-btn').addEventListener('click', () => {
        if(!activeInspectorId) return;
        
        if(confirm("CONFERMI RESET HARDWARE? L'asset andrà offline.")) {
            // Invece di usare window.sendCommand che aggiunge "CMD:", inviamo un oggetto JSON puro
            const resetPayload = { cmd: "RESET" };
            
            socket.emit('send_command', { 
                target_id: activeInspectorId, 
                command: resetPayload // Il bridge Python lo trasformerà in stringa JSON
            });
            
            logSystem(`SENDING KILL SIGNAL TO ${activeInspectorId}...`);
        }
    });

    // Tasto "CLOSE LINK" nell'inspector
    document.querySelector('.close-inspector-btn').addEventListener('click', () => {
        activeInspectorId = null;
        elViewInspector.classList.remove('active');
        elViewInspector.classList.add('hidden');
        
        elViewGlobal.classList.remove('hidden');
        elViewGlobal.classList.add('active');
        logSystem("RETURNING TO GLOBAL OVERVIEW.");
    });

    function handleGameEvent(msg) {
        const raw = msg.parsed_data || {};
        const type = raw.type;
        const payload = raw.payload || {};
        
        // Aggiorna Timer Globale (se arriva un evento TIME_UPDATE)
        if (type === 'TIME_UPDATE') {
            if (payload.time_left !== undefined) {
                const m = Math.floor(payload.time_left / 60);
                const s = payload.time_left % 60;
                elGlobalTimer.textContent = `${m}:${s.toString().padStart(2, '0')}`;
            }
            // Aggiorna Punteggi (se presenti)
            if (payload.t1_poss !== undefined) elScoreA.textContent = payload.t1_poss; // Assumiamo T1 = A
            if (payload.t2_poss !== undefined) elScoreB.textContent = payload.t2_poss; // Assumiamo T2 = B
        }
        
        // Logga evento
        if (type) logSystem(`EVENT RX: ${type} from ${raw.id}`);
    }

    function logSystem(text) {
        const span = document.createElement('div');
        span.textContent = `> ${text}`;
        elMiniLog.prepend(span);
    }
    
    // --- COMANDI RAPIDI (Bottoni nell'Inspector) ---
    document.querySelectorAll('.tactical-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!activeInspectorId) return;
            
            const cmdType = btn.getAttribute('data-cmd');
            let cmdStr = "";
            
            if (cmdType === 'START_DOM') cmdStr = "CMD:START_DOM_GAME;";
            if (cmdType === 'START_SD') cmdStr = "CMD:START_SD_GAME;";
            if (cmdType === 'FORCE_END') cmdStr = "CMD:FORCE_END_GAME";
            
            if (cmdStr) {
                socket.emit('send_command', { target_id: activeInspectorId, command: cmdStr });
                logSystem(`INJECTION: ${cmdType} -> ${activeInspectorId}`);
            }
        });
    });
});