document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    
    // --- RIFERIMENTI DOM (Elementi dell'interfaccia) ---
    
    // Liste e Log
    const elDeviceList = document.getElementById('device-list');
    const elMiniLog = document.getElementById('mini-log');
    
    // --- GESTIONE VISTE (Pannelli principali) ---
    const elViewHub = document.getElementById('view-hub');
    const elViewSetup = document.getElementById('view-setup');
    const elViewMonitor = document.getElementById('view-monitor'); // ex view-global
    const elViewInspector = document.getElementById('view-inspector');

    // Mappa delle viste per switching facile
    const views = {
        'hub': elViewHub,
        'setup': elViewSetup,
        'monitor': elViewMonitor,
        'inspector': elViewInspector
    };
    
    // Header Stats
    const elAssetCount = document.getElementById('asset-count');
    const elGlobalStatus = document.getElementById('global-status');
    const elMissionClock = document.getElementById('mission-clock');

    // Dashboard Widgets (Vista Monitor)
    const elGlobalTimer = document.getElementById('global-timer-display');
    const elScoreA = document.getElementById('score-a');
    const elScoreB = document.getElementById('score-b');

    // Inspector Elements (Vista Dettaglio Asset)
    const elInspTitle = document.getElementById('inspector-title');
    const elInspMode = document.getElementById('insp-mode');
    const elInspState = document.getElementById('insp-state');
    const elInspIp = document.getElementById('insp-ip');
    const elInspAliasInput = document.getElementById('insp-alias-input');
    const elInspFwVer = document.getElementById('insp-fw-ver');
    
    // Stato Locale dell'applicazione
    let activeInspectorId = null; // ID del dispositivo che stiamo guardando

    // --- FUNZIONE SWITCH VISTE ---
    function showView(viewName) {
        // Nascondi tutte le viste
        Object.values(views).forEach(el => {
            if(el) {
                el.classList.remove('active');
                el.classList.add('hidden');
            }
        });
        
        // Mostra quella richiesta
        const target = views[viewName];
        if(target) {
            target.classList.remove('hidden');
            target.classList.add('active');
        }
        
        // Se torniamo all'Hub, deselezioniamo la sidebar
        if(viewName === 'hub') {
            activeInspectorId = null;
            document.querySelectorAll('.device-item').forEach(el => el.classList.remove('active'));
        }
    }

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

    socket.on('devices_update', (devices) => {
        updateDeviceList(devices);
    });

    socket.on('esp_event', (msg) => {
        handleGameEvent(msg);
    });

    // --- FUNZIONI UI ---

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

    function openInspector(device) {
        activeInspectorId = device.id;
        
        const displayName = device.name || device.id;
        elInspTitle.textContent = `${displayName} // CONFIG`;
        
        elInspAliasInput.value = (device.name === device.id) ? "" : device.name;
        
        updateInspectorData(device);
        
        // Passa alla vista Inspector usando la funzione centralizzata
        showView('inspector');
        
        logSystem(`ACCESSING ZGT NODE: ${device.id}`);
    }

    function updateInspectorData(device) {
        if(elInspMode) elInspMode.textContent = device.mode || 'N/A';
        if(elInspState) elInspState.textContent = device.status || 'UNKNOWN';
        if(elInspIp) elInspIp.textContent = device.ip || 'UNKNOWN';
        if(elInspFwVer) elInspFwVer.textContent = `FW_VER: ${device.version || '--'}`;
    }

    // --- GESTIONE PULSANTI ---

    // 1. NAVIGAZIONE HUB -> SETUP / MONITOR
    const btnModeSetup = document.getElementById('btn-mode-setup');
    if(btnModeSetup) {
        btnModeSetup.addEventListener('click', () => {
            showView('setup');
            // logSystem("ACCESSING MISSION CONFIGURATION...");
        });
    }

    const btnModeObserve = document.getElementById('btn-mode-observe');
    if(btnModeObserve) {
        btnModeObserve.addEventListener('click', () => {
            showView('monitor');
            // logSystem("INITIALIZING TELEMETRY MONITOR...");
        });
    }

    // 2. Bottoni "Indietro" (Back) - Usati in Setup e Monitor
    document.querySelectorAll('.back-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            showView('hub');
        });
    });

    // 3. Chiudi Inspector
    document.querySelector('.close-inspector-btn').addEventListener('click', () => {
        showView('hub'); // Torna all'Hub
        logSystem("RETURNING TO HUB.");
    });

    // 4. Salva Alias
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

    // 5. Reset Hardware
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

    // 6. Bottone SCAN
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

    // --- EVENTI GIOCO ---
    function handleGameEvent(msg) {
        const raw = msg.parsed_data || {};
        const type = raw.type;
        const payload = raw.payload || {};
        
        if (type === 'TIME_UPDATE') {
            if (payload.time_left !== undefined) {
                const m = Math.floor(payload.time_left / 60);
                const s = payload.time_left % 60;
                elGlobalTimer.textContent = `${m}:${s.toString().padStart(2, '0')}`;
            }
            if (payload.t1_poss !== undefined) elScoreA.textContent = payload.t1_poss;
            if (payload.t2_poss !== undefined) elScoreB.textContent = payload.t2_poss;
        }
    }

    function logSystem(text) {
        const div = document.createElement('div');
        div.textContent = `> ${text}`;
        elMiniLog.prepend(div);
    }
    
    window.sendCommand = function(cmdObj) {
        if (!activeInspectorId) return console.warn("No active inspector");
        socket.emit('send_command', { target_id: activeInspectorId, command: cmdObj });
    };
});