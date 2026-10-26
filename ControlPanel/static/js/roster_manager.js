import { currentFactions } from './main.js';

let currentProfileUid = null;
export let globalPlayersDB = [];

let cachedSocket = null;
let cachedArenaRoster = {};

export function getCurrentProfileUid() {
    return currentProfileUid;
}

export function renderArenaRoster(arenaRoster, socket) {
    cachedSocket = socket;
    cachedArenaRoster = arenaRoster;
    
    const listAlphaManage = document.getElementById('roster-alpha-manage');
    const listBravoManage = document.getElementById('roster-bravo-manage');
    const listAlphaIn = document.getElementById('track-alpha-in');
    const listAlphaOut = document.getElementById('track-alpha-out');
    const listBravoIn = document.getElementById('track-bravo-in');
    const listBravoOut = document.getElementById('track-bravo-out');
    const listMonitorAlpha = document.getElementById('monitor-roster-alpha');
    const listMonitorBravo = document.getElementById('monitor-roster-bravo');
    
    if(!listAlphaManage || !listAlphaIn) return;
    
    [listAlphaManage, listBravoManage, listAlphaIn, listAlphaOut, listBravoIn, listBravoOut].forEach(el => el.innerHTML = '');
    if(listMonitorAlpha) listMonitorAlpha.innerHTML = '';
    if(listMonitorBravo) listMonitorBravo.innerHTML = '';
    
    let alphaCount = 0, bravoCount = 0, inFieldCount = 0;
    let alphaInCount = 0, bravoInCount = 0;
    
    Object.values(arenaRoster).forEach(player => {
        const isAlpha = player.team === 'ALPHA';
        const isInField = player.status === 'IN';
        
        if(isAlpha) alphaCount++; else bravoCount++;
        
        if(isInField) {
            inFieldCount++;
            if(isAlpha) { alphaInCount++; addToList(listMonitorAlpha, player, socket); } 
            else { bravoInCount++; addToList(listMonitorBravo, player, socket); }
        }

        const liManage = createManageItem(player, socket);
        if(isAlpha) listAlphaManage.appendChild(liManage); else listBravoManage.appendChild(liManage);

        const liTrack = createTrackItem(player, socket, isInField);
        if(isAlpha && isInField) listAlphaIn.appendChild(liTrack);
        if(isAlpha && !isInField) listAlphaOut.appendChild(liTrack);
        if(!isAlpha && isInField) listBravoIn.appendChild(liTrack);
        if(!isAlpha && !isInField) listBravoOut.appendChild(liTrack);
    });
    
    if(alphaCount === 0) listAlphaManage.innerHTML = '<li class="placeholder-text" style="color:var(--sop-dim); text-align:center; margin-top:20px;">NESSUN OPERATORE</li>';
    if(bravoCount === 0) listBravoManage.innerHTML = '<li class="placeholder-text" style="color:var(--sop-dim); text-align:center; margin-top:20px;">NESSUN OPERATORE</li>';
    
    document.getElementById('header-alpha-manage').innerHTML = `${currentFactions.ALPHA.name} (${alphaCount}) <span class="action-btn" onclick="openFactionModal('ALPHA')" style="font-size:14px; float:right;">[EDIT]</span>`;
    document.getElementById('header-bravo-manage').innerHTML = `${currentFactions.BRAVO.name} (${bravoCount}) <span class="action-btn" onclick="openFactionModal('BRAVO')" style="font-size:14px; float:right;">[EDIT]</span>`;
    
    const setEl = (id, txt) => { const el = document.getElementById(id); if(el) el.textContent = txt; };
    setEl('header-alpha-track-in', `${currentFactions.ALPHA.name} IN CAMPO (${alphaInCount})`);
    setEl('header-alpha-track-out', `${currentFactions.ALPHA.name} FUORI (${alphaCount - alphaInCount})`);
    setEl('header-bravo-track-in', `${currentFactions.BRAVO.name} IN CAMPO (${bravoInCount})`);
    setEl('header-bravo-track-out', `${currentFactions.BRAVO.name} FUORI (${bravoCount - bravoInCount})`);

    setEl('total-op-count', alphaCount + bravoCount);
    setEl('track-in-count', inFieldCount);
    setEl('score-a', alphaInCount);
    setEl('score-b', bravoInCount);
    setEl('setup-alpha-count', `${alphaInCount}/${alphaCount}`);
    setEl('setup-bravo-count', `${bravoInCount}/${bravoCount}`);
}

export function renderDatabase(players, socket, arenaRoster) {
    globalPlayersDB = players;
    cachedSocket = socket;
    cachedArenaRoster = arenaRoster;
    
    const modal = document.getElementById('add-player-modal');
    if (modal && !modal.classList.contains('hidden')) renderAddPlayerList(socket, arenaRoster);

    const dbList = document.getElementById('db-list');
    if(!dbList) return;

    dbList.innerHTML = '';
    document.getElementById('db-total-count').textContent = players.length;

    if(players.length === 0) {
        dbList.innerHTML = '<li class="placeholder-text" style="color:var(--sop-dim); text-align:center; margin-top:20px;">NESSUN OPERATORE IN ARCHIVIO</li>';
        return;
    }

    players.forEach(player => {
        const li = document.createElement('li');
        li.className = 'roster-item';

        const nameSpan = document.createElement('span');
        
        const games = player.games_played || 0;
        const wins = player.wins || 0;
        let winRate = 0;
        if (games > 0) winRate = Math.round((wins / games) * 100);
        
        // --- FIX: Aggiunta Badge PRO / GUEST ---
        const isPro = player.is_pro === 1;
        const badge = isPro ? '<span class="pro-badge">[★ PRO]</span>' : '<span class="guest-badge">[GUEST]</span>';
        
        nameSpan.innerHTML = `${badge} ${player.alias} <span style="font-size: 16px; font-weight: normal; color: #aaa; margin-left: 15px; font-family: monospace;">(UID: ${player.uid}) &nbsp;&nbsp;|&nbsp;&nbsp; P: <span style="color:var(--sop-primary); font-weight:bold">${games}</span> &nbsp;&nbsp;V: <span style="color:var(--sop-success); font-weight:bold">${wins}</span> <span style="color: #666; font-size:14px;">(${winRate}%)</span></span>`;
        nameSpan.style.fontWeight = 'bold'; 
        nameSpan.style.fontSize = '22px'; 
        nameSpan.className = 'clickable-name';
        nameSpan.onclick = () => openOperatorProfile(player.uid, socket);

        const controlsDiv = document.createElement('div');
        controlsDiv.style.fontSize = '18px'; controlsDiv.style.fontFamily = 'monospace';

        const btnRename = document.createElement('span');
        btnRename.textContent = '[REN]'; btnRename.className = 'action-btn'; btnRename.style.color = 'var(--sop-primary)';
        btnRename.onclick = () => {
            const newName = prompt("Inserisci nuovo nome operatore:", player.alias);
            if (newName && newName.trim() !== '') socket.emit('update_db_player', { uid: player.uid, action: 'rename', value: newName.trim().toUpperCase() });
        };

        const btnDel = document.createElement('span');
        btnDel.textContent = '[DEL]'; btnDel.className = 'action-btn'; btnDel.style.color = 'var(--sop-alert)';
        btnDel.onclick = () => {
            if(confirm(`ELIMINARE PERMANENTEMENTE ${player.alias} DAL DATABASE? L'azione è irreversibile.`)) {
                socket.emit('update_db_player', { uid: player.uid, action: 'delete' });
            }
        };

        controlsDiv.appendChild(btnRename); controlsDiv.appendChild(btnDel);
        li.appendChild(nameSpan); li.appendChild(controlsDiv);
        dbList.appendChild(li);
    });
}

export function renderAddPlayerList(socket, arenaRoster) {
    const list = document.getElementById('add-player-list');
    if (!list) return;
    list.innerHTML = '';

    if (!globalPlayersDB || !arenaRoster) return;

    const availablePlayers = globalPlayersDB.filter(p => !arenaRoster[p.uid]);
    if (availablePlayers.length === 0) {
        list.innerHTML = '<li class="placeholder-text" style="color:var(--sop-dim); text-align:center; margin-top:20px;">NESSUN GIOCATORE DISPONIBILE O GIA\' IN CAMPO</li>';
        return;
    }

    availablePlayers.forEach(player => {
        const li = document.createElement('li');
        li.className = 'roster-item'; li.style.justifyContent = 'space-between';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = `${player.alias}`;
        nameSpan.style.fontWeight = 'bold'; nameSpan.style.fontSize = '18px';

        const controlsDiv = document.createElement('div');

        const btnAlpha = document.createElement('button');
        btnAlpha.textContent = `[ + ${currentFactions.ALPHA.name} ]`;
        btnAlpha.className = 'deck-btn'; btnAlpha.style.color = 'var(--team-a-color)'; btnAlpha.style.borderColor = 'var(--team-a-color)'; btnAlpha.style.marginRight = '10px';
        btnAlpha.onclick = () => { socket.emit('register_operator', { uid: player.uid, team: 'ALPHA' }); };

        const btnBravo = document.createElement('button');
        btnBravo.textContent = `[ + ${currentFactions.BRAVO.name} ]`;
        btnBravo.className = 'deck-btn'; btnBravo.style.color = 'var(--team-b-color)'; btnBravo.style.borderColor = 'var(--team-b-color)';
        btnBravo.onclick = () => { socket.emit('register_operator', { uid: player.uid, team: 'BRAVO' }); };

        controlsDiv.appendChild(btnAlpha); controlsDiv.appendChild(btnBravo);
        li.appendChild(nameSpan); li.appendChild(controlsDiv);
        list.appendChild(li);
    });
}

export function populateProfileModal(data) {
    const setEl = (id, txt) => { const el = document.getElementById(id); if(el) el.textContent = txt; };
    setEl('modal-op-name', `PROFILE // ${data.alias}`);
    setEl('modal-op-uid', data.uid);
    setEl('modal-op-date', data.registered_at || 'Sconosciuta');
    
    const games = data.games_played || 0;
    const wins = data.wins || 0;
    let winRate = 0;
    if (games > 0) winRate = Math.round((wins / games) * 100);
    
    setEl('modal-stat-games', games);
    setEl('modal-stat-wins', wins);
    setEl('modal-stat-rate', `${winRate}%`);
    
    const karma = data.karma || 0;
    const karmaEl = document.getElementById('modal-op-karma');
    if(karmaEl) {
        karmaEl.textContent = karma;
        const badge = karmaEl.parentElement;
        badge.classList.remove('positive', 'negative');
        if (karma < 0) badge.classList.add('negative');
        else if (karma > 0) badge.classList.add('positive');
    }
    
    const notesEl = document.getElementById('modal-op-notes');
    if(notesEl) notesEl.value = data.notes || '';
    
    const photoEl = document.getElementById('modal-op-photo');
    if(photoEl) photoEl.src = data.photo ? `/static/uploads/${data.photo}?t=${new Date().getTime()}` : "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIiBmaWxsPSIjMzMzIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjM1IiByPSIyMCIvPjxwYXRoIGQ9Ik0yMCA5MCBRMjAgNjAgNTAgNjAgUTgwIDYwIDgwIDkwIFoiLz48L3N2Zz4=";
    
    document.getElementById('operator-modal').classList.remove('hidden');
}

function addToList(list, player, socket) {
    if(!list) return;
    const li = document.createElement('li');
    li.textContent = player.name; li.className = 'clickable-name';
    li.onclick = () => openOperatorProfile(player.uid, socket);
    list.appendChild(li);
}

function createManageItem(player, socket) {
    const li = document.createElement('li');
    li.className = 'roster-item'; 
    li.innerHTML = `<span class="clickable-name" style="font-weight:bold; font-size:20px;">${player.name}</span>
                    <div style="font-size:18px; font-family:monospace;">
                        <span class="action-btn" style="color:var(--sop-primary)">[REN]</span>
                        <span class="action-btn" style="color:var(--sop-secondary)">[SWAP]</span>
                        <span class="action-btn" style="color:var(--sop-alert)">[DEL]</span>
                    </div>`;
    
    li.querySelector('span.clickable-name').onclick = () => openOperatorProfile(player.uid, socket);
    const btns = li.querySelectorAll('.action-btn');
    btns[0].onclick = () => {
        const newName = prompt("Inserisci nuovo nome:", player.name);
        if (newName && newName.trim() !== '') socket.emit('update_operator', { uid: player.uid, action: 'rename', value: newName.trim().toUpperCase() });
    };
    btns[1].onclick = () => socket.emit('update_operator', { uid: player.uid, action: 'swap' });
    btns[2].onclick = () => { if(confirm(`Rimuovere ${player.name} dal roster attivo?`)) socket.emit('update_operator', { uid: player.uid, action: 'delete' }); };
    return li;
}

function createTrackItem(player, socket, isInField) {
    const li = document.createElement('li');
    li.className = `roster-item ${isInField ? 'in-field' : 'eliminated'}`;
    li.innerHTML = `<span class="clickable-name" style="font-weight:bold; font-size:20px;">${player.name}</span>
                    <div style="font-size:18px; font-family:monospace;">
                        <span class="action-btn" style="color:${isInField ? 'var(--team-a-color)' : 'var(--team-b-color)'}">${isInField ? '[RECALL]' : '[DEPLOY]'}</span>
                    </div>`;
    li.querySelector('span.clickable-name').onclick = () => openOperatorProfile(player.uid, socket);
    li.querySelector('.action-btn').onclick = () => socket.emit('update_operator', { uid: player.uid, action: 'status_toggle' });
    return li;
}

export function openOperatorProfile(uid, socket) { currentProfileUid = uid; socket.emit('request_profile', {uid: uid}); }


// --- FUNZIONI DI REGISTRAZIONE MANUALE TAG (KIOSK TO WEB) ---
window.openRegistrationModal = function() {
    document.getElementById('reg-uid').value = '';
    document.getElementById('reg-alias').value = '';
    document.getElementById('reg-pro').value = '0';
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
    
    if (!uid || !alias) {
        alert("Attendi la scansione dell'UID sul Kiosk e inserisci un Nome.");
        return;
    }
    
    cachedSocket.emit('register_player_manual', {
        uid: uid,
        alias: alias,
        is_pro: parseInt(isPro),
        tag_info: tagInfo
    });
    
    closeRegistrationModal();
};

window.openAddPlayerModal = function() { 
    renderAddPlayerList(cachedSocket, cachedArenaRoster);
    document.getElementById('add-player-modal').classList.remove('hidden'); 
};
window.closeAddPlayerModal = function() { document.getElementById('add-player-modal').classList.add('hidden'); };
window.closeModal = function() { document.getElementById('operator-modal').classList.add('hidden'); };