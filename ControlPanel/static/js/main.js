import { showView, logSystem, updateDeviceList, updateClock, activeInspectorId } from './ui_core.js';
import { resetMonitorLayout, updateUniversalFeed, renderRules } from './game_monitor.js';
import { renderArenaRoster, renderDatabase, populateProfileModal, getCurrentProfileUid, globalPlayersDB } from './roster_manager.js';

const socket = io();
let currentDevices = [];
let arenaRoster = {}; 
let monitoredDeviceId = null;

export let currentFactions = { 
    ALPHA: { name: 'ALPHA', color: '#ff3333' }, 
    BRAVO: { name: 'BRAVO', color: '#55ff55' } 
};

function applyFactionStyles(factions) {
    let styleTag = document.getElementById('dynamic-faction-styles');
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'dynamic-faction-styles';
        document.head.appendChild(styleTag);
    }
    
    styleTag.innerHTML = `
        :root {
            --team-a-color: ${factions.ALPHA.color};
            --team-b-color: ${factions.BRAVO.color};
        }
        
        .team-alpha-box .arena-header, #header-alpha-track-in { background: ${factions.ALPHA.color}33 !important; color: var(--team-a-color) !important; }
        .setup-roster-alpha, .count-alpha, .score.alpha, .alpha-list li, .d-val-red, .faction-a .faction-score, #dom-lbl-alpha { 
            color: var(--team-a-color) !important; 
            text-shadow: 0 0 15px ${factions.ALPHA.color}66 !important;
            border-left-color: var(--team-a-color) !important;
        }
        
        .team-bravo-box .arena-header, #header-bravo-track-in { background: ${factions.BRAVO.color}33 !important; color: var(--team-b-color) !important; }
        .setup-roster-bravo, .count-bravo, .score.bravo, .bravo-list li, .d-val-green, .faction-b .faction-score, #dom-lbl-bravo { 
            color: var(--team-b-color) !important; 
            text-shadow: 0 0 15px ${factions.BRAVO.color}66 !important;
            border-left-color: var(--team-b-color) !important;
        }
    `;
}

document.addEventListener('DOMContentLoaded', () => {
    updateClock();
    resetMonitorLayout(); 
    
    window.showView = (view) => showView(view, socket);
    window.clearActiveRoster = () => {
        if(confirm('ATTENZIONE: Rimuovere tutti gli operatori dal roster di oggi?')) socket.emit('clear_roster');
    };
    
    window.sendEnvCommand = (envCmd) => socket.emit('send_command', { target_id: "BROADCAST_ENV", command: { cmd: envCmd } });
    window.triggerServerReset = () => {
        if(confirm("ATTENZIONE CRITICA!\nVuoi forzare il riavvio del server Python?")) socket.emit('server_reset_request');
    };
    
    window.openFactionModal = function(teamId) {
        const f = currentFactions[teamId];
        document.getElementById('edit-faction-id').value = teamId;
        document.getElementById('edit-faction-name').value = f.name;
        document.getElementById('edit-faction-color').value = f.color;
        document.getElementById('modal-faction-title').textContent = `EDIT ${teamId} SETTINGS`;
        document.getElementById('faction-edit-modal').classList.remove('hidden');
    };

    window.closeFactionModal = function() {
        document.getElementById('faction-edit-modal').classList.add('hidden');
    };

    window.resetFactionColor = function() {
        const teamId = document.getElementById('edit-faction-id').value;
        const colorInput = document.getElementById('edit-faction-color');
        if (teamId === 'ALPHA') colorInput.value = '#ff3333';
        if (teamId === 'BRAVO') colorInput.value = '#55ff55';
    };

    window.saveFactionConfig = function() {
        const teamId = document.getElementById('edit-faction-id').value;
        const newName = document.getElementById('edit-faction-name').value.trim().toUpperCase();
        const newColor = document.getElementById('edit-faction-color').value;

        if (newName !== '') {
            const data = {};
            if (teamId === 'ALPHA') {
                data.alpha_name = newName;
                data.alpha_color = newColor;
            } else if (teamId === 'BRAVO') {
                data.bravo_name = newName;
                data.bravo_color = newColor;
            }
            socket.emit('update_factions', data);
            closeFactionModal();
        }
    };

    const btnSaveAlias = document.getElementById('save-alias-btn');
    if (btnSaveAlias) {
        btnSaveAlias.addEventListener('click', () => {
            const aliasInput = document.getElementById('insp-alias-input').value.trim();
            if (activeInspectorId && aliasInput) {
                socket.emit('rename_device', { id: activeInspectorId, name: aliasInput });
                document.getElementById('inspector-title').textContent = `${aliasInput} // CONFIG`;
            }
        });
    }
    
    const btnHardReset = document.getElementById('hard-reset-btn');
    if (btnHardReset) {
        btnHardReset.addEventListener('click', () => {
            if (activeInspectorId) {
                if (confirm(`Forzare il riavvio hardware (RESET) di ${activeInspectorId}?`)) {
                    socket.emit('send_command', { target_id: activeInspectorId, command: { cmd: "RESET" } });
                }
            }
        });
    }
    
    setInterval(() => {
        if (socket.connected) {
            socket.emit('request_roster', () => {});
            if (socket.io && socket.io.engine) {
                const rtt = socket.io.engine.lastPingTimestamp ? (Date.now() - socket.io.engine.lastPingTimestamp) : 12;
                const loadEl = document.getElementById('net-load');
                if (loadEl) {
                    loadEl.textContent = `${Math.round(rtt / 5) * 5} ms`;
                    loadEl.style.color = (rtt < 50) ? '#55ff55' : (rtt < 150 ? '#ff9900' : 'var(--sop-alert)');
                }
            }
        }
    }, 2500); 
});

socket.on('connect', () => {
    logSystem("LINK ESTABLISHED WITH SOP SERVER.");
    const elGlobalStatus = document.getElementById('global-status');
    if(elGlobalStatus) { elGlobalStatus.textContent = "ONLINE"; elGlobalStatus.className = "status-value status-normal"; }
    socket.emit('request_roster');
});

socket.on('disconnect', () => {
    logSystem("CONNECTION LOST - RETRYING...");
    const elGlobalStatus = document.getElementById('global-status');
    if(elGlobalStatus) { elGlobalStatus.textContent = "OFFLINE"; elGlobalStatus.className = "status-value status-alert"; }
});

socket.on('server_restarting', () => {
    alert("IL SERVER SI STA RIAVVIANDO. Attendi qualche secondo che il pannello torni online.");
});

socket.on('factions_update', (factions) => {
    currentFactions = factions;
    applyFactionStyles(factions);
    
    renderArenaRoster(arenaRoster, socket);
    if (typeof globalPlayersDB !== 'undefined' && globalPlayersDB.length > 0) renderDatabase(globalPlayersDB, socket, arenaRoster);
    
    const attackerSelect = document.getElementById('sd-attacker-team');
    if (attackerSelect) {
        Array.from(attackerSelect.options).forEach(opt => {
            if (opt.value === 'ALPHA') opt.textContent = currentFactions.ALPHA.name;
            if (opt.value === 'BRAVO') opt.textContent = currentFactions.BRAVO.name;
        });
    }

    const setEl = (id, txt) => { const el = document.getElementById(id); if(el) el.textContent = txt; };
    setEl('setup-label-alpha', `TEAM ${currentFactions.ALPHA.name}`);
    setEl('setup-label-bravo', `TEAM ${currentFactions.BRAVO.name}`);
    setEl('monitor-name-alpha', currentFactions.ALPHA.name);
    setEl('monitor-name-bravo', currentFactions.BRAVO.name);
    setEl('dom-lbl-alpha', currentFactions.ALPHA.name);
    setEl('dom-lbl-bravo', currentFactions.BRAVO.name);
});

socket.on('weather_update', (data) => { if(data.weather) document.getElementById('weather-display').textContent = data.weather; });
socket.on('roster_update', (rosterData) => { arenaRoster = rosterData; renderArenaRoster(arenaRoster, socket); });
socket.on('database_update', (players) => renderDatabase(players, socket, arenaRoster));
socket.on('profile_data', (data) => populateProfileModal(data));
socket.on('devices_update', (devices) => { currentDevices = devices; updateDeviceList(devices, socket, (id) => monitoredDeviceId = id); updateSetupDropdown(); });

socket.on('mission_start_success', () => { resetMonitorLayout(); window.showView('monitor'); });
socket.on('mission_start_error', (data) => { alert(data.msg); document.getElementById('btn-start-mission').classList.remove('disabled'); document.getElementById('btn-start-mission').disabled = false; });

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

    if (type === 'MODE_EXIT') { resetMonitorLayout(); return; }
    if (type === 'MODE_ENTER') { resetMonitorLayout(); }
    if (type === 'SETTINGS_UPDATE' || (type === 'MODE_ENTER' && payload.bomb_time)) renderRules(payload);
    
    updateUniversalFeed(payload, mode, type);
});

export function updateSetupDropdown() {
    const elSetupTargetSelect = document.getElementById('setup-target-select');
    if (!elSetupTargetSelect) return;
    const currentSelection = elSetupTargetSelect.value;
    elSetupTargetSelect.innerHTML = '<option value="">-- Seleziona nodo target --</option>';
    currentDevices.filter(d => d.mode === 'MAIN MENU' || d.mode === 'TERMINAL').forEach(d => {
        const opt = document.createElement('option'); opt.value = d.id; opt.textContent = d.name || d.id; elSetupTargetSelect.appendChild(opt);
    });
    if (currentSelection) elSetupTargetSelect.value = currentSelection;
}

document.getElementById('btn-transmit-setup').addEventListener('click', () => {
    const mode = document.getElementById('setup-mode-select').value;
    let targetId = document.getElementById('setup-target-select').value;
    let commandData = {};

    if (mode === 'sd') {
        commandData = {
            cmd: "SET_SD_SETTINGS", attacker: document.getElementById('sd-attacker-team').value,
            game_duration: parseInt(document.getElementById('sd-game-dur').value), bomb_time: parseInt(document.getElementById('sd-bomb-time').value),
            arm_time: parseInt(document.getElementById('sd-arm-time').value), defuse_time: parseInt(document.getElementById('sd-defuse-time').value),
            use_arm_pin: document.getElementById('sd-use-arm-pin').value === 'true', use_defuse_pin: document.getElementById('sd-use-defuse-pin').value === 'true',
            arm_pin: document.getElementById('sd-arm-pin').value, defuse_pin: document.getElementById('sd-defuse-pin').value
        };
    } else if (mode === 'dom') {
        commandData = {
            cmd: "SET_DOM_SETTINGS", duration: parseInt(document.getElementById('dom-game-dur').value),
            capture_time: parseInt(document.getElementById('dom-capture-time').value), countdown: parseInt(document.getElementById('dom-countdown').value)
        };
    } else if (mode === 'tdm') {
        commandData = { cmd: "SET_TDM_SETTINGS", duration: parseInt(document.getElementById('tdm-game-dur').value) || 15 };
        targetId = "SERVER-TDM";
    }
    socket.emit('send_command', { target_id: targetId, command: commandData });
    socket.emit('send_command', { target_id: "broadcast", command: { cmd: "SET_READY" } });
    
    document.getElementById('btn-start-mission').disabled = false;
    document.getElementById('btn-start-mission').classList.remove('disabled');
});

document.getElementById('btn-start-mission').addEventListener('click', () => {
    const mode = document.getElementById('setup-mode-select').value;
    let targetId = document.getElementById('setup-target-select').value;
    if (mode === 'tdm') targetId = "SERVER-TDM";
    socket.emit('request_mission_start', { mode: mode, target_id: targetId, duration: parseInt(document.getElementById('tdm-game-dur').value) || 15, force: false });
    document.getElementById('btn-start-mission').disabled = true;
    document.getElementById('btn-start-mission').classList.add('disabled');
});

document.getElementById('setup-mode-select').addEventListener('change', (e) => {
    ['setup-sd-params','setup-dom-params','setup-tdm-params','target-selection-row'].forEach(id => document.getElementById(id).classList.add('hidden'));
    if (e.target.value === 'sd') document.getElementById('setup-sd-params').classList.remove('hidden');
    else if (e.target.value === 'dom') document.getElementById('setup-dom-params').classList.remove('hidden');
    else if (e.target.value === 'tdm') document.getElementById('setup-tdm-params').classList.remove('hidden');
    if (e.target.value !== 'tdm') document.getElementById('target-selection-row').classList.remove('hidden');
});

window.uiForceEndMission = function() {
    const btn = document.getElementById('btn-force-end');
    const action = btn ? (btn.dataset.action || "FORCE_END_GAME") : "FORCE_END_GAME"; 
    socket.emit('send_command', { target_id: "SERVER-ROUTER", command: { cmd: action } });
};