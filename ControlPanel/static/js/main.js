import { showView, logSystem, updateDeviceList, updateClock, activeInspectorId } from './ui_core.js';
import { resetMonitorLayout, updateUniversalFeed, renderRules } from './game_monitor.js';
import { renderArenaRoster, renderDatabase, populateProfileModal, getCurrentProfileUid } from './roster_manager.js';

const socket = io();
let currentDevices = [];
let arenaRoster = {}; 

document.addEventListener('DOMContentLoaded', () => {
    updateClock();
    resetMonitorLayout(); // Forza un reset pulito all'avvio
    
    window.showView = (view) => showView(view, socket);
    window.clearActiveRoster = () => {
        if(confirm('ATTENZIONE: Rimuovere tutti gli operatori dal roster di oggi?')) {
            socket.emit('clear_roster');
            logSystem("RICHIESTA PULIZIA ROSTER INVIATA.");
        }
    };
    window.sendEnvCommand = (envCmd) => {
        if(confirm("Eseguire override ambientale: " + envCmd + "?")) {
            socket.emit('send_command', { target_id: "BROADCAST_ENV", command: { cmd: envCmd } });
        }
    };
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

// --- EVENTI DI MISSIONE (Avvia Navigazione Automatica) ---
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

// --- CORE ENGINE (MQTT BRIDGE) ---
socket.on('esp_event', (msg) => {
    // Ora la UI è "stupida". Se riceve un evento, significa che il Server lo ha autorizzato.
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

// --- SETUP START MISSION LOGIC ---
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
    const action = btn.dataset.action || "FORCE_END_GAME"; 
    
    const msg = (action === "FORCE_END_GAME") 
        ? "ATTENZIONE: Terminare forzatamente la partita in corso?" 
        : "Chiudere definitivamente la partita e riportare il sistema in STANDBY?";
        
    if(confirm(msg)) {
        // La UI non deve più sapere a quale nodo inviare il comando. Lo dice al server.
        // Il target "SERVER-ROUTER" indicherà al backend di instradare il comando alla missione attiva.
        socket.emit('send_command', { target_id: "SERVER-ROUTER", command: { cmd: action } });
    }
};