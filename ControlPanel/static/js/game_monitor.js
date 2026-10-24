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
}

export function updateUniversalFeed(payload, mode, msgType) {
    if (mode && mode !== lastConfiguredMode) {
        lastConfiguredMode = mode;
        document.getElementById('widget-sd-tactical').classList.remove('hidden');
        document.getElementById('widget-sd-rules').classList.remove('hidden');
        document.getElementById('widget-generic-map').classList.add('hidden');
        
        // Imposta il titolo grande della modalità dinamicamente
        const modeTitle = mode.replace(/_/g, ' ').toUpperCase();
        document.getElementById('monitor-mode-title').textContent = `OPERATION: ${modeTitle}`;
    }

    if (payload.state) {
        const statusEl = document.getElementById('sd-bomb-status');
        statusEl.textContent = payload.state;
        const s = payload.state;
        
        if (s.includes('DEFUS') || s.includes('CT WINS') || s.includes('CAPTURING B') || s.includes('OWNED BRAVO') || s.includes('BRAVO WINS')) {
            statusEl.style.color = '#55ff55'; 
        } else if (s.includes('ARM') || s.includes('EXPLODED') || s.includes('T WINS') || s.includes('CAPTURING A') || s.includes('OWNED ALPHA') || s.includes('ALPHA WINS')) {
            statusEl.style.color = 'var(--sop-alert)'; 
        } else if (s === 'STANDBY' || s === 'PREPARING' || s === 'DRAW') {
            statusEl.style.color = '#ff9900'; 
        } else {
            statusEl.style.color = 'var(--sop-primary)';
        }
        updateForceEndButton(s);
    }

    const formatTime = (seconds) => {
        if(seconds === undefined) return "00:00";
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
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
        bombContainer.classList.remove('hidden');
        domScores.classList.add('hidden');
        progSection.classList.remove('hidden');
        document.getElementById('lbl-prog-1').textContent = "ARMING PROGRESS";
        document.getElementById('lbl-prog-2').textContent = "DEFUSING PROGRESS";
        
        if (payload.bomb_time !== undefined) {
            document.getElementById('sd-bomb-timer').textContent = formatTime(payload.bomb_time);
        }
    } else if (isDom) {
        title.textContent = "TACTICAL FEED // DOMINATION";
        bombContainer.classList.add('hidden');
        domScores.classList.remove('hidden');
        progSection.classList.remove('hidden');
        document.getElementById('lbl-prog-1').textContent = "ALPHA ACTION";
        document.getElementById('lbl-prog-2').textContent = "BRAVO ACTION";
        
        if (payload.score_a !== undefined) document.getElementById('d-val-a').textContent = formatTime(payload.score_a);
        if (payload.score_b !== undefined) document.getElementById('d-val-b').textContent = formatTime(payload.score_b);
    } else if (isTdm) {
        title.textContent = "TACTICAL FEED // DEATHMATCH";
        bombContainer.classList.add('hidden');
        domScores.classList.add('hidden');
        progSection.classList.add('hidden');
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
        if (activeStates.includes(state)) {
            footer.classList.remove('hidden');
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