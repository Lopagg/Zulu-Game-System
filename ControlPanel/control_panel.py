import socket
import threading
from datetime import datetime, timedelta
import sys
import json # Necessario per inviare dati complessi al bridge

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

# --- Gestione Login (invariata) ---
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


# --- NUOVA ARCHITETTURA: GESTORE CENTRALE DEI DISPOSITIVI ---
devices = {}  # Dizionario che conterrà tutti i dispositivi, indicizzati per ID (MAC Address)
devices_lock = threading.Lock() # Lock per gestire l'accesso concorrente al dizionario

def check_device_status():
    """
    Task in background che controlla periodicamente il timeout di tutti i dispositivi.
    Se un dispositivo non invia un heartbeat per più di 15 secondi, viene marcato come OFFLINE.
    """
    print("-> Avvio del monitor di connessione dispositivi...")
    while True:
        with devices_lock:
            now = datetime.utcnow()
            offline_devices_ids = []
            # Controlla ogni dispositivo nella lista
            for device_id, device_data in devices.items():
                if device_data.get('status') == 'ONLINE':
                    # Calcola il tempo passato dall'ultimo segnale
                    delta = now - device_data['last_heartbeat']
                    if delta.total_seconds() > 15:
                        offline_devices_ids.append(device_id)
            
            # Se ci sono dispositivi andati offline, aggiorna il loro stato e notifica i browser
            if offline_devices_ids:
                for device_id in offline_devices_ids:
                    print(f"[!] Timeout del dispositivo {device_id}. Stato impostato su OFFLINE.")
                    devices[device_id]['status'] = 'OFFLINE'
                
                # Invia la lista aggiornata di tutti i dispositivi a tutti i browser connessi
                socketio.emit('devices_update', list(devices.values()))
        socketio.sleep(5) # Pausa di 5 secondi tra un controllo e l'altro


# --- ROUTE (PAGINE WEB) ---

@app.route('/')
@login_required
def dashboard():
    """La nuova pagina principale è la dashboard che mostra la lista dei dispositivi."""
    return render_template('dashboard.html', username=current_user.username)

@app.route('/game_control')
@login_required
def game_control():
    """Questa era la vecchia pagina 'index.html', ora serve per controllare una partita in corso."""
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
                return redirect(url_for('dashboard')) # Reindirizza alla nuova dashboard
        flash('Credenziali non valide.')
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

@app.route('/internal/forward_data', methods=['POST'])
def forward_data():
    """
    Endpoint che riceve i dati dal udp_bridge, aggiorna lo stato del dispositivo
    corrispondente e inoltra i dati ai client web.
    """
    global devices
    
    data = request.json
    parsed_data = data.get('parsed_data')
    device_ip_info = data.get('device_ip_info')

    if not parsed_data or not device_ip_info:
        return jsonify({"status": "error"}), 400

    # L'ID del dispositivo (MAC Address) è ora un campo obbligatorio
    device_id = parsed_data.get('id')
    if not device_id:
        return jsonify({"status": "ok"}), 200 # Ignora pacchetti senza ID

    with devices_lock:
        needs_full_update = False
        
        # Se il dispositivo è nuovo, lo aggiungiamo al nostro dizionario
        if device_id not in devices:
            devices[device_id] = {'id': device_id, 'status': 'OFFLINE', 'mode': 'Unknown'}
            needs_full_update = True
        
        device = devices[device_id]
        
        # Se lo stato precedente era OFFLINE, notifichiamo che è tornato ONLINE
        if device['status'] == 'OFFLINE':
            print(f"[+] Dispositivo {device_id} ONLINE (IP: {device_ip_info[0]}).")
            needs_full_update = True

        # Aggiorniamo sempre i dati del dispositivo ad ogni messaggio ricevuto
        device['status'] = 'ONLINE'
        device['last_heartbeat'] = datetime.utcnow()
        device['addr'] = device_ip_info # Memorizziamo l'indirizzo per poter rispondere
        if 'mode' in parsed_data:
            if device.get('mode') != parsed_data['mode']:
                needs_full_update = True # Se la modalità cambia, invia un aggiornamento
            device['mode'] = parsed_data['mode']
        
        # Se è necessario un aggiornamento (nuovo dispositivo, cambio stato/modalità),
        # inviamo l'intera lista aggiornata a tutti i browser.
        if needs_full_update:
            socketio.emit('devices_update', list(devices.values()))

    # Inoltriamo i dati di gioco specifici del dispositivo alla pagina di controllo
    if parsed_data.get('event') != 'heartbeat':
        # Aggiungiamo l'ID del dispositivo ai dati, così il frontend sa a chi appartengono
        parsed_data['deviceId'] = device_id
        socketio.emit('game_update', parsed_data)

    return jsonify({"status": "ok"}), 200

# --- GESTORI SOCKET.IO ---

@socketio.on('connect')
def handle_connect():
    """Quando un nuovo browser si connette, invia la lista corrente dei dispositivi."""
    print("Nuovo client web connesso...")
    with devices_lock:
        # Usiamo 'request.sid' per inviare i dati solo al client che si è appena connesso
        socketio.emit('devices_update', list(devices.values()), room=request.sid)

@socketio.on('send_command')
def handle_send_command(json_data):
    """
    Riceve un comando dal browser e lo inoltra al bridge UDP, specificando
    il dispositivo di destinazione.
    """
    command = json_data.get('command')
    target_id = json_data.get('target_id') # Ora il frontend deve specificare il target
    
    if command and target_id:
        with devices_lock:
            target_device = devices.get(target_id)
        
        if target_device and target_device['status'] == 'ONLINE':
            # Creiamo un pacchetto di dati per il bridge
            payload = {
                'command': command,
                'addr': target_device['addr'] # L'indirizzo IP e la porta del dispositivo
            }
            try:
                # Usiamo un socket temporaneo per inviare il comando al bridge locale
                with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
                    # Usiamo json.dumps per inviare un oggetto complesso come stringa
                    sock.sendto(json.dumps(payload).encode('utf-8'), ('127.0.0.1', BRIDGE_CMD_PORT))
                    print(f"Comando '{command}' inoltrato al bridge per il dispositivo {target_id}")
            except Exception as e:
                print(f"ERRORE nell'invio del comando al bridge: {e}")
        else:
            print(f"Errore: dispositivo target '{target_id}' non trovato o offline.")

# --- AVVIO ---

# Avvia il task in background per il controllo della connessione
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