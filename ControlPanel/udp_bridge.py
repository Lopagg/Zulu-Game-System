import socket
import json
import logging
import requests

# Configurazione
UDP_IP = "0.0.0.0"
UDP_PORT = 1234
WEB_SERVER_URL = "http://127.0.0.1:5000/internal/forward_data"

# Dizionario per mappare ID Dispositivo -> (IP, Porta)
device_map = {}

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("UDP_BRIDGE")

def start_bridge():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind((UDP_IP, UDP_PORT))
    
    logger.info(f"Zulu UDP Bridge avviato su {UDP_IP}:{UDP_PORT}")

    while True:
        try:
            data, addr = sock.recvfrom(4096)
            
            try:
                # Decodifica il JSON
                json_data = json.loads(data.decode('utf-8'))
                
                # CASO 1: Messaggio dal WEB SERVER (da inviare a un ESP32)
                if "target_id" in json_data and "command" in json_data:
                    target_id = json_data["target_id"]
                    command = json_data["command"]
                    
                    if target_id in device_map:
                        target_ip, target_port = device_map[target_id]
                        
                        # Il comando dovrebbe già essere una stringa JSON, ma per sicurezza:
                        command_to_send = json.dumps(command) if isinstance(command, dict) else str(command)
                            
                        sock.sendto(command_to_send.encode('utf-8'), (target_ip, target_port))
                        logger.info(f"[WEB -> ESP] Inviato a {target_id} ({target_ip}): {command_to_send}")
                    else:
                        logger.warning(f"[WARNING] Target {target_id} non trovato nella mappa dispositivi.")
                
                # CASO 2: Messaggio dall'ESP32 (da inviare al Web Server)
                else:
                    device_id = json_data.get('id')
                    if device_id:
                        device_map[device_id] = addr # Salva IP e Porta per future comunicazioni

                    # Inoltra al Web Server via HTTP POST
                    try:
                        payload = {
                            "parsed_data": json_data,
                            "device_ip_info": addr
                        }
                        requests.post(WEB_SERVER_URL, json=payload, timeout=1)
                    except requests.exceptions.RequestException as e:
                        logger.error(f"[ERROR] Impossibile inoltrare i dati al server Flask: {e}")

            except json.JSONDecodeError:
                logger.error(f"[ERROR] Pacchetto non-JSON ricevuto da {addr}")
                
        except Exception as e:
            logger.error(f"[CRITICAL] Errore loop bridge: {e}")

if __name__ == "__main__":
    start_bridge()