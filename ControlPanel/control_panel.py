from flask import Flask, render_template, request, jsonify, redirect, url_for, flash
from flask_socketio import SocketIO, emit
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
import logging
import json
import socket
import time
from datetime import datetime

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

# --- GESTIONE UTENTI (Simulata) ---
USERS = {
    "admin": {"password": "password", "name": "Operatore"}
}

class User(UserMixin):
    def __init__(self, id):
        self.id = id
        self.name = USERS[id]['name']

    @staticmethod
    def get(user_id):
        if user_id in USERS:
            return User(user_id)
        return None

@login_manager.user_loader
def load_user(user_id):
    return User.get(user_id)

# --- DEVICE REGISTRY (Il cuore della lista ASSET) ---
class DeviceRegistry:
    def __init__(self):
        self.devices = {}  # Dizionario {device_id: {data...}}

    def update_device(self, device_id, ip_info, msg_type, mode=None):
        now = time.time()
        
        # Se è nuovo, lo creiamo
        if device_id not in self.devices:
            self.devices[device_id] = {
                "id": device_id,
                "first_seen": now,
                "type": "ZGT", # Default, in futuro potrebbe arrivare dal pacchetto
            }
        
        # Aggiorniamo i dati dinamici
        self.devices[device_id]["last_seen"] = now
        self.devices[device_id]["ip"] = ip_info[0] if isinstance(ip_info, list) else ip_info
        self.devices[device_id]["status"] = "ONLINE"
        
        # Aggiorniamo la modalità se presente nel messaggio
        if mode:
            self.devices[device_id]["mode"] = mode
        
        # Se il dispositivo invia MODE_ENTER, aggiorniamo la modalità
        if msg_type == "MODE_ENTER" and mode:
            self.devices[device_id]["mode"] = mode

    def get_active_devices(self):
        # Ritorna la lista pulita, segnando OFFLINE chi non parla da 30s
        active_list = []
        now = time.time()
        timeout = 30 # Secondi prima di considerare offline
        
        for d_id, data in self.devices.items():
            if now - data["last_seen"] > timeout:
                data["status"] = "OFFLINE"
            else:
                data["status"] = "ONLINE"
            active_list.append(data)
        
        return active_list

registry = DeviceRegistry()

# --- ROUTE PAGINE WEB ---

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
            flash('Credenziali invalidi', 'error')
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

# --- API INTERNE (Ricezione dati da UDP Bridge) ---

@app.route('/internal/forward_data', methods=['POST'])
def receive_data_from_bridge():
    try:
        data = request.json
        if not data: return jsonify({"status": "error"}), 400
        
        # Estrai dati
        parsed = data.get('parsed_data', {})
        ip_info = data.get('device_ip_info', [])
        
        device_id = parsed.get('id')
        msg_type = parsed.get('type')
        payload = parsed.get('payload', {})
        
        if device_id:
            # 1. Aggiorna il registro dispositivi
            mode = payload.get('mode') # Se presente (es. in MODE_ENTER)
            registry.update_device(device_id, ip_info, msg_type, mode)
            
            # 2. Inoltra l'evento specifico (es. TIME_UPDATE) al frontend
            socketio.emit('esp_event', data)
            
            # 3. Invia la lista aggiornata dei dispositivi (sidebar)
            # Nota: In un sistema grande non lo faresti a ogni pacchetto, ma qui va bene per reattività
            socketio.emit('devices_update', registry.get_active_devices())

        return jsonify({"status": "ok"}), 200

    except Exception as e:
        logger.error(f"Errore forward: {e}")
        return jsonify({"status": "error"}), 500

@app.route('/api/send_command', methods=['POST'])
@login_required
def send_command():
    BRIDGE_IP, BRIDGE_PORT = '127.0.0.1', 12345
    try:
        req = request.json
        payload = {"target_id": req.get('target_id'), "command": req.get('command')}
        
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.sendto(json.dumps(payload).encode('utf-8'), (BRIDGE_IP, BRIDGE_PORT))
        return jsonify({"status": "sent"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- THREAD DI BACKGROUND (Opzionale) ---
# Se volessi pulire i dispositivi offline periodicamente anche senza traffico
# potresti aggiungere un thread qui che chiama registry.get_active_devices() ogni 10s.

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)