// roster_manager.js

let currentProfileUid = null;

export function renderArenaRoster(arenaRoster, socket) {
    // 1. Cattura Elementi DOM
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
    
    // 2. Loop Assegnazioni
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

        // Voci Management
        const liManage = createManageItem(player, socket);
        if(isAlpha) listAlphaManage.appendChild(liManage);
        else listBravoManage.appendChild(liManage);

        // Voci Tracking
        const liTrack = createTrackItem(player, socket, isInField);
        if(isAlpha && isInField) listAlphaIn.appendChild(liTrack);
        if(isAlpha && !isInField) listAlphaOut.appendChild(liTrack);
        if(!isAlpha && isInField) listBravoIn.appendChild(liTrack);
        if(!isAlpha && !isInField) listBravoOut.appendChild(liTrack);
    });
    
    // 3. Testi e Header
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

// Funzioni Helper per generare HTML
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

// Global Exports
window.openAddPlayerModal = function() {
    document.getElementById('add-player-modal').classList.remove('hidden');
};
window.closeAddPlayerModal = function() {
    document.getElementById('add-player-modal').classList.add('hidden');
};
window.closeModal = function() {
    document.getElementById('operator-modal').classList.add('hidden');
};