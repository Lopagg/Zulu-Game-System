document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    
    // --- RIFERIMENTI DOM (Elementi dell'interfaccia) ---
    
    // Liste e Log
    const elDeviceList = document.getElementById('device-list');
    const elMiniLog = document.getElementById('mini-log');
    
    // Viste (Pannelli principali)
    const elViewHub = document.getElementById('view-hub');
    const elViewSelectTarget = document.getElementById('view-select-target');
    const elViewSetup = document.getElementById('view-setup');
    const elViewMonitor = document.getElementById('view-monitor'); 
    const elViewInspector = document.getElementById('view-inspector');

    const views = {
        'hub': elViewHub,
        'select-target': elViewSelectTarget,
        'setup': elViewSetup,
        'monitor': elViewMonitor,
        'inspector': elViewInspector
    };
    
    // Header Stats
    const elAssetCount = document.getElementById('asset-count');
    const elGlobalStatus = document.getElementById('global-status');
    const elMissionClock = document.getElementById('mission-clock');

    // --- MONITOR WIDGETS (Vista Monitor) ---
    // Generici
    const elGlobalTimer = document.getElementById('global-timer-display');
    const elScoreA = document.getElementById('score-a');
    const elScoreB = document.getElementById('score-b');
    const elMonitorTargetId = document.getElementById('monitoring-target-id');

    // Specifici Cerca e Distruggi (S&D)
    const elSdBombStatus = document.getElementById('sd-bomb-status');
    const elSdBombTimer = document.getElementById('sd-bomb-timer');
    const elSdArmBar = document.getElementById('sd-arm-bar');
    const elSdDefuseBar = document.getElementById('sd-defuse-bar');
    const elSdRulesList = document.getElementById('sd-rules-list');

    // --- INSPECTOR ELEMENTS (Vista Dettaglio Asset) ---
    const elInspTitle = document.getElementById('inspector-title');
    const elInspMode = document.getElementById('insp-mode');
    const elInspState = document.getElementById('insp-state');
    const elInspIp = document.getElementById('insp-ip');
    const elInspAliasInput = document.getElementById('insp-alias-input');
    const elInspFwVer = document.getElementById('insp-fw-ver');
    
    // --- STATO LOCALE ---
    let activeInspectorId = null; // ID del dispositivo che stiamo configurando
    let monitoredDeviceId = null; // ID del dispositivo che stiamo sorvegliando nel Monitor
    let currentDevices = [];      // Cache locale dei dispositivi attivi per la griglia

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

    // Aggiornamento Dispositivi
    socket.on('devices_update', (devices) => {
        currentDevices = devices; // Salviamo la cache
        updateDeviceList(devices);
        
        // Se siamo nella vista di selezione target, aggiorniamo la griglia in tempo reale
        if (!elViewSelectTarget.classList.contains('hidden')) {
            renderTargetSelection();
        }
    });

    // Eventi di Gioco (Telemetria)
    socket.on('esp_event', (msg) => {
        handleGameEvent(msg);
    });

    // --- FUNZIONI NAVIGAZIONE VISTE ---

    function showView(viewName) {
        // Nascondi tutto
        Object.values(views).forEach(el => {
            if(el) {
                el.classList.remove('active');
                el.classList.add('hidden');
            }
        });
        
        // Mostra target
        const target = views[viewName];
        if(target) {
            target.classList.remove('hidden');
            target.classList.add('active');
        }
        
        // Reset stati se torniamo all'Hub
        if(viewName === 'hub') {
            activeInspectorId = null;
            monitoredDeviceId = null; 
            document.querySelectorAll('.device-item').forEach(el => el.classList.remove('active'));
        }
    }

    // --- FUNZIONI UI SIDEBAR ---

    function updateDeviceList(devices) {
        elDeviceList.innerHTML = ''; 
        elAssetCount.textContent = devices.length;

        if (devices.length === 0) {
            elDeviceList.innerHTML = '<li class="placeholder-msg">SCANNING NETWORK...</li>';
            return;
        }

        devices.forEach(device => {
            const isOnline = device.status === 'ONLINE';
            const cssClass = isOnline ? 'status-online' : 'status-offline';
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
            
            if (device.id === activeInspectorId) {
                updateInspectorData(device);
            }
        });
    }

    // --- FUNZIONI UI TARGET SELECTION (Griglia) ---

    function renderTargetSelection() {
        const grid = document.getElementById('target-grid');
        grid.innerHTML = '';

        if (currentDevices.length === 0) {
            grid.innerHTML = '<p class="placeholder-text blink">NO ACTIVE SIGNALS DETECTED.</p>';
            return;
        }

        currentDevices.forEach(device => {
            const displayName = device.name || device.id;
            
            const card = document.createElement('div');
            card.className = 'target-card';
            card.innerHTML = `
                <div class="target-icon">🎯</div>
                <div class="target-name">${displayName}</div>
                <div class="target-ip">${device.ip}</div>
                <div class="target-status">${device.mode || 'IDLE'}</div>
            `;
            
            card.addEventListener('click', () => {
                // Imposta il target e vai al Monitor
                monitoredDeviceId = device.id;
                elMonitorTargetId.textContent = displayName;
                
                showView('monitor');
                logSystem(`LINKING TELEMETRY TO: ${displayName}`);
                
                // Pulisce la vecchia telemetria per evitare confusione
                resetMonitorData();
            });

            grid.appendChild(card);
        });
    }
    
    function resetMonitorData() {
        if(elSdBombTimer) elSdBombTimer.textContent = "00:00";
        if(elSdBombStatus) elSdBombStatus.textContent = "WAITING...";
        if(elSdBombStatus) elSdBombStatus.style.color = "#fff";
        if(elSdArmBar) elSdArmBar.style.width = "0%";
        if(elSdDefuseBar) elSdDefuseBar.style.width = "0%";
        if(elSdRulesList) elSdRulesList.innerHTML = '<li>WAITING FOR DATA...</li>';
    }

    // --- FUNZIONI UI INSPECTOR ---

    function openInspector(device) {
        activeInspectorId = device.id;
        
        const displayName = device.name || device.id;
        elInspTitle.textContent = `${displayName} // CONFIG`;
        elInspAliasInput.value = (device.name === device.id) ? "" : device.name;
        
        updateInspectorData(device);
        showView('inspector');
        
        logSystem(`ACCESSING ZGT NODE: ${device.id}`);
    }

    function updateInspectorData(device) {
        if(elInspMode) elInspMode.textContent = device.mode || 'N/A';
        if(elInspState) elInspState.textContent = device.status || 'UNKNOWN';
        if(elInspIp) elInspIp.textContent = device.ip || 'UNKNOWN';
        if(elInspFwVer) elInspFwVer.textContent = `FW_VER: ${device.version || '--'}`;
    }

    // --- GESTIONE BOTTONI DI NAVIGAZIONE ---

    // 1. Hub -> Setup
    const btnModeSetup = document.getElementById('btn-mode-setup');
    if(btnModeSetup) {
        btnModeSetup.addEventListener('click', () => {
            showView('setup');
        });
    }

    // 2. Hub -> Selezione Target -> Monitor
    const btnModeObserve = document.getElementById('btn-mode-observe');
    if(btnModeObserve) {
        btnModeObserve.addEventListener('click', () => {
            renderTargetSelection();
            showView('select-target');
        });
    }

    // 3. Bottoni Indietro (Back)
    document.querySelectorAll('.back-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            showView('hub');
        });
    });

    // 4. Chiudi Inspector
    document.querySelector('.close-inspector-btn').addEventListener('click', () => {
        showView('hub');
        logSystem("RETURNING TO HUB.");
    });

    // --- GESTIONE BOTTONI AZIONE ---

    // Salva Alias
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

    // Reset Hardware
    const btnHardReset = document.getElementById('hard-reset-btn');
    if(btnHardReset) {
        btnHardReset.addEventListener('click', () => {
            if(!activeInspectorId) return;
            if(confirm("CONFERMI RESET HARDWARE? L'asset andrà offline.")) {
                const resetPayload = { cmd: "RESET" };
                socket.emit('send_command', { 
                    target_id: activeInspectorId, 
                    command: resetPayload 
                });
                logSystem(`SENDING KILL SIGNAL TO ${activeInspectorId}...`);
            }
        });
    }

    // Scan Manuale
    const btnScan = document.getElementById('scan-btn');
    if(btnScan) {
        btnScan.addEventListener('click', () => {
            logSystem("INITIATING NETWORK SCAN...");
            elDeviceList.innerHTML = '<li class="placeholder-msg blink">SCANNING FREQUENCIES...</li>';
            
            btnScan.disabled = true;
            btnScan.style.opacity = "0.5";

            setTimeout(() => {
                socket.emit('request_manual_scan');
                btnScan.disabled = false;
                btnScan.style.opacity = "1";
                logSystem("SCAN COMPLETE.");
            }, 800); 
        });
    }

    // --- GESTIONE EVENTI DI GIOCO (IL CUORE DEL MONITOR) ---
    
    function handleGameEvent(msg) {
        const raw = msg.parsed_data || {};
        const senderId = raw.id;
        const type = raw.type;
        const payload = raw.payload || {};
        
        // FILTRO: Se stiamo monitorando uno specifico target, ignoriamo gli altri
        // Ma permettiamo l'aggiornamento se non stiamo monitorando nessuno (opzionale)
        if (monitoredDeviceId && senderId !== monitoredDeviceId) {
            return; 
        }

        // --- 1. CERCA E DISTRUGGI (SD_UPDATE) ---
        if (type === 'SD_UPDATE') {
            // Stato Bomba (Testo e Colore)
            if (payload.state) {
                elSdBombStatus.textContent = payload.state;
                if(payload.state === 'ARMED') elSdBombStatus.style.color = 'var(--sop-alert)';
                else if(payload.state === 'SAFE') elSdBombStatus.style.color = 'var(--sop-primary)';
                else elSdBombStatus.style.color = '#fff';
            }

            // Timer Bomba
            if (payload.bomb_time !== undefined) {
                const m = Math.floor(payload.bomb_time / 60);
                const s = payload.bomb_time % 60;
                elSdBombTimer.textContent = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
            } else if (payload.state === 'ARMED' || payload.state === 'ARMING...') {
                 // Se non c'è tempo ma è armata, lasciamo il valore precedente o --
            } else {
                 elSdBombTimer.textContent = "00:00";
            }

            // Barre Progresso
            if (payload.arm_prog !== undefined) elSdArmBar.style.width = `${payload.arm_prog}%`;
            if (payload.def_prog !== undefined) elSdDefuseBar.style.width = `${payload.def_prog}%`;
        }

        // --- 2. REGOLE (MODE_ENTER) ---
        if (type === 'MODE_ENTER') {
            // Se entra in S&D, popola la lista regole
            if (raw.payload.mode === 'SEARCH_AND_DESTROY') {
                renderRules(payload);
            }
        }

        // --- 3. TIMER GIOCO GLOBALE (Time Update) ---
        if (type === 'TIME_UPDATE') {
            if (payload.time_left !== undefined) {
                const m = Math.floor(payload.time_left / 60);
                const s = payload.time_left % 60;
                elGlobalTimer.textContent = `${m}:${s.toString().padStart(2, '0')}`;
            }
            if (payload.t1_poss !== undefined) elScoreA.textContent = payload.t1_poss;
            if (payload.t2_poss !== undefined) elScoreB.textContent = payload.t2_poss;
        }
        
        // Log sistema (Debug opzionale)
        // if (type) logSystem(`EVENT RX: ${type}`); 
    }

    // Helper: Renderizza la lista regole
    function renderRules(payload) {
        if(!elSdRulesList) return;
        elSdRulesList.innerHTML = '';
        
        const keysMap = {
            'bomb_time': 'TEMPO DETONAZIONE',
            'arm_time': 'TEMPO INNESCO',
            'defuse_time': 'TEMPO DISINNESCO',
            'game_duration': 'DURATA ROUND'
        };

        for (const [key, val] of Object.entries(payload)) {
            if (key === 'mode' || key === 'version') continue; 
            const label = keysMap[key] || key.toUpperCase();
            
            const li = document.createElement('li');
            li.innerHTML = `<span class="rule-key">${label}</span> <span class="rule-val">${val}s</span>`;
            elSdRulesList.appendChild(li);
        }
    }

    // Utility: Logger
    function logSystem(text) {
        const div = document.createElement('div');
        div.textContent = `> ${text}`;
        elMiniLog.prepend(div);
    }
    
    // Espone sendCommand per debug
    window.sendCommand = function(cmdObj) {
        if (!activeInspectorId) return console.warn("No active inspector");
        socket.emit('send_command', { target_id: activeInspectorId, command: cmdObj });
    };
});