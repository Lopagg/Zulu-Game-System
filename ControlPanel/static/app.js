document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    
    const elDeviceList = document.getElementById('device-list');
    const elMiniLog = document.getElementById('mini-log');
    
    const views = {
        'hub': document.getElementById('view-hub'),
        'select-target': document.getElementById('view-select-target'),
        'setup': document.getElementById('view-setup'),
        'monitor': document.getElementById('view-monitor'),
        'inspector': document.getElementById('view-inspector'),
        'arena-menu': document.getElementById('view-arena-menu'),
        'arena-manage': document.getElementById('view-arena-manage'),
        'arena-tracking': document.getElementById('view-arena-tracking'),
        'arena-db': document.getElementById('view-arena-db')
    };
    
    window.showView = function(viewName) {
        Object.values(views).forEach(el => {
            if(el) { el.classList.remove('active'); el.classList.add('hidden'); }
        });
        const target = views[viewName];
        if(target) { target.classList.remove('hidden'); target.classList.add('active'); }
        
        if(viewName === 'hub') {
            activeInspectorId = null;
            monitoredDeviceId = null; 
            lastConfiguredMode = null;
            document.querySelectorAll('.device-item').forEach(el => el.classList.remove('active'));
        }
    };

    const elAssetCount = document.getElementById('asset-count');
    const elGlobalStatus = document.getElementById('global-status');
    const elMissionClock = document.getElementById('mission-clock');

    const elWidgetSdTactical = document.getElementById('widget-sd-tactical');
    const elWidgetSdRules = document.getElementById('widget-sd-rules');
    const elWidgetGenericMap = document.getElementById('widget-generic-map');

    const elGlobalTimer = document.getElementById('global-timer-display');
    const elScoreA = document.getElementById('score-a');
    const elScoreB = document.getElementById('score-b');
    const elMonitorTargetId = document.getElementById('monitoring-target-id');

    const elSdBombStatus = document.getElementById('sd-bomb-status');
    const elSdBombTimer = document.getElementById('sd-bomb-timer');
    const elBombContainer = document.querySelector('.bomb-timer-container');
    const elDomScores = document.getElementById('domination-scores');
    const elDomValA = document.getElementById('d-val-a');
    const elDomValB = document.getElementById('d-val-b');
    
    const elTacticalTitle = document.getElementById('tactical-panel-title');
    const elSdArmBar = document.getElementById('sd-arm-bar');
    const elSdDefuseBar = document.getElementById('sd-defuse-bar');
    const elSdRulesList = document.getElementById('sd-rules-list');

    const elInspTitle = document.getElementById('inspector-title');
    const elInspMode = document.getElementById('insp-mode');
    const elInspState = document.getElementById('insp-state');
    const elInspIp = document.getElementById('insp-ip');
    const elInspAliasInput = document.getElementById('insp-alias-input');
    const elInspFwVer = document.getElementById('insp-fw-ver');
    
    let activeInspectorId = null;
    let monitoredDeviceId = null;
    let currentDevices = [];
    let lastConfiguredMode = null; 
    let arenaRoster = {}; 

    let debounceTimer1 = null;
    let debounceTimer2 = null;

    setInterval(() => {
        const now = new Date();
        elMissionClock.textContent = now.toLocaleTimeString('it-IT', { hour12: false });
    }, 1000);

    socket.on('connect', () => {
        logSystem("LINK ESTABLISHED WITH SOP SERVER.");
        elGlobalStatus.textContent = "ONLINE";
        elGlobalStatus.classList.remove('status-alert');
        elGlobalStatus.classList.add('status-normal');
        socket.emit('request_roster');
    });

    socket.on('disconnect', () => {
        logSystem("CONNECTION LOST - RETRYING...");
        elGlobalStatus.textContent = "OFFLINE";
        elGlobalStatus.classList.remove('status-normal');
        elGlobalStatus.classList.add('status-alert');
    });

    socket.on('roster_update', (rosterData) => {
        arenaRoster = rosterData;
        renderArenaRoster();
    });

    // --- RICEZIONE AGGIORNAMENTI DATABASE STORICO ---
    socket.on('database_update', (players) => {
        const dbList = document.getElementById('db-list');
        const dbCount = document.getElementById('db-total-count');
        if(!dbList) return;

        dbList.innerHTML = '';
        if(dbCount) dbCount.textContent = players.length;

        if(players.length === 0) {
            dbList.innerHTML = '<li class="placeholder-text" style="color:var(--sop-dim); text-align:center; margin-top:20px;">NESSUN OPERATORE IN ARCHIVIO</li>';
            return;
        }

        players.forEach(player => {
            const li = document.createElement('li');
            li.className = 'roster-item';

            const nameSpan = document.createElement('span');
            nameSpan.textContent = `${player.alias} (UID: ${player.uid})`;
            nameSpan.style.fontWeight = 'bold';
            nameSpan.style.fontSize = '20px';

            const controlsDiv = document.createElement('div');
            controlsDiv.style.fontSize = '18px';
            controlsDiv.style.fontFamily = 'monospace';

            const btnRename = document.createElement('span');
            btnRename.textContent = '[REN]';
            btnRename.className = 'action-btn';
            btnRename.style.color = 'var(--sop-primary)';
            btnRename.onclick = () => {
                const newName = prompt("Inserisci nuovo nome operatore:", player.alias);
                if (newName && newName.trim() !== '') {
                    socket.emit('update_db_player', { uid: player.uid, action: 'rename', value: newName.trim().toUpperCase() });
                }
            };

            const btnDel = document.createElement('span');
            btnDel.textContent = '[DEL]';
            btnDel.className = 'action-btn';
            btnDel.style.color = 'var(--sop-alert)';
            btnDel.onclick = () => {
                if(confirm(`ELIMINARE PERMANENTEMENTE ${player.alias} DAL DATABASE? L'azione è irreversibile.`)) {
                    socket.emit('update_db_player', { uid: player.uid, action: 'delete' });
                }
            };

            controlsDiv.appendChild(btnRename);
            controlsDiv.appendChild(btnDel);

            li.appendChild(nameSpan);
            li.appendChild(controlsDiv);

            dbList.appendChild(li);
        });
    });

    socket.on('devices_update', (devices) => {
        currentDevices = devices;
        updateDeviceList(devices);
        
        if (!views['select-target'].classList.contains('hidden')) {
            renderTargetSelection();
        }
        updateSetupDropdown();

        if (monitoredDeviceId) {
            const dev = devices.find(d => d.id === monitoredDeviceId);
            if (dev && dev.mode) updateMonitorLayout(dev.mode);
        }
    });

    socket.on('esp_event', (msg) => {
        handleGameEvent(msg);
    });

    function renderArenaRoster() {
        const listAlphaManage = document.getElementById('roster-alpha-manage');
        const listBravoManage = document.getElementById('roster-bravo-manage');
        const listAlphaIn = document.getElementById('track-alpha-in');
        const listAlphaOut = document.getElementById('track-alpha-out');
        const listBravoIn = document.getElementById('track-bravo-in');
        const listBravoOut = document.getElementById('track-bravo-out');
        
        if(!listAlphaManage || !listAlphaIn) return;
        
        [listAlphaManage, listBravoManage, listAlphaIn, listAlphaOut, listBravoIn, listBravoOut].forEach(el => el.innerHTML = '');
        
        let alphaCount = 0, bravoCount = 0, inFieldCount = 0;
        let alphaInCount = 0, alphaOutCount = 0;
        let bravoInCount = 0, bravoOutCount = 0;
        
        Object.values(arenaRoster).forEach(player => {
            const isAlpha = player.team === 'ALPHA';
            const isInField = player.status === 'IN';
            
            if(isAlpha) alphaCount++; else bravoCount++;
            if(isInField) {
                inFieldCount++;
                if(isAlpha) alphaInCount++; else bravoInCount++;
            } else {
                if(isAlpha) alphaOutCount++; else bravoOutCount++;
            }

            // 1. SCHERMATA MANAGEMENT
            const liManage = document.createElement('li');
            liManage.className = 'roster-item'; 
            
            const nameSpanMng = document.createElement('span');
            nameSpanMng.textContent = player.name;
            nameSpanMng.style.fontWeight = 'bold';
            nameSpanMng.style.fontSize = '20px'; 
            
            const controlsMng = document.createElement('div');
            controlsMng.style.fontSize = '18px'; 
            controlsMng.style.fontFamily = 'monospace';
            
            const btnRename = document.createElement('span');
            btnRename.textContent = '[REN]';
            btnRename.className = 'action-btn';
            btnRename.style.color = 'var(--sop-primary)';
            btnRename.onclick = () => {
                const newName = prompt("Inserisci nuovo nome operatore:", player.name);
                if (newName && newName.trim() !== '') {
                    socket.emit('update_operator', { uid: player.uid, action: 'rename', value: newName.trim().toUpperCase() });
                }
            };
            
            const btnSwap = document.createElement('span');
            btnSwap.textContent = '[SWAP]';
            btnSwap.className = 'action-btn';
            btnSwap.style.color = 'var(--sop-secondary)';
            btnSwap.onclick = () => {
                socket.emit('update_operator', { uid: player.uid, action: 'swap' });
            };
            
            const btnDel = document.createElement('span');
            btnDel.textContent = '[DEL]';
            btnDel.className = 'action-btn';
            btnDel.style.color = 'var(--sop-alert)';
            btnDel.onclick = () => {
                if(confirm(`Rimuovere l'operatore ${player.name} dal roster attivo? (Le statistiche rimarranno in memoria)`)) {
                    socket.emit('update_operator', { uid: player.uid, action: 'delete' });
                }
            };
            
            controlsMng.appendChild(btnRename);
            controlsMng.appendChild(btnSwap);
            controlsMng.appendChild(btnDel);
            liManage.appendChild(nameSpanMng);
            liManage.appendChild(controlsMng);
            
            if(isAlpha) listAlphaManage.appendChild(liManage);
            else listBravoManage.appendChild(liManage);


            // 2. SCHERMATA TRACKING
            const liTrack = document.createElement('li');
            liTrack.className = `roster-item ${isInField ? 'in-field' : 'eliminated'}`;
            
            const nameSpanTrk = document.createElement('span');
            nameSpanTrk.textContent = player.name;
            nameSpanTrk.style.fontWeight = 'bold';
            nameSpanTrk.style.fontSize = '20px'; 
            
            const controlsTrk = document.createElement('div');
            controlsTrk.style.fontSize = '18px'; 
            controlsTrk.style.fontFamily = 'monospace';

            const btnToggle = document.createElement('span');
            btnToggle.textContent = isInField ? '[RECALL]' : '[DEPLOY]';
            btnToggle.className = 'action-btn';
            btnToggle.style.color = isInField ? 'var(--sop-alert)' : '#55ff55';
            btnToggle.onclick = () => {
                socket.emit('update_operator', { uid: player.uid, action: 'status_toggle' });
            };

            controlsTrk.appendChild(btnToggle);
            liTrack.appendChild(nameSpanTrk);
            liTrack.appendChild(controlsTrk);

            if(isAlpha && isInField) listAlphaIn.appendChild(liTrack);
            if(isAlpha && !isInField) listAlphaOut.appendChild(liTrack);
            if(!isAlpha && isInField) listBravoIn.appendChild(liTrack);
            if(!isAlpha && !isInField) listBravoOut.appendChild(liTrack);
        });
        
        if(alphaCount === 0) listAlphaManage.innerHTML = '<li class="placeholder-text" style="color:var(--sop-dim); text-align:center; margin-top:20px;">NESSUN OPERATORE REGISTRATO</li>';
        if(bravoCount === 0) listBravoManage.innerHTML = '<li class="placeholder-text" style="color:var(--sop-dim); text-align:center; margin-top:20px;">NESSUN OPERATORE REGISTRATO</li>';
        
        const headerAlphaMng = document.getElementById('header-alpha-manage');
        const headerBravoMng = document.getElementById('header-bravo-manage');
        const totalOpCount = document.getElementById('total-op-count');
        if(headerAlphaMng) headerAlphaMng.textContent = `TEAM ALPHA (${alphaCount})`;
        if(headerBravoMng) headerBravoMng.textContent = `TEAM BRAVO (${bravoCount})`;
        if(totalOpCount) totalOpCount.textContent = (alphaCount + bravoCount);

        const headerAlphaIn = document.getElementById('header-alpha-track-in');
        const headerAlphaOut = document.getElementById('header-alpha-track-out');
        const headerBravoIn = document.getElementById('header-bravo-track-in');
        const headerBravoOut = document.getElementById('header-bravo-track-out');
        const trackInCount = document.getElementById('track-in-count');
        
        if(headerAlphaIn) headerAlphaIn.textContent = `ALPHA IN CAMPO (${alphaInCount})`;
        if(headerAlphaOut) headerAlphaOut.textContent = `ALPHA FUORI (${alphaOutCount})`;
        if(headerBravoIn) headerBravoIn.textContent = `BRAVO IN CAMPO (${bravoInCount})`;
        if(headerBravoOut) headerBravoOut.textContent = `BRAVO FUORI (${bravoOutCount})`;
        if(trackInCount) trackInCount.textContent = inFieldCount;
    }

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
                <div class="device-icon">N</div>
                <div class="device-info">
                    <span class="device-id">${displayName}</span>
                    <span class="device-mode">${device.mode || 'UNKNOWN'}</span>
                </div>
            `;
            li.addEventListener('click', () => openInspector(device));
            elDeviceList.appendChild(li);
            if (device.id === activeInspectorId) updateInspectorData(device);
        });
    }

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
                resetMonitorData(); 
                updateMonitorLayout(device.mode);
                showView('monitor');
                logSystem(`LINKING TELEMETRY TO: ${displayName}`);
                socket.emit('send_command', { target_id: device.id, command: { cmd: "GET_STATUS" } });
            });
            grid.appendChild(card);
        });
    }
    
    function updateMonitorLayout(mode) {
        if (!mode || mode === lastConfiguredMode) return;
        lastConfiguredMode = mode;
        if (mode === 'SEARCH_AND_DESTROY' || mode === 'DOMINATION') {
            elWidgetSdTactical.classList.remove('hidden');
            elWidgetSdRules.classList.remove('hidden');
            elWidgetGenericMap.classList.add('hidden');
            
            if (mode === 'SEARCH_AND_DESTROY') {
                if(elTacticalTitle) elTacticalTitle.textContent = "TACTICAL FEED // BOMB STATUS";
                if(elBombContainer) elBombContainer.classList.remove('hidden'); 
                if(elDomScores) elDomScores.classList.add('hidden');
                if(elLblProg1) elLblProg1.textContent = "ARMING PROGRESS";
                if(elLblProg2) elLblProg2.textContent = "DEFUSING PROGRESS";
            } else if (mode === 'DOMINATION') {
                if(elTacticalTitle) elTacticalTitle.textContent = "TACTICAL FEED // ZONE CONTROL";
                if(elBombContainer) elBombContainer.classList.add('hidden');    
                if(elDomScores) elDomScores.classList.remove('hidden');
                if(elLblProg1) elLblProg1.textContent = "ALPHA ACTION";
                if(elLblProg2) elLblProg2.textContent = "BRAVO ACTION";
            }
            if(elSdArmBar) elSdArmBar.style.width = "0%";
            if(elSdDefuseBar) elSdDefuseBar.style.width = "0%";
        } else {
            elWidgetSdTactical.classList.add('hidden');
            elWidgetSdRules.classList.add('hidden');
            elWidgetGenericMap.classList.remove('hidden');
        }
    }

    function resetMonitorData() {
        if(elSdBombTimer) elSdBombTimer.textContent = "00:00";
        if(elSdBombStatus) elSdBombStatus.textContent = "WAITING...";
        if(elSdBombStatus) elSdBombStatus.style.color = "#fff";
        if(elDomValA) elDomValA.textContent = "00:00";
        if(elDomValB) elDomValB.textContent = "00:00";
        if(elSdArmBar) elSdArmBar.style.width = "0%";
        if(elSdDefuseBar) elSdDefuseBar.style.width = "0%";
        if(elSdRulesList) elSdRulesList.innerHTML = '<li>WAITING FOR TELEMETRY...</li>';
        if(elGlobalTimer) elGlobalTimer.textContent = "--:--";
        if(elScoreA) elScoreA.textContent = "0";
        if(elScoreB) elScoreB.textContent = "0";
    }

    function openInspector(device) {
        activeInspectorId = device.id;
        const displayName = device.name || device.id;
        elInspTitle.textContent = `${displayName} // CONFIG`;
        elInspAliasInput.value = (device.name === device.id) ? "" : device.name;
        updateInspectorData(device);
        showView('inspector');
        logSystem(`ACCESSING NODE: ${device.id}`);
    }

    function updateInspectorData(device) {
        if(elInspMode) elInspMode.textContent = device.mode || 'N/A';
        if(elInspState) elInspState.textContent = device.status || 'UNKNOWN';
        if(elInspIp) elInspIp.textContent = device.ip || 'UNKNOWN';
        if(elInspFwVer) elInspFwVer.textContent = `FW_VER: ${device.version || '--'}`;
    }

    const btnModeObserve = document.getElementById('btn-mode-observe');
    if(btnModeObserve) btnModeObserve.addEventListener('click', () => { renderTargetSelection(); showView('select-target'); });
    
    const btnModeArena = document.getElementById('btn-mode-arena');
    if(btnModeArena) btnModeArena.addEventListener('click', () => { showView('arena-menu'); logSystem("ARENA COMMAND ACCESSED."); });

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

    function handleGameEvent(msg) {
        const raw = msg.parsed_data || {};
        const senderId = raw.id || 'UNK';
        const type = raw.type || 'UNKNOWN';
        const payload = raw.payload || {};
        const shortId = senderId.slice(-4);

        if (type !== 'TIME_UPDATE' && type !== 'SD_UPDATE' && type !== 'DOM_UPDATE') {
            logSystem(`[${shortId}] ${type}`);
        }

        if (type === 'TAG_ASSIGN') {
            socket.emit('register_operator', { uid: payload.uid, team: payload.team });
            return; 
        }

        if (type === 'SD_UPDATE' || type === 'DOM_UPDATE') {
            const time = new Date().toLocaleTimeString().split(' ')[0];
            console.log(`[${time}] ${type} | State: ${payload.state} | Bomb: ${payload.bomb_time}s | Arm: ${payload.arm_prog}% | Def: ${payload.def_prog}%`);
        }

        if (type === 'TIME_UPDATE') {
            if (payload.time_left !== undefined && elGlobalTimer) {
                const m = Math.floor(payload.time_left / 60);
                const s = payload.time_left % 60;
                elGlobalTimer.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            }
            if (payload.t1_poss !== undefined && elScoreA) elScoreA.textContent = payload.t1_poss;
            if (payload.t2_poss !== undefined && elScoreB) elScoreB.textContent = payload.t2_poss;
        }

        if (monitoredDeviceId && senderId === monitoredDeviceId) {
            let mode = payload.mode || (type === 'SD_UPDATE' ? 'SEARCH_AND_DESTROY' : (type === 'DOM_UPDATE' ? 'DOMINATION' : null));
            if (mode === 'SEARCH_DESTROY') mode = 'SEARCH_AND_DESTROY';

            if (type === 'MODE_EXIT') {
                resetMonitorData();
                updateMonitorLayout(null);
                logSystem(`MODE EXIT DETECTED.`);
            }
            if (type === 'MODE_ENTER') {
                resetMonitorData();
                updateMonitorLayout(mode);
                if(elGlobalTimer) elGlobalTimer.textContent = "--:--"; 
                logSystem(`MODE ENTER: ${mode}`);
            }
            if (type === 'COUNTDOWN_UPDATE') {
                if (payload.time !== undefined && elGlobalTimer) {
                    elGlobalTimer.textContent = `T-${payload.time}`;
                    elGlobalTimer.style.color = '#ff9900'; 
                }
                if(elDomValA) elDomValA.textContent = "0";
                if(elDomValB) elDomValB.textContent = "0";
                if(elScoreA) elScoreA.textContent = "0";
                if(elScoreB) elScoreB.textContent = "0";
                
                if(elSdBombStatus) {
                    elSdBombStatus.textContent = "PREPARING";
                    elSdBombStatus.style.color = "#ff9900"; 
                }
            }

            if (mode && (type === 'HEARTBEAT' || type === 'MODE_ENTER' || type === 'SD_UPDATE' || type === 'DOM_UPDATE' || type === 'SETTINGS_UPDATE')) {
                updateMonitorLayout(mode);
            }
            
            if (type === 'SETTINGS_UPDATE' || (type === 'MODE_ENTER' && payload.bomb_time)) {
                renderRules(payload);
            }

            if (type === 'SD_UPDATE' || type === 'DOM_UPDATE') {
                const isDom = (type === 'DOM_UPDATE');
                
                if (isDom) {
                    if (elBombContainer) elBombContainer.classList.add('hidden');
                    if (elDomScores) elDomScores.classList.remove('hidden');
                } else {
                    if (elBombContainer) elBombContainer.classList.remove('hidden');
                    if (elDomScores) elDomScores.classList.add('hidden');
                    if (elSdBombTimer) elSdBombTimer.style.color = 'var(--sop-alert)';
                }

                if (payload.state && elSdBombStatus) {
                    elSdBombStatus.textContent = payload.state;
                    const s = payload.state;
                    if (s.includes('DEFUS') || s.includes('CT WINS') || s.includes('CAPTURING B') || s.includes('OWNED BRAVO') || s.includes('BRAVO WINS')) {
                        elSdBombStatus.style.color = '#55ff55'; 
                    } else if (s.includes('ARM') || s.includes('EXPLODED') || s.includes('T WINS') || s.includes('CAPTURING A') || s.includes('OWNED ALPHA') || s.includes('ALPHA WINS')) {
                        elSdBombStatus.style.color = 'var(--sop-alert)'; 
                    } else if (s === 'STANDBY' || s === 'PREPARING') {
                        elSdBombStatus.style.color = '#ff9900'; 
                    } else {
                        elSdBombStatus.style.color = 'var(--sop-primary)';
                    }
                }

                if (payload.game_time !== undefined && elGlobalTimer) {
                    const m = Math.floor(payload.game_time / 60);
                    const s = payload.game_time % 60;
                    elGlobalTimer.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                }
                if (!isDom && payload.bomb_time !== undefined && elSdBombTimer) {
                    const bm = Math.floor(payload.bomb_time / 60);
                    const bs = payload.bomb_time % 60;
                    elSdBombTimer.textContent = `${bm.toString().padStart(2, '0')}:${bs.toString().padStart(2, '0')}`;
                }
                if (elGlobalTimer && payload.state !== 'STANDBY') {
                    if (!elGlobalTimer.style.color || elGlobalTimer.style.color === 'var(--sop-text)' || elGlobalTimer.style.color === 'white') {
                         elGlobalTimer.style.color = 'var(--sop-primary)';
                    }
                    elGlobalTimer.style.color = 'var(--sop-primary)';
                }

                if (isDom) {
                    const formatScore = (s) => {
                        if (s === undefined) return "00:00";
                        const m = Math.floor(s / 60);
                        const sec = s % 60;
                        return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
                    };
                    if (payload.score_a !== undefined && elDomValA) elDomValA.textContent = formatScore(payload.score_a);
                    if (payload.score_b !== undefined && elDomValB) elDomValB.textContent = formatScore(payload.score_b);
                }

                let width1 = 0, width2 = 0, bar1Active = false, bar2Active = false;

                if (!isDom) {
                    if(payload.arm_prog !== undefined) { width1 = payload.arm_prog; bar1Active = width1 > 0; }
                    if(payload.def_prog !== undefined) { width2 = payload.def_prog; bar2Active = width2 > 0; }
                } else {
                    const prog = payload.capture_prog || 0;
                    const state = payload.state || '';
                    if (state.includes('CAPTURING A')) { width1 = prog; bar1Active = true; }
                    else if (state.includes('CAPTURING B')) { width2 = prog; bar2Active = true; }
                }

                const updateBar = (barElem, width, isActive, timerRefName) => {
                    if(!barElem) return;
                    if (isActive) {
                        if (timerRefName === 1) { clearTimeout(debounceTimer1); debounceTimer1 = null; }
                        else { clearTimeout(debounceTimer2); debounceTimer2 = null; }
                        barElem.style.width = `${width}%`;
                    } else {
                        if (barElem.style.width !== '0%') {
                            if (timerRefName === 1) {
                                if(!debounceTimer1) debounceTimer1 = setTimeout(() => { barElem.style.width = "0%"; debounceTimer1 = null; }, 200); 
                            } else {
                                if(!debounceTimer2) debounceTimer2 = setTimeout(() => { barElem.style.width = "0%"; debounceTimer2 = null; }, 200);
                            }
                        }
                    }
                };

                updateBar(elSdArmBar, width1, bar1Active, 1);
                updateBar(elSdDefuseBar, width2, bar2Active, 2);
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
    
    window.sendCommand = function(cmdObj) {
        if (!activeInspectorId) return console.warn("No active inspector");
        socket.emit('send_command', { target_id: activeInspectorId, command: cmdObj });
    };

    const elSetupModeSelect = document.getElementById('setup-mode-select');
    const elSetupSdParams = document.getElementById('setup-sd-params');
    const elSetupDomParams = document.getElementById('setup-dom-params');
    const elSetupTargetSelect = document.getElementById('setup-target-select');
    const btnTransmitSetup = document.getElementById('btn-transmit-setup');
    const btnStartMission = document.getElementById('btn-start-mission');

    if (elSetupModeSelect) {
        elSetupModeSelect.addEventListener('change', (e) => {
            if (e.target.value === 'sd') {
                elSetupSdParams.classList.remove('hidden');
                elSetupDomParams.classList.add('hidden');
            } else {
                elSetupSdParams.classList.add('hidden');
                elSetupDomParams.classList.remove('hidden');
            }
        });
    }

    const btnModeSetup = document.getElementById('btn-mode-setup');
    if (btnModeSetup) {
        btnModeSetup.addEventListener('click', () => {
            updateSetupDropdown(); 
            showView('setup');
            logSystem("SETUP PANEL ACCESSED.");
        });
    }

    if (btnTransmitSetup) {
        btnTransmitSetup.addEventListener('click', () => {
            const targetId = elSetupTargetSelect.value;
            if (!targetId) { alert("Seleziona un nodo di destinazione."); return; }
            const mode = elSetupModeSelect.value;
            let commandData = {};

            if (mode === 'sd') {
                commandData = {
                    cmd: "SET_SD_SETTINGS",
                    game_duration: parseInt(document.getElementById('sd-game-dur').value),
                    bomb_time: parseInt(document.getElementById('sd-bomb-time').value),
                    arm_time: parseInt(document.getElementById('sd-arm-time').value),
                    defuse_time: parseInt(document.getElementById('sd-defuse-time').value),
                    use_arm_pin: document.getElementById('sd-use-arm-pin').value === 'true',
                    use_defuse_pin: document.getElementById('sd-use-defuse-pin').value === 'true',
                    arm_pin: document.getElementById('sd-arm-pin').value,
                    defuse_pin: document.getElementById('sd-defuse-pin').value
                };
            } else {
                commandData = {
                    cmd: "SET_DOM_SETTINGS",
                    duration: parseInt(document.getElementById('dom-game-dur').value),
                    capture_time: parseInt(document.getElementById('dom-capture-time').value),
                    countdown: parseInt(document.getElementById('dom-countdown').value)
                };
            }
            socket.emit('send_command', { target_id: targetId, command: commandData });
            logSystem(`CONFIGURATION TRANSMITTED TO ${targetId}.`);
        });
    }

    if (btnStartMission) {
        btnStartMission.addEventListener('click', () => {
            const targetId = elSetupTargetSelect.value;
            if (!targetId) { alert("Seleziona un nodo di destinazione."); return; }
            const mode = elSetupModeSelect.value;
            let commandData = { cmd: (mode === 'sd') ? "START_SD_GAME" : "START_DOM_GAME" };

            socket.emit('send_command', { target_id: targetId, command: commandData });
            logSystem(`START MISSION SIGNAL SENT TO ${targetId}.`);
            
            monitoredDeviceId = targetId;
            elMonitorTargetId.textContent = elSetupTargetSelect.options[elSetupTargetSelect.selectedIndex].text;
            resetMonitorData();
            showView('monitor');
        });
    }

    function updateSetupDropdown() {
        const elSetupTargetSelect = document.getElementById('setup-target-select');
        if (!elSetupTargetSelect) return;
        
        const currentSelection = elSetupTargetSelect.value;
        elSetupTargetSelect.innerHTML = '<option value="">-- Seleziona un nodo --</option>';
        const terminalDevices = currentDevices.filter(d => d.mode === 'TERMINAL');
        
        terminalDevices.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.id;
            opt.textContent = d.name || d.id;
            elSetupTargetSelect.appendChild(opt);
        });
        
        if (currentSelection && terminalDevices.find(d => d.id === currentSelection)) {
            elSetupTargetSelect.value = currentSelection;
        }
    }
});

window.sendEnvCommand = function(envCmd) {
    if(confirm("Eseguire override ambientale: " + envCmd + "?")) {
        socket.emit('send_command', { target_id: "BROADCAST_ENV", command: { cmd: envCmd } });
        console.log(`> SYS_OVERRIDE: ${envCmd}`);
        const miniLog = document.getElementById('mini-log');
        if(miniLog) {
            const div = document.createElement('div');
            div.textContent = `> SYS_OVERRIDE: ${envCmd}`;
            miniLog.prepend(div);
        }
    }
};