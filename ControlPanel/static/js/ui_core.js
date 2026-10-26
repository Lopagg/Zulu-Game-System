// ui_core.js
import { updateSetupDropdown } from './main.js';

export let activeInspectorId = null;

const views = {
    'hub': document.getElementById('view-hub'),
    'setup': document.getElementById('view-setup'),
    'monitor': document.getElementById('view-monitor'),
    'inspector': document.getElementById('view-inspector'),
    'arena-menu': document.getElementById('view-arena-menu'),
    'arena-manage': document.getElementById('view-arena-manage'),
    'arena-tracking': document.getElementById('view-arena-tracking'),
    'arena-db': document.getElementById('view-arena-db')
};

export function showView(viewName, socket) {
    // --- FIX: Ricarica sempre il database dal server quando si apre il pannello ---
    if(viewName === 'arena-db' && socket) {
        socket.emit('request_database'); 
    }
    
    Object.values(views).forEach(el => {
        if(el) { el.classList.remove('active'); el.classList.add('hidden'); }
    });
    
    const target = views[viewName];
    if(target) { target.classList.remove('hidden'); target.classList.add('active'); }
    
    if(viewName === 'hub') {
        activeInspectorId = null;
        document.querySelectorAll('.device-item').forEach(el => el.classList.remove('active'));
    }
}

const elMiniLog = document.getElementById('mini-log');
export function logSystem(text) {
    if(!elMiniLog) return;
    const div = document.createElement('div');
    div.textContent = `> ${text}`;
    elMiniLog.prepend(div);
}

export function updateDeviceList(devices, socket, setMonitoredDeviceCb) {
    const elDeviceList = document.getElementById('device-list');
    const elAssetCount = document.getElementById('asset-count');
    if(!elDeviceList) return;
    
    elDeviceList.innerHTML = ''; 
    if(elAssetCount) elAssetCount.textContent = devices.length;
    
    if (devices.length === 0) {
        elDeviceList.innerHTML = '<li class="placeholder-msg">SCANNING NETWORK...</li>';
        return;
    }
    
    devices.forEach(device => {
        const isOnline = device.status === 'ONLINE';
        const cssClass = isOnline ? 'status-online' : 'status-offline';
        const displayName = device.name || device.id;
        const li = document.createElement('li');
        li.className = `device-item ${cssClass}`;
        
        if (device.id === activeInspectorId) li.classList.add('active'); 

        const isKiosk = device.mode === 'KIOSK';
        const iconLetter = isKiosk ? 'K' : 'N';
        const iconStyle = isKiosk ? 'background: var(--sop-secondary); color: #000;' : '';

        li.innerHTML = `
            <div class="device-icon" style="${iconStyle}">${iconLetter}</div>
            <div class="device-info">
                <span class="device-id">${displayName}</span>
                <span class="device-mode">${device.mode || 'UNKNOWN'}</span>
            </div>
        `;
        
        li.addEventListener('click', () => {
            activeInspectorId = device.id;
            updateInspectorData(device);
            showView('inspector', socket);
            
            if (device.mode !== 'KIOSK' && device.mode !== 'MAIN MENU') {
                setMonitoredDeviceCb(device.id);
                logSystem(`UI LOCKED ON NODE: ${device.id.slice(-4)}`);
            }
        });
        
        elDeviceList.appendChild(li);
        if (device.id === activeInspectorId) updateInspectorData(device);
    });
}

function updateInspectorData(device) {
    const displayName = device.name || device.id;
    document.getElementById('inspector-title').textContent = `${displayName} // CONFIG`;
    document.getElementById('insp-alias-input').value = (device.name === device.id) ? "" : device.name;
    document.getElementById('insp-mode').textContent = device.mode || 'N/A';
    document.getElementById('insp-state').textContent = device.status || 'UNKNOWN';
    document.getElementById('insp-ip').textContent = device.ip || 'UNKNOWN';
    document.getElementById('insp-fw-ver').textContent = `FW_VER: ${device.version || '--'}`;
    
    const hwTitle = document.getElementById('insp-hw-title');
    const hwDesc = document.getElementById('insp-hw-desc');
    if (hwTitle && hwDesc) {
        if (device.mode === 'KIOSK') {
            hwTitle.textContent = "TACTICAL KIOSK V1";
            hwDesc.textContent = "Terminale RFID per l'assegnazione squadre e gestione sistema.";
        } else if (device.id === 'SERVER-TDM' || device.mode === 'TEAM_DEATHMATCH') {
            hwTitle.textContent = "VIRTUAL TDM SERVER";
            hwDesc.textContent = "Motore logico software in esecuzione sul server centrale.";
        } else {
            hwTitle.textContent = "REMOTE ACCESS TERMINAL V1";
            hwDesc.textContent = "Terminale tattico multi-ruolo basato su architettura ESP32.";
        }
    }
}

export function updateClock() {
    const elMissionClock = document.getElementById('mission-clock');
    setInterval(() => {
        const now = new Date();
        if(elMissionClock) elMissionClock.textContent = now.toLocaleTimeString('it-IT', { hour12: false });
    }, 1000);
}