import { showView, logSystem, updateDeviceList, updateClock, activeInspectorId } from './ui_core.js';
import { resetMonitorLayout, updateUniversalFeed, renderRules, updateMonitorDailyWins } from './game_monitor.js';
import { renderArenaRoster, renderDatabase, populateProfileModal, getCurrentProfileUid, globalPlayersDB } from './roster_manager.js';

const socket = io();
let currentDevices = [];
let arenaRoster = {}; 
let monitoredDeviceId = null;
let currentCropper = null;

export let currentFactions = { 
    ALPHA: { name: 'ALPHA', color: '#ff3333', daily_wins: 0 }, 
    BRAVO: { name: 'BRAVO', color: '#55ff55', daily_wins: 0 } 
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
        document.getElementById('edit-faction-wins').value = f.daily_wins || 0;
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
        const newWins = parseInt(document.getElementById('edit-faction-wins').value) || 0;

        if (newName !== '') {
            const data = {};
            if (teamId === 'ALPHA') {
                data.alpha_name = newName;
                data.alpha_color = newColor;
                data.alpha_wins = newWins;
            } else if (teamId === 'BRAVO') {
                data.bravo_name = newName;
                data.bravo_color = newColor;
                data.bravo_wins = newWins;
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
    
    socket.on('mission_start_warning', (data) => {
        if(confirm(data.msg)) {
            data.original_request.force = true; 
            socket.emit('request_mission_start', data.original_request);
        } else {
            document.getElementById('btn-start-mission').classList.remove('disabled'); 
            document.getElementById('btn-start-mission').disabled = false; 
        }
    });

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
    
    updateMonitorDailyWins(factions); 
    
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

// --- DIZIONARIO ICONE METEO VETTORIALI (SVG) ---
const tacticalWeatherIcons = {
    "CLEAR": "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2300ffcc' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='5'/><line x1='12' y1='1' x2='12' y2='3'/><line x1='12' y1='21' x2='12' y2='23'/><line x1='4.22' y1='4.22' x2='5.64' y2='5.64'/><line x1='18.36' y1='18.36' x2='19.78' y2='19.78'/><line x1='1' y1='12' x2='3' y2='12'/><line x1='21' y1='12' x2='23' y2='12'/><line x1='4.22' y1='19.78' x2='5.64' y2='18.36'/><line x1='18.36' y1='4.22' x2='19.78' y2='5.64'/></svg>",
    "CLOUDS": "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2300ffcc' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z'/></svg>",
    "FOG": "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2300ffcc' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><line x1='4' y1='14' x2='20' y2='14'/><line x1='4' y1='18' x2='20' y2='18'/><path d='M17.5 10A8 8 0 1 0 9 20'/></svg>",
    "RAIN": "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2300ffcc' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z'/><line x1='8' y1='19' x2='8' y2='21'/><line x1='12' y1='19' x2='12' y2='21'/><line x1='16' y1='19' x2='16' y2='21'/></svg>",
    "SHOWERS": "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2300ffcc' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z'/><line x1='8' y1='19' x2='8' y2='21'/><line x1='12' y1='19' x2='12' y2='21'/><line x1='16' y1='19' x2='16' y2='21'/></svg>",
    "STORM": "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2300ffcc' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z'/><polygon points='13 19 19 19 11 23 11 19 5 19 13 15'/></svg>",
    "SNOW": "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2300ffcc' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><line x1='12' y1='2' x2='12' y2='22'/><line x1='2.93' y1='11.93' x2='21.07' y2='11.93'/><line x1='4.93' y1='4.93' x2='19.07' y2='19.07'/><line x1='4.93' y1='19.07' x2='19.07' y2='4.93'/></svg>",
    "DEFAULT": "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2300ffcc' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='10'/><line x1='12' y1='8' x2='12' y2='12'/><line x1='12' y1='16' x2='12.01' y2='16'/></svg>",
    "CLEAR_NIGHT": "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2300ffcc' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z'/></svg>",
    "CLOUDS_NIGHT": "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2300ffcc' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z'/><path d='M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z' fill='%23050505'/></svg>"
};

socket.on('weather_update', (data) => { 
    if(data.weather) {
        // La stringa che arriva da Python è tipo "18°C // CLEAR"
        const elDisplay = document.getElementById('weather-display');
        const elIcon = document.getElementById('weather-icon');
        
        if (elDisplay) {
            elDisplay.textContent = data.weather;
        }
        
        if (elIcon) {
            // Estrae la condizione separando la stringa in base al " // "
            const parts = data.weather.split(' // ');
            if (parts.length === 2) {
                const condition = parts[1].trim(); // Prende "CLEAR", "CLOUDS", ecc.
                // Assegna l'icona corrispondente, oppure l'icona DEFAULT di avviso
                elIcon.src = tacticalWeatherIcons[condition] || tacticalWeatherIcons["DEFAULT"];
            }
        }
    }
});

socket.on('roster_update', (rosterData) => { arenaRoster = rosterData; renderArenaRoster(arenaRoster, socket); });
socket.on('database_update', (players) => renderDatabase(players, socket, arenaRoster));
socket.on('profile_data', (data) => populateProfileModal(data));
socket.on('devices_update', (devices) => { currentDevices = devices; updateDeviceList(devices, socket, (id) => monitoredDeviceId = id); updateSetupDropdown(); });

// --- FIX CAMBIO SCHERMATA SU START TDM ---
socket.on('mission_start_success', () => { 
    // Utilizziamo direttamente la funzione importata, omettendo resetMonitorLayout che cancellerebbe la grafica appena caricata dal server
    showView('monitor', socket); 
});

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
    let dur = 15;

    if (mode === 'sd') {
        dur = parseInt(document.getElementById('sd-game-dur').value) || 20;
        commandData = {
            cmd: "SET_SD_SETTINGS", attacker: document.getElementById('sd-attacker-team').value,
            game_duration: dur, bomb_time: parseInt(document.getElementById('sd-bomb-time').value),
            arm_time: parseInt(document.getElementById('sd-arm-time').value), defuse_time: parseInt(document.getElementById('sd-defuse-time').value),
            use_arm_pin: document.getElementById('sd-use-arm-pin').value === 'true', use_defuse_pin: document.getElementById('sd-use-defuse-pin').value === 'true',
            arm_pin: document.getElementById('sd-arm-pin').value, defuse_pin: document.getElementById('sd-defuse-pin').value
        };
    } else if (mode === 'dom') {
        dur = parseInt(document.getElementById('dom-game-dur').value) || 15;
        commandData = {
            cmd: "SET_DOM_SETTINGS", duration: dur,
            capture_time: parseInt(document.getElementById('dom-capture-time').value), countdown: parseInt(document.getElementById('dom-countdown').value)
        };
    } else if (mode === 'tdm') {
        dur = parseInt(document.getElementById('tdm-game-dur').value) || 15;
        commandData = { cmd: "SET_TDM_SETTINGS", duration: dur };
        targetId = "SERVER-TDM";
    }
    
    socket.emit('send_command', { target_id: targetId, command: commandData });
    socket.emit('send_command', { target_id: "broadcast", command: { cmd: "SET_READY", mode: mode, target_id: targetId, duration: dur } });
    
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

window.saveOperatorNotes = function() {
    const uid = getCurrentProfileUid();
    const notes = document.getElementById('modal-op-notes').value;
    if(uid) socket.emit('save_notes', { uid: uid, notes: notes });
    alert("Annotazioni tattiche registrate.");
};

window.resetOperatorStats = function() {
    if(confirm("ATTENZIONE CRITICA: Vuoi azzerare definitivamente le partite e le vittorie di questo operatore?")) {
        socket.emit('update_db_player', { uid: getCurrentProfileUid(), action: 'reset_stats' });
        closeModal();
    }
};

window.modKarma = function(val) {
    const el = document.getElementById('modal-op-karma');
    if(!el) return;
    let currentKarma = parseInt(el.textContent) || 0;
    currentKarma += val;
    
    el.textContent = currentKarma;
    const badge = el.parentElement;
    badge.classList.remove('positive', 'negative');
    if (currentKarma < 0) badge.classList.add('negative');
    else if (currentKarma > 0) badge.classList.add('positive');
    
    socket.emit('update_karma', { uid: getCurrentProfileUid(), karma: currentKarma });
};

window.renameFromProfile = function() {
    const uid = getCurrentProfileUid();
    const currentNameText = document.getElementById('modal-op-name-text').innerText;
    const currentName = currentNameText.replace('PROFILE // ', '');
    const newName = prompt("Inserisci nuovo nome operatore:", currentName);
    
    if (newName && newName.trim() !== '') {
        socket.emit('update_db_player', { uid: uid, action: 'rename', value: newName.trim().toUpperCase() });
        setTimeout(() => { socket.emit('request_profile', {uid: uid}); }, 100); 
    }
};

window.editAsdFromProfile = function() {
    const uid = getCurrentProfileUid();
    const currentAsd = document.getElementById('modal-op-asd').innerText;
    const newAsd = prompt("Inserisci il nome della SQUADRA o dell'ASD (lascia vuoto per 'NESSUNA'):", currentAsd === 'NESSUNA' ? '' : currentAsd);
    
    if (newAsd !== null) {
        const finalAsd = newAsd.trim() === '' ? 'NESSUNA' : newAsd.trim().toUpperCase();
        socket.emit('update_db_player', { uid: uid, action: 'edit_asd', value: finalAsd });
        setTimeout(() => { socket.emit('request_profile', {uid: uid}); }, 100); 
    }
};

window.toggleProStatus = function() {
    const uid = getCurrentProfileUid();
    if(confirm("Vuoi cambiare il tipo di account (PRO / GUEST) per questa tessera?")) {
        socket.emit('update_db_player', { uid: uid, action: 'toggle_pro' });
        setTimeout(() => { socket.emit('request_profile', {uid: uid}); }, 100);
    }
};

window.purgeGuests = function() {
    if(confirm("ATTENZIONE: Verranno azzerate statistiche, note, karma e foto di TUTTE le tessere GUEST. Il nome tornerà quello di default (OP-X). Continuare?")) {
        socket.emit('purge_guests');
        alert("Operazione di pulizia completata. Le tessere GUEST sono pronte per il prossimo evento.");
    }
};

window.resetDailyWins = function() {
    if(confirm("ATTENZIONE: Vuoi azzerare i contatori delle vittorie odierne per ENTRAMBE le Fazioni?")) {
        socket.emit('reset_daily_wins');
    }
};

window.handlePhotoUpload = function(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = document.getElementById('image-to-crop');
            img.src = e.target.result;
            
            document.getElementById('operator-modal').classList.add('hidden');
            document.getElementById('crop-modal').classList.remove('hidden');
            
            if (currentCropper) {
                currentCropper.destroy();
            }
            
            currentCropper = new Cropper(img, {
                aspectRatio: 280 / 300, 
                viewMode: 1,
                background: false,
                zoomable: true,
                autoCropArea: 1,
            });
        }
        reader.readAsDataURL(input.files[0]);
        input.value = ''; 
    }
};

window.closeCropModal = function() {
    document.getElementById('crop-modal').classList.add('hidden');
    document.getElementById('operator-modal').classList.remove('hidden');
    if (currentCropper) {
        currentCropper.destroy();
        currentCropper = null;
    }
};

window.confirmCrop = function() {
    if (!currentCropper) return;
    
    currentCropper.getCroppedCanvas({
        width: 280,
        height: 300,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
    }).toBlob((blob) => {
        const formData = new FormData();
        formData.append('photo', blob, 'cropped.jpg');
        formData.append('uid', getCurrentProfileUid());
        
        fetch('/upload_photo', { method: 'POST', body: formData })
        .then(response => response.json())
        .then(data => {
            if(data.status === 'ok') {
                document.getElementById('modal-op-photo').src = `/static/uploads/${data.filename}?t=${new Date().getTime()}`;
            }
            closeCropModal();
        });
    }, 'image/jpeg', 0.9);
};


window.openRegistrationModal = function() {
    document.getElementById('reg-uid').value = '';
    
    let maxOp = 0;
    if (globalPlayersDB) {
        globalPlayersDB.forEach(p => {
            const nameToCheck = p.alias;
            if (nameToCheck && nameToCheck.startsWith('OP-')) {
                const num = parseInt(nameToCheck.replace('OP-', ''));
                if (!isNaN(num) && num > maxOp) {
                    maxOp = num;
                }
            }
        });
    }
    
    document.getElementById('reg-alias').value = `OP-${maxOp + 1}`;
    document.getElementById('reg-pro').value = '0';
    document.getElementById('reg-asd').value = '';
    document.getElementById('registration-modal').classList.remove('hidden');
};

window.closeRegistrationModal = function() {
    document.getElementById('registration-modal').classList.add('hidden');
};

window.submitRegistration = function() {
    const uid = document.getElementById('reg-uid').value.trim();
    const alias = document.getElementById('reg-alias').value.trim();
    const isPro = document.getElementById('reg-pro').value;
    const tagInfo = document.getElementById('reg-tag-info').value.trim();
    const asdTeam = document.getElementById('reg-asd').value.trim();
    
    if (!uid || !alias) {
        alert("Attendi la scansione dell'UID sul Kiosk e inserisci un Nome.");
        return;
    }
    
    socket.emit('register_player_manual', {
        uid: uid,
        alias: alias,
        is_pro: parseInt(isPro),
        tag_info: tagInfo,
        asd_team: asdTeam === '' ? 'NESSUNA' : asdTeam
    });
    
    closeRegistrationModal();
};

window.openAddPlayerModal = function() { 
    renderAddPlayerList(socket, arenaRoster); 
    document.getElementById('add-player-modal').classList.remove('hidden'); 
};
window.closeAddPlayerModal = function() { document.getElementById('add-player-modal').classList.add('hidden'); };
window.closeModal = function() { document.getElementById('operator-modal').classList.add('hidden'); };

window.deleteOperatorPhoto = function() {
    const uid = getCurrentProfileUid();
    if (uid && confirm("Vuoi eliminare la foto profilo di questo operatore?")) {
        socket.emit('update_db_player', { uid: uid, action: 'delete_photo' });
        // Ricarica automaticamente il profilo per aggiornare l'immagine al placeholder
        setTimeout(() => { socket.emit('request_profile', {uid: uid}); }, 100); 
    }
};

socket.on('raw_tag_scanned', (data) => {
    const modal = document.getElementById('registration-modal');
    if (modal && !modal.classList.contains('hidden')) {
        const uidInput = document.getElementById('reg-uid');
        if (uidInput) {
            uidInput.value = data.uid;
            uidInput.style.color = 'var(--sop-success)'; 
            logSystem(`KIOSK: Intercettato nuovo TAG [${data.uid}]`);
        }
    }
});

// --- GESTIONE INVINCIBILE RICERCA E FILTRI ---
document.body.addEventListener('input', (e) => {
    if (e.target.id === 'db-search') {
        if (typeof globalPlayersDB !== 'undefined' && globalPlayersDB.length > 0) {
            renderDatabase(globalPlayersDB, socket, arenaRoster);
        }
    }
});

document.body.addEventListener('change', (e) => {
    if (e.target.id === 'db-filter' || e.target.id === 'db-sort') {
        if (typeof globalPlayersDB !== 'undefined' && globalPlayersDB.length > 0) {
            renderDatabase(globalPlayersDB, socket, arenaRoster);
        }
    }
});