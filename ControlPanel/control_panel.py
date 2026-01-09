from flask import Flask, render_template, request, jsonify, redirect, url_for, flash
from flask_socketio import SocketIO, emit
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
import logging
import json
import socket

# --- CONFIGURAZIONE ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['SECRET_KEY'] = 'zulu_secret_key_change_in_prod' # Chiave segreta per le sessioni

# Inizializzazione SocketIO
socketio = SocketIO(app, cors_allowed_origins="*")

# Inizializzazione Flask-Login
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login' # Pagina a cui reindirizzare se non loggato

# --- GESTIONE UTENTI (Simulata) ---
# In un sistema reale useresti un database. Qui usiamo un dizionario.
USERS = {
    "admin": {"password": "password", "name": "Amministratore"}
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

# --- ROUTE PAGINE WEB ---

@app.route('/')
@login_required
def index():
    # Passiamo 'username' al template perché index.html lo richiede
    return render_template('index.html', username=current_user.name)

@app.route('/dashboard')
def dashboard():
    # La dashboard pubblica (spettatori) non richiede login
    return render_template('dashboard.html')

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
            flash('Credenziali non valide', 'error')

    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

# --- API INTERNE (Ricezione dati da ESP32 via Bridge UDP) ---

@app.route('/internal/forward_data', methods=['POST'])
def receive_data_from_bridge():
    try:
        data = request.json
        if not data:
            return jsonify({"status": "error", "message": "No JSON data"}), 400
        
        # Inoltra l'evento a tutti i browser connessi via SocketIO
        socketio.emit('esp_event', data)
        return jsonify({"status": "ok"}), 200

    except Exception as e:
        logger.error(f"Errore forward dati: {e}")
        return jsonify({"status": "error"}), 500

# --- API COMANDI (Invio comandi a ESP32) ---

@app.route('/api/send_command', methods=['POST'])
@login_required # Solo gli utenti loggati possono inviare comandi
def send_command():
    # Configurazione Bridge UDP
    BRIDGE_IP = '127.0.0.1'
    BRIDGE_CMD_PORT = 12345
    
    try:
        req = request.json
        target_id = req.get('target_id')
        command_obj = req.get('command') # Oggetto JSON o stringa
        
        if not target_id or not command_obj:
            return jsonify({"error": "Dati mancanti"}), 400

        # Costruiamo il pacchetto per il Bridge
        payload = {
            "target_id": target_id,
            "command": json.dumps(command_obj) if isinstance(command_obj, dict) else command_obj
        }
        
        # Invio pacchetto UDP al Bridge locale
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.sendto(json.dumps(payload).encode('utf-8'), (BRIDGE_IP, BRIDGE_CMD_PORT))
        
        return jsonify({"status": "sent"}), 200
        
    except Exception as e:
        logger.error(f"Errore invio comando: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print("--- ZULU CONTROL PANEL AVVIATO ---")
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)