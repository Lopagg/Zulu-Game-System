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

import db_manager 
import game_engine

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

USERS = { 
    "admin": { "password_hash": "scrypt:32768:8:1$UudpiqxEpDnMIMyI$d1c51523f034965a99cb569f943943399dc8722d382fec63de356a4f4b74fdebe269ff61c287b4784886553adb74086a2dac9cc570a13caa7434f3218dd2ca13", "name": "Admin" },
    "topgun": { "password_hash": "scrypt:32768:8:1$7OpLxyv7XJkDXsrf$f1b769dd4f3496651e6c3a17cc56b4aa0469985e8a1ae0655eec9a93456e04cb501259345d00607e534a7822dbac4e4394a0b6f09315b5deeae29930b43eee67", "name": "TopGun" }
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
def load_user(user_id): return User.get(user_id)

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
        except: pass
    return cached_weather

@app.before_request
def setup_database():
    if not hasattr(app, 'db_initialized'):
        db_manager.init_db()
        game_engine.start_mqtt(socketio)  
        if not game_engine.background_thread_started:
            socketio.start_background_task(game_engine.background_cleanup, fetch_weather)
            game_engine.background_thread_started = True
        app.db_initialized = True

@app.route('/')
@login_required
def index(): return render_template('index.html', username=current_user.name)

@app.route('/tv')
def tv_dashboard(): return render_template('tv.html')

@app.route('/mobile')
@login_required
def mobile_dashboard(): 
    return render_template('mobile.html', username=current_user.name)

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        next_page = request.args.get('next')
        
        if username in USERS and check_password_hash(USERS[username]['password_hash'], password):
            login_user(User.get(username))
            return redirect(next_page or url_for('index'))
            
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
    if 'photo' not in request.files or 'uid' not in request.form: return jsonify({"status": "error"}), 400
    file = request.files['photo']
    uid = request.form['uid']
    if file.filename != '':
        filename = secure_filename(f"op_{uid}.jpg")
        file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
        db_manager.update_player_photo(uid, filename)
        return jsonify({"status": "ok", "filename": filename})
    return jsonify({"status": "error"}), 400

@socketio.on('connect')
def handle_connect():
    active_devs, _ = game_engine.registry.get_active_devices()
    emit('devices_update', active_devs)
    emit('weather_update', {'weather': fetch_weather()})
    emit('factions_update', db_manager.get_factions_config())
    socketio.emit('roster_update', db_manager.get_full_roster())
    emit('database_update', db_manager.get_all_players())

@socketio.on('update_factions')
@login_required
def handle_update_factions(data):
    if 'alpha_name' in data and 'alpha_color' in data:
        db_manager.set_faction_config('ALPHA', data['alpha_name'], data['alpha_color'])
    if 'bravo_name' in data and 'bravo_color' in data:
        db_manager.set_faction_config('BRAVO', data['bravo_name'], data['bravo_color'])
        
    if 'alpha_wins' in data: db_manager.update_faction_wins('ALPHA', data['alpha_wins'])
    if 'bravo_wins' in data: db_manager.update_faction_wins('BRAVO', data['bravo_wins'])
    
    new_config = db_manager.get_factions_config()
    socketio.emit('factions_update', new_config)
    
    # Manda colori PURI al Kiosk se usa quelli di default
    def get_pure_rgb(hex_code):
        h = str(hex_code).lstrip('#').lower()
        if h == 'ff3333': return (255, 0, 0)
        if h == '55ff55': return (0, 255, 0)
        return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
        
    a_rgb = get_pure_rgb(new_config['ALPHA']['color'])
    b_rgb = get_pure_rgb(new_config['BRAVO']['color'])
    
    game_engine.mqtt_client.publish("zulu/cmd/broadcast", json.dumps({
        "cmd": "SET_FACTIONS",
        "t1": new_config['ALPHA']['name'], "t1_c": a_rgb,
        "t2": new_config['BRAVO']['name'], "t2_c": b_rgb
    }))

@socketio.on('reset_daily_wins')
def handle_reset_daily_wins():
    db_manager.reset_daily_wins()
    socketio.emit('factions_update', db_manager.get_factions_config())

@socketio.on('request_roster')
def handle_request_roster(): socketio.emit('roster_update', db_manager.get_full_roster())

@socketio.on('register_operator')
def handle_register_operator(data):
    uid, team = data.get('uid'), data.get('team')
    if uid and team:
        db_manager.register_player(uid, team)
        socketio.emit('roster_update', db_manager.get_full_roster())

@socketio.on('update_operator')
def handle_update_operator(data):
    uid, action, value = data.get('uid'), data.get('action'), data.get('value')
    if action == 'rename': db_manager.rename_player(uid, value)
    elif action == 'swap': db_manager.swap_player_team(uid)
    elif action == 'status_toggle':
        row = db_manager.get_player_status(uid)
        if row: db_manager.toggle_player_status(uid, row[0])
    elif action == 'delete': db_manager.remove_from_roster(uid)
    socketio.emit('roster_update', db_manager.get_full_roster())

@socketio.on('clear_roster')
def handle_clear_roster():
    db_manager.clear_active_roster()
    socketio.emit('roster_update', db_manager.get_full_roster())

@socketio.on('request_database')
def handle_request_database(): socketio.emit('database_update', db_manager.get_all_players())

@socketio.on('register_player_manual')
def handle_register_manual(data):
    uid = data.get('uid')
    alias = data.get('alias')
    is_pro = data.get('is_pro', 0)
    tag_info = data.get('tag_info', 'NTAG215 / ISO 14443-3A')
    asd_team = data.get('asd_team', 'NESSUNA')
    
    if uid and alias:
        db_manager.register_player_manual(uid, alias.upper(), is_pro, tag_info, asd_team.upper())
        socketio.emit('database_update', db_manager.get_all_players())

@socketio.on('update_db_player')
def handle_update_db_player(data):
    uid, action, value = data.get('uid'), data.get('action'), data.get('value')
    if action == 'rename': db_manager.rename_player(uid, value)
    elif action == 'delete': db_manager.delete_player_permanently(uid)
    elif action == 'reset_stats': db_manager.reset_player_stats(uid)
    elif action == 'toggle_pro': db_manager.toggle_pro_status(uid)
    elif action == 'edit_asd': db_manager.update_player_asd(uid, value)
    
    socketio.emit('roster_update', db_manager.get_full_roster())
    socketio.emit('database_update', db_manager.get_all_players())

@socketio.on('purge_guests')
def handle_purge_guests():
    db_manager.purge_guest_data()
    socketio.emit('database_update', db_manager.get_all_players())
    socketio.emit('roster_update', db_manager.get_full_roster())

@socketio.on('request_profile')
def handle_request_profile(data):
    profile = db_manager.get_player_profile(data.get('uid'))
    if profile: emit('profile_data', profile)

@socketio.on('save_notes')
def handle_save_notes(data): db_manager.update_player_notes(data.get('uid'), data.get('notes'))

@socketio.on('update_karma')
def handle_update_karma(data):
    db_manager.update_player_karma(data.get('uid'), data.get('karma'))
    socketio.emit('database_update', db_manager.get_all_players())
    profile = db_manager.get_player_profile(data.get('uid'))
    if profile: emit('profile_data', profile)

@socketio.on('request_mission_start')
def handle_request_mission_start(data):
    mode, target_id, dur, force = data.get('mode'), data.get('target_id'), data.get('duration', 15), data.get('force', False)
    players = db_manager.get_active_roster_status()
    players_out = sum(1 for p in players if p[2] != 'IN')
    alpha_in = sum(1 for p in players if p[1] == 'ALPHA' and p[2] == 'IN')
    bravo_in = sum(1 for p in players if p[1] == 'BRAVO' and p[2] == 'IN')
    
    if not force:
        if len(players) == 0:
            emit('mission_start_warning', {'msg': "Il Roster è vuoto. Vuoi avviare la missione comunque?", 'original_request': data})
            return
        if players_out > 0:
            emit('mission_start_error', {'msg': f"Ci sono {players_out} operatori fuori dal campo. Tutti devono risultare 'IN CAMPO'."})
            return
        if alpha_in == 0 or bravo_in == 0:
            emit('mission_start_warning', {'msg': f"Squadre sbilanciate (A:{alpha_in} B:{bravo_in}). Avviare comunque?", 'original_request': data})
            return
            
    game_engine.mission_control.start_mission(mode, target_id, duration=dur)
            
    if mode == 'tdm':
        socketio.emit('esp_event', {"parsed_data": { "id": "SERVER-TDM", "type": "MODE_ENTER", "payload": {"mode": "TEAM_DEATHMATCH"} }})
        socketio.emit('esp_event', {"parsed_data": { "id": "SERVER-TDM", "type": "SETTINGS_UPDATE", "payload": {"mode": "TEAM_DEATHMATCH", "game_duration": dur} }})
        game_engine.trigger_siren("SIREN_LONG")
    else:
        cmd_str = "START_SD_GAME" if mode == 'sd' else "START_DOM_GAME"
        try: game_engine.mqtt_client.publish(f"zulu/cmd/{target_id}", json.dumps({"cmd": cmd_str}))
        except: pass
    socketio.emit('mission_start_success')

@socketio.on('mobile_tag_scanned')
def handle_mobile_scan(data):
    uid = data.get('uid')
    if uid:
        socketio.emit('raw_tag_scanned', {'uid': uid})
        row = db_manager.get_player_status(uid)
        if row:
            new_status = db_manager.toggle_player_status(uid, row[0])
            socketio.emit('roster_update', db_manager.get_full_roster())
            emit('mobile_scan_reply', {'success': True, 'uid': uid, 'status': new_status, 'team': row[1]})
        else:
            emit('mobile_scan_reply', {'success': False, 'uid': uid, 'msg': 'Tag non assegnato al roster.'})

@socketio.on('rename_device')
def handle_rename(data):
    if data.get('id') and data.get('name'):
        game_engine.registry.rename_device(data['id'], data['name'])
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
        cmd_obj = data.get('command')
        cmd_str = json.dumps(cmd_obj) if isinstance(cmd_obj, dict) else cmd_obj
        
        if isinstance(cmd_obj, dict):
            c = cmd_obj.get("cmd", "")
            if c == "SET_READY": 
                game_engine.mission_ready_flag = True
                game_engine.mission_control.mode = cmd_obj.get("mode")
                game_engine.mission_control.target_id = cmd_obj.get("target_id")
                game_engine.mission_control.global_duration = cmd_obj.get("duration", 15) * 60
                return
            
            elif c == "SET_SD_SETTINGS":
                game_engine.mission_control.sd_settings = cmd_obj
                
                # BUG FIX: Invio dati al RAT in formato castato puro (int/str)
                if target_id and target_id != "SERVER-ROUTER":
                    use_arm = str(cmd_obj.get("use_arm_pin", "true")).lower() == "true"
                    use_defuse = str(cmd_obj.get("use_defuse_pin", "true")).lower() == "true"
                    
                    flat_payload = {
                        "cmd": "SET_SD_SETTINGS",
                        "bomb_time": int(cmd_obj.get("bomb_time", 10)),
                        "arm_time": int(cmd_obj.get("arm_time", 5)),
                        "defuse_time": int(cmd_obj.get("defuse_time", 10)),
                        "arm_pin": str(cmd_obj.get("arm_pin", "1234")),
                        "defuse_pin": str(cmd_obj.get("defuse_pin", "4321")),
                        "use_arm_pin": use_arm,
                        "use_defuse_pin": use_defuse
                    }
                    game_engine.mqtt_client.publish(f"zulu/cmd/{target_id}", json.dumps(flat_payload))
                return
                
            elif c == "SET_TDM_SETTINGS": 
                return

        if target_id == "BROADCAST_ENV":
            game_engine.mqtt_client.publish("zulu/cmd/broadcast", cmd_str)
            return

        if target_id == "SERVER-ROUTER":
            rt = game_engine.mission_control.target_id
            if not game_engine.mission_control.active_mission or not rt: return
            if rt == "SERVER-TDM":
                if "FORCE_END_GAME" in cmd_str:
                    with game_engine.mission_control.lock:
                        if game_engine.mission_control.state != "STOPPED":
                            game_engine.mission_control.state = "STOPPED"
                            db_manager.process_match_stats("STOPPED")
                            if socketio: socketio.emit('database_update', db_manager.get_all_players())
                            doc = { "id": "SERVER-TDM", "type": "TDM_UPDATE", "payload": { "mode": "TEAM_DEATHMATCH", "state": "STOPPED", "game_time": game_engine.mission_control.global_time_left } }
                            socketio.emit('esp_event', {"parsed_data": doc})
                            game_engine.trigger_siren("SIREN_LONG")
                elif "CLOSE_MISSION" in cmd_str:
                    game_engine.mission_control.end_mission()
                    socketio.emit('esp_event', {"parsed_data": {"id": "SERVER-TDM", "type": "MODE_EXIT"}})
                return
            else:
                if "CLOSE_MISSION" in cmd_str:
                    game_engine.mission_control.end_mission()
                    game_engine.mqtt_client.publish(f"zulu/cmd/{rt}", json.dumps({"cmd": "RETURN_TO_MENU"}))
                    socketio.emit('esp_event', {"parsed_data": {"id": rt, "type": "MODE_EXIT"}})
                else:
                    game_engine.mqtt_client.publish(f"zulu/cmd/{rt}", cmd_str)
            return

        game_engine.mqtt_client.publish(f"zulu/cmd/{target_id}", cmd_str)
             
    except Exception as e:
        logger.error(f"[ERROR SOCKET CMD] {e}")

@socketio.on('server_reset_request')
@login_required
def handle_server_reset():
    socketio.emit('server_restarting')
    time.sleep(1)
    import sys, os
    os.execv(sys.executable, [sys.executable] + sys.argv)

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=False, allow_unsafe_werkzeug=True)