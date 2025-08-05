import socket
import threading
from flask import Flask, render_template
from flask_socketio import SocketIO

# --- Configurazione ---
UDP_PORT = 1234
HOST_IP = '0.0.0.0'

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, async_mode='threading')

# --- MODIFICA: Logica di stato migliorata ---
# Dizionario per memorizzare l'ultimo stato noto del gioco
last_known_state = {}
# Lock per garantire che l'accesso a last_known_state sia thread-safe
state_lock = threading.Lock()

def parse_message(data_str):
    """Semplice parser per i messaggi chiave:valore;"""
    parts = data_str.strip().split(';')
    message_dict = {}
    for part in parts:
        if ':' in part:
            key, value = part.split(':', 1)
            message_dict[key] = value
    return message_dict

last_device_ip = None

def udp_listener():
    global last_device_ip, last_known_state
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.bind((HOST_IP, UDP_PORT))
        print(f"-> Listener UDP avviato sulla porta {UDP_PORT}")
        while True:
            data, addr = sock.recvfrom(1024)
            last_device_ip = addr[0]
            message_str = data.decode('utf-8', errors='ignore')
            print(f"Ricevuto UDP da {addr}: {message_str}")
            
            parsed_data = parse_message(message_str)
            if parsed_data:
                # --- MODIFICA: Gestione dello stato più robusta ---
                with state_lock:
                    # Se il dispositivo entra in una nuova modalità o torna online,
                    # resetta completamente lo stato per evitare dati vecchi.
                    if parsed_data.get('event') in ['mode_enter', 'device_online']:
                        last_known_state = parsed_data
                    # Se esce da una modalità, resetta allo stato del menu principale.
                    elif parsed_data.get('event') == 'mode_exit':
                        last_known_state = {'event': 'mode_enter', 'mode': 'main_menu'}
                    # Per tutti gli altri eventi (update), aggiorna lo stato esistente.
                    else:
                        last_known_state.update(parsed_data)
                
                socketio.emit('game_update', parsed_data)

@app.route('/')
def index():
    """Questa funzione serve la pagina web principale."""
    return render_template('index.html')

@socketio.on('connect')
def handle_connect():
    """Quando un nuovo client web si connette, gli invia l'ultimo stato noto."""
    global last_known_state
    print("Nuovo client connesso. Invio dello stato attuale...")
    with state_lock:
        if last_known_state:
            # Invia l'oggetto di stato completo al nuovo client
            socketio.emit('game_update', last_known_state)

@socketio.on('send_command')
def handle_send_command(json):
    """Riceve un comando dal browser e lo invia via UDP al dispositivo."""
    command = json.get('command')
    if command and last_device_ip:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.sendto(command.encode('utf-8'), (last_device_ip, UDP_PORT))
            print(f"Comando inviato a {last_device_ip}: {command}")
    else:
        print("Errore: nessun comando o IP del dispositivo non noto.")

if __name__ == '__main__':
    print("-> Avvio del server web e del listener UDP...")
    listener_thread = threading.Thread(target=udp_listener, daemon=True)
    listener_thread.start()
    
    try:
        hostname = socket.gethostname()
        local_ip = socket.gethostbyname(hostname)
        print(f"-> Pannello di controllo accessibile all'indirizzo http://{local_ip}:5000")
    except socket.gaierror:
        print("-> Non è stato possibile determinare l'IP locale. Accedi tramite l'IP del tuo computer sulla rete locale, porta 5000.")
    
    socketio.run(app, host=HOST_IP, port=5000, allow_unsafe_werkzeug=True)