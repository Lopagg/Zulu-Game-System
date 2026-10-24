// main.js
import { showView, logSystem, updateDeviceList, updateClock, activeInspectorId } from './ui_core.js';
import { resetMonitorLayout, updateUniversalFeed, renderRules } from './game_monitor.js';
import { renderArenaRoster } from './roster_manager.js';

// --- INIZIALIZZAZIONE ---
const socket = io();
let currentDevices = [];
let monitoredDeviceId = null; 
let arenaRoster = {}; 
let globalPlayersDB = []; 

document.addEventListener('DOMContentLoaded', () => {
    updateClock();
    
    // Collega funzioni globali al window object (per HTML inline come onclick="showView('x')")
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

// --- CONNESSIONE E RETE ---
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

// --- GESTIONE DATI SOCKET ---
socket.on('roster_update', (rosterData) => {
    arenaRoster = rosterData;
    renderArenaRoster(arenaRoster, socket);
});

socket.on('devices_update', (devices) => {
    currentDevices = devices;
    updateDeviceList(devices, socket, (id) => monitoredDeviceId = id);
    updateSetupDropdown();
});

socket.on('kiosk_hardware_cmd', (data) => {
    if (data.cmd === 'GAME_START') {
        const mode = document.getElementById('setup-mode-select').value;
        let targetId = document.getElementById('setup-target-select').value;
        const dur = parseInt(document.getElementById('tdm-game-dur').value) || 15;
        
        socket.emit('request_mission_start', { mode: mode, target_id: targetId, duration: dur, force: false });
        logSystem("KIOSK: Rilevato pulsante hardware START. Missione Inviata.");
    } else if (data.cmd === 'FORCE_END_GAME') {
        if (monitoredDeviceId) socket.emit('send_command', { target_id: monitoredDeviceId, command: { cmd: "FORCE_END_GAME" } });
    }
});

// --- CORE ENGINE (MQTT BRIDGE) ---
socket.on('esp_event', (msg) => {
    const raw = msg.parsed_data || {};
    const senderId = raw.id || 'UNK';
    const type = raw.type || 'UNKNOWN';
    const payload = raw.payload || {};

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

    if (type === 'MODE_ENTER' || type === 'COUNTDOWN_UPDATE' || (type === 'TDM_UPDATE' && !monitoredDeviceId)) {
        monitoredDeviceId = senderId;
    }

    // Ignora telemetria di dispositivi non in focus
    if (monitoredDeviceId && senderId !== monitoredDeviceId) return;

    if (type === 'MODE_EXIT') {
        monitoredDeviceId = null; 
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
    
    // Richiama il modulo di monitoraggio universale
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
        targetId = "broadcast";
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
    
    socket.emit('request_mission_start', { mode: mode, target_id: targetId, duration: dur, force: false });
    document.getElementById('btn-start-mission').disabled = true;
    document.getElementById('btn-start-mission').classList.add('disabled');
});

// Setup Menu Cambio Tab (SD, DOM, TDM)
document.getElementById('setup-mode-select').addEventListener('change', (e) => {
    document.getElementById('setup-sd-params').classList.add('hidden');
    document.getElementById('setup-dom-params').classList.add('hidden');
    document.getElementById('setup-tdm-params').classList.add('hidden');

    if (e.target.value === 'sd') document.getElementById('setup-sd-params').classList.remove('hidden');
    else if (e.target.value === 'dom') document.getElementById('setup-dom-params').classList.remove('hidden');
    else if (e.target.value === 'tdm') document.getElementById('setup-tdm-params').classList.remove('hidden');
});