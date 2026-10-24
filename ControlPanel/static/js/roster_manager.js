// roster_manager.js

let currentProfileUid = null;
export let globalPlayersDB = [];

export function getCurrentProfileUid() {
    return currentProfileUid;
}

export function renderArenaRoster(arenaRoster, socket) {
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
            if(isAlpha) {
                alphaInCount++;
                addToList(listMonitorAlpha, player, socket);
            } else {
                bravoInCount++;
                addToList(listMonitorBravo, player, socket);
            }
        }

        const liManage = createManageItem(player, socket);
        if(isAlpha) listAlphaManage.appendChild(liManage);
        else listBravoManage.appendChild(liManage);

        const liTrack = createTrackItem(player, socket, isInField);
        if(isAlpha && isInField) listAlphaIn.appendChild(liTrack);
        if(isAlpha && !isInField) listAlphaOut.appendChild(liTrack);
        if(!isAlpha && isInField) listBravoIn.appendChild(liTrack);
        if(!isAlpha && !isInField) listBravoOut.appendChild(liTrack);
    });
    
    if(alphaCount === 0) listAlphaManage.innerHTML = '<li class="placeholder-text" style="color:var(--sop-dim); text-align:center; margin-top:20px;">NESSUN OPERATORE</li>';
    if(bravoCount === 0) listBravoManage.innerHTML = '<li class="placeholder-text" style="color:var(--sop-dim); text-align:center; margin-top:20px;">NESSUN OPERATORE</li>';
    
    document.getElementById('header-alpha-manage').textContent = `TEAM ALPHA (${alphaCount})`;
    document.getElementById('header-bravo-manage').textContent = `TEAM BRAVO (${bravoCount})`;
    document.getElementById('total-op-count').textContent = (alphaCount + bravoCount);
    document.getElementById('track-in-count').textContent = inFieldCount;

    document.getElementById('score-a').textContent = alphaInCount;
    document.getElementById('score-b').textContent = bravoInCount;

    document.getElementById('setup-alpha-count').textContent = `${alphaInCount}/${alphaCount}`;
    document.getElementById('setup-bravo-count').textContent = `${bravoInCount}/${bravoCount}`;
}

export function renderDatabase(players, socket, arenaRoster) {
    globalPlayersDB = players;

    const modal = document.getElementById('add-player-modal');
    if (modal && !modal.classList.contains('hidden')) {
        renderAddPlayerList(socket, arenaRoster);
    }

    const dbList = document.getElementById('db-list');
    const dbCount = document.getElementById('db-total-count');
    if(!dbList) return;

    dbList.innerHTML = '';
    if(dbCount) dbCount.textContent = players.length;

    if(players.length === 0) {
        dbList.innerHTML = '<li class="placeholder-text" style="color:var(--sop-dim); text-align:center; margin-top:20px;">NESSUN OPERATORE IN ARCHIVIO</li>';
        return;
    }

    players.forEach(player => {
        const li = document.createElement('li');
        li.className = 'roster-item';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = `${player.alias} (UID: ${player.uid})`;
        nameSpan.style.fontWeight = 'bold';
        nameSpan.style.fontSize = '20px';
        nameSpan.className = 'clickable-name';
        nameSpan.onclick = () => openOperatorProfile(player.uid, socket);

        const controlsDiv = document.createElement('div');
        controlsDiv.style.fontSize = '18px';
        controlsDiv.style.fontFamily = 'monospace';

        const btnRename = document.createElement('span');
        btnRename.textContent = '[REN]';
        btnRename.className = 'action-btn';
        btnRename.style.color = 'var(--sop-primary)';
        btnRename.onclick = () => {
            const newName = prompt("Inserisci nuovo nome operatore:", player.alias);
            if (newName && newName.trim() !== '') {
                socket.emit('update_db_player', { uid: player.uid, action: 'rename', value: newName.trim().toUpperCase() });
            }
        };

        const btnDel = document.createElement('span');
        btnDel.textContent = '[DEL]';
        btnDel.className = 'action-btn';
        btnDel.style.color = 'var(--sop-alert)';
        btnDel.onclick = () => {
            if(confirm(`ELIMINARE PERMANENTEMENTE ${player.alias} DAL DATABASE? L'azione è irreversibile.`)) {
                socket.emit('update_db_player', { uid: player.uid, action: 'delete' });
            }
        };

        controlsDiv.appendChild(btnRename);
        controlsDiv.appendChild(btnDel);
        li.appendChild(nameSpan);
        li.appendChild(controlsDiv);
        dbList.appendChild(li);
    });
}

export function renderAddPlayerList(socket, arenaRoster) {
    const list = document.getElementById('add-player-list');
    if (!list) return;
    list.innerHTML = '';

    const availablePlayers = globalPlayersDB.filter(p => !arenaRoster[p.uid]);

    if (availablePlayers.length === 0) {
        list.innerHTML = '<li class="placeholder-text" style="color:var(--sop-dim); text-align:center; margin-top:20px;">TUTTI I GIOCATORI SONO GIA\' IN CAMPO OPPURE DB VUOTO</li>';
        return;
    }

    availablePlayers.forEach(player => {
        const li = document.createElement('li');
        li.className = 'roster-item';
        li.style.justifyContent = 'space-between';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = `${player.alias}`;
        nameSpan.style.fontWeight = 'bold';
        nameSpan.style.fontSize = '18px';

        const controlsDiv = document.createElement('div');

        const btnAlpha = document.createElement('button');
        btnAlpha.textContent = '[ + ALPHA ]';
        btnAlpha.className = 'deck-btn';
        btnAlpha.style.color = 'var(--sop-alert)';
        btnAlpha.style.borderColor = 'var(--sop-alert)';
        btnAlpha.style.marginRight = '10px';
        btnAlpha.onclick = () => { socket.emit('register_operator', { uid: player.uid, team: 'ALPHA' }); };

        const btnBravo = document.createElement('button');
        btnBravo.textContent = '[ + BRAVO ]';
        btnBravo.className = 'deck-btn';
        btnBravo.style.color = '#55ff55';
        btnBravo.style.borderColor = '#55ff55';
        btnBravo.onclick = () => { socket.emit('register_operator', { uid: player.uid, team: 'BRAVO' }); };

        controlsDiv.appendChild(btnAlpha);
        controlsDiv.appendChild(btnBravo);
        li.appendChild(nameSpan);
        li.appendChild(controlsDiv);
        list.appendChild(li);
    });
}

export function populateProfileModal(data) {
    const nameEl = document.getElementById('modal-op-name');
    if(nameEl) nameEl.textContent = `PROFILE // ${data.alias}`;
    const uidEl = document.getElementById('modal-op-uid');
    if(uidEl) uidEl.textContent = data.uid;
    const dateEl = document.getElementById('modal-op-date');
    if(dateEl) dateEl.textContent = data.registered_at || 'Sconosciuta';
    const gamesEl = document.getElementById('modal-op-games');
    if(gamesEl) gamesEl.textContent = data.games_played || 0;
    const notesEl = document.getElementById('modal-op-notes');
    if(notesEl) notesEl.value = data.notes || '';
    
    const photoEl = document.getElementById('modal-op-photo');
    if(photoEl) {
        if(data.photo) photoEl.src = `/static/uploads/${data.photo}?t=${new Date().getTime()}`;
        else photoEl.src = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIiBmaWxsPSIjMzMzIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjM1IiByPSIyMCIvPjxwYXRoIGQ9Ik0yMCA5MCBRMjAgNjAgNTAgNjAgUTgwIDYwIDgwIDkwIFoiLz48L3N2Zz4=";
    }
    
    document.getElementById('operator-modal').classList.remove('hidden');
}

function addToList(list, player, socket) {
    if(!list) return;
    const li = document.createElement('li');
    li.textContent = player.name;
    li.className = 'clickable-name';
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
    btns[2].onclick = () => {
        if(confirm(`Rimuovere ${player.name} dal roster attivo?`)) socket.emit('update_operator', { uid: player.uid, action: 'delete' });
    };
    return li;
}

function createTrackItem(player, socket, isInField) {
    const li = document.createElement('li');
    li.className = `roster-item ${isInField ? 'in-field' : 'eliminated'}`;
    li.innerHTML = `<span class="clickable-name" style="font-weight:bold; font-size:20px;">${player.name}</span>
                    <div style="font-size:18px; font-family:monospace;">
                        <span class="action-btn" style="color:${isInField ? 'var(--sop-alert)' : '#55ff55'}">${isInField ? '[RECALL]' : '[DEPLOY]'}</span>
                    </div>`;
    li.querySelector('span.clickable-name').onclick = () => openOperatorProfile(player.uid, socket);
    li.querySelector('.action-btn').onclick = () => socket.emit('update_operator', { uid: player.uid, action: 'status_toggle' });
    return li;
}

export function openOperatorProfile(uid, socket) {
    currentProfileUid = uid;
    socket.emit('request_profile', {uid: uid});
}

window.openAddPlayerModal = function() {
    document.getElementById('add-player-modal').classList.remove('hidden');
};
window.closeAddPlayerModal = function() {
    document.getElementById('add-player-modal').classList.add('hidden');
};
window.closeModal = function() {
    document.getElementById('operator-modal').classList.add('hidden');
};