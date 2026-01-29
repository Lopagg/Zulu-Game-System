document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    
    // --- RIFERIMENTI DOM ---
    const elDeviceList = document.getElementById('device-list');
    const elMiniLog = document.getElementById('mini-log');
    
    // Viste
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
    
    // Header
    const elAssetCount = document.getElementById('asset-count');
    const elGlobalStatus = document.getElementById('global-status');
    const elMissionClock = document.getElementById('mission-clock');

    // --- MONITOR WIDGETS ---
    const elWidgetSdTactical = document.getElementById('widget-sd-tactical');
    const elWidgetSdRules = document.getElementById('widget-sd-rules');
    const elWidgetGenericMap = document.getElementById('widget-generic-map');

    const elGlobalTimer = document.getElementById('global-timer-display');
    const elScoreA = document.getElementById('score-a');
    const elScoreB = document.getElementById('score-b');
    const elMonitorTargetId = document.getElementById('monitoring-target-id');

    // Specifici S&D e Dominio
    const elSdBombStatus = document.getElementById('sd-bomb-status');
    const elSdBombTimer = document.getElementById('sd-bomb-timer');
    const elBombContainer = document.querySelector('.bomb-timer-container'); // Contenitore Timer
    const elDomScores = document.getElementById('domination-scores');       // Contenitore Punteggi
    
    const elTacticalTitle = document.getElementById('tactical-panel-title');
    
    const elSdArmBar = document.getElementById('sd-arm-bar');
    const elSdDefuseBar = document.getElementById('sd-defuse-bar');
    const elSdRulesList = document.getElementById('sd-rules-list');

    const elLblProg1 = document.getElementById('lbl-prog-1');
    const elLblProg2 = document.getElementById('lbl-prog-2');

    // Inspector
    const elInspTitle = document.getElementById('inspector-title');
    const elInspMode = document.getElementById('insp-mode');
    const elInspState = document.getElementById('insp-state');
    const elInspIp = document.getElementById('insp-ip');
    const elInspAliasInput = document.getElementById('insp-alias-input');
    const elInspFwVer = document.getElementById('insp-fw-ver');
    
    // Stato Locale
    let activeInspectorId = null;
    let monitoredDeviceId = null;
    let currentDevices = [];

    // Orologio Locale
    setInterval(() => {
        const now = new Date();
        elMissionClock.textContent = now.toLocaleTimeString('it-IT', { hour12: false });
    }, 1000);

    // --- SOCKET IO ---
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
        currentDevices = devices;
        updateDeviceList(devices);
        
        if (!elViewSelectTarget.classList.contains('hidden')) {
            renderTargetSelection();
        }

        if (monitoredDeviceId) {
            const dev = devices.find(d => d.id === monitoredDeviceId);
            if (dev && dev.mode) {
                // Aggiorna il layout se la modalità cambia "live"
                updateMonitorLayout(dev.mode);
            }
        }
    });

    socket.on('esp_event', (msg) => {
        handleGameEvent(msg);
    });

    // --- NAVIGAZIONE ---
    function showView(viewName) {
        Object.values(views).forEach(el => {
            if(el) {
                el.classList.remove('active');
                el.classList.add('hidden');
            }
        });
        const target = views[viewName];
        if(target) {
            target.classList.remove('hidden');
            target.classList.add('active');
        }
        if(viewName === 'hub') {
            activeInspectorId = null;
            monitoredDeviceId = null; 
            document.querySelectorAll('.device-item').forEach(el => el.classList.remove('active'));
        }
    }

    // --- SIDEBAR ---
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
            li.addEventListener('click', () => openInspector(device));
            elDeviceList.appendChild(li);
            
            if (device.id === activeInspectorId) {
                updateInspectorData(device);
            }
        });
    }

    // --- TARGET SELECTION ---
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
                monitoredDeviceId = device.id;
                elMonitorTargetId.textContent = displayName;
                
                // 1. Reset Dati (Pulizia valori vecchi)
                resetMonitorData(); 
                
                // 2. Imposta Layout Corretto (IMPORTANTE: Dopo il reset!)
                updateMonitorLayout(device.mode);
                
                showView('monitor');
                logSystem(`LINKING TELEMETRY TO: ${displayName}`);

                // Richiedi stato aggiornato
                socket.emit('send_command', { 
                    target_id: device.id, 
                    command: { cmd: "GET_STATUS" } 
                });
            });
            grid.appendChild(card);
        });
    }
    
    // --- GESTIONE LAYOUT INTELLIGENTE ---
    function updateMonitorLayout(mode) {
        if (!mode) return;

        // Riferimenti alle etichette delle barre
        const lbl1 = document.getElementById('lbl-prog-1');
        const lbl2 = document.getElementById('lbl-prog-2');

        if (mode === 'SEARCH_AND_DESTROY' || mode === 'DOMINATION') {
            elWidgetSdTactical.classList.remove('hidden');
            elWidgetSdRules.classList.remove('hidden');
            elWidgetGenericMap.classList.add('hidden');
            
            // --- CONFIGURAZIONE SPECIFICA ---
            if (mode === 'SEARCH_AND_DESTROY') {
                if(elTacticalTitle) elTacticalTitle.textContent = "TACTICAL FEED // BOMB STATUS";
                if(elBombContainer) elBombContainer.classList.remove('hidden'); 
                if(elDomScores) elDomScores.classList.add('hidden');
                
                // TESTI PER S&D
                if(lbl1) lbl1.textContent = "ARMING PROGRESS";
                if(lbl2) lbl2.textContent = "DEFUSING PROGRESS";
            } 
            else if (mode === 'DOMINATION') {
                if(elTacticalTitle) elTacticalTitle.textContent = "TACTICAL FEED // ZONE CONTROL";
                if(elBombContainer) elBombContainer.classList.add('hidden');    
                if(elDomScores) elDomScores.classList.remove('hidden');
                
                // TESTI PER DOMINIO
                if(lbl1) lbl1.textContent = "ALPHA ACTION";
                if(lbl2) lbl2.textContent = "BRAVO ACTION";
            }

            // Reset barre solo al cambio layout
            if(elSdArmBar) elSdArmBar.style.width = "0%";
            if(elSdDefuseBar) elSdDefuseBar.style.width = "0%";

        } else {
            elWidgetSdTactical.classList.add('hidden');
            elWidgetSdRules.classList.add('hidden');
            elWidgetGenericMap.classList.remove('hidden');
        }
    }

    function resetMonitorData() {
        // Reset Timer Tattico
        if(elSdBombTimer) elSdBombTimer.textContent = "00:00";
        if(elSdBombStatus) elSdBombStatus.textContent = "WAITING...";
        if(elSdBombStatus) elSdBombStatus.style.color = "#fff";
        
        // Reset Punteggi Dominio
        const elDomValA = document.getElementById('d-val-a');
        const elDomValB = document.getElementById('d-val-b');
        if(elDomValA) elDomValA.textContent = "0";
        if(elDomValB) elDomValB.textContent = "0";

        // Reset Barre
        if(elSdArmBar) elSdArmBar.style.width = "0%";
        if(elSdDefuseBar) elSdDefuseBar.style.width = "0%";
        if(elSdRulesList) elSdRulesList.innerHTML = '<li>WAITING FOR TELEMETRY...</li>';

        // --- NUOVO: Reset Globale (Timer principale e Punteggi Operatori) ---
        if(elGlobalTimer) elGlobalTimer.textContent = "--:--";
        if(elScoreA) elScoreA.textContent = "0";
        if(elScoreB) elScoreB.textContent = "0";
    }

    // --- INSPECTOR ---
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

    // --- PULSANTI ---
    const btnModeSetup = document.getElementById('btn-mode-setup');
    if(btnModeSetup) btnModeSetup.addEventListener('click', () => showView('setup'));

    const btnModeObserve = document.getElementById('btn-mode-observe');
    if(btnModeObserve) btnModeObserve.addEventListener('click', () => { renderTargetSelection(); showView('select-target'); });

    document.querySelectorAll('.back-btn').forEach(btn => btn.addEventListener('click', () => showView('hub')));
    document.querySelector('.close-inspector-btn').addEventListener('click', () => { showView('hub'); logSystem("RETURNING TO HUB."); });

    const btnSaveAlias = document.getElementById('save-alias-btn');
    if(btnSaveAlias) btnSaveAlias.addEventListener('click', () => {
        if(!activeInspectorId) return;
        const newName = elInspAliasInput.value.trim();
        if(newName) {
            socket.emit('rename_device', { id: activeInspectorId, name: newName });
            logSystem(`ALIAS UPDATE REQUEST: ${newName}`);
        }
    });

    const btnHardReset = document.getElementById('hard-reset-btn');
    if(btnHardReset) btnHardReset.addEventListener('click', () => {
        if(!activeInspectorId) return;
        if(confirm("CONFERMI RESET HARDWARE?")) {
            socket.emit('send_command', { target_id: activeInspectorId, command: { cmd: "RESET" } });
            logSystem(`SENDING KILL SIGNAL...`);
        }
    });

    const btnForceEnd = document.getElementById('btn-force-end');
    if(btnForceEnd) btnForceEnd.addEventListener('click', () => {
        if(!monitoredDeviceId) { alert("Nessun dispositivo selezionato."); return; }
        if(confirm("ATTENZIONE: Terminare forzatamente la partita?")) {
            socket.emit('send_command', { target_id: monitoredDeviceId, command: { cmd: "FORCE_END_GAME" } });
            logSystem(`SENDING TERMINATION SIGNAL...`);
        }
    });

    const btnScan = document.getElementById('scan-btn');
    if(btnScan) btnScan.addEventListener('click', () => {
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

    // --- GESTIONE TELEMETRIA ---
    function handleGameEvent(msg) {
        const raw = msg.parsed_data || {};
        const senderId = raw.id || 'UNK';
        const type = raw.type || 'UNKNOWN';
        const payload = raw.payload || {};
        const shortId = senderId.slice(-4);

        if (type !== 'TIME_UPDATE' && type !== 'SD_UPDATE' && type !== 'DOM_UPDATE') {
            logSystem(`[${shortId}] ${type}`);
        }

        // Timer Globale (aggiornato da TIME_UPDATE o dai pacchetti specifici se TIME_UPDATE manca)
        if (type === 'TIME_UPDATE') {
            if (payload.time_left !== undefined && elGlobalTimer) {
                const m = Math.floor(payload.time_left / 60);
                const s = payload.time_left % 60;
                elGlobalTimer.textContent = `${m}:${s.toString().padStart(2, '0')}`;
            }
            if (payload.t1_poss !== undefined && elScoreA) elScoreA.textContent = payload.t1_poss;
            if (payload.t2_poss !== undefined && elScoreB) elScoreB.textContent = payload.t2_poss;
        }

        if (monitoredDeviceId && senderId === monitoredDeviceId) {
            
            // Rilevamento automatico modalità
            let mode = payload.mode || (type === 'SD_UPDATE' ? 'SEARCH_AND_DESTROY' : (type === 'DOM_UPDATE' ? 'DOMINATION' : null));
            if (mode === 'SEARCH_DESTROY') mode = 'SEARCH_AND_DESTROY';

            // Eventi di sistema
            if (type === 'MODE_EXIT') {
                resetMonitorData();
                updateMonitorLayout(null);
                logSystem(`MODE EXIT DETECTED.`);
            }
            if (type === 'MODE_ENTER') {
                resetMonitorData();
                updateMonitorLayout(mode);
                if(elGlobalTimer) elGlobalTimer.textContent = "--:--"; // Reset visivo timer
                logSystem(`MODE ENTER: ${mode}`);
            }
            if (type === 'COUNTDOWN_UPDATE') {
                if (payload.time !== undefined && elGlobalTimer) {
                    elGlobalTimer.textContent = `T-${payload.time}`;
                    elGlobalTimer.style.color = '#ff9900'; 
                }
                // Reset visivo punteggi mentre contiamo
                if(elDomValA) elDomValA.textContent = "0";
                if(elDomValB) elDomValB.textContent = "0";
                if(elScoreA) elScoreA.textContent = "0";
                if(elScoreB) elScoreB.textContent = "0";
                
                if(elSdBombStatus) {
                    elSdBombStatus.textContent = "PREPARING";
                    elSdBombStatus.style.color = "#ff9900"; 
                }
            }

            // Aggiornamento Layout dinamico
            if (mode && (type === 'HEARTBEAT' || type === 'MODE_ENTER' || type === 'SD_UPDATE' || type === 'DOM_UPDATE' || type === 'SETTINGS_UPDATE')) {
                updateMonitorLayout(mode);
            }
            
            // Aggiornamento Regole
            if (type === 'SETTINGS_UPDATE' || (type === 'MODE_ENTER' && payload.bomb_time)) {
                renderRules(payload);
            }

            // --- GESTIONE UNIFICATA BARRE E STATO ---
            // Usiamo una logica comune per evitare duplicazioni e errori
            if (type === 'SD_UPDATE' || type === 'DOM_UPDATE') {
                
                const isDom = (type === 'DOM_UPDATE');
                
                // 1. Visibilità Elementi (Ridondanza di sicurezza)
                if (isDom) {
                    if (elBombContainer) elBombContainer.classList.add('hidden');
                    if (elDomScores) elDomScores.classList.remove('hidden');
                } else {
                    if (elBombContainer) elBombContainer.classList.remove('hidden');
                    if (elDomScores) elDomScores.classList.add('hidden');
                    if (elSdBombTimer) elSdBombTimer.style.color = 'var(--sop-alert)';
                }

                // 2. Stato Testuale
                if (payload.state && elSdBombStatus) {
                    elSdBombStatus.textContent = payload.state;
                    const s = payload.state;
                    if (s.includes('ARM') || s.includes('EXPLODED') || s.includes('T WINS') || s.includes('ALPHA')) 
                        elSdBombStatus.style.color = 'var(--sop-alert)'; 
                    else if (s.includes('DEFUS') || s.includes('CT WINS') || s.includes('BRAVO')) 
                        elSdBombStatus.style.color = '#55ff55'; 
                    else if (s === 'STANDBY') 
                        elSdBombStatus.style.color = '#ff9900';
                    else 
                        elSdBombStatus.style.color = 'var(--sop-primary)';
                }

                // 3. Dati Specifici (Timer Bomba o Punteggi)
                if (!isDom && payload.bomb_time !== undefined && elSdBombTimer) {
                    const m = Math.floor(payload.bomb_time / 60);
                    const s = payload.bomb_time % 60;
                    elSdBombTimer.textContent = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
                }
                
                if (isDom) {
                    const elDomValA = document.getElementById('d-val-a');
                    const elDomValB = document.getElementById('d-val-b');
                    if (payload.score_a !== undefined && elDomValA) elDomValA.textContent = payload.score_a;
                    if (payload.score_b !== undefined && elDomValB) elDomValB.textContent = payload.score_b;
                }

                // 4. Timer Globale (Protezione durante countdown)
                if (payload.game_time && elGlobalTimer && payload.state !== 'STANDBY') {
                    const m = Math.floor(payload.game_time / 60);
                    const s = payload.game_time % 60;
                    elGlobalTimer.textContent = `${m}:${s.toString().padStart(2, '0')}`;
                    elGlobalTimer.style.color = 'var(--sop-text)';
                }

                // 5. BARRE DI PROGRESSO (FIX RIMBALZO)
                // Aggiorniamo la barra SOLO se il dato è presente nel pacchetto.
                // Se è undefined, lasciamo la barra dov'è (evita il ritorno a 0).

                if (!isDom) {
                    // --- SEARCH & DESTROY ---
                    if (payload.arm_prog !== undefined && elSdArmBar) {
                        elSdArmBar.style.width = `${payload.arm_prog}%`;
                    }
                    if (payload.def_prog !== undefined && elSdDefuseBar) {
                        elSdDefuseBar.style.width = `${payload.def_prog}%`;
                    }
                } else {
                    // --- DOMINATION ---
                    // Controlla anche qui che capture_prog esista
                    if (payload.capture_prog !== undefined) {
                        const prog = payload.capture_prog;
                        
                        if (payload.state.includes('CAPTURING A')) {
                            if(elSdArmBar) elSdArmBar.style.width = `${prog}%`;
                            if(elSdDefuseBar) elSdDefuseBar.style.width = "0%";
                        } 
                        else if (payload.state.includes('CAPTURING B')) {
                            if(elSdArmBar) elSdArmBar.style.width = "0%";
                            if(elSdDefuseBar) elSdDefuseBar.style.width = `${prog}%`;
                        } 
                        else {
                            // Se nessuno cattura, resetta a 0
                            if(elSdArmBar) elSdArmBar.style.width = "0%";
                            if(elSdDefuseBar) elSdDefuseBar.style.width = "0%";
                        }
                    }
                }
                updateForceEndButton(payload.state);
            }
        }
    }

    function updateForceEndButton(state) {
        const btnForceEnd = document.getElementById('btn-force-end');
        if (btnForceEnd) {
            const footer = btnForceEnd.parentElement;
            const activeStates = ['SAFE', 'ARMING...', 'ARMED', 'DEFUSING...', 'NEUTRAL', 'OWNED ALPHA', 'OWNED BRAVO', 'CAPTURING A...', 'CAPTURING B...'];
            if (activeStates.includes(state)) footer.classList.remove('hidden');
            else footer.classList.add('hidden');
        }
    }

    function renderRules(payload) {
        if(!elSdRulesList) return;
        elSdRulesList.innerHTML = '';
        const keysMap = { 'bomb_time': 'TIMER BOMBA (Min)', 'arm_time': 'TEMPO INNESCO (Sec)', 'defuse_time': 'TEMPO DISINNESCO (Sec)', 'game_duration': 'DURATA ROUND (Min)', 'capture_time': 'TEMPO CATTURA (Sec)', 'countdown': 'START DELAY (Sec)' };

        for (const [key, val] of Object.entries(payload)) {
            if (key === 'mode' || key === 'version' || key === 'type') continue; 
            let displayVal = val;
            if(val === true || val === 'YES') displayVal = 'SÌ';
            if(val === false || val === 'NO') displayVal = 'NO';
            const label = keysMap[key] || key.toUpperCase().replace('_', ' ');
            const li = document.createElement('li');
            li.innerHTML = `<span class="rule-key">${label}</span> <span class="rule-val">${displayVal}</span>`;
            elSdRulesList.appendChild(li);
        }
    }

    function logSystem(text) {
        const div = document.createElement('div');
        div.textContent = `> ${text}`;
        elMiniLog.prepend(div);
    }
    
    // Debug
    window.sendCommand = function(cmdObj) {
        if (!activeInspectorId) return console.warn("No active inspector");
        socket.emit('send_command', { target_id: activeInspectorId, command: cmdObj });
    };
});