document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    
    const elDeviceList = document.getElementById('device-list');
    const elMiniLog = document.getElementById('mini-log');
    
    const views = {
        'hub': document.getElementById('view-hub'),
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
            activeGameNodeId = null; 
            currentGameState = 'STANDBY';
            document.querySelectorAll('.device-item').forEach(el => el.classList.remove('active'));
        }
        
        if(viewName === 'arena-db') {
            socket.emit('request_database');
        }
    };

    window.clearActiveRoster = function() {
        if(confirm('ATTENZIONE: Rimuovere tutti gli operatori dal roster di oggi? (Le statistiche globali rimarranno intatte)')) {
            socket.emit('clear_roster');
            logSystem("RICHIESTA PULIZIA ROSTER INVIATA.");
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
    let activeGameNodeId = null; 
    let currentDevices = [];
    let lastConfiguredMode = null; 
    let arenaRoster = {}; 
    let currentGameState = 'STANDBY'; 
    let currentProfileUid = null;
    
    let globalPlayersDB = []; 

    let debounceTimer1 = null;
    let debounceTimer2 = null;

    setInterval(() => {
        const now = new Date();
        elMissionClock.textContent = now.toLocaleTimeString('it-IT', { hour12: false });
    }, 1000);

    function fetchTacticalWeather() {
        fetch('https://api.open-meteo.com/v1/forecast?latitude=45.615&longitude=9.005&current_weather=true')
            .then(res => res.json())
            .then(data => {
                const cw = data.current_weather;
                if(cw) {
                    const temp = Math.round(cw.temperature);
                    const code = cw.weathercode;
                    let condition = "CLEAR";
                    
                    if (code >= 1 && code <= 3) condition = "CLOUDS";
                    else if (code >= 45 && code <= 48) condition = "FOG";
                    else if (code >= 51 && code <= 67) condition = "RAIN";
                    else if (code >= 71 && code <= 77) condition = "SNOW";
                    else if (code >= 80 && code <= 82) condition = "SHOWERS";
                    else if (code >= 95) condition = "STORM";

                    const weatherEl = document.getElementById('weather-display');
                    if (weatherEl) weatherEl.textContent = `${temp}°C // ${condition}`;
                }
            })
            .catch(err => console.error("[SYS] Errore fetch meteo:", err));
    }
    fetchTacticalWeather();
    setInterval(fetchTacticalWeather, 900000); 

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
        if (!document.getElementById('add-player-modal').classList.contains('hidden')) {
            renderAddPlayerList();
        }
    });

    socket.on('database_update', (players) => {
        globalPlayersDB = players; 
        if (!document.getElementById('add-player-modal').classList.contains('hidden')) {
            renderAddPlayerList();
        }

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
            nameSpan.className = 'clickable-name';
            nameSpan.onclick = () => openOperatorProfile(player.uid);

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
        updateSetupDropdown();
    });

    socket.on('esp_event', (msg) => {
        handleGameEvent(msg);
    });

    socket.on('kiosk_hardware_cmd', (data) => {
        if (data.cmd === 'GAME_START') {
            const btnStart = document.getElementById('btn-start-mission');
            if (btnStart) {
                logSystem("KIOSK: Rilevato pulsante hardware START.");
                btnStart.click(); 
            }
        } else if (data.cmd === 'FORCE_END_GAME') {
            logSystem("KIOSK: Rilevato pulsante hardware END. Terminazione immediata.");
            if (activeGameNodeId) {
                socket.emit('send_command', { target_id: activeGameNodeId, command: { cmd: "FORCE_END_GAME" } });
                socket.emit('send_command', { target_id: "BROADCAST_ENV", command: { cmd: "SIREN_LONG" } }); 
                logSystem(`SENDING TERMINATION SIGNAL TO NODE [${activeGameNodeId.slice(-4)}]...`);
            } else {
                logSystem("NESSUNA PARTITA ATTIVA RILEVATA DA TERMINARE.");
            }
        }
    });

    function renderArenaRoster() {
        const listAlphaManage = document.getElementById('roster-alpha-manage');
        const listBravoManage = document.getElementById('roster-bravo-manage');
        const listAlphaIn = document.getElementById('track-alpha-in');
        const listAlphaOut = document.getElementById('track-alpha-out');
        const listBravoIn = document.getElementById('track-bravo-in');
        const listBravoOut = document.getElementById('track-bravo-out');
        
        const listMonitorAlpha = document.getElementById('monitor-roster-alpha');
        const listMonitorBravo = document.getElementById('monitor-roster-bravo');
        
        if(!listAlphaManage || !listAlphaIn) return;
        
        [listAlphaManage, listBravoManage, listAlphaIn, listAlphaOut, listBravoIn, listBravoOut].forEach(el => el.innerHTML = '');
        if(listMonitorAlpha) listMonitorAlpha.innerHTML = '';
        if(listMonitorBravo) listMonitorBravo.innerHTML = '';
        
        let alphaCount = 0, bravoCount = 0, inFieldCount = 0;
        let alphaInCount = 0, alphaOutCount = 0;
        let bravoInCount = 0, bravoOutCount = 0;
        
        Object.values(arenaRoster).forEach(player => {
            const isAlpha = player.team === 'ALPHA';
            const isInField = player.status === 'IN';
            
            if(isAlpha) alphaCount++; else bravoCount++;
            
            if(isInField) {
                inFieldCount++;
                if(isAlpha) {
                    alphaInCount++;
                    if(listMonitorAlpha) {
                        const liMon = document.createElement('li');
                        liMon.textContent = player.name;
                        liMon.className = 'clickable-name';
                        liMon.onclick = () => openOperatorProfile(player.uid);
                        listMonitorAlpha.appendChild(liMon);
                    }
                } else {
                    bravoInCount++;
                    if(listMonitorBravo) {
                        const liMon = document.createElement('li');
                        liMon.textContent = player.name;
                        liMon.className = 'clickable-name';
                        liMon.onclick = () => openOperatorProfile(player.uid);
                        listMonitorBravo.appendChild(liMon);
                    }
                }
            } else {
                if(isAlpha) alphaOutCount++; else bravoOutCount++;
            }

            const liManage = document.createElement('li');
            liManage.className = 'roster-item'; 
            
            const nameSpanMng = document.createElement('span');
            nameSpanMng.textContent = player.name;
            nameSpanMng.style.fontWeight = 'bold';
            nameSpanMng.style.fontSize = '20px'; 
            nameSpanMng.className = 'clickable-name';
            nameSpanMng.onclick = () => openOperatorProfile(player.uid);
            
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

            const liTrack = document.createElement('li');
            liTrack.className = `roster-item ${isInField ? 'in-field' : 'eliminated'}`;
            
            const nameSpanTrk = document.createElement('span');
            nameSpanTrk.textContent = player.name;
            nameSpanTrk.style.fontWeight = 'bold';
            nameSpanTrk.style.fontSize = '20px'; 
            nameSpanTrk.className = 'clickable-name';
            nameSpanTrk.onclick = () => openOperatorProfile(player.uid);
            
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

        if (elScoreA) elScoreA.textContent = alphaInCount;
        if (elScoreB) elScoreB.textContent = bravoInCount;

        const setupAlphaCount = document.getElementById('setup-alpha-count');
        const setupBravoCount = document.getElementById('setup-bravo-count');
        if (setupAlphaCount) {
            setupAlphaCount.textContent = `${alphaInCount}/${alphaCount}`;
        }
        if (setupBravoCount) {
            setupBravoCount.textContent = `${bravoInCount}/${bravoCount}`;
        }

        const activeStates = ['SAFE', 'ARMING...', 'ARMED', 'DEFUSING...', 'NEUTRAL', 'OWNED ALPHA', 'OWNED BRAVO', 'CAPTURING A...', 'CAPTURING B...'];
        const gameIsRunning = activeStates.includes(currentGameState) && activeGameNodeId !== null;

        if (gameIsRunning) {
            if (alphaInCount === 0 && bravoInCount > 0) {
                logSystem("!!! TEAM ALPHA ELIMINATO - VITTORIA BRAVO !!!");
                socket.emit('send_command', { target_id: activeGameNodeId, command: { cmd: "FORCE_WIN", winner: "BRAVO" } });
                currentGameState = 'BRAVO WINS'; 
            } else if (bravoInCount === 0 && alphaInCount > 0) {
                logSystem("!!! TEAM BRAVO ELIMINATO - VITTORIA ALPHA !!!");
                socket.emit('send_command', { target_id: activeGameNodeId, command: { cmd: "FORCE_WIN", winner: "ALPHA" } });
                currentGameState = 'ALPHA WINS'; 
            } else if (alphaInCount === 0 && bravoInCount === 0) {
                logSystem("!!! MUTUA DISTRUZIONE - PARTITA TERMINATA !!!");
                socket.emit('send_command', { target_id: activeGameNodeId, command: { cmd: "FORCE_END_GAME" } });
                currentGameState = 'DRAW';
            }
        }
    }

    window.openAddPlayerModal = function() {
        socket.emit('request_database');
        document.getElementById('add-player-modal').classList.remove('hidden');
    };

    window.closeAddPlayerModal = function() {
        document.getElementById('add-player-modal').classList.add('hidden');
    };

    function renderAddPlayerList() {
        const list = document.getElementById('add-player-list');
        if (!list) return;
        list.innerHTML = '';

        const availablePlayers = globalPlayersDB.filter(p => !arenaRoster[p.uid]);

        if (availablePlayers.length === 0) {
            list.innerHTML = '<li class="placeholder-text" style="color:var(--sop-dim); text-align:center; margin-top:20px;">TUTTI I GIOCATORI DEL DB SONO GIA\' IN CAMPO OPPURE DB VUOTO</li>';
            return;
        }

        availablePlayers.forEach(player => {
            const li = document.createElement('li');
            li.className = 'roster-item';
            li.style.justifyContent = 'space-between';

            const nameSpan = document.createElement('span');
            nameSpan.textContent = `${player.alias}`;
            nameSpan.style.fontWeight = 'bold';
            nameSpan.style.fontSize = '18px';

            const controlsDiv = document.createElement('div');

            const btnAlpha = document.createElement('button');
            btnAlpha.textContent = '[ + ALPHA ]';
            btnAlpha.className = 'deck-btn';
            btnAlpha.style.color = 'var(--sop-alert)';
            btnAlpha.style.borderColor = 'var(--sop-alert)';
            btnAlpha.style.marginRight = '10px';
            btnAlpha.onclick = () => {
                socket.emit('register_operator', { uid: player.uid, team: 'ALPHA' });
            };

            const btnBravo = document.createElement('button');
            btnBravo.textContent = '[ + BRAVO ]';
            btnBravo.className = 'deck-btn';
            btnBravo.style.color = '#55ff55';
            btnBravo.style.borderColor = '#55ff55';
            btnBravo.onclick = () => {
                socket.emit('register_operator', { uid: player.uid, team: 'BRAVO' });
            };

            controlsDiv.appendChild(btnAlpha);
            controlsDiv.appendChild(btnBravo);

            li.appendChild(nameSpan);
            li.appendChild(controlsDiv);
            list.appendChild(li);
        });
    }

    window.openOperatorProfile = function(uid) {
        currentProfileUid = uid;
        socket.emit('request_profile', {uid: uid});
    };

    window.closeModal = function() {
        document.getElementById('operator-modal').classList.add('hidden');
    };

    socket.on('profile_data', (data) => {
        document.getElementById('modal-op-name').textContent = `PROFILE // ${data.alias}`;
        document.getElementById('modal-op-uid').textContent = data.uid;
        document.getElementById('modal-op-date').textContent = data.registered_at || 'Sconosciuta';
        document.getElementById('modal-op-games').textContent = data.games_played || 0;
        document.getElementById('modal-op-notes').value = data.notes || '';
        
        const photoEl = document.getElementById('modal-op-photo');
        if(data.photo) {
            photoEl.src = `/static/uploads/${data.photo}?t=${new Date().getTime()}`;
        } else {
            photoEl.src = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIiBmaWxsPSIjMzMzIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjM1IiByPSIyMCIvPjxwYXRoIGQ9Ik0yMCA5MCBRMjAgNjAgNTAgNjAgUTgwIDYwIDgwIDkwIFoiLz48L3N2Zz4=";
        }
        
        document.getElementById('operator-modal').classList.remove('hidden');
    });

    window.saveOperatorNotes = function() {
        const notes = document.getElementById('modal-op-notes').value;
        if(currentProfileUid) {
            socket.emit('save_notes', {uid: currentProfileUid, notes: notes});
            logSystem(`NOTE SALVATE PER [${currentProfileUid}]`);
            closeModal();
        }
    };

    window.handlePhotoUpload = function(input) {
        if(!input.files || !input.files[0] || !currentProfileUid) return;
        
        const file = input.files[0];
        const formData = new FormData();
        formData.append('photo', file);
        formData.append('uid', currentProfileUid);
        
        logSystem("CARICAMENTO FOTO IN CORSO...");
        
        fetch('/upload_photo', {
            method: 'POST',
            body: formData
        })
        .then(res => res.json())
        .then(data => {
            if(data.status === 'ok') {
                const photoEl = document.getElementById('modal-op-photo');
                photoEl.src = `/static/uploads/${data.filename}?t=${new Date().getTime()}`;
                logSystem(`FOTO PROFILO AGGIORNATA.`);
            } else {
                alert('Errore durante il caricamento della foto.');
                logSystem("ERRORE UPLOAD FOTO.");
            }
        })
        .catch(err => {
            console.error(err);
            alert('Errore di rete durante l\'upload.');
        });
    };

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
            const isKiosk = device.mode === 'KIOSK';
            const iconLetter = isKiosk ? 'K' : 'N';
            const iconStyle = isKiosk ? 'background: var(--sop-secondary); color: #000;' : '';

            li.innerHTML = `
                <div class="device-icon" style="${iconStyle}">${iconLetter}</div>
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
    
    function updateMonitorLayout(mode) {
        if (!mode || mode === lastConfiguredMode) return;
        lastConfiguredMode = mode;
        if (mode === 'SEARCH_AND_DESTROY' || mode === 'DOMINATION' || mode === 'TEAM_DEATHMATCH') {
            elWidgetSdTactical.classList.remove('hidden');
            elWidgetSdRules.classList.remove('hidden');
            elWidgetGenericMap.classList.add('hidden');
            
            const progSection = document.querySelector('.progress-section');
            
            if (mode === 'SEARCH_AND_DESTROY') {
                if(elTacticalTitle) elTacticalTitle.textContent = "TACTICAL FEED // BOMB STATUS";
                if(elBombContainer) elBombContainer.classList.remove('hidden'); 
                if(elDomScores) elDomScores.classList.add('hidden');
                if(progSection) progSection.classList.remove('hidden');
                if(elLblProg1) elLblProg1.textContent = "ARMING PROGRESS";
                if(elLblProg2) elLblProg2.textContent = "DEFUSING PROGRESS";
            } else if (mode === 'DOMINATION') {
                if(elTacticalTitle) elTacticalTitle.textContent = "TACTICAL FEED // ZONE CONTROL";
                if(elBombContainer) elBombContainer.classList.add('hidden');    
                if(elDomScores) elDomScores.classList.remove('hidden');
                if(progSection) progSection.classList.remove('hidden');
                if(elLblProg1) elLblProg1.textContent = "ALPHA ACTION";
                if(elLblProg2) elLblProg2.textContent = "BRAVO ACTION";
            } else if (mode === 'TEAM_DEATHMATCH') {
                if(elTacticalTitle) elTacticalTitle.textContent = "TACTICAL FEED // TDM";
                if(elBombContainer) elBombContainer.classList.add('hidden');    
                if(elDomScores) elDomScores.classList.add('hidden');
                if(progSection) progSection.classList.add('hidden'); 
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

        const descTitle = document.querySelector('.asset-desc h4');
        const descText = document.querySelector('.asset-desc .desc-text');
        
        if (device.mode === 'KIOSK') {
            if(descTitle) descTitle.textContent = "PHILANTHROPY TACTICAL KIOSK";
            if(descText) descText.textContent = "Terminale logistico RFID per l'identificazione, l'ingresso e lo smistamento degli operatori in campo.";
        } else {
            if(descTitle) descTitle.textContent = "PHILANTHROPY TACTICAL NODE (MK-I)";
            if(descText) descText.textContent = "Terminale tattico multi-ruolo basato su architettura ESP32.";
        }
    }

    const btnModeObserve = document.getElementById('btn-mode-observe');
    if(btnModeObserve) btnModeObserve.addEventListener('click', () => { showView('monitor'); });
    
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
        if(!activeGameNodeId) {
            alert("Nessuna partita attiva rilevata sul campo.");
            return;
        }
        if(confirm("ATTENZIONE: Terminare forzatamente la partita?")) {
            socket.emit('send_command', { target_id: activeGameNodeId, command: { cmd: "FORCE_END_GAME" } });
            socket.emit('send_command', { target_id: "BROADCAST_ENV", command: { cmd: "SIREN_LONG" } }); 
            logSystem(`SENDING TERMINATION SIGNAL TO NODE [${activeGameNodeId.slice(-4)}]...`);
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

        if (!['TIME_UPDATE', 'SD_UPDATE', 'DOM_UPDATE', 'TDM_UPDATE', 'HEARTBEAT'].includes(type)) {
            logSystem(`[${shortId}] ${type}`);
        }

        if (['MODE_ENTER', 'COUNTDOWN_UPDATE', 'SD_UPDATE', 'DOM_UPDATE', 'TIME_UPDATE', 'TDM_UPDATE'].includes(type)) {
            activeGameNodeId = senderId;
        }

        if (type === 'HEARTBEAT' && activeGameNodeId && senderId !== activeGameNodeId) {
            return; 
        }

        let mode = payload.mode || raw.mode || (type === 'SD_UPDATE' ? 'SEARCH_AND_DESTROY' : (type === 'DOM_UPDATE' ? 'DOMINATION' : (type === 'TDM_UPDATE' ? 'TEAM_DEATHMATCH' : null)));
        if (mode === 'SEARCH_DESTROY') mode = 'SEARCH_AND_DESTROY';

        if (mode === 'KIOSK') return; 

        if (type === 'TAG_ASSIGN') {
            socket.emit('register_operator', { uid: payload.uid, team: payload.team });
            return; 
        }

        if (type === 'TIME_UPDATE') {
            if (payload.time_left !== undefined && elGlobalTimer) {
                const m = Math.floor(payload.time_left / 60);
                const s = payload.time_left % 60;
                elGlobalTimer.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            }
        }

        if (type === 'MODE_EXIT') {
            currentGameState = 'STANDBY';
            activeGameNodeId = null; 
            resetMonitorData();
            updateMonitorLayout(null);
            logSystem(`GLOBAL MODE EXIT DETECTED.`);
        }
        if (type === 'MODE_ENTER') {
            currentGameState = 'PREPARING';
            resetMonitorData();
            updateMonitorLayout(mode);
            if(elGlobalTimer) elGlobalTimer.textContent = "--:--"; 
            logSystem(`GLOBAL MODE ENTER: ${mode}`);
        }
        if (type === 'COUNTDOWN_UPDATE') {
            if (payload.time !== undefined && elGlobalTimer) {
                elGlobalTimer.textContent = `T-${payload.time}`;
                elGlobalTimer.style.color = '#ff9900'; 
            }
            if(elDomValA) elDomValA.textContent = "0";
            if(elDomValB) elDomValB.textContent = "0";
            
            if(elSdBombStatus) {
                elSdBombStatus.textContent = "PREPARING";
                elSdBombStatus.style.color = "#ff9900"; 
            }
        }

        if (mode && (type === 'HEARTBEAT' || type === 'MODE_ENTER' || type === 'SD_UPDATE' || type === 'DOM_UPDATE' || type === 'SETTINGS_UPDATE' || type === 'TDM_UPDATE')) {
            updateMonitorLayout(mode);
        }
        
        if (type === 'SETTINGS_UPDATE' || (type === 'MODE_ENTER' && payload.bomb_time)) {
            renderRules(payload);
        }

        if (type === 'SD_UPDATE' || type === 'DOM_UPDATE' || type === 'TDM_UPDATE') {
            const isDom = (type === 'DOM_UPDATE');
            const isTdm = (type === 'TDM_UPDATE');
            
            if (isDom) {
                if (elBombContainer) elBombContainer.classList.add('hidden');
                if (elDomScores) elDomScores.classList.remove('hidden');
            } else if (isTdm) {
                if (elBombContainer) elBombContainer.classList.add('hidden');
                if (elDomScores) elDomScores.classList.add('hidden');
            } else {
                if (elBombContainer) elBombContainer.classList.remove('hidden');
                if (elDomScores) elDomScores.classList.add('hidden');
                if (elSdBombTimer) elSdBombTimer.style.color = 'var(--sop-alert)';
            }

            if (payload.state && elSdBombStatus) {
                
                // --- SUONA LA SIRENA QUANDO LA PARTITA FINISCE EFFETTIVAMENTE ---
                const endStates = ['T WINS', 'CT WINS', 'ALPHA WINS', 'BRAVO WINS', 'DRAW', 'STOPPED'];
                if (endStates.includes(payload.state) && !endStates.includes(currentGameState)) {
                    logSystem(`!!! PARTITA TERMINATA (${payload.state}) - ATTIVAZIONE SIRENA !!!`);
                    socket.emit('send_command', { target_id: "BROADCAST_ENV", command: { cmd: "SIREN_LONG" } });
                }

                // --- SUONA LA SIRENA QUANDO LA PARTITA INIZIA EFFETTIVAMENTE ---
                const startStates = ['ACTIVE', 'SAFE', 'NEUTRAL'];
                if (currentGameState === 'PREPARING' && startStates.includes(payload.state)) {
                    logSystem(`!!! PARTITA INIZIATA (${payload.state}) - ATTIVAZIONE SIRENA !!!`);
                    socket.emit('send_command', { target_id: "BROADCAST_ENV", command: { cmd: "SIREN_LONG" } });
                }

                currentGameState = payload.state;
                elSdBombStatus.textContent = payload.state;
                const s = payload.state;
                if (s.includes('DEFUS') || s.includes('CT WINS') || s.includes('CAPTURING B') || s.includes('OWNED BRAVO') || s.includes('BRAVO WINS')) {
                    elSdBombStatus.style.color = '#55ff55'; 
                } else if (s.includes('ARM') || s.includes('EXPLODED') || s.includes('T WINS') || s.includes('CAPTURING A') || s.includes('OWNED ALPHA') || s.includes('ALPHA WINS')) {
                    elSdBombStatus.style.color = 'var(--sop-alert)'; 
                } else if (s === 'STANDBY' || s === 'PREPARING' || s === 'DRAW') {
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
            if (!isDom && !isTdm && payload.bomb_time !== undefined && elSdBombTimer) {
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

            if (!isDom && !isTdm) {
                if(payload.arm_prog !== undefined) { width1 = payload.arm_prog; bar1Active = width1 > 0; }
                if(payload.def_prog !== undefined) { width2 = payload.def_prog; bar2Active = width2 > 0; }
            } else if (isDom) {
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

    function updateForceEndButton(state) {
        const btnForceEnd = document.getElementById('btn-force-end');
        if (btnForceEnd) {
            const footer = btnForceEnd.parentElement;
            const activeStates = ['SAFE', 'ARMING...', 'ARMED', 'DEFUSING...', 'NEUTRAL', 'OWNED ALPHA', 'OWNED BRAVO', 'CAPTURING A...', 'CAPTURING B...', 'ACTIVE'];
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
            if(elSetupSdParams) elSetupSdParams.classList.add('hidden');
            if(elSetupDomParams) elSetupDomParams.classList.add('hidden');
            const tdmParams = document.getElementById('setup-tdm-params');
            if(tdmParams) tdmParams.classList.add('hidden');

            const targetRow = document.getElementById('target-selection-row');

            if (e.target.value === 'sd') {
                if(elSetupSdParams) elSetupSdParams.classList.remove('hidden');
                if(targetRow) targetRow.classList.remove('hidden');
            } else if (e.target.value === 'dom') {
                if(elSetupDomParams) elSetupDomParams.classList.remove('hidden');
                if(targetRow) targetRow.classList.remove('hidden');
            } else if (e.target.value === 'tdm') {
                if(tdmParams) tdmParams.classList.remove('hidden');
                if(targetRow) targetRow.classList.add('hidden');
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
            const mode = elSetupModeSelect.value;
            if (mode === 'tdm') {
                alert("Il Team Deathmatch è gestito dal server, non richiede l'invio di configurazioni hardware.");
                return;
            }

            const targetId = elSetupTargetSelect.value;
            if (!targetId) { alert("Seleziona un nodo di destinazione."); return; }
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
            const mode = elSetupModeSelect.value;
            let targetId = elSetupTargetSelect.value;
            
            if (mode !== 'tdm' && !targetId) { 
                const targetSelect = document.getElementById('setup-target-select');
                if (targetSelect && targetSelect.options.length > 1) {
                    targetSelect.selectedIndex = 1;
                    targetId = targetSelect.value;
                } else {
                    alert("Nessun terminale di gioco connesso per avviare la missione!");
                    return; 
                }
            }

            const players = Object.values(arenaRoster);
            const playersOut = players.filter(p => p.status !== 'IN');
            
            let alphaIn = 0;
            let bravoIn = 0;
            players.forEach(p => {
                if(p.status === 'IN') {
                    if(p.team === 'ALPHA') alphaIn++;
                    if(p.team === 'BRAVO') bravoIn++;
                }
            });

            if (players.length === 0) {
                if(!confirm("ATTENZIONE: Il Roster è completamente vuoto. Vuoi avviare la missione comunque?")) {
                    return;
                }
            } else {
                if (playersOut.length > 0) {
                    alert(`OPERAZIONE INTERROTTA:\nCi sono ${playersOut.length} operatori fuori dal campo.\nTutti i giocatori registrati devono risultare "IN CAMPO" per poter avviare la missione.`);
                    return;
                }
                
                if (alphaIn === 0 || bravoIn === 0) {
                    if(!confirm(`ATTENZIONE: Una delle due squadre non ha operatori in campo (Alpha: ${alphaIn} | Bravo: ${bravoIn}).\nSicuro di voler avviare una partita sbilanciata?`)) {
                        return;
                    }
                }
            }

            if (mode === 'tdm') {
                const dur = parseInt(document.getElementById('tdm-game-dur').value) || 15;
                socket.emit('start_tdm_game', { duration: dur });
                logSystem(`START MISSION: TEAM DEATHMATCH (${dur} min).`);
                resetMonitorData();
                showView('monitor');
                return;
            }

            let commandData = { cmd: (mode === 'sd') ? "START_SD_GAME" : "START_DOM_GAME" };
            socket.emit('send_command', { target_id: targetId, command: commandData });
            logSystem(`START MISSION SIGNAL SENT TO ${targetId}.`);
            
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