// Aggiungiamo un listener per assicurarci che tutto il codice venga eseguito solo dopo che la pagina è stata caricata completamente.
document.addEventListener('DOMContentLoaded', () => {
    
    const socket = io();
    socket.on('connect', () => {
        console.log('Connesso al server!');
    });

    // Rileva su quale pagina ci troviamo analizzando l'URL
    const isDashboard = window.location.pathname === '/';
    const isGameControl = window.location.pathname.startsWith('/game_control');

    // --- LOGICA ESEGUITA SOLO SULLA DASHBOARD ---
    if (isDashboard) {
        const deviceListElement = document.getElementById('device-list');
        const startGameBtn = document.getElementById('start-game-btn');

        // Quando il server invia la lista dei dispositivi, la visualizziamo
        socket.on('devices_update', (devices) => {
            console.log('Ricevuta lista dispositivi:', devices);
            if (!deviceListElement) return; // Sicurezza: esce se l'elemento non esiste
            deviceListElement.innerHTML = ''; // Pulisce la lista
            
            if (!devices || devices.length === 0) {
                deviceListElement.innerHTML = '<li>Nessun dispositivo online al momento.</li>';
                return;
            }

            devices.forEach(device => {
                const li = document.createElement('li');
                const statusClass = device.status === 'ONLINE' ? 'team-green' : 'team-red';
                // Aggiungiamo un ID univoco per il terminale se necessario
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
                // Quando si clicca "Avvia Partita", reindirizziamo alla pagina di controllo
                window.location.href = '/game_control';
            });
        }
    }

    // --- LOGICA ESEGUITA SOLO SULLA PAGINA DI CONTROLLO GIOCO ---
    if (isGameControl) {
        // Riferimenti a tutti gli elementi della pagina di controllo
        const waitingView = document.getElementById('waiting-view');
        const simpleView = document.getElementById('simple-view');
        const simpleModeName = document.getElementById('simple-mode-name');
        const domView = document.getElementById('domination-view');
        const sdView = document.getElementById('sd-view');
        const terminalView = document.getElementById('terminal-view');
        const logList = document.getElementById('log-list');
        const statusIndicator = document.getElementById('connection-status-indicator');
        const statusText = document.getElementById('connection-status-text');
        
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
        const terminalModeSelect = document.getElementById('terminal-mode-select');
        const prepDomBtn = document.getElementById('prep-dom-btn');
        const terminalDomConfig = document.getElementById('terminal-dom-config');
        const sendDomSettingsBtn = document.getElementById('send-dom-settings-btn');
        const startDomGameBtn = document.getElementById('start-dom-game-btn');
        const backToTerminalSelectBtn = document.getElementById('back-to-terminal-select');
        const prepSdBtn = document.getElementById('prep-sd-btn');
        const terminalSdConfig = document.getElementById('terminal-sd-config');
        const termSendSdSettingsBtn = document.getElementById('term-send-sd-settings-btn');
        const termStartSdGameBtn = document.getElementById('term-start-sd-game-btn');
        const backToTerminalSelectSdBtn = document.getElementById('back-to-terminal-select-sd');
        
        let activeMode = 'none';
        let actionInterval = null;
        let lastGameState = 'In attesa di inizio...';
        let captureTime = 10, armTime = 5, defuseTime = 10;
        let gameTimerInterval = null;
        let wasStartedFromTerminal = false;
        let gameTimerSeconds = 0;

        socket.on('connection_status', (data) => {
            if (!statusIndicator) return;
            if (data.status === 'ONLINE') {
                statusIndicator.classList.remove('status-offline');
                statusIndicator.classList.add('status-online');
                statusText.textContent = 'DISPOSITIVO ONLINE';
                waitingView.classList.add('hidden');
            } else {
                statusIndicator.classList.remove('status-online');
                statusIndicator.classList.add('status-offline');
                statusText.textContent = 'DISPOSITIVO OFFLINE';
                waitingView.classList.remove('hidden');
                showView('none');
            }
        });

        socket.on('game_update', (data) => {
            if (logList) {
                const newLogEntry = document.createElement('li');
                newLogEntry.textContent = JSON.stringify(data);
                logList.prepend(newLogEntry);
            }
            if (data.event === 'device_online' || data.event === 'mode_exit') {
                resetToMainMenu();
            } else if (data.event === 'mode_enter') {
                stopAllTimers();
                activeMode = data.mode;
                if (data.mode === 'domination') { showView('domination'); resetDominationView(); } 
                else if (data.mode === 'sd') { showView('sd'); resetSdView(false); }
                else if (data.mode === 'terminal') { showView('terminal'); resetTerminalView(); } 
                else {
                    showView('simple');
                    if (data.mode === 'main_menu') simpleModeName.textContent = 'Menu principale';
                    else if (data.mode === 'music') simpleModeName.textContent = 'Stanza dei Suoni';
                    else if (data.mode === 'testhw') simpleModeName.textContent = 'Test Hardware';
                }
            } else if (data.event === 'remote_start') {
                activeMode = data.mode;
                if (data.mode === 'domination') { showView('domination'); resetDominationView(); } 
                else if (data.mode === 'sd') {
                    showView('sd');
                    resetSdView(true);
                    const gameTime = document.getElementById('term-sd-gametime').value;
                    startGameTimer(gameTime);
                }
            }

            if (activeMode === 'domination') handleDominationEvents(data);
            else if (activeMode === 'sd') handleSearchDestroyEvents(data);
            else if (activeMode === 'terminal') handleTerminalEvents(data);
        });
        
        // Qui iniziano tutte le funzioni helper che erano nel vecchio index.html
        function handleDominationEvents(data) {
            if (data.event === 'settings_update') { settingDuration.textContent = data.duration; settingCapture.textContent = data.capture; captureTime = parseInt(data.capture, 10); settingCountdown.textContent = data.countdown; }
            if (data.event === 'countdown_start') { lastGameState = `Partita inizia in ${data.duration}s...`; domGameState.innerHTML = lastGameState; }
            if (data.event === 'countdown_update') { lastGameState = `Partita inizia in ${data.time}s...`; domGameState.innerHTML = lastGameState; }
            if (data.event === 'game_start') { lastGameState = 'ZONA NEUTRA'; domGameState.innerHTML = lastGameState; }
            if (data.event === 'time_update') { updateTimerDisplay(domTimer, parseInt(data.time, 10)); }
            if (data.event === 'capture_start') { lastGameState = domGameState.innerHTML; domGameState.innerHTML = `Squadra <span class="team-${data.team === '1' ? 'red' : 'green'}">${data.team === '1' ? 'Rossa' : 'Verde'}</span> sta conquistando...`; startProgressBar(data.team === '1' ? team1ProgressBar : team2ProgressBar, captureTime); }
            if (data.event === 'capture_cancel') { stopProgressBar(); domGameState.innerHTML = 'Conquista annullata!'; setTimeout(() => { domGameState.innerHTML = lastGameState; }, 2000); }
            if (data.event === 'zone_captured') { stopProgressBar(); lastGameState = `ZONA SQUADRA <span class="team-${data.team === '1' ? 'red' : 'green'}">${data.team === '1' ? 'ROSSA' : 'VERDE'}</span>!`; domGameState.innerHTML = lastGameState; }
            if (data.event === 'score_update') { scoreTeam1.textContent = formatMilliseconds(data.team1_score); scoreTeam2.textContent = formatMilliseconds(data.team2_score); }
            if (data.event === 'game_end') { domTimer.textContent = "00:00"; domGameState.innerHTML = "Partita Terminata!"; if (data.winner === '1') winnerStatus.innerHTML = 'SQUADRA <span class="team-red">ROSSA</span>'; else if (data.winner === '2') winnerStatus.innerHTML = 'SQUADRA <span class="team-green">VERDE</span>'; else winnerStatus.innerHTML = "PAREGGIO"; }
        }
        function handleSearchDestroyEvents(data) {
            if (data.event === 'settings_update') { settingBombTime.textContent = data.bomb_time; settingArmTime.textContent = data.arm_time; armTime = parseInt(data.arm_time, 10); settingDefuseTime.textContent = data.defuse_time; defuseTime = parseInt(data.defuse_time, 10); settingUseArmPin.textContent = data.use_arm_pin === '1' ? 'Sì' : 'No'; settingArmPin.textContent = data.arm_pin; settingUseDefusePin.textContent = data.use_disarm_pin === '1' ? 'Sì' : 'No'; settingDisarmPin.textContent = data.disarm_pin; }
            if (data.event === 'game_start') { sdBombState.textContent = 'In attesa di innesco...'; startGameTimerBtn.disabled = false; }
            if (data.event === 'arm_start') { sdBombState.textContent = 'Innesco in corso...'; startProgressBar(armProgressBar, armTime); }
            if (data.event === 'arm_cancel') { sdBombState.textContent = 'Innesco annullato. In attesa...'; stopProgressBar(); }
            if (data.event === 'arm_pin_wrong') { sdBombState.textContent = 'PIN innesco errato!'; }
            if (data.event === 'bomb_armed') { stopProgressBar(); sdBombState.textContent = 'BOMBA INNESCATA!'; }
            if (data.event === 'time_update') { updateTimerDisplay(sdBombTimer, parseInt(data.time, 10)); }
            if (data.event === 'defuse_start') { sdBombState.textContent = 'Disinnesco in corso...'; startProgressBar(defuseProgressBar, defuseTime); }
            if (data.event === 'defuse_cancel') { sdBombState.textContent = 'BOMBA INNESCATA!'; stopProgressBar(); }
            if (data.event === 'defuse_pin_wrong') { sdBombState.textContent = 'PIN disinnesco errato!'; }
            if (data.event === 'game_end') { stopGameTimer(); stopProgressBar(); let winnerText = data.winner === 'terrorists' ? 'squadra <span class="team-red">T</span>' : 'squadra <span class="team-green">CT</span>'; sdBombState.innerHTML = `Partita finita! Vince la ${winnerText}`; }
            if (data.event === 'round_reset') { resetSdView(false); }
        }
        function handleTerminalEvents(data) { if (data.event === 'settings_update') { if (data.duration) { startDomGameBtn.disabled = false; } if (data.bomb_time) { termStartSdGameBtn.disabled = false; } } }
        
        // Event listeners per i pulsanti del terminale
        if(prepDomBtn) prepDomBtn.addEventListener('click', () => { terminalModeSelect.classList.add('hidden'); terminalDomConfig.classList.remove('hidden'); });
        if(backToTerminalSelectBtn) backToTerminalSelectBtn.addEventListener('click', () => { terminalModeSelect.classList.remove('hidden'); terminalDomConfig.classList.add('hidden'); });
        if(sendDomSettingsBtn) sendDomSettingsBtn.addEventListener('click', () => { const duration = document.getElementById('term-dom-duration').value; const capture = document.getElementById('term-dom-capture').value; socket.emit('send_command', { command: `CMD:SET_DOM_SETTINGS;DURATION:${duration};CAPTURE:${capture};`, target_id: 'TUO_DEVICE_ID' }); startDomGameBtn.disabled = true; });
        if(startDomGameBtn) startDomGameBtn.addEventListener('click', () => { socket.emit('send_command', { command: 'CMD:START_DOM_GAME;', target_id: 'TUO_DEVICE_ID' }); });
        if(prepSdBtn) prepSdBtn.addEventListener('click', () => { terminalModeSelect.classList.add('hidden'); terminalSdConfig.classList.remove('hidden'); });
        if(backToTerminalSelectSdBtn) backToTerminalSelectSdBtn.addEventListener('click', () => { terminalModeSelect.classList.remove('hidden'); terminalSdConfig.classList.add('hidden'); });
        if(termSendSdSettingsBtn) termSendSdSettingsBtn.addEventListener('click', () => { const cmd = `CMD:SET_SD_SETTINGS;BOMB_TIME:${document.getElementById('term-sd-bombtime').value};ARM_TIME:${document.getElementById('term-sd-armtime').value};DEFUSE_TIME:${document.getElementById('term-sd-defusetime').value};USE_ARM_PIN:${document.getElementById('term-sd-use-arm-pin').value};ARM_PIN:${document.getElementById('term-sd-arm-pin').value};USE_DEFUSE_PIN:${document.getElementById('term-sd-use-defuse-pin').value};DEFUSE_PIN:${document.getElementById('term-sd-defuse-pin').value};`; socket.emit('send_command', { command: cmd, target_id: 'TUO_DEVICE_ID' }); termStartSdGameBtn.disabled = true; });
        if(termStartSdGameBtn) termStartSdGameBtn.addEventListener('click', () => { socket.emit('send_command', { command: 'CMD:START_SD_GAME;', target_id: 'TUO_DEVICE_ID' }); });
        if(forceEndDomBtn) forceEndDomBtn.addEventListener('click', () => { if(confirm("Terminare la partita?")) socket.emit('send_command', { command: 'CMD:FORCE_END_GAME', target_id: 'TUO_DEVICE_ID' }); });
        if(forceEndSdBtn) forceEndSdBtn.addEventListener('click', () => { if(confirm("Terminare la partita?")) socket.emit('send_command', { command: 'CMD:FORCE_END_GAME', target_id: 'TUO_DEVICE_ID' }); });
        if(startGameTimerBtn) startGameTimerBtn.addEventListener('click', () => startGameTimer(gameDurationInput.value));


function startGameTimer(minutes) {
    stopGameTimer();
    gameTimerSeconds = parseInt(minutes, 10) * 60;
    if (isNaN(gameTimerSeconds) || gameTimerSeconds <= 0) return;
    
    gameDurationWrapper.classList.add('hidden');
    forceEndSdBtn.classList.remove('hidden');
    updateTimerDisplay(sdGameTimer, gameTimerSeconds);

    gameTimerInterval = setInterval(() => {
        gameTimerSeconds--;
        updateTimerDisplay(sdGameTimer, gameTimerSeconds);
        if (gameTimerSeconds <= 0) {
            stopGameTimer();
            sdBombState.innerHTML = "TEMPO SCADUTO! Vince CT";
            socket.emit('send_command', { command: 'CMD:FORCE_END_GAME' });
        }
    }, 1000);
}

function stopGameTimer() {
    clearInterval(gameTimerInterval);
    gameTimerInterval = null;
    forceEndSdBtn.classList.add('hidden');
    startGameTimerBtn.disabled = true;
    gameDurationWrapper.classList.remove('hidden');
}

function stopAllTimers() {
    stopGameTimer();
    stopProgressBar();
}

function updateTimerDisplay(element, totalSeconds) {
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
        if (progress >= 100) stopProgressBar();
    }, 50);
}

function stopProgressBar() {
    clearInterval(actionInterval);
    team1ProgressContainer.classList.add('hidden');
    team2ProgressContainer.classList.add('hidden');
    armProgressContainer.classList.add('hidden');
    defuseProgressContainer.classList.add('hidden');
    team1ProgressBar.style.width = '0%';
    team2ProgressBar.style.width = '0%';
    armProgressBar.style.width = '0%';
    defuseProgressBar.style.width = '0%';
}

function formatMilliseconds(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function showView(viewName) {
    simpleView.classList.add('hidden');
    domView.classList.add('hidden');
    sdView.classList.add('hidden');
    terminalView.classList.add('hidden');
    
    if (viewName === 'simple') simpleView.classList.remove('hidden');
    else if (viewName === 'domination') domView.classList.remove('hidden');
    else if (viewName === 'sd') sdView.classList.remove('hidden');
    else if (viewName === 'terminal') terminalView.classList.remove('hidden');
}

function resetToMainMenu() {
    showView('simple'); 
    simpleModeName.textContent = 'Menu principale';
    stopAllTimers();
}

function resetDominationView() {
    domGameState.innerHTML = 'In attesa di inizio...';
    lastGameState = 'In attesa di inizio...';
    domTimer.textContent = '--:--';
    winnerStatus.innerHTML = '--';
    scoreTeam1.textContent = '00:00';
    scoreTeam2.textContent = '00:00';
    forceEndDomBtn.classList.add('hidden');
}

function resetSdView(isRemoteStart = false) {
    sdBombState.textContent = 'In attesa di inizio...';
    sdBombTimer.textContent = '--:--';
    sdGameTimer.textContent = '--:--';
    stopGameTimer();
    if (isRemoteStart) {
        gameDurationWrapper.classList.add('hidden');
        const termSettings = {
            bomb_time: document.getElementById('term-sd-bombtime').value,
            arm_time: document.getElementById('term-sd-armtime').value,
            defuse_time: document.getElementById('term-sd-defusetime').value,
            use_arm_pin: document.getElementById('term-sd-use-arm-pin').value,
            arm_pin: document.getElementById('term-sd-arm-pin').value,
            use_disarm_pin: document.getElementById('term-sd-use-defuse-pin').value,
            disarm_pin: document.getElementById('term-sd-defuse-pin').value,
        };
        settingBombTime.textContent = termSettings.bomb_time;
        settingArmTime.textContent = termSettings.arm_time;
        settingDefuseTime.textContent = termSettings.defuse_time;
        settingUseArmPin.textContent = termSettings.use_arm_pin === '1' ? 'Sì' : 'No';
        settingArmPin.textContent = termSettings.arm_pin;
        settingUseDefusePin.textContent = termSettings.use_disarm_pin === '1' ? 'Sì' : 'No';
        settingDisarmPin.textContent = termSettings.disarm_pin;
    } else {
        gameDurationWrapper.classList.remove('hidden');
        startGameTimerBtn.disabled = true;
        updateTimerDisplay(sdGameTimer, parseInt(gameDurationInput.value, 10) * 60);
    }
}

function resetTerminalView() {
    terminalModeSelect.classList.remove('hidden');
    terminalDomConfig.classList.add('hidden');
    terminalSdConfig.classList.add('hidden');
    startDomGameBtn.disabled = true;
    termStartSdGameBtn.disabled = true;
}

    }
});