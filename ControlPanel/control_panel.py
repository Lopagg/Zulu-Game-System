import socket
import threading
from flask import Flask, render_template
from flask_socketio import SocketIO

# --- Configurazione ---
UDP_PORT = 1234
HOST_IP = '0.0.0.0' # Significa "ascolta su tutte le interfacce di rete del PC"

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, async_mode='threading')

def parse_message(data_str):
    """Semplice parser per i messaggi chiave:valore;"""
    parts = data_str.strip().split(';')
    message_dict = {}
    for part in parts:
        if ':' in part:
            key, value = part.split(':', 1)
            message_dict[key] = value
    return message_dict

# Salva l'indirizzo IP dell'ultimo dispositivo che ha inviato un messaggio
last_device_ip = None

def udp_listener():
    global last_device_ip
    """Questa funzione gira in un thread separato e ascolta i pacchetti UDP."""
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.bind((HOST_IP, UDP_PORT))
        print(f"-> Listener UDP avviato sulla porta {UDP_PORT}")
        while True:
            data, addr = sock.recvfrom(1024)
            last_device_ip = addr[0] # Salva l'IP
            message_str = data.decode('utf-8', errors='ignore')
            print(f"Ricevuto UDP da {addr}: {message_str}")
            
            # Inoltra il messaggio a tutti i client web connessi
            parsed_data = parse_message(message_str)
            if parsed_data:
                socketio.emit('game_update', parsed_data)

@app.route('/')
def index():
    """Questa funzione serve la pagina web principale."""
    return render_template('index.html')

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

# ATTENZIONE: Questo blocco DEVE essere all'inizio della riga, senza spazi prima.
if __name__ == '__main__':
    # ATTENZIONE: Le righe seguenti DEVONO avere 4 spazi all'inizio.
    print("-> Avvio del server web e del listener UDP...")
    listener_thread = threading.Thread(target=udp_listener, daemon=True)
    listener_thread.start()
    
    print(f"-> Pannello di controllo accessibile all'indirizzo http://192.168.1.4:5000")
    socketio.run(app, host=HOST_IP, port=5000)