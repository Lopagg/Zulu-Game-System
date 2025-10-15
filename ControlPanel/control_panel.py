import socket
import threading
from datetime import datetime, timedelta
import sys
import json

from flask import Flask, render_template, request, redirect, url_for, flash, jsonify
from flask_socketio import SocketIO
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash

# --- Configurazione ---
HOST_IP = '0.0.0.0'
BRIDGE_CMD_PORT = 12345

app = Flask(__name__)
app.config['SECRET_KEY'] = 'la-tua-chiave-segreta-super-difficile'
socketio = SocketIO(app)

# --- Gestione Login ---
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'
users = { 'admin': { 'password_hash': generate_password_hash('zulu'), 'id': '1' } }

class User(UserMixin):
    def __init__(self, id, username, password_hash):
        self.id = id
        self.username = username
        self.password_hash = password_hash
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

@login_manager.user_loader
def load_user(user_id):
    for username, data in users.items():
        if data['id'] == user_id:
            return User(id=data['id'], username=username, password_hash=data['password_hash'])
    return None

# --- Gestore Dispositivi ---
devices = {}
devices_lock = threading.Lock()

def prepare_devices_for_emit(devices_dict):
    """
    CORREZIONE: Converte i dati dei dispositivi in un formato sicuro per JSON,
    trasformando gli oggetti 'datetime' in stringhe.
    """
    devices_list = []
    for device_id, device_data in devices_dict.items():
        data_copy = device_data.copy()
        if 'last_heartbeat' in data_copy and isinstance(data_copy['last_heartbeat'], datetime):
            data_copy['last_heartbeat'] = data_copy['last_heartbeat'].isoformat() + "Z"
        # Rimuoviamo l'indirizzo IP, non serve al frontend
        data_copy.pop('addr', None)
        devices_list.append(data_copy)
    return devices_list

def check_device_status():
    """Task in background che controlla il timeout di tutti i dispositivi."""
    print("-> Avvio del monitor di connessione dispositivi...")
    while True:
        with devices_lock:
            now = datetime.utcnow()
            offline_devices_ids = []
            for device_id, device_data in devices.items():
                if device_data.get('status') == 'ONLINE':
                    if 'last_heartbeat' in device_data and isinstance(device_data['last_heartbeat'], datetime):
                        delta = now - device_data['last_heartbeat']
                        if delta.total_seconds() > 15:
                            offline_devices_ids.append(device_id)

            if offline_devices_ids:
                for device_id in offline_devices_ids:
                    print(f"[!] Timeout del dispositivo {device_id}. Stato: OFFLINE.")
                    devices[device_id]['status'] = 'OFFLINE'

                devices_to_emit = prepare_devices_for_emit(devices)
                socketio.emit('devices_update', devices_to_emit)
        socketio.sleep(5)

# --- Route ---
@app.route('/')
@login_required
def dashboard():
    return render_template('dashboard.html', username=current_user.username)

@app.route('/game_control')
@login_required
def game_control():
    return render_template('index.html', username=current_user.username)

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        user_data = users.get(username)
        if user_data:
            user = User(id=user_data['id'], username=username, password_hash=user_data['password_hash'])
            if user.check_password(password):
                login_user(user)
                return redirect(url_for('dashboard'))
        flash('Credenziali non valide.')
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

@app.route('/internal/forward_data', methods=['POST'])
def forward_data():
    global devices
    data = request.json
    parsed_data = data.get('parsed_data')
    device_ip_info = data.get('device_ip_info')
    if not parsed_data or not device_ip_info:
        return jsonify({"status": "error"}), 400
    device_id = parsed_data.get('id')
    if not device_id:
        return jsonify({"status": "ok"}), 200

    with devices_lock:
        needs_full_update = False
        if device_id not in devices:
            devices[device_id] = {'id': device_id, 'status': 'OFFLINE', 'mode': 'Unknown'}
            needs_full_update = True

        device = devices[device_id]
        if device['status'] == 'OFFLINE':
            print(f"[+] Dispositivo {device_id} ONLINE (IP: {device_ip_info[0]}).")
            needs_full_update = True

        device['status'] = 'ONLINE'
        device['last_heartbeat'] = datetime.utcnow() # Questo è l'oggetto datetime
        device['addr'] = tuple(device_ip_info) # Assicura che sia una tupla

        if parsed_data.get('event') == 'mode_exit':
            if device.get('mode') != 'main_menu':
                device['mode'] = 'main_menu'
                needs_full_update = True
        elif 'mode' in parsed_data:
            if device.get('mode') != parsed_data['mode']:
                device['mode'] = parsed_data['mode']
                needs_full_update = True

        if needs_full_update:
            devices_to_emit = prepare_devices_for_emit(devices)
            socketio.emit('devices_update', devices_to_emit)

    if parsed_data.get('event') != 'heartbeat':
        parsed_data['deviceId'] = device_id
        socketio.emit('game_update', parsed_data)

    return jsonify({"status": "ok"}), 200

# --- Socket.IO ---
@socketio.on('connect')
def handle_connect():
    print("Nuovo client web connesso...")
    with devices_lock:
        devices_to_emit = prepare_devices_for_emit(devices)
        socketio.emit('devices_update', devices_to_emit, room=request.sid)

@socketio.on('send_command')
def handle_send_command(json_data):
    command = json_data.get('command')
    target_id = json_data.get('target_id')
    if command and target_id:
        with devices_lock:
            target_device = devices.get(target_id)
        if target_device and target_device['status'] == 'ONLINE':
            payload = {'command': command, 'target_id': target_id}
            try:
                with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
                    sock.sendto(json.dumps(payload).encode('utf-8'), ('127.0.0.1', BRIDGE_CMD_PORT))
                    print(f"Comando '{command}' inoltrato al bridge per {target_id}")
            except Exception as e:
                print(f"ERRORE invio comando al bridge: {e}")
        else:
            print(f"Errore: dispositivo {target_id} non trovato o offline.")

# --- Avvio ---
socketio.start_background_task(target=check_device_status)

if __name__ == '__main__':
    print("-> Avvio del server web in modalità DEBUG...")
    hostname = socket.gethostname()
    try:
        local_ip = socket.gethostbyname(hostname)
    except:
        local_ip = "127.0.0.1"
    print(f"-> Pannello accessibile a http://{local_ip}:5000")
    socketio.run(app, host=HOST_IP, port=5000)