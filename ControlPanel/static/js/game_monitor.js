import { currentFactions } from './main.js';

let lastConfiguredMode = null;
let debounceTimer1 = null;
let debounceTimer2 = null;

export function resetMonitorLayout() {
    document.getElementById('global-timer-display').textContent = "--:--";
    document.getElementById('sd-bomb-status').textContent = "WAITING...";
    document.getElementById('sd-bomb-status').style.color = "#fff";
    document.getElementById('d-val-a').textContent = "0";
    document.getElementById('d-val-b').textContent = "0";
    document.getElementById('sd-arm-bar').style.width = "0%";
    document.getElementById('sd-defuse-bar').style.width = "0%";
    document.getElementById('sd-rules-list').innerHTML = '<li>WAITING FOR TELEMETRY...</li>';
    document.getElementById('monitor-mode-title').textContent = "AWAITING MISSION DATA...";

    document.getElementById('widget-sd-tactical').classList.add('hidden');
    document.getElementById('widget-sd-rules').classList.add('hidden');
    document.getElementById('widget-generic-map').classList.remove('hidden');

    document.querySelector('.bomb-timer-container').classList.add('hidden');
    document.getElementById('domination-scores').classList.add('hidden');
    document.querySelector('.progress-section').classList.add('hidden');
    
    lastConfiguredMode = null;
}

// --- NUOVA FUNZIONE: Chiamata da main.js quando cambiano le fazioni ---
export function updateMonitorDailyWins(factions) {
    const setEl = (id, txt) => { const el = document.getElementById(id); if(el) el.textContent = txt; };
    
    setEl('monitor-wins-lbl-a', factions.ALPHA.name);
    setEl('monitor-wins-lbl-b', factions.BRAVO.name);
    setEl('monitor-wins-alpha', factions.ALPHA.daily_wins || 0);
    setEl('monitor-wins-bravo', factions.BRAVO.daily_wins || 0);
    
    const alphaNum = document.getElementById('monitor-wins-alpha');
    const alphaLbl = document.getElementById('monitor-wins-lbl-a');
    if(alphaNum && alphaLbl) {
        alphaNum.style.color = factions.ALPHA.color;
        alphaNum.style.textShadow = `0 0 10px ${factions.ALPHA.color}66`;
        alphaLbl.style.color = factions.ALPHA.color;
    }
    
    const bravoNum = document.getElementById('monitor-wins-bravo');
    const bravoLbl = document.getElementById('monitor-wins-lbl-b');
    if(bravoNum && bravoLbl) {
        bravoNum.style.color = factions.BRAVO.color;
        bravoNum.style.textShadow = `0 0 10px ${factions.BRAVO.color}66`;
        braLbl.style.color = factions.BRAVO.color;
    }
}

export function updateUniversalFeed(payload, mode, msgType) {
    if (['KIOSK', 'MAIN MENU', 'TERMINAL'].includes(mode)) return;
    
    if (mode && mode !== lastConfiguredMode) {
        lastConfiguredMode = mode;
        document.getElementById('widget-sd-tactical').classList.remove('hidden');
        document.getElementById('widget-sd-rules').classList.remove('hidden');
        document.getElementById('widget-generic-map').classList.add('hidden');
        document.getElementById('monitor-mode-title').textContent = `OPERATION: ${mode.replace(/_/g, ' ').toUpperCase()}`;
        
        // Imposta le barre a rosso/verde fisso
        const armBar = document.getElementById('sd-arm-bar');
        const defuseBar = document.getElementById('sd-defuse-bar');
        if (armBar) armBar.className = "progress-fill fill-red";
        if (defuseBar) defuseBar.className = "progress-fill fill-green";
    }

    if (payload.state) {
        let s = payload.state;
        s = s.replace('ALPHA', currentFactions.ALPHA.name).replace('BRAVO', currentFactions.BRAVO.name);
        const statusEl = document.getElementById('sd-bomb-status');
        statusEl.textContent = s;
        
        if (s.includes('WINS') || s.includes('OWNED')) {
            if (s.includes('CT WINS') || s.includes('BRAVO WINS') || s.includes('OWNED BRAVO') || s.includes(currentFactions.BRAVO.name)) {
                statusEl.style.color = currentFactions.BRAVO.color; 
            } else if (s.includes('T WINS') || s.includes('ALPHA WINS') || s.includes('OWNED ALPHA') || s.includes(currentFactions.ALPHA.name)) {
                statusEl.style.color = currentFactions.ALPHA.color; 
            }
        } else {
            if (s.includes('DEFUS') || s.includes('CAPTURING B')) {
                statusEl.style.color = '#55ff55'; 
            } else if (s.includes('ARM') || s.includes('EXPLODED') || s.includes('CAPTURING A')) {
                statusEl.style.color = '#ff3333'; 
            } else if (s === 'STANDBY' || s === 'PREPARING' || s === 'DRAW') {
                statusEl.style.color = '#ff9900'; 
            } else {
                statusEl.style.color = 'var(--sop-primary)';
            }
        }
        updateForceEndButton(payload.state); 
    }

    const formatTime = (seconds) => {
        if(seconds === undefined) return "00:00";
        const m = Math.floor(seconds / 60); const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    if (payload.game_time !== undefined) {
        document.getElementById('global-timer-display').textContent = formatTime(payload.game_time);
        document.getElementById('global-timer-display').style.color = 'var(--sop-primary)';
    } else if (payload.time_left !== undefined) {
        document.getElementById('global-timer-display').textContent = formatTime(payload.time_left);
    } else if (msgType === 'COUNTDOWN_UPDATE' && payload.time !== undefined) {
        document.getElementById('global-timer-display').textContent = `T-${payload.time}`;
        document.getElementById('global-timer-display').style.color = '#ff9900'; 
    }

    const isDom = (msgType === 'DOM_UPDATE' || mode === 'DOMINATION');
    const isTdm = (msgType === 'TDM_UPDATE' || mode === 'TEAM_DEATHMATCH');
    const isSd = (msgType === 'SD_UPDATE' || mode === 'SEARCH_AND_DESTROY');

    const bombContainer = document.querySelector('.bomb-timer-container');
    const domScores = document.getElementById('domination-scores');
    const progSection = document.querySelector('.progress-section');
    const title = document.getElementById('tactical-panel-title');

    if (isSd) {
        title.textContent = "TACTICAL FEED // S&D";
        bombContainer.classList.remove('hidden'); domScores.classList.add('hidden'); progSection.classList.remove('hidden');
        document.getElementById('lbl-prog-1').textContent = "ARMING PROGRESS";
        document.getElementById('lbl-prog-2').textContent = "DEFUSING PROGRESS";
        if (payload.bomb_time !== undefined) document.getElementById('sd-bomb-timer').textContent = formatTime(payload.bomb_time);
    } else if (isDom) {
        title.textContent = "TACTICAL FEED // DOMINATION";
        bombContainer.classList.add('hidden'); domScores.classList.remove('hidden'); progSection.classList.remove('hidden');
        
        document.getElementById('lbl-prog-1').textContent = `${currentFactions.ALPHA.name} ACTION`;
        document.getElementById('lbl-prog-2').textContent = `${currentFactions.BRAVO.name} ACTION`;
        
        if (payload.score_a !== undefined) document.getElementById('d-val-a').textContent = formatTime(payload.score_a);
        if (payload.score_b !== undefined) document.getElementById('d-val-b').textContent = formatTime(payload.score_b);
    } else if (isTdm) {
        title.textContent = "TACTICAL FEED // DEATHMATCH";
        bombContainer.classList.add('hidden'); domScores.classList.add('hidden'); progSection.classList.add('hidden');
    }

    let width1 = 0, width2 = 0, bar1Active = false, bar2Active = false;
    if (isSd) {
        if(payload.arm_prog !== undefined) { width1 = payload.arm_prog; bar1Active = width1 > 0; }
        if(payload.def_prog !== undefined) { width2 = payload.def_prog; bar2Active = width2 > 0; }
    } else if (isDom) {
        const prog = payload.capture_prog || 0;
        const state = payload.state || '';
        if (state.includes('CAPTURING A')) { width1 = prog; bar1Active = true; }
        else if (state.includes('CAPTURING B')) { width2 = prog; bar2Active = true; }
    }

    updateProgressBar(document.getElementById('sd-arm-bar'), width1, bar1Active, 1);
    updateProgressBar(document.getElementById('sd-defuse-bar'), width2, bar2Active, 2);
    
    // Aggiorniamo anche le daily wins in caso siano state caricate dopo l'apertura del monitor
    updateMonitorDailyWins(currentFactions);
}

function updateProgressBar(barElem, width, isActive, timerRefName) {
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
}

function updateForceEndButton(state) {
    const btnForceEnd = document.getElementById('btn-force-end');
    if (btnForceEnd) {
        const footer = btnForceEnd.parentElement;
        const activeStates = ['SAFE', 'ARMING...', 'ARMED', 'DEFUSING...', 'NEUTRAL', 'OWNED ALPHA', 'OWNED BRAVO', 'CAPTURING A...', 'CAPTURING B...', 'ACTIVE'];
        const endStates = ['T WINS', 'CT WINS', 'ALPHA WINS', 'BRAVO WINS', 'DRAW', 'STOPPED'];
        
        if (activeStates.includes(state)) {
            footer.classList.remove('hidden');
            btnForceEnd.textContent = "[ TERMINATE MISSION ]";
            btnForceEnd.dataset.action = "FORCE_END_GAME";
            btnForceEnd.className = "deck-btn btn-danger full-width";
            btnForceEnd.style.borderColor = "var(--sop-alert)";
            btnForceEnd.style.color = "var(--sop-alert)";
        } else if (endStates.includes(state)) {
            footer.classList.remove('hidden');
            btnForceEnd.textContent = "[ CLOSE & DISMISS ]";
            btnForceEnd.dataset.action = "CLOSE_MISSION";
            btnForceEnd.className = "deck-btn full-width";
            btnForceEnd.style.borderColor = "var(--sop-success)";
            btnForceEnd.style.color = "var(--sop-success)";
        } else {
            footer.classList.add('hidden');
        }
    }
}

export function renderRules(payload) {
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