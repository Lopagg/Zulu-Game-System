from flask import Flask, render_template, request, jsonify, redirect, url_for, flash
from flask_socketio import SocketIO, emit
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
import logging
import json
import socket
import time
import threading # Necessario per il background task

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
# In un sistema reale useresti un database cifrato.
USERS = {
    "admin": {"password": "zulu", "name": "Operatore"} # Password cambiata
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

# --- DEVICE REGISTRY (Modificato per eliminare i morti) ---
class DeviceRegistry:
    def __init__(self):
        self.devices = {}
        self.timeout_seconds = 10 # Dopo quanti secondi rimuovere il device

    def update_device(self, device_id, ip_info, msg_type, mode=None):
        now = time.time()
        
        if device_id not in self.devices:
            # Nuovo dispositivo rilevato
            self.devices[device_id] = {
                "id": device_id,
                "type": "ZGT",
                "mode": "BOOTING..." # Stato iniziale temporaneo
            }
        
        # Aggiorna heartbeat
        self.devices[device_id]["last_seen"] = now
        self.devices[device_id]["ip"] = ip_info[0] if isinstance(ip_info, list) else ip_info
        self.devices[device_id]["status"] = "ONLINE"
        
        # Se il messaggio contiene info sulla modalità, aggiorna
        if mode:
            self.devices[device_id]["mode"] = mode
        elif msg_type == "BOOT_COMPLETE":
             self.devices[device_id]["mode"] = "MAIN MENU"

    def get_active_devices(self):
        """Restituisce solo i device vivi e rimuove quelli morti dal dizionario"""
        now = time.time()
        to_remove = []
        active_list = []

        for d_id, data in self.devices.items():
            if now - data["last_seen"] > self.timeout_seconds:
                to_remove.append(d_id)
            else:
                active_list.append(data)
        
        # Pulizia
        for d_id in to_remove:
            del self.devices[d_id]
            
        return active_list

registry = DeviceRegistry()

# --- THREAD DI BACKGROUND ---
# Questo thread invia la lista aggiornata al browser ogni 2 secondi.
# Così se un dispositivo muore, sparisce dalla lista anche se non arrivano altri pacchetti.
def background_cleanup_task():
    while True:
        socketio.sleep(2) # Usa sleep di socketio per non bloccare
        active_devs = registry.get_active_devices()
        socketio.emit('devices_update', active_devs)

# --- ROUTE ---

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
            flash('Credenziali errate', 'error')
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
            # 1. Aggiorna il registro (segna come ONLINE)
            mode = payload.get('mode')
            registry.update_device(device_id, ip_info, msg_type, mode)
            
            # 2. Inoltra l'evento raw al frontend (Log, Timer, ecc.)
            socketio.emit('esp_event', data)
            
            # 3. AGGIUNTA FONDAMENTALE: Invia SUBITO la lista aggiornata
            # Non aspettiamo il thread di background. Se arriva un dato, il device deve apparire.
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

if __name__ == '__main__':
    # Avvia il thread di cleanup in background
    socketio.start_background_task(target=background_cleanup_task)
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)