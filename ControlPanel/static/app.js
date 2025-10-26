// File: ControlPanel/static/app.js (Versione Corretta)

document.addEventListener('DOMContentLoaded', () => {
    
    const socket = io();
    socket.on('connect', () => {
        console.log('Pagina connessa al server!');
        // Opzionale: Richiedi subito lo stato dei dispositivi
        // socket.emit('request_device_update'); 
    });

    // Rileva su quale pagina ci troviamo (non strettamente necessario qui, ma utile per contesto)
    const isDashboard = !!document.getElementById('device-list');
    const isGameControl = !!document.getElementById('waiting-view'); // Assumiamo che #waiting-view esista sempre in index.html

    // --- LOGICA ESEGUITA SOLO SULLA PAGINA DI CONTROLLO GIOCO ---
    if (isGameControl) {
        console.log('[DEBUG] Eseguo logica Game Control');
        
        // Riferimenti agli elementi HTML (mantieni tutti i tuoi const qui)
        const waitingView = document.getElementById('waiting-view');
        const modeSelectionView = document.getElementById('mode-selection-view');
        const terminalSelectionView = document.getElementById('terminal-selection-view');
        const terminalListView = document.getElementById('terminal-list');
        const terminalSelectionTitle = document.getElementById('terminal-selection-title');
        const terminalView = document.getElementById('terminal-view'); // Vista di configurazione
        const domView = document.getElementById('domination-view');
        const sdView = document.getElementById('sd-view');
        const simpleView = document.getElementById('simple-view'); // Vista generica (usata poco qui)
        
        const logList = document.getElementById('log-list');
        const statusIndicator = document.getElementById('connection-status-indicator');
        const statusText = document.getElementById('connection-status-text');
        
        // Pulsanti di selezione
        const selectTdmBtn = document.getElementById('select-tdm-btn'); // Anche se non implementato
        const selectSdBtn = document.getElementById('select-sd-btn');
        const selectDomBtn = document.getElementById('select-dom-btn');
        const backToModeSelectBtn = document.getElementById('back-to-mode-select-btn');

        // Elementi Configurazione Dominio
        const terminalDomConfig = document.getElementById('terminal-dom-config');
        const sendDomSettingsBtn = document.getElementById('send-dom-settings-btn');
        const startDomGameBtn = document.getElementById('start-dom-game-btn');
        const backToTerminalSelectDomBtn = document.getElementById('back-to-terminal-select-dom');
        
        // Elementi Configurazione S&D
        const terminalSdConfig = document.getElementById('terminal-sd-config');
        const termSendSdSettingsBtn = document.getElementById('term-send-sd-settings-btn');
        const termStartSdGameBtn = document.getElementById('term-start-sd-game-btn');
        const backToTerminalSelectSdBtn = document.getElementById('back-to-terminal-select-sd');
        
        // Elementi Monitoraggio Dominio
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
        const backFromDomBtn = document.getElementById('back-from-dom'); // Aggiunto riferimento bottone Indietro
        
        // Elementi Monitoraggio S&D
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
        const backFromSdBtn = document.getElementById('back-from-sd'); // Aggiunto riferimento bottone Indietro
        
        // Stato Globale
        let allDevices = [];
        // 'activeMode' rappresenta lo stato della UI:
        // 'waiting', 'mode-selection', 'terminal-selection', 'config', 'domination', 'sd'
        let activeMode = 'waiting'; // Inizia sempre da 'waiting'
        let activeDeviceId = null; // L'ID del terminale selezionato per la partita
        let selectedGameMode = null; // 'sd' o 'dom'
        
        // Variabili di gioco (mantieni le tue qui)
        let actionInterval = null;
        let lastGameState = 'In attesa di inizio...';
        let captureTime = 10, armTime = 5, defuseTime = 10;
        let gameTimerInterval = null;
        let gameTimerSeconds = 0;

        // --- Funzioni Helper ---
        function findOnlineDevice(devices) {
            if (!devices) return null;
            return devices.find(d => d.status === 'ONLINE');
        }

        function showView(viewName) {
            console.log(`[UI] Mostro vista: ${viewName}`);
            // Nascondi tutte le viste principali
            if(waitingView) waitingView.classList.add('hidden');
            if(modeSelectionView) modeSelectionView.classList.add('hidden');
            if(terminalSelectionView) terminalSelectionView.classList.add('hidden');
            if(terminalView) terminalView.classList.add('hidden'); // Nascondi anche la vista config
            if(domView) domView.classList.add('hidden');
            if(sdView) sdView.classList.add('hidden');
            if(simpleView) simpleView.classList.add('hidden'); // Nascondi anche simpleView se non serve
            
            // Mostra la vista richiesta
            if(viewName === 'waiting') waitingView?.classList.remove('hidden');
            else if(viewName === 'mode-selection') modeSelectionView?.classList.remove('hidden');
            else if(viewName === 'terminal-selection') terminalSelectionView?.classList.remove('hidden');
            else if(viewName === 'terminal') terminalView?.classList.remove('hidden'); // Mostra la vista config
            else if(viewName === 'domination') domView?.classList.remove('hidden');
            else if(viewName === 'sd') sdView?.classList.remove('hidden');
            // Aggiungi altre viste se necessario
        }

        function resetToModeSelection() {
            console.log("[UI] Reset a Selezione Modalità");
            activeMode = 'mode-selection';
            activeDeviceId = null; // Deseleziona il terminale
            selectedGameMode = null;
            showView('mode-selection'); 
            stopAllTimers();
            // Resetta anche i form di configurazione se vuoi
            resetTerminalView(); 
        }

        // --- Listener SocketIO ---

        socket.on('devices_update', (devices) => {
            console.log(`[UI State] Ricevuto devices_update. Stato attuale UI: ${activeMode}`);
            allDevices = devices;
            const anyDeviceOnline = findOnlineDevice(devices);

            if (anyDeviceOnline) {
                statusIndicator.classList.remove('status-offline');
                statusIndicator.classList.add('status-online');
                statusText.textContent = `DISPOSITIVI ONLINE: ${devices.filter(d => d.status === 'ONLINE').length}`;

                // Se eravamo in attesa o appena connessi, vai alla selezione modalità
                if (activeMode === 'none' || activeMode === 'waiting') {
                    activeMode = 'mode-selection';
                    showView('mode-selection');
                    console.log(`[UI State] Passato a: ${activeMode}`);
                }

                // Se siamo nella selezione terminale, aggiorna la lista
                if (activeMode === 'terminal-selection') {
                    populateTerminalList();
                }
                // Se siamo in configurazione o in gioco, NON fare nulla che cambi activeMode o activeDeviceId
                // Questo previene reset indesiderati se arriva un update mentre si configura/gioca.

            } else {
                // NESSUN dispositivo online
                statusIndicator.classList.remove('status-online');
                statusIndicator.classList.add('status-offline');
                statusText.textContent = 'NESSUN DISPOSITIVO ONLINE';

                // --- MODIFICA CHIAVE ---
                // Azzera l'ID e torna in attesa SOLO se NON siamo in una partita attiva
                // (preserviamo l'ID se siamo in 'config', 'domination', 'sd'
                // perché il dispositivo potrebbe tornare online a breve)
                if (activeMode !== 'config' && activeMode !== 'domination' && activeMode !== 'sd') {
                    activeDeviceId = null; // Azzera solo se eravamo nei menu iniziali
                }
                // Riporta sempre allo stato 'waiting' e mostra la vista corrispondente
                activeMode = 'waiting';
                showView('waiting');
                console.log(`[UI State] Passato a: ${activeMode} (Nessun dispositivo online). activeDeviceId: ${activeDeviceId}`);
                // Potrebbe essere utile fermare i timer qui se si disconnette tutto
                // stopAllTimers(); // Decommenta se necessario
                // --- FINE MODIFICA CHIAVE ---
            }
        });

        socket.on('game_update', (data) => {
            // Log grezzo
            if (logList) {
                const newLogEntry = document.createElement('li');
                newLogEntry.textContent = JSON.stringify(data);
                logList.prepend(newLogEntry);
            }

            // ** GESTIONE TRANSIZIONE DI STATO (MODE_ENTER) **
            // Questo evento è CRUCIALE per passare dalla configurazione al monitoraggio
            if (data.event === 'mode_enter') {
                // Controlla se l'evento proviene dal terminale che abbiamo avviato
                if (data.deviceId === activeDeviceId) {
                    console.log(`[STATE CHANGE] Ricevuto mode_enter: ${data.mode} da ${data.deviceId}. Cambio vista.`);
                    stopAllTimers(); // Ferma timer precedenti (es. timer di configurazione)
                    
                    if (data.mode === 'domination') { 
                        activeMode = 'domination'; // Imposta lo stato UI del GIOCO
                        showView('domination');    // Mostra la vista di MONITORAGGIO
                        resetDominationView(); 
                    } 
                    else if (data.mode === 'sd') { 
                        activeMode = 'sd';         // Imposta lo stato UI del GIOCO
                        showView('sd');            // Mostra la vista di MONITORAGGIO
                        resetSdView(false);        // Resetta la vista S&D
                        // Avvia il timer di round se necessario (es. se era impostato nella config)
                        if (gameDurationInput && gameDurationInput.value) {
                             startGameTimer(gameDurationInput.value);
                         }
                    }
                    else {
                        // Se l'ESP entra in un'altra modalità (es. main_menu dopo fine partita),
                        // torna alla selezione modalità.
                        console.log(`[STATE CHANGE] Terminale ${activeDeviceId} entrato in modalità ${data.mode}. Torno a selezione modalità.`);
                        resetToModeSelection();
                    }
                    return; // Evento gestito, non processare oltre
                } else {
                     console.log(`[DEBUG] Ricevuto mode_enter da ${data.deviceId} ma il terminale attivo è ${activeDeviceId}. Ignoro.`);
                }
            }
            
             // ** GESTIONE USCITA MODALITA' (MODE_EXIT) **
             if (data.event === 'mode_exit') {
                 if (data.deviceId === activeDeviceId) {
                     console.log(`[STATE CHANGE] Terminale ${activeDeviceId} uscito dalla modalità ${data.mode}. Torno a selezione modalità.`);
                     resetToModeSelection();
                     return; // Evento gestito
                 }
             }

            // Ignora messaggi se non abbiamo un terminale attivo o se provengono da un altro terminale
            if (!activeDeviceId || data.deviceId !== activeDeviceId) {
                // console.log(`[DEBUG] Messaggio ignorato: activeDeviceId=${activeDeviceId}, data.deviceId=${data.deviceId}`);
                return;
            }

            // ** GESTIONE SBLOCCO PULSANTE "AVVIA" durante la configurazione **
            if (activeMode === 'config' && data.event === 'settings_update') {
                console.log("[DEBUG] Ricevuto settings_update in modalità config, sblocco pulsante AVVIA");
                if (selectedGameMode === 'dom' && data.duration !== undefined) { 
                    startDomGameBtn.disabled = false;
                }
                if (selectedGameMode === 'sd' && data.bomb_time !== undefined) {
                    termStartSdGameBtn.disabled = false;
                }
            }

            // ** GESTIONE EVENTI DI GIOCO SPECIFICI (solo se siamo nella modalità corretta) **
            if (activeMode === 'domination') {
                handleDominationEvents(data);
            } else if (activeMode === 'sd') {
                handleSearchDestroyEvents(data);
            }
        });

        // --- LOGICA DI NAVIGAZIONE UI ---

        if(selectTdmBtn) {
             selectTdmBtn.addEventListener('click', () => {
                 alert('Modalità Deathmatch a Squadre non ancora implementata.');
             });
         }

        if(selectSdBtn) {
            selectSdBtn.addEventListener('click', () => {
                selectedGameMode = 'sd';
                activeMode = 'terminal-selection'; // Imposta stato UI
                terminalSelectionTitle.textContent = 'Seleziona Terminale (Cerca e Distruggi)';
                populateTerminalList();
                showView('terminal-selection');
            });
        }

        if(selectDomBtn) {
            selectDomBtn.addEventListener('click', () => {
                selectedGameMode = 'dom';
                activeMode = 'terminal-selection'; // Imposta stato UI
                terminalSelectionTitle.textContent = 'Seleziona Terminale (Dominio)';
                populateTerminalList();
                showView('terminal-selection');
            });
        }

        if(backToModeSelectBtn) {
            backToModeSelectBtn.addEventListener('click', () => {
                activeMode = 'mode-selection'; // Imposta stato UI
                selectedGameMode = null;
                activeDeviceId = null; // Deseleziona terminale quando torni alla selezione modalità
                showView('mode-selection');
            });
        }

        // Popola la lista dei terminali
        function populateTerminalList() {
            terminalListView.innerHTML = ''; // Pulisci la lista precedente
            const onlineDevices = allDevices.filter(d => d.status === 'ONLINE');

            if (onlineDevices.length === 0) {
                terminalListView.innerHTML = '<li class="terminal-list-item busy">Nessun terminale online trovato.</li>';
                return;
            }

            onlineDevices.forEach(device => {
                const li = document.createElement('li');
                // Un terminale è pronto se è online E in modalità 'terminal'
                const isReady = device.mode === 'terminal'; 
                li.className = 'terminal-list-item ' + (isReady ? 'ready' : 'busy');
                // Mostra l'ID completo e lo stato attuale
                li.innerHTML = `<span>${device.id}</span> <span>${isReady ? 'Pronto (in attesa)' : `Occupato (${device.mode})`}</span>`;
                
                // Rendi cliccabile solo se pronto
                if (isReady) {
                    li.addEventListener('click', () => {
                        activeDeviceId = device.id; // Memorizza l'ID del terminale scelto
                        console.log(`Terminale ${activeDeviceId} selezionato per la partita ${selectedGameMode}.`);
                        activeMode = 'config'; // Passa allo stato UI di configurazione
                        
                        showView('terminal'); // Mostra il contenitore generale della configurazione
                        
                        // Mostra il form di configurazione specifico per la modalità scelta
                        if (selectedGameMode === 'sd') {
                            terminalDomConfig.classList.add('hidden');
                            terminalSdConfig.classList.remove('hidden');
                            termStartSdGameBtn.disabled = true; // Disabilita avvio finché non si inviano le impostazioni
                        } else if (selectedGameMode === 'dom') {
                            terminalSdConfig.classList.add('hidden');
                            terminalDomConfig.classList.remove('hidden');
                            startDomGameBtn.disabled = true; // Disabilita avvio finché non si inviano le impostazioni
                        }
                    });
                }
                terminalListView.appendChild(li);
            });
        }

        // ** CORREZIONE PULSANTI "ANNULLA" dalla Configurazione **
        if(backToTerminalSelectDomBtn) {
            backToTerminalSelectDomBtn.addEventListener('click', () => {
                // activeDeviceId = null; // NON AZZERARE L'ID! L'utente potrebbe voler solo cambiare terminale o riguardare la lista.
                activeMode = 'terminal-selection'; // Imposta lo stato UI corretto (vista selezione terminale)
                populateTerminalList(); // Aggiorna la lista, lo stato dei terminali potrebbe essere cambiato
                showView('terminal-selection'); // Mostra la vista corretta
                console.log('[UI State] Tornato a selezione terminale (da config DOM). activeDeviceId:', activeDeviceId);
            });
        }
        if(backToTerminalSelectSdBtn) {
            backToTerminalSelectSdBtn.addEventListener('click', () => {
                // activeDeviceId = null; // NON AZZERARE L'ID!
                activeMode = 'terminal-selection'; // Imposta lo stato UI corretto
                populateTerminalList();
                showView('terminal-selection');
                console.log('[UI State] Tornato a selezione terminale (da config SD). activeDeviceId:', activeDeviceId);
            });
        }

        // ** CORREZIONE PULSANTI "INDIETRO" dal Monitoraggio **
        if(backFromDomBtn) {
             backFromDomBtn.addEventListener('click', (e) => {
                 e.preventDefault(); // Previeni comportamento link
                 resetToModeSelection();
             });
         }
         if(backFromSdBtn) {
             backFromSdBtn.addEventListener('click', (e) => {
                 e.preventDefault(); // Previeni comportamento link
                 resetToModeSelection();
             });
         }
        
        // --- Pulsanti di Invio Comandi ---
        
        // Invia Impostazioni Dominio
        if(sendDomSettingsBtn) {
            sendDomSettingsBtn.addEventListener('click', () => {
                if(!activeDeviceId) { alert("Nessun terminale attivo selezionato!"); return; } 
                const duration = document.getElementById('term-dom-duration').value;
                const capture = document.getElementById('term-dom-capture').value;
                const command = `CMD:SET_DOM_SETTINGS;DURATION:${duration};CAPTURE:${capture};`;
                socket.emit('send_command', { command: command, target_id: activeDeviceId });
                startDomGameBtn.disabled = true; // Disabilita di nuovo in attesa di conferma
                console.log(`[CMD SENT] Inviato SET_DOM_SETTINGS a ${activeDeviceId}`);
            });
        }
        
        // AVVIA PARTITA Dominio
        if(startDomGameBtn) {
            startDomGameBtn.addEventListener('click', () => {
                if(!activeDeviceId) { alert("Nessun terminale attivo selezionato!"); return; } 
                socket.emit('send_command', { command: 'CMD:START_DOM_GAME;', target_id: activeDeviceId });
                console.log(`[CMD SENT] Inviato START_DOM_GAME a ${activeDeviceId}. In attesa di mode_enter...`);
                // ** NON cambiare activeMode o showView qui! Aspetta mode_enter **
            });
        }
        
        // Invia Impostazioni S&D
        if(termSendSdSettingsBtn) {
            termSendSdSettingsBtn.addEventListener('click', () => {
                if(!activeDeviceId) { alert("Nessun terminale attivo selezionato!"); return; } 
                const cmd = `CMD:SET_SD_SETTINGS;BOMB_TIME:${document.getElementById('term-sd-bombtime').value};ARM_TIME:${document.getElementById('term-sd-armtime').value};DEFUSE_TIME:${document.getElementById('term-sd-defusetime').value};USE_ARM_PIN:${document.getElementById('term-sd-use-arm-pin').value};ARM_PIN:${document.getElementById('term-sd-arm-pin').value};USE_DEFUSE_PIN:${document.getElementById('term-sd-use-defuse-pin').value};DEFUSE_PIN:${document.getElementById('term-sd-defuse-pin').value};`;
                socket.emit('send_command', { command: cmd, target_id: activeDeviceId });
                termStartSdGameBtn.disabled = true; // Disabilita di nuovo in attesa di conferma
                console.log(`[CMD SENT] Inviato SET_SD_SETTINGS a ${activeDeviceId}`);
            });
        }

        // AVVIA PARTITA S&D
        if(termStartSdGameBtn) {
            termStartSdGameBtn.addEventListener('click', () => {
                if(!activeDeviceId) { alert("Nessun terminale attivo selezionato!"); return; }
                socket.emit('send_command', { command: 'CMD:START_SD_GAME;', target_id: activeDeviceId });
                console.log(`[CMD SENT] Inviato START_SD_GAME a ${activeDeviceId}. In attesa di mode_enter...`);
                // ** NON cambiare activeMode o showView qui! Aspetta mode_enter **
            });
        }
        
        // Termina Partita (pulsanti dentro le viste di monitoraggio)
        if(forceEndDomBtn) {
            forceEndDomBtn.addEventListener('click', () => {
                if(confirm("Terminare la partita Dominio?") && activeDeviceId) {
                    socket.emit('send_command', { command: 'CMD:FORCE_END_GAME', target_id: activeDeviceId });
                }
            });
        }
        
        if(forceEndSdBtn) {
            forceEndSdBtn.addEventListener('click', () => {
                if(confirm("Terminare la partita Cerca & Distruggi?") && activeDeviceId) {
                    socket.emit('send_command', { command: 'CMD:FORCE_END_GAME', target_id: activeDeviceId });
                }
            });
        }
        
        // Avvia Timer Locale (per S&D)
        if(startGameTimerBtn) {
            startGameTimerBtn.addEventListener('click', () => {
                startGameTimer(gameDurationInput.value);
            });
        }
        
        // --- FUNZIONI DI GIOCO (con formattazione) ---
        
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
        
        // Pulsanti di invio comandi
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
                if(!activeDeviceId) { alert("Terminale non connesso!"); return; }
                socket.emit('send_command', { command: 'CMD:START_DOM_GAME;', target_id: activeDeviceId });
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
                if(!activeDeviceId) { alert("Terminale non connesso!"); return; }
                socket.emit('send_command', { command: 'CMD:START_SD_GAME;', target_id: activeDeviceId });
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

