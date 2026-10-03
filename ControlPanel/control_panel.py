from flask import Flask, render_template, request, jsonify, redirect, url_for, flash
from flask_socketio import SocketIO, emit
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
import logging
import json
import socket
import time
import threading
from threading import Lock
import sqlite3
import os

# --- CONFIGURAZIONE ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['SECRET_KEY'] = 'philanthropy_secret_key_change_in_prod'
socketio = SocketIO(app, cors_allowed_origins="*")

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

USERS = { "admin": {"password": "admin", "name": "Operatore"} }

class User(UserMixin):
    def __init__(self, id):
        self.id = id
        self.name = USERS[id]['name']
        
    @staticmethod
    def get(user_id):
        if user_id in USERS: return User(user_id)
        return None

@login_manager.user_loader
def load_user(user_id):
    return User.get(user_id)

# --- DATABASE SETUP (PHILANTHROPY) ---
DB_PATH = 'philanthropy_arena.db'

def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        # Tabella dell'anagrafica globale (permanente)
        c.execute('''CREATE TABLE IF NOT EXISTS players
                     (uid TEXT PRIMARY KEY, alias TEXT, games_played INTEGER DEFAULT 0, wins INTEGER DEFAULT 0)''')
        # Tabella temporanea per i giocatori attualmente in campo
        c.execute('''CREATE TABLE IF NOT EXISTS active_roster
                     (uid TEXT PRIMARY KEY, team TEXT, status TEXT)''')
        conn.commit()

init_db()

def broadcast_roster():
    """Legge il roster dal DB e lo invia a tutti i client web connessi."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute('''
            SELECT a.uid, p.alias as name, a.team, a.status 
            FROM active_roster a 
            JOIN players p ON a.uid = p.uid
        ''')
        rows = c.fetchall()
        roster = {}
        for r in rows:
            roster[r['uid']] = dict(r)
            
    socketio.emit('roster_update', roster)

# --- DEVICE REGISTRY (Thread-Safe) ---
class DeviceRegistry:
    def __init__(self):
        self.devices = {}
        self.timeout_seconds = 15 
        self.lock = Lock()

    def update_device(self, device_id, ip_info, msg_type, mode=None, version=None):
        now = time.time()
        changed = False
        
        with self.lock:
            if device_id not in self.devices:
                self.devices[device_id] = {
                    "id": device_id,
                    "name": device_id,
                    "type": "NODE",
                    "mode": "BOOTING...",
                    "version": "Unknown"
                }
                changed = True 
            
            self.devices[device_id]["last_seen"] = now
            
            new_ip = ip_info[0] if isinstance(ip_info, list) else ip_info
            if self.devices[device_id].get("ip") != new_ip:
                self.devices[device_id]["ip"] = new_ip
            
            self.devices[device_id]["status"] = "ONLINE"
            
            if version and self.devices[device_id].get("version") != version:
                self.devices[device_id]["version"] = version
                changed = True

            if mode and self.devices[device_id].get("mode") != mode:
                 self.devices[device_id]["mode"] = mode
                 changed = True
            elif msg_type == "MODE_EXIT" and self.devices[device_id].get("mode") != "MAIN MENU":
                self.devices[device_id]["mode"] = "MAIN MENU"
                changed = True
            
        return changed

    def rename_device(self, device_id, new_name):
        with self.lock:
            if device_id in self.devices:
                self.devices[device_id]["name"] = new_name
                return True
        return False

    def get_active_devices(self):
        now = time.time()
        to_remove = []
        active_list = []
        needs_update = False

        with self.lock:
            for d_id, data in self.devices.items():
                if now - data["last_seen"] > self.timeout_seconds:
                    to_remove.append(d_id)
                else:
                    active_list.append(data)
            
            for d_id in to_remove:
                del self.devices[d_id]
                needs_update = True
            
        return active_list, needs_update

registry = DeviceRegistry()
background_thread_started = False

def background_cleanup():
    logger.info("[SYSTEM] Task di Pulizia AVVIATO.")
    while True:
        socketio.sleep(2) 
        try:
            active_devs, removed_something = registry.get_active_devices()
            if removed_something:
                logger.info(f"[SYSTEM] Dispositivo disconnesso. Nodi rimasti: {len(active_devs)}")
                socketio.emit('devices_update', active_devs)
        except Exception as e:
            logger.error(f"[CRITICAL] Errore nel thread di pulizia: {e}")

# --- ROUTES & WEBSOCKETS ---

@socketio.on('connect')
def handle_connect():
    global background_thread_started
    if not background_thread_started:
        socketio.start_background_task(background_cleanup)
        background_thread_started = True
    
    active_devs, _ = registry.get_active_devices()
    emit('devices_update', active_devs)
    broadcast_roster()
    logger.info(f"[SYSTEM] Client connesso: {request.sid}")

@app.route('/')
@login_required
def index():
    return render_template('index.html', username=current_user.name)

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        if username in USERS and USERS[username]['password'] == password:
            user = User.get(username)
            login_user(user)
            return redirect(url_for('index'))
        else:
            flash('ACCESSO NEGATO', 'error')
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

@app.route('/internal/forward_data', methods=['POST'])
def receive_data_from_bridge():
    try:
        data = request.json
        if not data: return jsonify({"status": "error"}), 400
        
        parsed = data.get('parsed_data', {})
        ip_info = data.get('device_ip_info', [])
        
        device_id = parsed.get('id')
        msg_type = parsed.get('type')
        payload = parsed.get('payload', {})
        
        if device_id:
            mode = payload.get('mode')
            version = payload.get('version')
            
            has_changed = registry.update_device(device_id, ip_info, msg_type, mode, version)
            socketio.emit('esp_event', data)
            
            if has_changed:
                active_devs, _ = registry.get_active_devices()
                socketio.emit('devices_update', active_devs)

        return jsonify({"status": "ok"}), 200
    except Exception as e:
        logger.error(f"Errore forward: {e}")
        return jsonify({"status": "error"}), 500

# --- WEBSOCKET EVENTI ROSTER ARENA ---
@socketio.on('request_roster')
def handle_request_roster():
    broadcast_roster()

@socketio.on('register_operator')
def handle_register_operator(data):
    uid = data.get('uid')
    team = data.get('team')
    if not uid or not team: return
    
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute("INSERT OR IGNORE INTO players (uid, alias) VALUES (?, ?)", (uid, f"OP-{uid[:4]}"))
        c.execute("INSERT OR REPLACE INTO active_roster (uid, team, status) VALUES (?, ?, 'FUORI')", (uid, team))
        conn.commit()
    logger.info(f"[ARENA] Registrato operatore {uid} nel {team}")
    broadcast_roster()

@socketio.on('update_operator')
def handle_update_operator(data):
    uid = data.get('uid')
    action = data.get('action')
    value = data.get('value')
    
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        if action == 'rename':
            c.execute("UPDATE players SET alias = ? WHERE uid = ?", (value, uid))
        elif action == 'swap':
            c.execute("UPDATE active_roster SET team = CASE WHEN team='ALPHA' THEN 'BRAVO' ELSE 'ALPHA' END WHERE uid = ?", (uid,))
        elif action == 'status_toggle':
            c.execute("UPDATE active_roster SET status = CASE WHEN status='IN' THEN 'FUORI' ELSE 'IN' END WHERE uid = ?", (uid,))
        elif action == 'delete':
            c.execute("DELETE FROM active_roster WHERE uid = ?", (uid,))
        conn.commit()
    broadcast_roster()

@socketio.on('clear_roster')
def handle_clear_roster():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("DELETE FROM active_roster")
        conn.commit()
    logger.info("[ARENA] Roster attivo resettato.")
    broadcast_roster()

# --- WEBSOCKET EVENTI DATABASE GLOBALE ---
@socketio.on('request_database')
def handle_request_database():
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute("SELECT * FROM players ORDER BY alias")
        rows = [dict(r) for r in c.fetchall()]
    socketio.emit('database_update', rows)

@socketio.on('update_db_player')
def handle_update_db_player(data):
    uid = data.get('uid')
    action = data.get('action')
    value = data.get('value')
    
    with sqlite3.connect(DB_PATH) as conn:
        if action == 'rename':
            conn.execute("UPDATE players SET alias = ? WHERE uid = ?", (value, uid))
        elif action == 'delete':
            conn.execute("DELETE FROM players WHERE uid = ?", (uid,))
            conn.execute("DELETE FROM active_roster WHERE uid = ?", (uid,))
        conn.commit()
    broadcast_roster()
    handle_request_database()

# -------------------------------------

@socketio.on('rename_device')
def handle_rename(data):
    device_id = data.get('id')
    new_name = data.get('name')
    if device_id and new_name:
        registry.rename_device(device_id, new_name)
        active_devs, _ = registry.get_active_devices()
        socketio.emit('devices_update', active_devs)

@socketio.on('request_manual_scan')
def handle_manual_scan():
    active_devs, _ = registry.get_active_devices()
    socketio.emit('devices_update', active_devs)

@socketio.on('send_command')
def handle_socket_command(data):
    BRIDGE_IP, BRIDGE_PORT = '127.0.0.1', 1234
    try:
        target_id = data.get('target_id')
        command_obj = data.get('command')
        cmd_str = json.dumps(command_obj) if isinstance(command_obj, dict) else command_obj
        
        payload = {"target_id": target_id, "command": cmd_str}
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.sendto(json.dumps(payload).encode('utf-8'), (BRIDGE_IP, BRIDGE_PORT))
    except Exception as e:
        logger.error(f"[ERROR SOCKET] {e}")

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)