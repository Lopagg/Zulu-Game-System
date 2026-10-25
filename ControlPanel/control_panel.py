from flask import Flask, render_template, request, jsonify, redirect, url_for, flash
from flask_socketio import SocketIO, emit
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
import logging
import json
import time
import os
import urllib.request

# --- IMPORTA I MODULI CUSTOM ---
import db_manager 
import game_engine

# --- CONFIGURAZIONE GLOBALE ---
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

# --- GESTIONE UTENTI CON HASH ---
USERS = { 
    "admin": {
        "password_hash": "scrypt:32768:8:1$UudpiqxEpDnMIMyI$d1c51523f034965a99cb569f943943399dc8722d382fec63de356a4f4b74fdebe269ff61c287b4784886553adb74086a2dac9cc570a13caa7434f3218dd2ca13", 
        "name": "Admin"
    },
    "topgun": {
        "password_hash": "scrypt:32768:8:1$7OpLxyv7XJkDXsrf$f1b769dd4f3496651e6c3a17cc56b4aa0469985e8a1ae0655eec9a93456e04cb501259345d00607e534a7822dbac4e4394a0b6f09315b5deeae29930b43eee67", 
        "name": "TopGun"
    }
}

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

# --- METEO GLOBALE ---
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

# --- ROUTES E AUTENTICAZIONE FLASK ---
@app.before_request
def setup_database():
    """Inizializza il DB al primo avvio."""
    if not hasattr(app, 'db_initialized'):
        db_manager.init_db()
        game_engine.start_mqtt(socketio)  # Passiamo socketio al motore MQTT
        app.db_initialized = True

@app.route('/')
@login_required
def index():
    return render_template('index.html', username=current_user.name)

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        if username in USERS and check_password_hash(USERS[username]['password_hash'], password):
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
        db_manager.update_player_photo(uid, filename)
        return jsonify({"status": "ok", "filename": filename})
    return jsonify({"status": "error"}), 400

# --- WEBSOCKETS E INTERFACCIA TATTICA ---
@socketio.on('connect')
def handle_connect():
    if not game_engine.background_thread_started:
        # Avvia l'arbitro passandogli la funzione del meteo
        socketio.start_background_task(game_engine.background_cleanup, fetch_weather)
        game_engine.background_thread_started = True
    
    active_devs, _ = game_engine.registry.get_active_devices()
    emit('devices_update', active_devs)
    emit('weather_update', {'weather': fetch_weather()})
    socketio.emit('roster_update', db_manager.get_full_roster())

@socketio.on('request_roster')
def handle_request_roster():
    socketio.emit('roster_update', db_manager.get_full_roster())

@socketio.on('register_operator')
def handle_register_operator(data):
    uid = data.get('uid')
    team = data.get('team')
    if uid and team:
        db_manager.register_player(uid, team)
        socketio.emit('roster_update', db_manager.get_full_roster())

@socketio.on('update_operator')
def handle_update_operator(data):
    uid = data.get('uid')
    action = data.get('action')
    value = data.get('value')
    
    if action == 'rename':
        db_manager.rename_player(uid, value)
    elif action == 'swap':
        db_manager.swap_player_team(uid)
    elif action == 'status_toggle':
        row = db_manager.get_player_status(uid)
        if row:
            db_manager.toggle_player_status(uid, row[0])
    elif action == 'delete':
        db_manager.remove_from_roster(uid)
        
    socketio.emit('roster_update', db_manager.get_full_roster())

@socketio.on('clear_roster')
def handle_clear_roster():
    db_manager.clear_active_roster()
    socketio.emit('roster_update', db_manager.get_full_roster())

@socketio.on('request_database')
def handle_request_database():
    socketio.emit('database_update', db_manager.get_all_players())

@socketio.on('update_db_player')
def handle_update_db_player(data):
    uid = data.get('uid')
    action = data.get('action')
    value = data.get('value')
    
    if action == 'rename':
        db_manager.rename_player(uid, value)
    elif action == 'delete':
        db_manager.delete_player_permanently(uid)
        
    socketio.emit('roster_update', db_manager.get_full_roster())
    socketio.emit('database_update', db_manager.get_all_players())

@socketio.on('request_profile')
def handle_request_profile(data):
    uid = data.get('uid')
    profile = db_manager.get_player_profile(uid)
    if profile:
        emit('profile_data', profile)

@socketio.on('save_notes')
def handle_save_notes(data):
    uid = data.get('uid')
    notes = data.get('notes')
    db_manager.update_player_notes(uid, notes)

@socketio.on('request_mission_start')
def handle_request_mission_start(data):
    mode = data.get('mode')
    target_id = data.get('target_id')
    dur = data.get('duration', 15)
    force = data.get('force', False)
    
    players = db_manager.get_active_roster_status()
    total_players = len(players)
    players_out = sum(1 for p in players if p[2] != 'IN')
    alpha_in = sum(1 for p in players if p[1] == 'ALPHA' and p[2] == 'IN')
    bravo_in = sum(1 for p in players if p[1] == 'BRAVO' and p[2] == 'IN')
    
    if not force:
        if total_players == 0:
            emit('mission_start_warning', {'msg': "ATTENZIONE: Il Roster è completamente vuoto. Vuoi avviare la missione comunque?", 'original_request': data})
            return
        if players_out > 0:
            emit('mission_start_error', {'msg': f"OPERAZIONE INTERROTTA:\nCi sono {players_out} operatori fuori dal campo.\nTutti i giocatori registrati devono risultare 'IN CAMPO' per poter avviare la missione."})
            return
        if alpha_in == 0 or bravo_in == 0:
            emit('mission_start_warning', {'msg': f"ATTENZIONE: Una delle due squadre non ha operatori in campo (Alpha: {alpha_in} | Bravo: {bravo_in}).\nSicuro di voler avviare una partita sbilanciata?", 'original_request': data})
            return
            
    # Il Server prende il controllo della Sessione
    game_engine.mission_control.start_mission(mode, target_id, duration=dur)
            
    if mode == 'tdm':
        doc = { "id": "SERVER-TDM", "type": "MODE_ENTER", "payload": {"mode": "TEAM_DEATHMATCH"} }
        socketio.emit('esp_event', {"parsed_data": doc})
        
        rules_doc = { "id": "SERVER-TDM", "type": "SETTINGS_UPDATE", "payload": {"mode": "TEAM_DEATHMATCH", "game_duration": dur} }
        socketio.emit('esp_event', {"parsed_data": rules_doc})
        logger.info(f"START MISSION: TEAM DEATHMATCH ({dur} min).")
        game_engine.trigger_siren("SIREN_LONG")
    else:
        cmd_str = "START_SD_GAME" if mode == 'sd' else "START_DOM_GAME"
        cmd_payload = {"cmd": cmd_str}
        try:
            game_engine.mqtt_client.publish(f"zulu/cmd/{target_id}", json.dumps(cmd_payload))
            logger.info(f"[MQTT TX] Comando Start Mission inviato a {target_id} -> {cmd_payload}")
        except Exception as e:
            logger.error(f"[ERROR MQTT START] {e}")
            
    emit('mission_start_success')

@socketio.on('rename_device')
def handle_rename(data):
    device_id = data.get('id')
    new_name = data.get('name')
    if device_id and new_name:
        game_engine.registry.rename_device(device_id, new_name)
        active_devs, _ = game_engine.registry.get_active_devices()
        socketio.emit('devices_update', active_devs)

@socketio.on('request_manual_scan')
def handle_manual_scan():
    active_devs, _ = game_engine.registry.get_active_devices()
    socketio.emit('devices_update', active_devs)

@socketio.on('send_command')
def handle_socket_command(data):
    try:
        target_id = data.get('target_id')
        command_obj = data.get('command')
        cmd_str = json.dumps(command_obj) if isinstance(command_obj, dict) else command_obj
        
        if isinstance(command_obj, dict):
            cmd_val = command_obj.get("cmd", "")
            if cmd_val == "SET_READY":
                game_engine.mission_ready_flag = True
                return
            elif cmd_val == "SET_TDM_SETTINGS":
                return
            elif cmd_val in ["FORCE_END_GAME", "FORCE_WIN", "RESET"]:
                game_engine.mission_ready_flag = False
                game_engine.mission_control.end_mission(final_state="STOPPED")

        if target_id == "SERVER-TDM":
            if "FORCE_END_GAME" in cmd_str or "FORCE_WIN" in cmd_str:
                state_str = "STOPPED"
                if "FORCE_WIN" in cmd_str:
                    if "ALPHA" in cmd_str: state_str = "ALPHA WINS"
                    elif "BRAVO" in cmd_str: state_str = "BRAVO WINS"
                
                game_engine.mission_control.end_mission(final_state=state_str)
                doc = { "id": "SERVER-TDM", "type": "TDM_UPDATE", "payload": { "mode": "TEAM_DEATHMATCH", "state": state_str, "game_time": 0 } }
                socketio.emit('esp_event', {"parsed_data": doc})
                game_engine.trigger_siren("SIREN_LONG")
                db_manager.process_match_stats(state_str) 
            return
        
        if target_id == "BROADCAST_ENV":
            game_engine.mqtt_client.publish("zulu/cmd/broadcast", cmd_str)
            return

        # 1. Invia il comando originale (es. FORCE_END_GAME)
        game_engine.mqtt_client.publish(f"zulu/cmd/{target_id}", cmd_str)
        
        # 2. Se è uno stop forzato, chiudiamo tutto istantaneamente
        if "FORCE_END_GAME" in cmd_str:
             game_engine.mission_control.end_mission()
             # Costringe il RAT a uscire e ricaricarsi (se supportato dal firmware)
             game_engine.mqtt_client.publish(f"zulu/cmd/{target_id}", json.dumps({"cmd": "RESET"}))
             # Finta un MODE_EXIT per pulire istantaneamente la pagina web
             socketio.emit('esp_event', {"parsed_data": {"id": target_id, "type": "MODE_EXIT"}})
             
    except Exception as e:
        logger.error(f"[ERROR SOCKET CMD] {e}")

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=False, allow_unsafe_werkzeug=True)