import socket
import threading
from flask import Flask, render_template, request, redirect, url_for, flash, jsonify
from flask_socketio import SocketIO
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash

# --- Configurazione ---
HOST_IP = '0.0.0.0'
UDP_PORT = 1234 # La teniamo per inviare comandi

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

# --- Logica di stato migliorata ---
last_known_state = {}
state_lock = threading.Lock()
last_device_ip = None # Verrà impostato dal bridge

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
    global last_known_state, last_device_ip
    
    # Riceve i dati JSON dal nostro script bridge
    data = request.json
    parsed_data = data.get('parsed_data')
    device_ip = data.get('device_ip')

    if not parsed_data or not device_ip:
        return jsonify({"status": "error", "message": "Dati mancanti"}), 400

    last_device_ip = device_ip # Aggiorna l'IP del dispositivo
    
    # Ora che siamo in un contesto Flask/SocketIO sicuro, possiamo emettere l'evento
    with state_lock:
        if parsed_data.get('event') in ['mode_enter', 'device_online']:
            last_known_state = parsed_data
        elif parsed_data.get('event') == 'mode_exit':
            last_known_state = {'event': 'mode_enter', 'mode': 'main_menu'}
        else:
            last_known_state.update(parsed_data)
    
    socketio.emit('game_update', parsed_data)
    return jsonify({"status": "ok"}), 200

# --- GESTORI SOCKET.IO ---

@socketio.on('connect')
def handle_connect():
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
    # Quando eseguito manualmente, avvia solo il server web
    print("-> Avvio del server web...")
    hostname = socket.gethostname()
    try: local_ip = socket.gethostbyname(hostname)
    except: local_ip = "127.0.0.1"
    print(f"-> Pannello accessibile a http://{local_ip}:5000")
    socketio.run(app, host=HOST_IP, port=5000)
