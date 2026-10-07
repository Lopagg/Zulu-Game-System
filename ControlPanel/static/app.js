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

    const elInspTitle = document.getElementById('inspector-title');
    const elInspMode = document.getElementById('insp-mode');
    const elInspState = document.getElementById('insp-state');
    const elInspIp = document.getElementById('insp-ip');
    const elInspAliasInput = document.getElementById('insp-alias-input');
    const elInspFwVer = document.getElementById('insp-fw-ver');
    
    let activeInspectorId = null;
    let currentDevices = [];
    let arenaRoster = {}; 
    let currentProfileUid = null;
    let globalPlayersDB = []; 
    
    // Dizionario globale per i timer di rimbalzo delle barre di progresso multi-nodo
    const debounceTimers = {};

    setInterval(() => {
        const now = new Date();
        if(elMissionClock) elMissionClock.textContent = now.toLocaleTimeString('it-IT', { hour12: false });
    }, 1000);

    socket.on('connect', () => {
        logSystem("LINK ESTABLISHED WITH SOP SERVER.");
        if(elGlobalStatus) {
            elGlobalStatus.textContent = "ONLINE";
            elGlobalStatus.classList.remove('status-alert');
            elGlobalStatus.classList.add('status-normal');
        }
        socket.emit('request_roster');
    });

    socket.on('disconnect', () => {
        logSystem("CONNECTION LOST - RETRYING...");
        if(elGlobalStatus) {
            elGlobalStatus.textContent = "OFFLINE";
            elGlobalStatus.classList.remove('status-normal');
            elGlobalStatus.classList.add('status-alert');
        }
    });
    
    socket.on('weather_update', (data) => {
        const weatherEl = document.getElementById('weather-display');
        if (weatherEl && data.weather) {
            weatherEl.textContent = data.weather;
        }
    });

    socket.on('roster_update', (rosterData) => {
        arenaRoster = rosterData;
        renderArenaRoster();
        const addPlayerModal = document.getElementById('add-player-modal');
        if (addPlayerModal && !addPlayerModal.classList.contains('hidden')) {
            renderAddPlayerList();
        }
    });

    socket.on('database_update', (players) => {
        globalPlayersDB = players; 
        const addPlayerModal = document.getElementById('add-player-modal');
        if (addPlayerModal && !addPlayerModal.classList.contains('hidden')) {
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
            logSystem("KIOSK: Rilevato pulsante hardware END. Terminazione immediata globale.");
            // Invia segnale di kill a tutti i nodi in stato attivo (recuperandoli dal DOM generato)
            const activeNodeCards = document.querySelectorAll('.node-card');
            if(activeNodeCards.length > 0) {
                activeNodeCards.forEach(card => {
                    const devId = card.getAttribute('data-device-id');
                    if(devId) {
                        window.forceEndNode(devId);
                    }
                });
            } else {
                logSystem("NESSUNA PARTITA ATTIVA RILEVATA DA TERMINARE.");
            }
        }
    });

    socket.on('mission_start_error', (data) => {
        alert(data.msg);
    });

    socket.on('mission_start_warning', (data) => {
        if(confirm(data.msg)) {
            socket.emit('request_mission_start', { ...data.original_request, force: true });
        }
    });

    socket.on('mission_start_success', () => {
        showView('monitor');
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
        
        const elScoreA = document.getElementById('score-a');
        const elScoreB = document.getElementById('score-b');
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
    }

    window.openAddPlayerModal = function() {
        socket.emit('request_database');
        const modal = document.getElementById('add-player-modal');
        if(modal) modal.classList.remove('hidden');
    };

    window.closeAddPlayerModal = function() {
        const modal = document.getElementById('add-player-modal');
        if(modal) modal.classList.add('hidden');
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
        const modal = document.getElementById('operator-modal');
        if(modal) modal.classList.add('hidden');
    };

    socket.on('profile_data', (data) => {
        const nameEl = document.getElementById('modal-op-name');
        if(nameEl) nameEl.textContent = `PROFILE // ${data.alias}`;
        const uidEl = document.getElementById('modal-op-uid');
        if(uidEl) uidEl.textContent = data.uid;
        const dateEl = document.getElementById('modal-op-date');
        if(dateEl) dateEl.textContent = data.registered_at || 'Sconosciuta';
        const gamesEl = document.getElementById('modal-op-games');
        if(gamesEl) gamesEl.textContent = data.games_played || 0;
        const notesEl = document.getElementById('modal-op-notes');
        if(notesEl) notesEl.value = data.notes || '';
        
        const photoEl = document.getElementById('modal-op-photo');
        if(photoEl) {
            if(data.photo) {
                photoEl.src = `/static/uploads/${data.photo}?t=${new Date().getTime()}`;
            } else {
                photoEl.src = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIiBmaWxsPSIjMzMzIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjM1IiByPSIyMCIvPjxwYXRoIGQ9Ik0yMCA5MCBRMjAgNjAgNTAgNjAgUTgwIDYwIDgwIDkwIFoiLz48L3N2Zz4=";
            }
        }
        
        const modal = document.getElementById('operator-modal');
        if(modal) modal.classList.remove('hidden');
    });

    window.saveOperatorNotes = function() {
        const notesEl = document.getElementById('modal-op-notes');
        if(!notesEl) return;
        const notes = notesEl.value;
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
                if(photoEl) photoEl.src = `/static/uploads/${data.filename}?t=${new Date().getTime()}`;
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
        if(!elDeviceList) return;
        elDeviceList.innerHTML = ''; 
        if(elAssetCount) elAssetCount.textContent = devices.length;
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

    function openInspector(device) {
        activeInspectorId = device.id;
        const displayName = device.name || device.id;
        if(elInspTitle) elInspTitle.textContent = `${displayName} // CONFIG`;
        if(elInspAliasInput) elInspAliasInput.value = (device.name === device.id) ? "" : device.name;
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

    const btnScan = document.getElementById('scan-btn');
    if(btnScan) btnScan.addEventListener('click', () => {
        logSystem("INITIATING NETWORK SCAN...");
        if(elDeviceList) elDeviceList.innerHTML = '<li class="placeholder-msg blink">SCANNING FREQUENCIES...</li>';
        btnScan.disabled = true;
        btnScan.style.opacity = "0.5";
        setTimeout(() => {
            socket.emit('request_manual_scan');
            btnScan.disabled = false;
            btnScan.style.opacity = "1";
            logSystem("SCAN COMPLETE.");
        }, 800); 
    });

    // --- FUNZIONI UTILITY PER SCHEDE MULTI-NODO ---
    function formatTime(s) {
        if(s === undefined || isNaN(s)) return "00:00";
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    }

    function getDeviceName(id) {
        const dev = currentDevices.find(d => d.id === id);
        return dev && dev.name ? dev.name : id;
    }

    // Forza la chiusura della partita su uno specifico nodo
    window.forceEndNode = function(deviceId) {
        if(confirm(`ATTENZIONE: Terminare forzatamente la partita sul nodo [${deviceId.slice(-4)}]?`)) {
            socket.emit('send_command', { target_id: deviceId, command: { cmd: "FORCE_END_GAME" } });
            logSystem(`SENDING TERMINATION SIGNAL TO NODE [${deviceId.slice(-4)}]...`);
        }
    };

    function updateBarMulti(barId, width, isActive) {
        const barElem = document.getElementById(barId);
        if(!barElem) return;
        if(isActive) {
            clearTimeout(debounceTimers[barId]); 
            debounceTimers[barId] = null;
            barElem.style.width = `${width}%`;
        } else {
            if(barElem.style.width !== '0%') {
                if(!debounceTimers[barId]) {
                    debounceTimers[barId] = setTimeout(() => { 
                        barElem.style.width = '0%'; 
                        debounceTimers[barId] = null; 
                    }, 200);
                }
            }
        }
    }

    // Crea dinamicamente l'interfaccia se la scheda per il nodo non esiste
    function ensureNodeCard(deviceId, mode, deviceName) {
        let container = document.getElementById('nodes-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'nodes-container';
            container.style.display = 'grid';
            container.style.gridTemplateColumns = 'repeat(auto-fit, minmax(320px, 1fr))';
            container.style.gap = '20px';
            container.style.paddingTop = '15px';
            const monitorSection = document.querySelector('.tactical-layout');
            if(monitorSection) {
                // Inserisce il contenitore nodi prima delle regole
                monitorSection.insertBefore(container, monitorSection.firstChild);
            }
        }

        let card = document.getElementById(`node-card-${deviceId}`);
        if (!card) {
            card = document.createElement('div');
            card.id = `node-card-${deviceId}`;
            card.className = 'tactical-widget node-card'; 
            card.setAttribute('data-device-id', deviceId);
            
            // Stile base (può essere integrato nel tuo style.css in futuro)
            card.style.border = '1px solid var(--sop-dim)';
            card.style.padding = '15px';
            card.style.backgroundColor = 'rgba(0,0,0,0.5)';
            card.style.display = 'flex';
            card.style.flexDirection = 'column';

            let innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px dashed var(--sop-dim); padding-bottom:10px; margin-bottom:15px;">
                    <h3 style="margin:0; color:var(--sop-primary); font-size:16px;">
                        ${deviceName} <br><span style="font-size:12px; color:var(--sop-text); font-weight:normal;">[${mode}]</span>
                    </h3>
                    <button class="action-btn" style="color:var(--sop-alert); border:1px solid var(--sop-alert); background:transparent; padding:4px 8px; cursor:pointer;" onclick="window.forceEndNode('${deviceId}')">END</button>
                </div>
                
                <div style="font-size:28px; font-weight:bold; text-align:center; margin-bottom:15px; letter-spacing:1px;" id="status-${deviceId}">WAITING...</div>
                
                <div style="display:flex; justify-content:space-around; font-family:monospace; font-size:20px; margin-bottom:15px;">
                    <div>GAME:<br><span id="game-time-${deviceId}" style="color:var(--sop-primary);">00:00</span></div>
                    ${mode !== 'TEAM_DEATHMATCH' && mode !== 'DOMINATION' ? `<div>BOMB:<br><span id="bomb-time-${deviceId}" style="color:var(--sop-alert);">00:00</span></div>` : ''}
                </div>
            `;

            if (mode === 'DOMINATION') {
                innerHTML += `
                    <div style="display:flex; justify-content:space-around; font-family:monospace; font-size:22px; margin-bottom:15px; padding:10px; background:#111;">
                        <div style="color:var(--sop-alert); text-align:center;">ALPHA<br><span id="score-a-${deviceId}">00:00</span></div>
                        <div style="color:#55ff55; text-align:center;">BRAVO<br><span id="score-b-${deviceId}">00:00</span></div>
                    </div>
                `;
            }

            if (mode !== 'TEAM_DEATHMATCH') {
                let lbl1 = mode === 'SEARCH_AND_DESTROY' ? 'ARMING PROGRESS' : 'ALPHA CAPTURE';
                let lbl2 = mode === 'SEARCH_AND_DESTROY' ? 'DEFUSING PROGRESS' : 'BRAVO CAPTURE';
                let color1 = 'var(--sop-alert)';
                let color2 = '#55ff55';

                innerHTML += `
                    <div style="margin-top:auto;">
                        <div style="margin-bottom:10px;">
                            <div style="font-size:12px; color:var(--sop-dim); margin-bottom:4px;">${lbl1}</div>
                            <div style="height:12px; background:#111; border:1px solid #333; width:100%; position:relative;">
                                <div id="prog-1-${deviceId}" style="height:100%; width:0%; background:${color1}; transition:width 0.2s;"></div>
                            </div>
                        </div>
                        <div>
                            <div style="font-size:12px; color:var(--sop-dim); margin-bottom:4px;">${lbl2}</div>
                            <div style="height:12px; background:#111; border:1px solid #333; width:100%; position:relative;">
                                <div id="prog-2-${deviceId}" style="height:100%; width:0%; background:${color2}; transition:width 0.2s;"></div>
                            </div>
                        </div>
                    </div>
                `;
            }

            card.innerHTML = innerHTML;
            container.appendChild(card);
        }
        return card;
    }

    // Rimuove la scheda visiva se il nodo esce dalla modalità gioco
    function removeNodeCard(deviceId) {
        const card = document.getElementById(`node-card-${deviceId}`);
        if(card) {
            card.remove();
        }
    }

    // Aggiorna dinamicamente solo i valori all'interno della specifica scheda
    function updateNodeCard(deviceId, type, payload) {
        const elStatus = document.getElementById(`status-${deviceId}`);
        const elGameTime = document.getElementById(`game-time-${deviceId}`);
        const elBombTime = document.getElementById(`bomb-time-${deviceId}`);
        const elScoreA = document.getElementById(`score-a-${deviceId}`);
        const elScoreB = document.getElementById(`score-b-${deviceId}`);

        if (payload.state && elStatus) {
            elStatus.textContent = payload.state;
            const s = payload.state;
            if (s.includes('DEFUS') || s.includes('CT WINS') || s.includes('CAPTURING B') || s.includes('OWNED BRAVO') || s.includes('BRAVO WINS')) {
                elStatus.style.color = '#55ff55';
            } else if (s.includes('ARM') || s.includes('EXPLODED') || s.includes('T WINS') || s.includes('CAPTURING A') || s.includes('OWNED ALPHA') || s.includes('ALPHA WINS')) {
                elStatus.style.color = 'var(--sop-alert)';
            } else if (s === 'STANDBY' || s === 'PREPARING' || s === 'DRAW') {
                elStatus.style.color = '#ff9900';
            } else {
                elStatus.style.color = 'var(--sop-primary)';
            }
        }

        // TDM Countdown globale
        if (type === 'COUNTDOWN_UPDATE') {
            if(payload.time !== undefined && elGameTime) {
                elGameTime.textContent = `T-${payload.time}`;
                elGameTime.style.color = '#ff9900';
            }
            if(elStatus) {
                elStatus.textContent = "PREPARING";
                elStatus.style.color = "#ff9900";
            }
            return;
        } else if (elGameTime && elGameTime.style.color === 'rgb(255, 153, 0)') {
            // Ripristina colore normale dopo il countdown
            elGameTime.style.color = 'var(--sop-primary)';
        }

        if (payload.game_time !== undefined && elGameTime) {
            elGameTime.textContent = formatTime(payload.game_time);
        } else if (payload.time_left !== undefined && elGameTime) {
            elGameTime.textContent = formatTime(payload.time_left);
        }

        if (payload.bomb_time !== undefined && elBombTime) {
            elBombTime.textContent = formatTime(payload.bomb_time);
        }
        if (payload.score_a !== undefined && elScoreA) {
            elScoreA.textContent = formatTime(payload.score_a);
        }
        if (payload.score_b !== undefined && elScoreB) {
            elScoreB.textContent = formatTime(payload.score_b);
        }

        let width1 = 0, width2 = 0, bar1Active = false, bar2Active = false;
        const isDom = (type === 'DOM_UPDATE');

        if (!isDom && type !== 'TDM_UPDATE') {
            if(payload.arm_prog !== undefined) { width1 = payload.arm_prog; bar1Active = width1 > 0; }
            if(payload.def_prog !== undefined) { width2 = payload.def_prog; bar2Active = width2 > 0; }
        } else if (isDom) {
            const prog = payload.capture_prog || 0;
            const state = payload.state || '';
            if (state.includes('CAPTURING A')) { width1 = prog; bar1Active = true; }
            else if (state.includes('CAPTURING B')) { width2 = prog; bar2Active = true; }
        }

        updateBarMulti(`prog-1-${deviceId}`, width1, bar1Active);
        updateBarMulti(`prog-2-${deviceId}`, width2, bar2Active);
    }

    // Gestore Principale Eventi MQTT inoltrati
    function handleGameEvent(msg) {
        const raw = msg.parsed_data || {};
        const senderId = raw.id || 'UNK';
        const type = raw.type || 'UNKNOWN';
        const payload = raw.payload || {};
        const shortId = senderId.slice(-4);

        if (!['TIME_UPDATE', 'SD_UPDATE', 'DOM_UPDATE', 'TDM_UPDATE', 'HEARTBEAT'].includes(type)) {
            logSystem(`[${shortId}] ${type}`);
        }

        if (type === 'MODE_EXIT') {
            removeNodeCard(senderId);
            logSystem(`NODE [${shortId}] EXIT DETECTED.`);
            return;
        }

        if (type === 'TAG_ASSIGN') {
            socket.emit('register_operator', { uid: payload.uid, team: payload.team });
            return; 
        }

        let mode = payload.mode || raw.mode;
        if(!mode) {
             if (type === 'SD_UPDATE') mode = 'SEARCH_AND_DESTROY';
             else if (type === 'DOM_UPDATE') mode = 'DOMINATION';
             else if (type === 'TDM_UPDATE') mode = 'TEAM_DEATHMATCH';
        }
        if (mode === 'SEARCH_DESTROY') mode = 'SEARCH_AND_DESTROY';

        if (mode === 'KIOSK') return; 

        if (mode && type !== 'SETTINGS_UPDATE') {
            ensureNodeCard(senderId, mode, getDeviceName(senderId));
        }

        updateNodeCard(senderId, type, payload);
        
        if (type === 'SETTINGS_UPDATE' || (type === 'MODE_ENTER' && payload.bomb_time)) {
            renderRules(payload, senderId);
        }
    }

    // Le regole per ora vengono accumulate (o riscritte) nel pannello comune (o si possono vincolare al nodo se necessario)
    function renderRules(payload, deviceId) {
        const elSdRulesList = document.getElementById('sd-rules-list');
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
        if(!elMiniLog) return;
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

            const dur = parseInt(document.getElementById('tdm-game-dur').value) || 15;
            
            socket.emit('request_mission_start', {
                mode: mode,
                target_id: targetId,
                duration: dur,
                force: false
            });
        });
    }

    function updateSetupDropdown() {
        const elSetupTargetSelect = document.getElementById('setup-target-select');
        if (!elSetupTargetSelect) return;
        
        const currentSelection = elSetupTargetSelect.value;
        elSetupTargetSelect.innerHTML = '<option value="">-- Seleziona un nodo nel Menu Principale --</option>';
        
        const terminalDevices = currentDevices.filter(d => d.mode === 'MAIN MENU' || d.mode === 'TERMINAL');
        
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
        // Usa socket dalla finestra globale non è possibile se non esposto, quindi richiamiamo un custom event
        document.dispatchEvent(new CustomEvent('send_env_command', { detail: envCmd }));
        console.log(`> SYS_OVERRIDE: ${envCmd}`);
        const miniLog = document.getElementById('mini-log');
        if(miniLog) {
            const div = document.createElement('div');
            div.textContent = `> SYS_OVERRIDE: ${envCmd}`;
            miniLog.prepend(div);
        }
    }
};

document.addEventListener('send_env_command', function(e) {
    const socket = io(); // Alternativa: gestire il socket globale
    socket.emit('send_command', { target_id: "BROADCAST_ENV", command: { cmd: e.detail } });
});