import socket
import threading
from datetime import datetime, timedelta
from flask import Flask, render_template, request, redirect, url_for, flash, jsonify
from flask_socketio import SocketIO
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash

# --- Configurazione ---
HOST_IP = '0.0.0.0'
BRIDGE_CMD_PORT = 12345

app = Flask(__name__)
app.config['SECRET_KEY'] = 'la-tua-chiave-segreta-super-difficile' 
# Non serve più specificare async_mode quando si usa Gunicorn con eventlet
socketio = SocketIO(app) 

# --- CONFIGURAZIONE FLASK-LOGIN (invariata) ---
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

# --- Logica di stato ---
last_known_state = {}
state_lock = threading.Lock()

# Variabili per il controllo della connessione
device_status = "OFFLINE"
last_heartbeat_time = None
status_lock = threading.Lock()

def check_device_status():
    """
    Questo task viene eseguito in background per controllare se il dispositivo
    è ancora connesso. Se non riceve un heartbeat per più di 15 secondi,
    lo considera offline.
    """
    global device_status, last_heartbeat_time
    print("-> Avvio del monitor di connessione del dispositivo...")
    while True:
        with status_lock:
            # Controlla solo se abbiamo ricevuto almeno un heartbeat
            if last_heartbeat_time:
                # Calcola il tempo passato dall'ultimo segnale
                delta = datetime.utcnow() - last_heartbeat_time
                if delta.total_seconds() > 15 and device_status == "ONLINE":
                    print("[!] Timeout del dispositivo. Stato impostato su OFFLINE.")
                    device_status = "OFFLINE"
                    # Invia l'aggiornamento a tutti i browser
                    socketio.emit('connection_status', {'status': 'OFFLINE'})
            
            # Se lo stato è OFFLINE ma non abbiamo mai ricevuto un heartbeat, non fare nulla
            # finché non arriva il primo pacchetto.

        socketio.sleep(5) # Controlla ogni 5 secondi

# --- ROUTE (PAGINE WEB) ---

@app.route('/')
@login_required
def index():
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
                return redirect(url_for('index'))
        flash('Credenziali non valide. Riprova.')
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

# --- NUOVO ENDPOINT INTERNO PER IL BRIDGE ---
@app.route('/internal/forward_data', methods=['POST'])
def forward_data():
    global last_known_state, last_device_ip, device_status, last_heartbeat_time
    
    # Riceve i dati JSON dal nostro script bridge
    data = request.json
    parsed_data = data.get('parsed_data')
    device_ip = data.get('device_ip')

    if not parsed_data or not device_ip:
        return jsonify({"status": "error", "message": "Dati mancanti"}), 400
    
    with status_lock:
        last_heartbeat_time = datetime.utcnow() # Aggiorna il timestamp dell'ultimo segnale
        # Se era offline, ora è online
        if device_status == "OFFLINE":
            print(f"[+] Dispositivo ONLINE (IP: {device_ip}).")
            device_status = "ONLINE"
            socketio.emit('connection_status', {'status': 'ONLINE'})

    last_device_ip = device_ip # Aggiorna l'IP del dispositivo
    
    # Ora che siamo in un contesto Flask/SocketIO sicuro, possiamo emettere l'evento
    with state_lock:
        if parsed_data.get('event') in ['mode_enter', 'device_online']:
            last_known_state = parsed_data
        elif parsed_data.get('event') == 'mode_exit':
            last_known_state = {'event': 'mode_enter', 'mode': 'main_menu'}
        else:
            last_known_state.update(parsed_data)
    
    if parsed_data.get('event') != 'heartbeat':
      socketio.emit('game_update', parsed_data)

    return jsonify({"status": "ok"}), 200

# --- GESTORI SOCKET.IO ---

@socketio.on('connect')
def handle_connect():
    print("Nuovo client connesso. Invio stato attuale...")
    with state_lock:
        if last_known_state:
            socketio.emit('game_update', last_known_state)
    with status_lock:
        socketio.emit('connection_status', {'status': device_status})

@socketio.on('send_command')
def handle_send_command(json):
    """
    Riceve un comando dal browser e lo invia al bridge UDP per l'inoltro.
    """
    command = json.get('command')
    if command:
        # Usa un socket temporaneo per inviare il comando al bridge locale
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
                sock.sendto(command.encode('utf-8'), ('127.0.0.1', BRIDGE_CMD_PORT))
                print(f"Comando inoltrato al bridge per l'invio: {command}")
        except Exception as e:
            print(f"ERRORE invio comando al bridge: {e}")
    else:
        print("Errore: nessun comando ricevuto dal browser.")

socketio.start_background_task(target=check_device_status)

if __name__ == '__main__':
    print("-> Avvio del server web...")
    hostname = socket.gethostname()
    try: local_ip = socket.gethostbyname(hostname)
    except: local_ip = "127.0.0.1"
    print(f"-> Pannello accessibile a http://{local_ip}:5000")
    socketio.run(app, host=HOST_IP, port=5000)