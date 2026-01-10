document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    
    // --- RIFERIMENTI DOM ---
    const elDeviceList = document.getElementById('device-list');
    const elMiniLog = document.getElementById('mini-log');
    
    // Viste
    const elViewHub = document.getElementById('view-hub');
    const elViewSetup = document.getElementById('view-setup');
    const elViewSelectTarget = document.getElementById('view-select-target'); // NUOVA VISTA
    const elViewMonitor = document.getElementById('view-monitor'); 
    const elViewInspector = document.getElementById('view-inspector');

    const views = {
        'hub': elViewHub,
        'setup': elViewSetup,
        'select-target': elViewSelectTarget,
        'monitor': elViewMonitor,
        'inspector': elViewInspector
    };
    
    // Elementi Monitor
    const elGlobalTimer = document.getElementById('global-timer-display');
    const elScoreA = document.getElementById('score-a');
    const elScoreB = document.getElementById('score-b');
    const elMonitorTargetId = document.getElementById('monitoring-target-id');

    // Elementi Inspector
    const elInspTitle = document.getElementById('inspector-title');
    const elInspMode = document.getElementById('insp-mode');
    const elInspState = document.getElementById('insp-state');
    const elInspIp = document.getElementById('insp-ip');
    const elInspAliasInput = document.getElementById('insp-alias-input');
    const elInspFwVer = document.getElementById('insp-fw-ver');
    
    // Header Stats
    const elAssetCount = document.getElementById('asset-count');
    const elGlobalStatus = document.getElementById('global-status');
    const elMissionClock = document.getElementById('mission-clock');

    // --- STATO LOCALE ---
    let activeInspectorId = null; 
    let monitoredDeviceId = null; // ID del dispositivo che stiamo sorvegliando nel Monitor
    let currentDevices = [];      // Cache locale dei dispositivi attivi

    // --- FUNZIONE SWITCH VISTE ---
    function showView(viewName) {
        Object.values(views).forEach(el => {
            if(el) { el.classList.remove('active'); el.classList.add('hidden'); }
        });
        const target = views[viewName];
        if(target) { target.classList.remove('hidden'); target.classList.add('active'); }
        
        if(viewName === 'hub') {
            activeInspectorId = null;
            monitoredDeviceId = null; // Reset sorveglianza quando si torna alla Home
            document.querySelectorAll('.device-item').forEach(el => el.classList.remove('active'));
        }
    }

    // --- OROLOGIO ---
    setInterval(() => {
        const now = new Date();
        elMissionClock.textContent = now.toLocaleTimeString('it-IT', { hour12: false });
    }, 1000);

    // --- SOCKET EVENTS ---
    socket.on('connect', () => {
        logSystem("LINK ESTABLISHED.");
        elGlobalStatus.textContent = "ONLINE";
        elGlobalStatus.className = "status-value status-normal";
    });

    socket.on('disconnect', () => {
        logSystem("CONNECTION LOST.");
        elGlobalStatus.textContent = "OFFLINE";
        elGlobalStatus.className = "status-value status-alert";
    });

    socket.on('devices_update', (devices) => {
        currentDevices = devices; // Salviamo la lista per usarla nella selezione target
        updateDeviceList(devices);
        
        // Se siamo nella schermata di selezione target, aggiorniamola in tempo reale
        if (!elViewSelectTarget.classList.contains('hidden')) {
            renderTargetSelection();
        }
    });

    socket.on('esp_event', (msg) => {
        handleGameEvent(msg);
    });

    // --- LOGICA UI ---

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
            li.addEventListener('click', () => { openInspector(device); });
            elDeviceList.appendChild(li);
            
            if (device.id === activeInspectorId) updateInspectorData(device);
        });
    }

    // --- NUOVA LOGICA SELEZIONE TARGET ---
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
                // AVVIA SORVEGLIANZA SU QUESTO ID
                monitoredDeviceId = device.id;
                elMonitorTargetId.textContent = displayName;
                
                showView('monitor');
                logSystem(`LINKING TELEMETRY TO: ${displayName}`);
            });

            grid.appendChild(card);
        });
    }

    // --- GESTIONE VISTE E BOTTONI ---

    // 1. Hub -> Setup
    document.getElementById('btn-mode-setup').addEventListener('click', () => {
        showView('setup');
    });

    // 2. Hub -> Selezione Target (MODIFICATO)
    document.getElementById('btn-mode-observe').addEventListener('click', () => {
        renderTargetSelection(); // Genera la griglia
        showView('select-target');
    });

    // 3. Back Buttons
    document.querySelectorAll('.back-btn').forEach(btn => {
        btn.addEventListener('click', () => { showView('hub'); });
    });

    // 4. Inspector Logic
    function openInspector(device) {
        activeInspectorId = device.id;
        const displayName = device.name || device.id;
        elInspTitle.textContent = `${displayName} // CONFIG`;
        elInspAliasInput.value = (device.name === device.id) ? "" : device.name;
        updateInspectorData(device);
        showView('inspector');
    }

    function updateInspectorData(device) {
        if(elInspMode) elInspMode.textContent = device.mode || 'N/A';
        if(elInspState) elInspState.textContent = device.status || 'UNKNOWN';
        if(elInspIp) elInspIp.textContent = device.ip || 'UNKNOWN';
        if(elInspFwVer) elInspFwVer.textContent = `FW_VER: ${device.version || '--'}`;
    }

    document.querySelector('.close-inspector-btn').addEventListener('click', () => {
        showView('hub');
    });

    // 5. Utility Buttons (Rename, Reset, Scan) - (Codice invariato)
    const btnSaveAlias = document.getElementById('save-alias-btn');
    if(btnSaveAlias) {
        btnSaveAlias.addEventListener('click', () => {
            if(!activeInspectorId) return;
            const newName = elInspAliasInput.value.trim();
            if(newName) {
                socket.emit('rename_device', { id: activeInspectorId, name: newName });
            }
        });
    }

    const btnHardReset = document.getElementById('hard-reset-btn');
    if(btnHardReset) {
        btnHardReset.addEventListener('click', () => {
            if(!activeInspectorId) return;
            if(confirm("CONFERMI RESET HARDWARE?")) {
                socket.emit('send_command', { target_id: activeInspectorId, command: { cmd: "RESET" } });
                logSystem(`SENDING KILL SIGNAL...`);
            }
        });
    }

    const btnScan = document.getElementById('scan-btn');
    if(btnScan) {
        btnScan.addEventListener('click', () => {
            logSystem("SCANNING...");
            elDeviceList.innerHTML = '<li class="placeholder-msg blink">SCANNING...</li>';
            socket.emit('request_manual_scan');
        });
    }

    // --- HANDLING EVENTI DI GIOCO ---
    function handleGameEvent(msg) {
        const raw = msg.parsed_data || {};
        const senderId = raw.id;
        const type = raw.type;
        const payload = raw.payload || {};
        
        // FILTRO CRITICO: Aggiorna la dashboard SOLO se l'evento arriva dal dispositivo sorvegliato
        if (monitoredDeviceId && senderId !== monitoredDeviceId) {
            return; // Ignora eventi di altri dispositivi
        }

        // Se siamo nel monitor, aggiorniamo i widget
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
});