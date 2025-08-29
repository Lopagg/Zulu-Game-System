import socket
import threading
# --- MODIFICA: Assicurati che eventlet sia importato e il monkey-patch applicato all'inizio
import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template, request, redirect, url_for, flash
from flask_socketio import SocketIO
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash

# --- Configurazione ---
UDP_PORT = 1234
HOST_IP = '0.0.0.0'

app = Flask(__name__)
app.config['SECRET_KEY'] = 'la-tua-chiave-segreta-super-difficile' 
socketio = SocketIO(app, async_mode='eventlet')

# --- CONFIGURAZIONE FLASK-LOGIN ---
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# --- DATABASE UTENTI SEMPLIFICATO ---
users = {
    'admin': {
        'password_hash': generate_password_hash('zulu'),
        'id': '1'
    }
}

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

# --- Logica di stato migliorata ---
last_known_state = {}
state_lock = threading.Lock()

def parse_message(data_str):
    parts = data_str.strip().split(';')
    message_dict = {}
    for part in parts:
        if ':' in part:
            key, value = part.split(':', 1)
            message_dict[key] = value
    return message_dict

last_device_ip = None

# --- MODIFICA: Funzione UDP Listener con gestione robusta degli errori ---
def udp_listener():
    global last_device_ip, last_known_state
    
    sock = None # Inizializza a None
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.bind((HOST_IP, UDP_PORT))
        print(f"-> Listener UDP avviato e bind eseguito sulla porta {UDP_PORT}")

        while True:
            data, addr = sock.recvfrom(1024)
            last_device_ip = addr[0]
            message_str = data.decode('utf-8', errors='ignore')
            
            print(f"Ricevuto UDP RAW da {addr}: {message_str}")
            
            parsed_data = parse_message(message_str)
            if parsed_data:
                with state_lock:
                    if parsed_data.get('event') in ['mode_enter', 'device_online']:
                        last_known_state = parsed_data
                    elif parsed_data.get('event') == 'mode_exit':
                        last_known_state = {'event': 'mode_enter', 'mode': 'main_menu'}
                    else:
                        last_known_state.update(parsed_data)
                
                socketio.emit('game_update', parsed_data)
    
    except Exception as e:
        # Se QUALSIASI cosa va storta, lo stamperemo qui!
        print(f"!!!!!!!!!! ERRORE CRITICO NEL LISTENER UDP: {e} !!!!!!!!!!")
    
    finally:
        if sock:
            sock.close()
        print("-> Listener UDP terminato.")

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

@socketio.on('connect')
def handle_connect():
    global last_known_state
    print("Nuovo client connesso. Invio dello stato attuale...")
    with state_lock:
        if last_known_state:
            socketio.emit('game_update', last_known_state)

@socketio.on('send_command')
def handle_send_command(json):
    command = json.get('command')
    if command and last_device_ip:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.sendto(command.encode('utf-8'), (last_device_ip, UDP_PORT))
            print(f"Comando inviato a {last_device_ip}: {command}")
    else:
        print("Errore: nessun comando o IP del dispositivo non noto.")

if __name__ == '__main__':
    print("-> Avvio del server web e del listener UDP...")
    eventlet.spawn(udp_listener)
    
    hostname = socket.gethostname()
    try:
        local_ip = socket.gethostbyname(hostname)
    except socket.gaierror:
        local_ip = socket.gethostbyname(hostname + ".local")

    print(f"-> Pannello di controllo accessibile all'indirizzo http://{local_ip}:5000")
    
    socketio.run(app, host=HOST_IP, port=5000, allow_unsafe_werkzeug=True)
