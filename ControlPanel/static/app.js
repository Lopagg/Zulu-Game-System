document.addEventListener('DOMContentLoaded', () => {
    
    const socket = io();
    socket.on('connect', () => {
        console.log('Pagina connessa al server!');
    });

    // Rileva su quale pagina ci troviamo
    const isDashboard = !!document.getElementById('device-list');
    const isGameControl = !!document.getElementById('waiting-view');

    // --- LOGICA ESEGUITA SOLO SULLA DASHBOARD ---
    if (isDashboard) {
        console.log('[DEBUG] Eseguo logica Dashboard');
        const deviceListElement = document.getElementById('device-list');
        const startGameBtn = document.getElementById('start-game-btn');

        socket.on('devices_update', (devices) => {
            console.log('Dashboard: Ricevuta lista dispositivi:', devices);
            if (!deviceListElement) {
                return;
            }

            deviceListElement.innerHTML = '';
            
            if (!devices || devices.length === 0) {
                deviceListElement.innerHTML = '<li>Nessun dispositivo online al momento.</li>';
                return;
            }

            devices.forEach(device => {
                const li = document.createElement('li');
                const statusClass = device.status === 'ONLINE' ? 'team-green' : 'team-red';
                let deviceName = device.id;
                if (device.mode === 'terminal') {
                    deviceName = `Terminale (${device.id})`;
                }

                li.innerHTML = `Dispositivo: <strong>${deviceName}</strong> - Stato: <span class="${statusClass}">${device.status}</span> - Modalità: <em>${device.mode || 'N/A'}</em>`;
                deviceListElement.appendChild(li);
            });
        });

        if (startGameBtn) {
            startGameBtn.addEventListener('click', () => {
                window.location.href = '/game_control';
            });
        }
    }

    // --- LOGICA ESEGUITA SOLO SULLA PAGINA DI CONTROLLO GIOCO ---
    if (isGameControl) {
        console.log('[DEBUG] Eseguo logica Game Control');
        
        // Riferimenti agli elementi HTML
        const waitingView = document.getElementById('waiting-view');
        const simpleView = document.getElementById('simple-view');
        const simpleModeName = document.getElementById('simple-mode-name');
        const domView = document.getElementById('domination-view');
        const sdView = document.getElementById('sd-view');
        const terminalView = document.getElementById('terminal-view');
        const logList = document.getElementById('log-list');
        const statusIndicator = document.getElementById('connection-status-indicator');
        const statusText = document.getElementById('connection-status-text');
        
        // Viste di selezione
        const modeSelectionView = document.getElementById('mode-selection-view');
        const terminalSelectionView = document.getElementById('terminal-selection-view');
        const terminalListView = document.getElementById('terminal-list');
        const terminalSelectionTitle = document.getElementById('terminal-selection-title');
        
        // Pulsanti di selezione
        const selectTdmBtn = document.getElementById('select-tdm-btn');
        const selectSdBtn = document.getElementById('select-sd-btn');
        const selectDomBtn = document.getElementById('select-dom-btn');
        const backToModeSelectBtn = document.getElementById('back-to-mode-select-btn');

        // Elementi Dominio
        const domTimer = document.getElementById('domination-timer');
        const domGameState = document.getElementById('domination-game-state');
        const settingDuration = document.getElementById('setting-duration');
        const settingCapture = document.getElementById('setting-capture');
        const settingCountdown = document.getElementById('setting-countdown');
        const winnerStatus = document.getElementById('status-winner');
        const team1ProgressContainer = document.getElementById('team1-progress-container');
        const team1ProgressBar = document.getElementById('team1-progress');
        const team2ProgressContainer = document.getElementById('team2-progress-container');
        const team2ProgressBar = document.getElementById('team2-progress');
        const scoreTeam1 = document.getElementById('score-team1');
        const scoreTeam2 = document.getElementById('score-team2');
        const forceEndDomBtn = document.getElementById('force-end-dom-btn');
        
        // Elementi Cerca & Distruggi
        const sdGameTimer = document.getElementById('sd-game-timer');
        const forceEndSdBtn = document.getElementById('force-end-sd-btn');
        const sdBombState = document.getElementById('sd-bomb-state');
        const sdBombTimer = document.getElementById('sd-bomb-timer');
        const settingBombTime = document.getElementById('setting-bomb-time');
        const settingArmTime = document.getElementById('setting-arm-time');
        const settingDefuseTime = document.getElementById('setting-defuse-time');
        const settingUseArmPin = document.getElementById('setting-use-arm-pin');
        const settingArmPin = document.getElementById('setting-arm-pin');
        const settingUseDefusePin = document.getElementById('setting-use-defuse-pin');
        const settingDisarmPin = document.getElementById('setting-disarm-pin');
        const armProgressContainer = document.getElementById('arm-progress-container');
        const armProgressBar = document.getElementById('arm-progress');
        const defuseProgressContainer = document.getElementById('defuse-progress-container');
        const defuseProgressBar = document.getElementById('defuse-progress');
        const gameDurationWrapper = document.getElementById('game-duration-wrapper');
        const gameDurationInput = document.getElementById('game-duration-input');
        const startGameTimerBtn = document.getElementById('start-game-timer-btn');
        
        // Elementi Terminale (Configurazione)
        const terminalDomConfig = document.getElementById('terminal-dom-config');
        const sendDomSettingsBtn = document.getElementById('send-dom-settings-btn');
        const startDomGameBtn = document.getElementById('start-dom-game-btn');
        // CORREZIONE 2: ID Corretto
        const backToTerminalSelectDomBtn = document.getElementById('back-to-terminal-select-dom');
        
        const terminalSdConfig = document.getElementById('terminal-sd-config');
        const termSendSdSettingsBtn = document.getElementById('term-send-sd-settings-btn');
        const termStartSdGameBtn = document.getElementById('term-start-sd-game-btn');
        // CORREZIONE 2: ID Corretto
        const backToTerminalSelectSdBtn = document.getElementById('back-to-terminal-select-sd');
        
        // Stato Globale
        let allDevices = [];
        let activeMode = 'none'; // Stato della UI (mode-selection, terminal-selection, config, domination, sd)
        let activeDeviceId = null; // L'ID del terminale che abbiamo SELEZIONATO
        let selectedGameMode = null; // 'sd' o 'dom', per sapere quale config mostrare
        
        let actionInterval = null;
        let lastGameState = 'In attesa di inizio...';
        let captureTime = 10, armTime = 5, defuseTime = 10;
        let gameTimerInterval = null;
        let gameTimerSeconds = 0;

        // Funzione per trovare un dispositivo online (qualsiasi)
        function findOnlineDevice(devices) {
            if (!devices) {
                return null;
            }
            return devices.find(d => d.status === 'ONLINE');
        }
        
        // Listener principale per lo stato dei dispositivi
        socket.on('devices_update', (devices) => {
            console.log('[DEBUG] Game Control: Ricevuta lista dispositivi:', devices);
            allDevices = devices; 

            const anyDeviceOnline = findOnlineDevice(devices);

            if (anyDeviceOnline) {
                statusIndicator.classList.remove('status-offline');
                statusIndicator.classList.add('status-online');
                statusText.textContent = `DISPOSITIVI ONLINE: ${devices.filter(d => d.status === 'ONLINE').length}`;
                
                if (activeMode === 'none') {
                    waitingView.classList.add('hidden');
                    showView('mode-selection');
                }
                
                if (activeMode === 'terminal-selection') {
                    populateTerminalList();
                }

            } else {
                activeDeviceId = null;
                statusIndicator.classList.remove('status-online');
                statusIndicator.classList.add('status-offline');
                statusText.textContent = 'NESSUN DISPOSITIVO ONLINE';
                showView('waiting'); // Mostra "IN ATTESA"
            }
        });

        // Listener per i messaggi di gioco
        socket.on('game_update', (data) => {
            if (logList) {
                const newLogEntry = document.createElement('li');
                newLogEntry.textContent = JSON.stringify(data);
                logList.prepend(newLogEntry);
            }

            // CORREZIONE (Sblocco Pulsante "Avvia"): 
            // Gestisce l'abilitazione dei pulsanti "AVVIA"
            // Questo evento deve essere gestito *sempre* se proviene dal terminale attivo
            // e siamo in modalità configurazione.
            if (activeDeviceId && data.deviceId === activeDeviceId && data.event === 'settings_update') {
                console.log("[DEBUG] Ricevuto settings_update, sblocco pulsante AVVIA");
                if (data.duration) { 
                    startDomGameBtn.disabled = false;
                }
                if (data.bomb_time) {
                    termStartSdGameBtn.disabled = false;
                }
            }
            
            // CORREZIONE (Transizione Vista): 
            // La transizione di modalità (mode_enter) è l'evento più importante
            // e deve essere gestito *prima* del filtro generale.
            if (data.event === 'mode_enter') {
                // Se questo evento proviene dal dispositivo che abbiamo appena avviato...
                if (data.deviceId === activeDeviceId) {
                    console.log(`[DEBUG] Transizione alla modalità di gioco: ${data.mode}`);
                    stopAllTimers();
                    activeMode = data.mode; // Imposta lo stato della UI sulla modalità di gioco (es. 'domination')
                    
                    if (data.mode === 'domination') { 
                        showView('domination'); 
                        resetDominationView(); 
                    } 
                    else if (data.mode === 'sd') { 
                        showView('sd'); 
                        resetSdView(false); 
                    }
                    else {
                        // Se entra in un'altra modalità (es. music, main_menu)
                        // torniamo alla selezione modalità.
                        resetToMainMenu();
                    }
                    return; // Evento gestito
                }
            }

            // Ignora tutti gli altri messaggi se non provengono dal terminale attivo
            if (!activeDeviceId || data.deviceId !== activeDeviceId) {
                return;
            }

            // GESTIONE ALTRI EVENTI (solo per il dispositivo attivo)
            if (data.event === 'device_online' || data.event === 'mode_exit') {
                // Il dispositivo è tornato al menu principale, quindi torniamo alla selezione modalità
                resetToMainMenu();
            
            } else if (data.event === 'remote_start') {
                // Questo evento (che arriva prima di mode_enter)
                // ora viene solo loggato. La transizione della vista
                // è gestita correttamente da 'mode_enter'.
                console.log("[DEBUG] Comando remote_start ricevuto.");
            }

            // Gestori specifici per gli eventi *interni* a una modalità
            if (activeMode === 'domination') {
                handleDominationEvents(data);
            } else if (activeMode === 'sd') {
                handleSearchDestroyEvents(data);
            }
        });

        // --- NUOVA LOGICA DI FLUSSO ---

        if(selectTdmBtn) {
            selectTdmBtn.addEventListener('click', () => {
                alert('Modalità Deathmatch a Squadre non ancora implementata.');
            });
        }

        if(selectSdBtn) {
            selectSdBtn.addEventListener('click', () => {
                selectedGameMode = 'sd';
                terminalSelectionTitle.textContent = 'Seleziona Terminale (Cerca e Distruggi)';
                populateTerminalList();
                showView('terminal-selection');
            });
        }

        if(selectDomBtn) {
            selectDomBtn.addEventListener('click', () => {
                selectedGameMode = 'dom';
                terminalSelectionTitle.textContent = 'Seleziona Terminale (Dominio)';
                populateTerminalList();
                showView('terminal-selection');
            });
        }

        if(backToModeSelectBtn) {
            backToModeSelectBtn.addEventListener('click', () => {
                showView('mode-selection');
            });
        }

        function populateTerminalList() {
            terminalListView.innerHTML = '';
            const onlineDevices = allDevices.filter(d => d.status === 'ONLINE');

            if (onlineDevices.length === 0) {
                terminalListView.innerHTML = '<li class="terminal-list-item busy">Nessun terminale online trovato.</li>';
                return;
            }

            onlineDevices.forEach(device => {
                const li = document.createElement('li');
                const isReady = device.mode === 'terminal';
                li.className = 'terminal-list-item ' + (isReady ? 'ready' : 'busy');
                li.innerHTML = `<span>${device.id}</span> <span>${isReady ? 'Pronto' : `Occupato (${device.mode})`}</span>`;
                
                if (isReady) {
                    li.addEventListener('click', () => {
                        activeDeviceId = device.id; 
                        console.log(`Terminale ${activeDeviceId} selezionato per la partita.`);
                        activeMode = 'config'; // Siamo in modalità configurazione
                        
                        showView('terminal');
                        
                        if (selectedGameMode === 'sd') {
                            terminalDomConfig.classList.add('hidden');
                            terminalSdConfig.classList.remove('hidden');
                        } else if (selectedGameMode === 'dom') {
                            terminalSdConfig.classList.add('hidden');
                            terminalDomConfig.classList.remove('hidden');
                        }
                    });
                }
                terminalListView.appendChild(li);
            });
        }

        if(backToTerminalSelectDomBtn) {
            backToTerminalSelectDomBtn.addEventListener('click', () => {
                    // activeDeviceId = null; // NON azzerare l'ID, l'utente potrebbe voler solo cambiare le impostazioni
                    activeMode = 'terminal-selection'; // Imposta lo stato corretto
                    populateTerminalList(); // Aggiorna solo la lista
                    showView('terminal-selection'); // Torna alla selezione
            });
        }
        if(backToTerminalSelectSdBtn) {
            backToTerminalSelectSdBtn.addEventListener('click', () => {
                // activeDeviceId = null; // NON azzerare l'ID
                activeMode = 'terminal-selection'; // Imposta lo stato corretto
                populateTerminalList();
                showView('terminal-selection');
            });
        }
        
        // --- FUNZIONI DI GIOCO (con formattazione e logica corretta) ---
        
        function handleDominationEvents(data) {
            if (data.event === 'settings_update') {
                settingDuration.textContent = data.duration;
                settingCapture.textContent = data.capture;
                captureTime = parseInt(data.capture, 10);
                settingCountdown.textContent = data.countdown;
            }
            if (data.event === 'countdown_start' || data.event === 'game_start') {
                forceEndDomBtn.classList.remove('hidden');
                lastGameState = (data.event === 'game_start') ? 'ZONA NEUTRA' : `Partita inizia in ${data.duration || data.time}s...`;
                domGameState.innerHTML = lastGameState;
            }
            if (data.event === 'countdown_update') {
                lastGameState = `Partita inizia in ${data.time}s...`;
                domGameState.innerHTML = lastGameState;
            }
            if (data.event === 'time_update') {
                updateTimerDisplay(domTimer, parseInt(data.time, 10));
            }
            if (data.event === 'capture_start') {
                lastGameState = domGameState.innerHTML;
                domGameState.innerHTML = `Squadra <span class="team-${data.team === '1' ? 'red' : 'green'}">${data.team === '1' ? 'Rossa' : 'Verde'}</span> sta conquistando...`;
                startProgressBar(data.team === '1' ? team1ProgressBar : team2ProgressBar, captureTime);
            }
            if (data.event === 'capture_cancel') {
                stopProgressBar();
                domGameState.innerHTML = 'Conquista annullata!';
                setTimeout(() => { domGameState.innerHTML = lastGameState; }, 2000);
            }
            if (data.event === 'zone_captured') {
                stopProgressBar();
                lastGameState = `ZONA SQUADRA <span class="team-${data.team === '1' ? 'red' : 'green'}">${data.team === '1' ? 'ROSSA' : 'VERDE'}</span>!`;
                domGameState.innerHTML = lastGameState;
            }
            if (data.event === 'score_update') {
                scoreTeam1.textContent = formatMilliseconds(data.team1_score);
                scoreTeam2.textContent = formatMilliseconds(data.team2_score);
            }
            if (data.event === 'game_end') {
                domTimer.textContent = "00:00";
                domGameState.innerHTML = "Partita Terminata!";
                forceEndDomBtn.classList.add('hidden');
                if (data.winner === '1') winnerStatus.innerHTML = 'SQUADRA <span class="team-red">ROSSA</span>';
                else if (data.winner === '2') winnerStatus.innerHTML = 'SQUADRA <span class="team-green">VERDE</span>';
                else winnerStatus.innerHTML = "PAREGGIO";
            }
        }
        
        function handleSearchDestroyEvents(data) {
            if (data.event === 'settings_update') {
                settingBombTime.textContent = data.bomb_time;
                settingArmTime.textContent = data.arm_time;
                armTime = parseInt(data.arm_time, 10);
                settingDefuseTime.textContent = data.defuse_time;
                defuseTime = parseInt(data.defuse_time, 10);
                settingUseArmPin.textContent = data.use_arm_pin === '1' ? 'Sì' : 'No';
                settingArmPin.textContent = data.arm_pin;
                settingUseDefusePin.textContent = data.use_disarm_pin === '1' ? 'Sì' : 'No';
                settingDisarmPin.textContent = data.disarm_pin;
            }
            if (data.event === 'game_start') {
                sdBombState.textContent = 'In attesa di innesco...';
                startGameTimerBtn.disabled = false;
                forceEndSdBtn.classList.remove('hidden');
            }
            if (data.event === 'arm_start') {
                sdBombState.textContent = 'Innesco in corso...';
                startProgressBar(armProgressBar, armTime);
            }
            if (data.event === 'arm_cancel') {
                sdBombState.textContent = 'Innesco annullato. In attesa...';
                stopProgressBar();
            }
            if (data.event === 'arm_pin_wrong') {
                sdBombState.textContent = 'PIN innesco errato!';
            }
            if (data.event === 'bomb_armed') {
                stopProgressBar();
                sdBombState.textContent = 'BOMBA INNESCATA!';
            }
            if (data.event === 'time_update') {
                updateTimerDisplay(sdBombTimer, parseInt(data.time, 10));
            }
            if (data.event === 'defuse_start') {
                sdBombState.textContent = 'Disinnesco in corso...';
                startProgressBar(defuseProgressBar, defuseTime);
            }
            if (data.event === 'defuse_cancel') {
                sdBombState.textContent = 'BOMBA INNESCATA!';
                stopProgressBar();
            }
            if (data.event === 'defuse_pin_wrong') {
                sdBombState.textContent = 'PIN disinnesco errato!';
            }
            if (data.event === 'game_end') {
                stopGameTimer();
                stopProgressBar();
                forceEndSdBtn.classList.add('hidden');
                let winnerText = data.winner === 'terrorists' ? 'squadra <span class="team-red">T</span>' : 'squadra <span class="team-green">CT</span>';
                sdBombState.innerHTML = `Partita finita! Vince la ${winnerText}`;
            }
            if (data.event === 'round_reset') {
                resetSdView(false);
            }
        }
        
        // Pulsanti di invio comandi (ora usano activeDeviceId)
        if(sendDomSettingsBtn) {
            sendDomSettingsBtn.addEventListener('click', () => {
                if(!activeDeviceId) { alert("Terminale non connesso!"); return; }
                const duration = document.getElementById('term-dom-duration').value;
                const capture = document.getElementById('term-dom-capture').value;
                socket.emit('send_command', { command: `CMD:SET_DOM_SETTINGS;DURATION:${duration};CAPTURE:${capture};`, target_id: activeDeviceId });
                startDomGameBtn.disabled = true;
            });
        }
        
        if(startDomGameBtn) {
            startDomGameBtn.addEventListener('click', () => {
                // Questo controllo ora funzionerà perché activeDeviceId non è stato azzerato
                if(!activeDeviceId) { alert("Nessun terminale attivo selezionato!"); return; } 
                socket.emit('send_command', { command: 'CMD:START_DOM_GAME;', target_id: activeDeviceId });
                console.log(`[CMD SENT] Inviato START_DOM_GAME a ${activeDeviceId}. In attesa di mode_enter...`);
            });
        }
        
        if(termSendSdSettingsBtn) {
            termSendSdSettingsBtn.addEventListener('click', () => {
                if(!activeDeviceId) { alert("Terminale non connesso!"); return; }
                const cmd = `CMD:SET_SD_SETTINGS;BOMB_TIME:${document.getElementById('term-sd-bombtime').value};ARM_TIME:${document.getElementById('term-sd-armtime').value};DEFUSE_TIME:${document.getElementById('term-sd-defusetime').value};USE_ARM_PIN:${document.getElementById('term-sd-use-arm-pin').value};ARM_PIN:${document.getElementById('term-sd-arm-pin').value};USE_DEFUSE_PIN:${document.getElementById('term-sd-use-defuse-pin').value};DEFUSE_PIN:${document.getElementById('term-sd-defuse-pin').value};`;
                socket.emit('send_command', { command: cmd, target_id: activeDeviceId });
                termStartSdGameBtn.disabled = true;
            });
        }

        if(termStartSdGameBtn) {
            termStartSdGameBtn.addEventListener('click', () => {
                // Questo controllo ora funzionerà
                if(!activeDeviceId) { alert("Nessun terminale attivo selezionato!"); return; } 
                socket.emit('send_command', { command: 'CMD:START_SD_GAME;', target_id: activeDeviceId });
                console.log(`[CMD SENT] Inviato START_SD_GAME a ${activeDeviceId}. In attesa di mode_enter...`);
            });
        }
        
        if(forceEndDomBtn) {
            forceEndDomBtn.addEventListener('click', () => {
                if(confirm("Terminare la partita?") && activeDeviceId) {
                    socket.emit('send_command', { command: 'CMD:FORCE_END_GAME', target_id: activeDeviceId });
                }
            });
        }
        
        if(forceEndSdBtn) {
            forceEndSdBtn.addEventListener('click', () => {
                if(confirm("Terminare la partita?") && activeDeviceId) {
                    socket.emit('send_command', { command: 'CMD:FORCE_END_GAME', target_id: activeDeviceId });
                }
            });
        }
        
        if(startGameTimerBtn) {
            startGameTimerBtn.addEventListener('click', () => {
                startGameTimer(gameDurationInput.value);
            });
        }

        // --- Funzioni Helper (formattate) ---
        
        function startGameTimer(minutes) {
            stopGameTimer();
            gameTimerSeconds = parseInt(minutes, 10) * 60;
            if (isNaN(gameTimerSeconds) || gameTimerSeconds <= 0) {
                return;
            }
            gameDurationWrapper.classList.add('hidden');
            forceEndSdBtn.classList.remove('hidden');
            updateTimerDisplay(sdGameTimer, gameTimerSeconds);
            gameTimerInterval = setInterval(() => {
                gameTimerSeconds--;
                updateTimerDisplay(sdGameTimer, gameTimerSeconds);
                if (gameTimerSeconds <= 0) {
                    stopGameTimer();
                    sdBombState.innerHTML = "TEMPO SCADUTO! Vince CT";
                    if(activeDeviceId) {
                        socket.emit('send_command', { command: 'CMD:FORCE_END_GAME', target_id: activeDeviceId });
                    }
                }
            }, 1000);
        }
        
        function stopGameTimer() {
            clearInterval(gameTimerInterval);
            gameTimerInterval = null;
            if(forceEndSdBtn) {
                forceEndSdBtn.classList.add('hidden');
            }
            if(startGameTimerBtn) {
                startGameTimerBtn.disabled = true;
            }
            if(gameDurationWrapper) {
                gameDurationWrapper.classList.remove('hidden');
            }
        }
        
        function stopAllTimers() {
            stopGameTimer();
            stopProgressBar();
        }
        
        function updateTimerDisplay(element, totalSeconds) {
            if(!element) {
                return;
            }
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            element.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
        
        function startProgressBar(barElement, durationSeconds) {
            stopProgressBar();
            const container = barElement.parentElement;
            container.classList.remove('hidden');
            barElement.style.width = '0%';
            const startTime = Date.now();
            actionInterval = setInterval(() => {
                const elapsedTime = Date.now() - startTime;
                const progress = (elapsedTime / (durationSeconds * 1000)) * 100;
                barElement.style.width = Math.min(progress, 100) + '%';
                if (progress >= 100) {
                    stopProgressBar();
                }
            }, 50);
        }
        
        function stopProgressBar() {
            clearInterval(actionInterval);
            if(team1ProgressContainer) team1ProgressContainer.classList.add('hidden');
            if(team2ProgressContainer) team2ProgressContainer.classList.add('hidden');
            if(armProgressContainer) armProgressContainer.classList.add('hidden');
            if(defuseProgressContainer) defuseProgressContainer.classList.add('hidden');
            
            if(team1ProgressBar) team1ProgressBar.style.width = '0%';
            if(team2ProgressBar) team2ProgressBar.style.width = '0%';
            if(armProgressBar) armProgressBar.style.width = '0%';
            if(defuseProgressBar) defuseProgressBar.style.width = '0%';
        }
        
        function formatMilliseconds(ms) {
            const totalSeconds = Math.floor(ms / 1000);
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
        
        function showView(viewName) {
            if(waitingView) waitingView.classList.add('hidden');
            if(simpleView) simpleView.classList.add('hidden');
            if(domView) domView.classList.add('hidden');
            if(sdView) sdView.classList.add('hidden');
            if(terminalView) terminalView.classList.add('hidden');
            if(modeSelectionView) modeSelectionView.classList.add('hidden');
            if(terminalSelectionView) terminalSelectionView.classList.add('hidden');
            
            if(viewName === 'waiting') waitingView.classList.remove('hidden');
            else if(viewName === 'simple') simpleView.classList.remove('hidden');
            else if(viewName === 'domination') domView.classList.remove('hidden');
            else if(viewName === 'sd') sdView.classList.remove('hidden');
            else if(viewName === 'terminal') terminalView.classList.remove('hidden');
            else if(viewName === 'mode-selection') modeSelectionView.classList.remove('hidden');
            else if(viewName === 'terminal-selection') terminalSelectionView.classList.remove('hidden');
        }

        function resetToMainMenu() {
            activeMode = 'none';
            activeDeviceId = null;
            selectedGameMode = null;
            showView('mode-selection'); 
            stopAllTimers();
        }
        
        function resetDominationView() {
            if(domGameState) domGameState.innerHTML = 'In attesa di inizio...';
            lastGameState = 'In attesa di inizio...';
            if(domTimer) domTimer.textContent = '--:--';
            if(winnerStatus) winnerStatus.innerHTML = '--';
            if(scoreTeam1) scoreTeam1.textContent = '00:00';
            if(scoreTeam2) scoreTeam2.textContent = '00:00';
            if(forceEndDomBtn) forceEndDomBtn.classList.add('hidden');
        }
        
        function resetSdView(isRemoteStart = false) {
            if(sdBombState) sdBombState.textContent = 'In attesa di inizio...';
            if(sdBombTimer) sdBombTimer.textContent = '--:--';
            if(sdGameTimer) sdGameTimer.textContent = '--:--';
            stopGameTimer();
            if (isRemoteStart) {
                if(gameDurationWrapper) gameDurationWrapper.classList.add('hidden');
            } else {
                if(gameDurationWrapper) gameDurationWrapper.classList.remove('hidden');
                if(startGameTimerBtn) startGameTimerBtn.disabled = true;
                if(gameDurationInput && sdGameTimer) updateTimerDisplay(sdGameTimer, parseInt(gameDurationInput.value, 10) * 60);
            }
        }
        
        function resetTerminalView() {
            // Nasconde i pannelli di configurazione
            if(terminalDomConfig) terminalDomConfig.classList.add('hidden'); 
            if(terminalSdConfig) terminalSdConfig.classList.add('hidden'); 
            // Disabilita i pulsanti di avvio
            if(startDomGameBtn) startDomGameBtn.disabled = true; 
            if(termStartSdGameBtn) termStartSdGameBtn.disabled = true; 
        }
    
        console.log("[DEBUG] Logica Game Control caricata e listener agganciati.");
    }
});