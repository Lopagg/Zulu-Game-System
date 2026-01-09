from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit
import logging

# Configurazione Log
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['SECRET_KEY'] = 'zulu_secret_key' # Cambia con una chiave sicura in produzione
socketio = SocketIO(app, cors_allowed_origins="*")

# --- ROUTE PAGINE WEB ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/dashboard')
def dashboard():
    return render_template('dashboard.html')

@app.route('/login')
def login():
    return render_template('login.html')

# --- API INTERNE (Chiamate da udp_bridge.py) ---

@app.route('/internal/forward_data', methods=['POST'])
def receive_data_from_bridge():
    """
    Riceve i dati JSON grezzi dal Bridge UDP e li inoltra al Frontend via SocketIO.
    Payload atteso: { "parsed_data": {...}, "device_ip_info": [...] }
    """
    try:
        data = request.json
        if not data:
            return jsonify({"status": "error", "message": "No JSON data"}), 400
        
        # Estrai i dati utili
        esp_event = data.get('parsed_data', {})
        # device_info = data.get('device_ip_info', []) 
        
        # Logghiamo per debug
        event_type = esp_event.get('type', 'UNKNOWN')
        # logger.info(f"Inoltro evento al frontend: {event_type}")

        # Inoltra a tutti i client connessi (browser)
        socketio.emit('esp_event', data)
        
        return jsonify({"status": "ok"}), 200

    except Exception as e:
        logger.error(f"Errore nel forwarding dati: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

# --- API PER INVIARE COMANDI AGLI ESP32 ---
# Il frontend chiamerà questa rotta per dire "Inizia Partita"
# E noi gireremo il comando al bridge UDP che lo spedirà all'ESP32

@app.route('/api/send_command', methods=['POST'])
def send_command():
    import socket
    import json
    
    # Parametri per parlare con il thread command_sender del bridge
    BRIDGE_IP = '127.0.0.1'
    BRIDGE_CMD_PORT = 12345
    
    try:
        req = request.json
        target_id = req.get('target_id') # MAC address o "BROADCAST"
        command_json = req.get('command') # Oggetto JSON del comando
        
        if not target_id or not command_json:
            return jsonify({"error": "Missing target_id or command"}), 400

        # Pacchetto per il bridge
        payload = {
            "target_id": target_id,
            "command": json.dumps(command_json) # Serializziamo il comando interno
        }
        
        # Invio al bridge UDP
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.sendto(json.dumps(payload).encode('utf-8'), (BRIDGE_IP, BRIDGE_CMD_PORT))
        
        return jsonify({"status": "sent"}), 200
        
    except Exception as e:
        logger.error(f"Errore invio comando: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print("--- ZULU CONTROL PANEL AVVIATO ---")
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)