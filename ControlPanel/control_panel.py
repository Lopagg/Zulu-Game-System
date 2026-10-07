from flask import Flask, render_template, request, jsonify, redirect, url_for, flash
from flask_socketio import SocketIO, emit
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.utils import secure_filename
import paho.mqtt.client as mqtt 
import logging
import json
import time
import threading
from threading import Lock
import sqlite3
import os
import datetime
import urllib.request

# --- CONFIGURAZIONE ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['SECRET_KEY'] = 'philanthropy_secret_key_change_in_prod'

UPLOAD_FOLDER = os.path.join(app.root_path, 'static', 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

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

# --- DATABASE SETUP ---
DB_PATH = 'philanthropy_arena.db'

def get_current_time():
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute('''CREATE TABLE IF NOT EXISTS players
                     (uid TEXT PRIMARY KEY, alias TEXT, games_played INTEGER DEFAULT 0, wins INTEGER DEFAULT 0)''')
        
        try: c.execute("ALTER TABLE players ADD COLUMN registered_at TEXT")
        except sqlite3.OperationalError: pass
        try: c.execute("ALTER TABLE players ADD COLUMN notes TEXT")
        except sqlite3.OperationalError: pass
        try: c.execute("ALTER TABLE players ADD COLUMN photo TEXT")
        except sqlite3.OperationalError: pass

        c.execute('''CREATE TABLE IF NOT EXISTS active_roster
                     (uid TEXT PRIMARY KEY, team TEXT, status TEXT)''')
        conn.commit()

init_db()

def broadcast_roster():
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

# --- METEO ---
last_weather_update = 0
cached_weather = "--°C // SCANNING..."

def fetch_weather():
    global last_weather_update, cached_weather
    now = time.time()
    if now - last_weather_update > 900: 
        try:
            req = urllib.request.urlopen('https://api.open-meteo.com/v1/forecast?latitude=45.615&longitude=9.005&current_weather=true', timeout=5)
            data = json.loads(req.read().decode('utf-8'))
            cw = data.get('current_weather')
            if cw:
                temp = round(cw.get('temperature', 0))
                code = cw.get('weathercode', 0)
                condition = "CLEAR"
                if 1 <= code <= 3: condition = "CLOUDS"
                elif 45 <= code <= 48: condition = "FOG"
                elif 51 <= code <= 67: condition = "RAIN"
                elif 71 <= code <= 77: condition = "SNOW"
                elif 80 <= code <= 82: condition = "SHOWERS"
                elif code >= 95: condition = "STORM"
                cached_weather = f"{temp}°C // {condition}"
                last_weather_update = now
        except Exception as e:
            logger.error(f"[ERROR METEO] {e}")
    return cached_weather

# --- STATISTICHE ---
def update_match_stats(winner_state):
    winning_team = None
    if winner_state in ['ALPHA WINS', 'OWNED ALPHA', 'T WINS']:
        winning_team = 'ALPHA'
    elif winner_state in ['BRAVO WINS', 'OWNED BRAVO', 'CT WINS']:
        winning_team = 'BRAVO'
        
    try:
        with sqlite3.connect(DB_PATH) as conn:
            c = conn.cursor()
            c.execute("SELECT uid, team FROM active_roster WHERE status='IN'")
            players = c.fetchall()
            for uid, team in players:
                c.execute("UPDATE players SET games_played = games_played + 1 WHERE uid = ?", (uid,))
                if winning_team and team == winning_team:
                    c.execute("UPDATE players SET wins = wins + 1 WHERE uid = ?", (uid,))
            conn.commit()
            logger.info(f"[STATS] Aggiornate statistiche per {len(players)} operatori. Team Vittorioso: {winning_team or 'NESSUNO'}")
    except Exception as e:
        logger.error(f"[ERROR STATS] {e}")

# --- DEVICE REGISTRY (Multi-Node Architecture) ---
class DeviceRegistry:
    def __init__(self):
        self.devices = {}
        self.timeout_seconds = 15 
        self.lock = Lock()

    def update_device(self, device_id, msg_type, mode=None, version=None):
        now = time.time()
        changed = False
        with self.lock:
            if device_id not in self.devices:
                self.devices[device_id] = { 
                    "id": device_id, 
                    "name": device_id, 
                    "type": "NODE", 
                    "mode": "BOOTING...", 
                    "version": "Unknown", 
                    "ip": "MQTT",
                    "game_state": "STANDBY",
                    "telemetry": {}
                }
                changed = True 
                
            self.devices[device_id]["last_seen"] = now
            self.devices[device_id]["status"] = "ONLINE"
            
            if version and self.devices[device_id].get("version") != version:
                self.devices[device_id]["version"] = version
                changed = True
                
            if mode and self.devices[device_id].get("mode") != mode:
                 self.devices[device_id]["mode"] = mode
                 changed = True
                 
            elif msg_type == "MODE_EXIT" and self.devices[device_id].get("mode") != "MAIN MENU":
                self.devices[device_id]["mode"] = "MAIN MENU"
                self.devices[device_id]["game_state"] = "STANDBY"
                self.devices[device_id]["telemetry"] = {}
                changed = True
                
        return changed

    def update_telemetry(self, device_id, payload, new_state=None):
        changed = False
        with self.lock:
            if device_id in self.devices:
                self.devices[device_id]["telemetry"].update(payload)
                if new_state and self.devices[device_id]["game_state"] != new_state:
                    self.devices[device_id]["game_state"] = new_state
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

# --- TRACKER TDM GLOBALE ---
tdm_state = { "active": False, "time_left": 0, "duration": 0 }

# --- CLIENT MQTT SETUP ---
mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1)

def on_mqtt_connect(client, userdata, flags, rc):
    logger.info(f"[MQTT] Connesso al Broker con codice: {rc}")
    client.subscribe("zulu/telemetry/#")

def on_mqtt_message(client, userdata, msg):
    try:
        payload_str = msg.payload.decode('utf-8')
        parsed = json.loads(payload_str)
        
        device_id = parsed.get('id')
        msg_type = parsed.get('type')
        payload = parsed.get('payload', {})
        
        if msg_type not in ['HEARTBEAT', 'TIME_UPDATE', 'DOM_UPDATE', 'SD_UPDATE']:
            logger.info(f"[MQTT RX] {device_id} -> TYPE: {msg_type} | PAYLOAD: {payload}")
        
        if device_id:
            # --- GESTIONE KIOSK ---
            if msg_type == 'KIOSK_CMD':
                cmd = payload.get('cmd')
                if cmd:
                    socketio.emit('kiosk_hardware_cmd', {'cmd': cmd})
                return

            elif msg_type == 'TAG_SCANNED':
                uid = payload.get('uid')
                reply_action = "UNKNOWN"
                if uid:
                    with sqlite3.connect(DB_PATH) as conn:
                        c = conn.cursor()
                        c.execute("SELECT status, team FROM active_roster WHERE uid = ?", (uid,))
                        row = c.fetchone()
                        
                        if row:
                            new_status = 'FUORI' if row[0] == 'IN' else 'IN'
                            c.execute("UPDATE active_roster SET status = ? WHERE uid = ?", (new_status, uid))
                            conn.commit()
                            reply_action = f"{new_status}_{row[1]}" 
                            broadcast_roster()
                        else:
                            reply_action = "WAIT_ASSIGN"
                
                reply_payload = {"cmd": "KIOSK_REPLY", "action": reply_action}
                mqtt_client.publish(f"zulu/cmd/{device_id}", json.dumps(reply_payload))

            elif msg_type == 'TAG_ASSIGN':
                uid = payload.get('uid')
                team = payload.get('team')
                if uid and team:
                    with sqlite3.connect(DB_PATH) as conn:
                        c = conn.cursor()
                        c.execute("INSERT OR IGNORE INTO players (uid, alias, registered_at) VALUES (?, ?, ?)", (uid, f"OP-{uid[:4]}", get_current_time()))
                        c.execute("INSERT OR REPLACE INTO active_roster (uid, team, status) VALUES (?, ?, 'IN')", (uid, team))
                        conn.commit()
                    broadcast_roster()
            
            # --- AGGIORNAMENTO REGISTRO NODI ---
            mode = payload.get('mode') or parsed.get('mode')
            version = payload.get('version') or parsed.get('version')
            
            has_changed = registry.update_device(device_id, msg_type, mode, version)
            
            if msg_type not in ['TAG_SCANNED', 'TAG_ASSIGN']:
                socketio.emit('esp_event', {"parsed_data": parsed})

            # --- GESTIONE TELEMETRIA & ARBITRO PER SINGOLO NODO ---
            if msg_type in ['SD_UPDATE', 'DOM_UPDATE']:
                new_state = payload.get('state')
                old_state = registry.devices[device_id].get("game_state", "STANDBY")
                
                state_changed = registry.update_telemetry(device_id, payload, new_state)
                
                if state_changed:
                    end_states = ['T WINS', 'CT WINS', 'ALPHA WINS', 'BRAVO WINS', 'DRAW', 'STOPPED']
                    start_states = ['ACTIVE', 'SAFE', 'NEUTRAL']
                    
                    if new_state in end_states and old_state not in end_states:
                        logger.info(f"[ARBITRO SERVER] Partita su nodo {device_id} terminata ({new_state}).")
                        trigger_siren("SIREN_LONG")
                        update_match_stats(new_state) 
                    
                    if old_state == 'PREPARING' and new_state in start_states:
                        logger.info(f"[ARBITRO SERVER] Partita su nodo {device_id} iniziata ({new_state}).")
                        trigger_siren("SIREN_LONG")
                            
            elif msg_type == 'MODE_ENTER':
                registry.update_telemetry(device_id, {}, "PREPARING")
            
            if has_changed:
                active_devs, _ = registry.get_active_devices()
                socketio.emit('devices_update', active_devs)

    except Exception as e:
        logger.error(f"[MQTT ERROR] Eccezione nel parsing del messaggio: {e}")

mqtt_client.on_connect = on_mqtt_connect
mqtt_client.on_message = on_mqtt_message

try:
    mqtt_client.connect("127.0.0.1", 1883, 60)
    mqtt_client.loop_start()
    logger.info("[MQTT] Servizio MQTT in background avviato.")
except Exception as e:
    logger.error(f"[CRITICAL MQTT] Impossibile collegarsi a Mosquitto: {e}")

def trigger_siren(cmd_type="SIREN_LONG"):
    try:
        command_str = json.dumps({"cmd": cmd_type})
        mqtt_client.publish("zulu/cmd/broadcast", command_str)
    except Exception as e:
        logger.error(f"[ERROR SIREN SERVER] {e}")

def background_cleanup():
    logger.info("[SYSTEM] Task di Pulizia e Arbitro Globale AVVIATO.")
    tick_counter = 0
    while True:
        socketio.sleep(1) 
        tick_counter += 1
        
        with sqlite3.connect(DB_PATH) as conn:
            c = conn.cursor()
            c.execute("SELECT team FROM active_roster WHERE status='IN'")
            players = c.fetchall()
            alpha_in = sum(1 for p in players if p[0] == 'ALPHA')
            bravo_in = sum(1 for p in players if p[0] == 'BRAVO')
        
        # --- ARBITRO TEAM DEATHMATCH ---
        if tdm_state['active']:
            if tdm_state['time_left'] > 0:
                tdm_state['time_left'] -= 1
            
            state_str = "ACTIVE"
            tdm_ends = False
            
            if alpha_in == 0 and bravo_in > 0:
                state_str = "BRAVO WINS"
                tdm_ends = True
            elif bravo_in == 0 and alpha_in > 0:
                state_str = "ALPHA WINS"
                tdm_ends = True
            elif alpha_in == 0 and bravo_in == 0:
                state_str = "DRAW"
                tdm_ends = True
            elif tdm_state['time_left'] <= 0:
                if alpha_in > bravo_in: state_str = "ALPHA WINS"
                elif bravo_in > alpha_in: state_str = "BRAVO WINS"
                else: state_str = "DRAW"
                tdm_ends = True
                
            if tdm_ends:
                tdm_state['active'] = False
                trigger_siren("SIREN_LONG") 
                update_match_stats(state_str)
            
            doc = { "id": "SERVER-TDM", "type": "TDM_UPDATE", "payload": { "mode": "TEAM_DEATHMATCH", "state": state_str, "game_time": tdm_state['time_left'] } }
            socketio.emit('esp_event', {"parsed_data": doc})

        # --- ARBITRO TERMINALI HARDWARE MULTI-NODO ---
        active_hw_states = ['SAFE', 'ARMING...', 'ARMED', 'DEFUSING...', 'NEUTRAL', 'OWNED ALPHA', 'OWNED BRAVO', 'CAPTURING A...', 'CAPTURING B...']
        
        # Scansiona direttamente il DeviceRegistry
        with registry.lock:
            for dev_id, data in registry.devices.items():
                state = data.get("game_state")
                if state in active_hw_states:
                    cmd_to_send = None
                    if alpha_in == 0 and bravo_in > 0:
                        cmd_to_send = {"cmd": "FORCE_WIN", "winner": "BRAVO"}
                    elif bravo_in == 0 and alpha_in > 0:
                        cmd_to_send = {"cmd": "FORCE_WIN", "winner": "ALPHA"}
                    elif alpha_in == 0 and bravo_in == 0:
                        cmd_to_send = {"cmd": "FORCE_END_GAME"}
                    
                    if cmd_to_send:
                        data["game_state"] = 'WAITING_END_ACK' 
                        logger.info(f"[ARBITRO SERVER] Rilevata eliminazione team! Invio comando MQTT al nodo {dev_id}")
                        try:
                            mqtt_client.publish(f"zulu/cmd/{dev_id}", json.dumps(cmd_to_send))
                        except Exception as e:
                            logger.error(f"[ERROR MQTT FORCE_WIN] {e}")

        # Pulizia Nodi Disconnessi
        if tick_counter % 2 == 0:
            active_devs, removed_something = registry.get_active_devices()
            if removed_something:
                socketio.emit('devices_update', active_devs)
                
        if tick_counter % 10 == 0:
            weather_data = fetch_weather()
            socketio.emit('weather_update', {'weather': weather_data})

# --- ROUTES & WEBSOCKETS ---
@socketio.on('connect')
def handle_connect():
    global background_thread_started
    if not background_thread_started:
        socketio.start_background_task(background_cleanup)
        background_thread_started = True
    
    active_devs, _ = registry.get_active_devices()
    emit('devices_update', active_devs)
    emit('weather_update', {'weather': fetch_weather()})
    broadcast_roster()

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

@app.route('/upload_photo', methods=['POST'])
@login_required
def upload_photo():
    if 'photo' not in request.files or 'uid' not in request.form:
        return jsonify({"status": "error"}), 400
    file = request.files['photo']
    uid = request.form['uid']
    if file.filename != '':
        filename = secure_filename(f"op_{uid}.jpg")
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute("UPDATE players SET photo = ? WHERE uid = ?", (filename, uid))
        return jsonify({"status": "ok", "filename": filename})
    return jsonify({"status": "error"}), 400

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
        c.execute("INSERT OR IGNORE INTO players (uid, alias, registered_at) VALUES (?, ?, ?)", (uid, f"OP-{uid[:4]}", get_current_time()))
        c.execute("INSERT OR REPLACE INTO active_roster (uid, team, status) VALUES (?, ?, 'FUORI')", (uid, team))
        conn.commit()
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
    broadcast_roster()

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

@socketio.on('request_profile')
def handle_request_profile(data):
    uid = data.get('uid')
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute("SELECT * FROM players WHERE uid = ?", (uid,))
        row = c.fetchone()
        if row:
            emit('profile_data', dict(row))

@socketio.on('save_notes')
def handle_save_notes(data):
    uid = data.get('uid')
    notes = data.get('notes')
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("UPDATE players SET notes = ? WHERE uid = ?", (notes, uid))

# --- VALIDAZIONE START MISSIONE ---
@socketio.on('request_mission_start')
def handle_request_mission_start(data):
    mode = data.get('mode')
    target_id = data.get('target_id')
    dur = data.get('duration', 15)
    force = data.get('force', False)
    
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute("SELECT team, status FROM active_roster")
        players = c.fetchall()
        
    total_players = len(players)
    players_out = sum(1 for p in players if p[1] != 'IN')
    alpha_in = sum(1 for p in players if p[0] == 'ALPHA' and p[1] == 'IN')
    bravo_in = sum(1 for p in players if p[0] == 'BRAVO' and p[1] == 'IN')
    
    if not force:
        if total_players == 0:
            emit('mission_start_warning', {
                'msg': "ATTENZIONE: Il Roster è completamente vuoto. Vuoi avviare la missione comunque?",
                'original_request': data
            })
            return
        
        if players_out > 0:
            emit('mission_start_error', {
                'msg': f"OPERAZIONE INTERROTTA:\nCi sono {players_out} operatori fuori dal campo.\nTutti i giocatori registrati devono risultare 'IN CAMPO' per poter avviare la missione."
            })
            return
            
        if alpha_in == 0 or bravo_in == 0:
            emit('mission_start_warning', {
                'msg': f"ATTENZIONE: Una delle due squadre non ha operatori in campo (Alpha: {alpha_in} | Bravo: {bravo_in}).\nSicuro di voler avviare una partita sbilanciata?",
                'original_request': data
            })
            return
            
    if mode == 'tdm':
        tdm_state['active'] = True
        tdm_state['duration'] = dur * 60
        tdm_state['time_left'] = dur * 60
        
        doc = { "id": "SERVER-TDM", "type": "MODE_ENTER", "payload": {"mode": "TEAM_DEATHMATCH"} }
        socketio.emit('esp_event', {"parsed_data": doc})
        
        rules_doc = { "id": "SERVER-TDM", "type": "SETTINGS_UPDATE", "payload": {"mode": "TEAM_DEATHMATCH", "game_duration": dur} }
        socketio.emit('esp_event', {"parsed_data": rules_doc})
        logger.info(f"START MISSION: TEAM DEATHMATCH ({dur} min).")

        trigger_siren("SIREN_LONG")
        
    else:
        cmd_str = "START_SD_GAME" if mode == 'sd' else "START_DOM_GAME"
        cmd_payload = {"cmd": cmd_str}
        try:
            mqtt_client.publish(f"zulu/cmd/{target_id}", json.dumps(cmd_payload))
            logger.info(f"[MQTT TX] Comando Start Mission inviato a {target_id} -> {cmd_payload}")
        except Exception as e:
            logger.error(f"[ERROR MQTT START] {e}")
            
    emit('mission_start_success')

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
    try:
        target_id = data.get('target_id')
        command_obj = data.get('command')
        cmd_str = json.dumps(command_obj) if isinstance(command_obj, dict) else command_obj
        
        if target_id == "SERVER-TDM":
            if "FORCE_END_GAME" in cmd_str or "FORCE_WIN" in cmd_str:
                tdm_state['active'] = False
                state_str = "STOPPED"
                if "FORCE_WIN" in cmd_str:
                    if "ALPHA" in cmd_str: state_str = "ALPHA WINS"
                    elif "BRAVO" in cmd_str: state_str = "BRAVO WINS"
                
                doc = { "id": "SERVER-TDM", "type": "TDM_UPDATE", "payload": { "mode": "TEAM_DEATHMATCH", "state": state_str, "game_time": tdm_state['time_left'] } }
                socketio.emit('esp_event', {"parsed_data": doc})
                trigger_siren("SIREN_LONG")
                update_match_stats(state_str) 
            return
        
        if target_id == "BROADCAST_ENV":
            mqtt_client.publish("zulu/cmd/broadcast", cmd_str)
            return

        mqtt_client.publish(f"zulu/cmd/{target_id}", cmd_str)
    except Exception as e:
        logger.error(f"[ERROR SOCKET CMD] {e}")

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=False, allow_unsafe_werkzeug=True)