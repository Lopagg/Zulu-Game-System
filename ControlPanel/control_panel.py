from flask import Flask, render_template, request, jsonify, redirect, url_for, flash
from flask_socketio import SocketIO, emit
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
import logging
import json
import socket
import time
import threading

# --- CONFIGURAZIONE ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['SECRET_KEY'] = 'zulu_secret_key_change_in_prod'
socketio = SocketIO(app, cors_allowed_origins="*")

# Inizializzazione Flask-Login
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# --- GESTIONE UTENTI ---
USERS = { "admin": {"password": "zulu", "name": "Operatore"} }

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

# --- DEVICE REGISTRY ---
class DeviceRegistry:
    def __init__(self):
        self.devices = {}
        self.timeout_seconds = 15 # Dopo 15s senza segnale, il device è considerato OFFLINE

    def update_device(self, device_id, ip_info, msg_type, mode=None, version=None):
        now = time.time()
        
        if device_id not in self.devices:
            self.devices[device_id] = {
                "id": device_id,
                "name": device_id,
                "type": "ZGT",
                "mode": "BOOTING...",
                "version": "Unknown"
            }
        
        self.devices[device_id]["last_seen"] = now
        self.devices[device_id]["ip"] = ip_info[0] if isinstance(ip_info, list) else ip_info
        self.devices[device_id]["status"] = "ONLINE"
        
        if version:
            self.devices[device_id]["version"] = version

        # Aggiorna la modalità se presente nel pacchetto (es. da Heartbeat o Mode Enter)
        if mode:
             self.devices[device_id]["mode"] = mode
        elif msg_type == "MODE_EXIT":
            self.devices[device_id]["mode"] = "MAIN MENU"

    def rename_device(self, device_id, new_name):
        if device_id in self.devices:
            self.devices[device_id]["name"] = new_name
            return True
        return False

    def get_active_devices(self):
        now = time.time()
        to_remove = []
        active_list = []

        # Controlla chi è scaduto
        for d_id, data in self.devices.items():
            if now - data["last_seen"] > self.timeout_seconds:
                to_remove.append(d_id)
            else:
                active_list.append(data)
        
        # Rimuovi i morti
        for d_id in to_remove:
            del self.devices[d_id]
            
        return active_list

registry = DeviceRegistry()

# --- TASK DI PULIZIA AUTOMATICA ---
# Questo thread gira ogni 2 secondi, pulisce la lista e la invia al frontend.
# Risolve il problema del "dispositivo che non scompare mai".
def background_cleanup_task():
    while True:
        socketio.sleep(2)
        active_devs = registry.get_active_devices()
        socketio.emit('devices_update', active_devs)

# --- ROUTES ---

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
            flash('ACCESSO NEGATO: Credenziali Errate', 'error')
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
            registry.update_device(device_id, ip_info, msg_type, mode, version)
            
            # Invia l'evento al frontend (per i log e il gioco)
            socketio.emit('esp_event', data)
            
            # Invia subito la lista aggiornata (opzionale, ma rende la UI reattiva)
            # socketio.emit('devices_update', registry.get_active_devices())

        return jsonify({"status": "ok"}), 200

    except Exception as e:
        logger.error(f"Errore forward: {e}")
        return jsonify({"status": "error"}), 500

@app.route('/api/send_command', methods=['POST'])
@login_required
def send_command():
    BRIDGE_IP, BRIDGE_PORT = '127.0.0.1', 1234
    try:
        req = request.json
        target_id = req.get('target_id')
        command_obj = req.get('command')
        
        print(f"\n[DEBUG] WEB -> BRIDGE: Inviando comando a {target_id}")
        
        cmd_str = json.dumps(command_obj) if isinstance(command_obj, dict) else command_obj
        payload = { "target_id": target_id, "command": cmd_str }
        
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.sendto(json.dumps(payload).encode('utf-8'), (BRIDGE_IP, BRIDGE_PORT))
        
        return jsonify({"status": "sent"}), 200
    except Exception as e:
        print(f"[ERROR] Invio fallito: {e}")
        return jsonify({"error": str(e)}), 500

@socketio.on('rename_device')
def handle_rename(data):
    device_id = data.get('id')
    new_name = data.get('name')
    if device_id and new_name:
        registry.rename_device(device_id, new_name)
        socketio.emit('devices_update', registry.get_active_devices())

@socketio.on('request_manual_scan')
def handle_manual_scan():
    active_devs = registry.get_active_devices()
    socketio.emit('devices_update', active_devs)

@socketio.on('send_command')
def handle_socket_command(data):
    with app.test_request_context():
        BRIDGE_IP, BRIDGE_PORT = '127.0.0.1', 1234
        try:
            target_id = data.get('target_id')
            command_obj = data.get('command')
            
            print(f"\n[DEBUG SOCKET] WEB -> BRIDGE: Comando per {target_id}")
            
            cmd_str = json.dumps(command_obj) if isinstance(command_obj, dict) else command_obj
            payload = {"target_id": target_id, "command": cmd_str}
            
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.sendto(json.dumps(payload).encode('utf-8'), (BRIDGE_IP, BRIDGE_PORT))
        except Exception as e:
            print(f"[ERROR SOCKET] {e}")

if __name__ == '__main__':
    # AVVIO TASK BACKGROUND (Fondamentale per il refresh automatico)
    socketio.start_background_task(target=background_cleanup_task)
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)