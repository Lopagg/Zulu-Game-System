import { showView, logSystem, updateDeviceList, updateClock, activeInspectorId } from './ui_core.js';
import { resetMonitorLayout, updateUniversalFeed, renderRules } from './game_monitor.js';
import { renderArenaRoster, renderDatabase, populateProfileModal, getCurrentProfileUid, globalPlayersDB } from './roster_manager.js';

const socket = io();
let currentDevices = [];
let arenaRoster = {}; 
let monitoredDeviceId = null;

export let currentFactions = { ALPHA: 'ALPHA', BRAVO: 'BRAVO' };

document.addEventListener('DOMContentLoaded', () => {
    updateClock();
    resetMonitorLayout(); 
    
    window.showView = (view) => showView(view, socket);
    window.clearActiveRoster = () => {
        if(confirm('ATTENZIONE: Rimuovere tutti gli operatori dal roster di oggi?')) {
            socket.emit('clear_roster');
            logSystem("RICHIESTA PULIZIA ROSTER INVIATA.");
        }
    };
    
    window.sendEnvCommand = (envCmd) => {
        socket.emit('send_command', { target_id: "BROADCAST_ENV", command: { cmd: envCmd } });
    };
    
    window.triggerServerReset = () => {
        if(confirm("ATTENZIONE CRITICA!\nVuoi davvero forzare il riavvio completo del server Python? Tutte le comunicazioni si interromperanno per qualche secondo.")) {
            socket.emit('server_reset_request');
        }
    };
    
    window.renameFaction = (teamId) => {
        const oldName = currentFactions[teamId];
        const newName = prompt(`Inserisci nuovo nome per il Team ${teamId}:`, oldName);
        if (newName && newName.trim() !== '' && newName !== oldName) {
            const data = {};
            if (teamId === 'ALPHA') data.alpha_name = newName.trim().toUpperCase();
            if (teamId === 'BRAVO') data.bravo_name = newName.trim().toUpperCase();
            socket.emit('update_factions', data);
        }
    };

    const btnSaveAlias = document.getElementById('save-alias-btn');
    if (btnSaveAlias) {
        btnSaveAlias.addEventListener('click', () => {
            const aliasInput = document.getElementById('insp-alias-input').value.trim();
            if (activeInspectorId && aliasInput) {
                socket.emit('rename_device', { id: activeInspectorId, name: aliasInput });
                logSystem(`ALIAS SALVATO: ${aliasInput}`);
                document.getElementById('inspector-title').textContent = `${aliasInput} // CONFIG`;
            }
        });
    }
    
    const btnHardReset = document.getElementById('hard-reset-btn');
    if (btnHardReset) {
        btnHardReset.addEventListener('click', () => {
            if (activeInspectorId) {
                if (confirm(`Forzare il riavvio hardware (RESET) del dispositivo ${activeInspectorId}?`)) {
                    socket.emit('send_command', { target_id: activeInspectorId, command: { cmd: "RESET" } });
                    logSystem(`RESET COMMAND SENT TO ${activeInspectorId}`);
                }
            }
        });
    }
    
    setInterval(() => {
        if (socket.connected) {
            const startPing = Date.now();
            socket.emit('request_roster', () => {
            });
            let latencyStr = "-- ms";
            if (socket.io && socket.io.engine) {
                const rtt = socket.io.engine.lastPingTimestamp ? (Date.now() - socket.io.engine.lastPingTimestamp) : 12;
                latencyStr = `${Math.round(rtt / 5) * 5} ms`;
            }
            
            const loadEl = document.getElementById('net-load');
            if (loadEl) {
                loadEl.textContent = latencyStr;
                const rtt_val = parseInt(latencyStr);
                if (rtt_val < 50) loadEl.style.color = '#55ff55';
                else if (rtt_val < 150) loadEl.style.color = '#ff9900';
                else loadEl.style.color = 'var(--sop-alert)';
            }
        }
    }, 2500); 
});

socket.on('connect', () => {
    logSystem("LINK ESTABLISHED WITH SOP SERVER.");
    const elGlobalStatus = document.getElementById('global-status');
    if(elGlobalStatus) {
        elGlobalStatus.textContent = "ONLINE";
        elGlobalStatus.classList.remove('status-alert');
        elGlobalStatus.classList.add('status-normal');
    }
    socket.emit('request_roster');
});

socket.on('disconnect', () => {
    logSystem("CONNECTION LOST - RETRYING...");
    const elGlobalStatus = document.getElementById('global-status');
    if(elGlobalStatus) {
        elGlobalStatus.textContent = "OFFLINE";
        elGlobalStatus.classList.remove('status-normal');
        elGlobalStatus.classList.add('status-alert');
    }
});

socket.on('server_restarting', () => {
    logSystem("CRITICAL: SYSTEM REBOOT IN PROGRESS...");
    const elGlobalStatus = document.getElementById('global-status');
    if(elGlobalStatus) {
        elGlobalStatus.textContent = "REBOOTING";
        elGlobalStatus.classList.remove('status-normal');
        elGlobalStatus.classList.add('status-alert');
    }
    alert("IL SERVER SI STA RIAVVIANDO. Attendi qualche secondo che il pannello torni online in automatico.");
});

socket.on('factions_update', (factions) => {
    currentFactions = factions;
    logSystem(`FAZIONI SETTATE: ${factions.ALPHA} / ${factions.BRAVO}`);
    
    renderArenaRoster(arenaRoster, socket);
    if (typeof globalPlayersDB !== 'undefined' && globalPlayersDB.length > 0) {
        renderDatabase(globalPlayersDB, socket, arenaRoster);
    }
    
    const attackerSelect = document.getElementById('sd-attacker-team');
    if (attackerSelect) {
        Array.from(attackerSelect.options).forEach(opt => {
            if (opt.value === 'ALPHA') opt.textContent = currentFactions.ALPHA;
            if (opt.value === 'BRAVO') opt.textContent = currentFactions.BRAVO;
        });
    }

    // --- AGGIORNAMENTO ETICHETTE SETUP ---
    const setupAlpha = document.getElementById('setup-label-alpha');
    const setupBravo = document.getElementById('setup-label-bravo');
    if (setupAlpha) setupAlpha.textContent = `TEAM ${currentFactions.ALPHA}`;
    if (setupBravo) setupBravo.textContent = `TEAM ${currentFactions.BRAVO}`;

    // --- AGGIORNAMENTO ETICHETTE MONITOR ---
    const monAlpha = document.getElementById('monitor-name-alpha');
    const monBravo = document.getElementById('monitor-name-bravo');
    if (monAlpha) monAlpha.textContent = currentFactions.ALPHA;
    if (monBravo) monBravo.textContent = currentFactions.BRAVO;

    const domLblAlpha = document.getElementById('dom-lbl-alpha');
    const domLblBravo = document.getElementById('dom-lbl-bravo');
    if (domLblAlpha) domLblAlpha.textContent = currentFactions.ALPHA;
    if (domLblBravo) domLblBravo.textContent = currentFactions.BRAVO;
});

socket.on('weather_update', (data) => {
    if (data.weather) document.getElementById('weather-display').textContent = data.weather;
});

socket.on('roster_update', (rosterData) => {
    arenaRoster = rosterData;
    renderArenaRoster(arenaRoster, socket);
});

socket.on('database_update', (players) => {
    renderDatabase(players, socket, arenaRoster);
});

socket.on('profile_data', (data) => {
    populateProfileModal(data);
});

socket.on('devices_update', (devices) => {
    currentDevices = devices;
    updateDeviceList(devices, socket, (id) => monitoredDeviceId = id);
    updateSetupDropdown();
});

socket.on('mission_start_success', () => {
    resetMonitorLayout();
    window.showView('monitor');
});

socket.on('mission_start_error', (data) => {
    alert(data.msg);
    document.getElementById('btn-start-mission').disabled = false;
    document.getElementById('btn-start-mission').classList.remove('disabled');
});

socket.on('mission_start_warning', (data) => {
    if(confirm(data.msg)) {
        socket.emit('request_mission_start', { ...data.original_request, force: true });
    } else {
        document.getElementById('btn-start-mission').disabled = false;
        document.getElementById('btn-start-mission').classList.remove('disabled');
    }
});

socket.on('kiosk_hardware_cmd', (data) => {
    if (data.cmd === 'GAME_START') {
        const mode = document.getElementById('setup-mode-select').value;
        let targetId = document.getElementById('setup-target-select').value;
        
        if (mode === 'tdm') targetId = "SERVER-TDM";
        const dur = parseInt(document.getElementById('tdm-game-dur').value) || 15;
        
        socket.emit('request_mission_start', { mode: mode, target_id: targetId, duration: dur, force: false });
        logSystem("KIOSK: Rilevato pulsante hardware START. Missione Inviata.");
    } else if (data.cmd === 'FORCE_END_GAME') {
        const mode = document.getElementById('setup-mode-select').value;
        if (mode === 'tdm') {
             socket.emit('send_command', { target_id: "SERVER-TDM", command: { cmd: "FORCE_END_GAME" } });
        } else if (monitoredDeviceId) {
             socket.emit('send_command', { target_id: monitoredDeviceId, command: { cmd: "FORCE_END_GAME" } });
        }
    }
});

socket.on('esp_event', (msg) => {
    const raw = msg.parsed_data || {};
    const type = raw.type || 'UNKNOWN';
    const payload = raw.payload || {};

    let mode = payload.mode || raw.mode;
    if(!mode) {
         if (type === 'SD_UPDATE') mode = 'SEARCH_AND_DESTROY';
         else if (type === 'DOM_UPDATE') mode = 'DOMINATION';
         else if (type === 'TDM_UPDATE') mode = 'TEAM_DEATHMATCH';
    }

    if (type === 'MODE_EXIT') {
        resetMonitorLayout();
        logSystem(`MODE EXIT DETECTED.`);
        return;
    }

    if (type === 'MODE_ENTER') {
        resetMonitorLayout();
    }
    
    if (type === 'SETTINGS_UPDATE' || (type === 'MODE_ENTER' && payload.bomb_time)) {
        renderRules(payload);
    }
    
    updateUniversalFeed(payload, mode, type);
});

export function updateSetupDropdown() {
    const elSetupTargetSelect = document.getElementById('setup-target-select');
    if (!elSetupTargetSelect) return;
    const currentSelection = elSetupTargetSelect.value;
    elSetupTargetSelect.innerHTML = '<option value="">-- Seleziona un nodo nel Menu Principale --</option>';
    
    currentDevices.filter(d => d.mode === 'MAIN MENU' || d.mode === 'TERMINAL').forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = d.name || d.id;
        elSetupTargetSelect.appendChild(opt);
    });
    if (currentSelection) elSetupTargetSelect.value = currentSelection;
}

document.getElementById('btn-transmit-setup').addEventListener('click', () => {
    const mode = document.getElementById('setup-mode-select').value;
    let targetId = document.getElementById('setup-target-select').value;
    let commandData = {};

    if (mode === 'sd') {
        commandData = {
            cmd: "SET_SD_SETTINGS",
            attacker: document.getElementById('sd-attacker-team').value,
            game_duration: parseInt(document.getElementById('sd-game-dur').value),
            bomb_time: parseInt(document.getElementById('sd-bomb-time').value),
            arm_time: parseInt(document.getElementById('sd-arm-time').value),
            defuse_time: parseInt(document.getElementById('sd-defuse-time').value),
            use_arm_pin: document.getElementById('sd-use-arm-pin').value === 'true',
            use_defuse_pin: document.getElementById('sd-use-defuse-pin').value === 'true',
            arm_pin: document.getElementById('sd-arm-pin').value,
            defuse_pin: document.getElementById('sd-defuse-pin').value
        };
    } else if (mode === 'dom') {
        commandData = {
            cmd: "SET_DOM_SETTINGS",
            duration: parseInt(document.getElementById('dom-game-dur').value),
            capture_time: parseInt(document.getElementById('dom-capture-time').value),
            countdown: parseInt(document.getElementById('dom-countdown').value)
        };
    } else if (mode === 'tdm') {
        const dur = parseInt(document.getElementById('tdm-game-dur').value) || 15;
        commandData = { cmd: "SET_TDM_SETTINGS", duration: dur };
        targetId = "SERVER-TDM";
    }
    
    socket.emit('send_command', { target_id: targetId, command: commandData });
    socket.emit('send_command', { target_id: "broadcast", command: { cmd: "SET_READY" } });
    
    document.getElementById('btn-start-mission').disabled = false;
    document.getElementById('btn-start-mission').classList.remove('disabled');
    alert("Configurazione Inviata. Avvia dal Kiosk o dal pulsante START MISSION.");
});

document.getElementById('btn-start-mission').addEventListener('click', () => {
    const mode = document.getElementById('setup-mode-select').value;
    let targetId = document.getElementById('setup-target-select').value;
    const dur = parseInt(document.getElementById('tdm-game-dur').value) || 15;
    
    if (mode === 'tdm') targetId = "SERVER-TDM";
    
    socket.emit('request_mission_start', { mode: mode, target_id: targetId, duration: dur, force: false });
    
    document.getElementById('btn-start-mission').disabled = true;
    document.getElementById('btn-start-mission').classList.add('disabled');
});

document.getElementById('setup-mode-select').addEventListener('change', (e) => {
    document.getElementById('setup-sd-params').classList.add('hidden');
    document.getElementById('setup-dom-params').classList.add('hidden');
    document.getElementById('setup-tdm-params').classList.add('hidden');
    document.getElementById('target-selection-row').classList.remove('hidden');

    if (e.target.value === 'sd') {
        document.getElementById('setup-sd-params').classList.remove('hidden');
    }
    else if (e.target.value === 'dom') {
        document.getElementById('setup-dom-params').classList.remove('hidden');
    }
    else if (e.target.value === 'tdm') {
        document.getElementById('setup-tdm-params').classList.remove('hidden');
        document.getElementById('target-selection-row').classList.add('hidden');
    }
});

window.uiForceEndMission = function() {
    const btn = document.getElementById('btn-force-end');
    const action = btn ? (btn.dataset.action || "FORCE_END_GAME") : "FORCE_END_GAME"; 
    socket.emit('send_command', { target_id: "SERVER-ROUTER", command: { cmd: action } });
};