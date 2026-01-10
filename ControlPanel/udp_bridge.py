import socket
import json
import logging

# Configurazione
UDP_IP = "0.0.0.0"
UDP_PORT = 12345
WEB_SERVER_URL = "http://127.0.0.1:5000/internal/forward_data"

# Dizionario per mappare ID Dispositivo -> (IP, Porta)
device_map = {}

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("UDP_BRIDGE")

def start_bridge():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind((UDP_IP, UDP_PORT))
    
    logger.info(f"Zulu UDP Bridge avviato su {UDP_IP}:{UDP_PORT}")
    
    import requests # Importiamo qui per evitare errori se manca all'inizio

    while True:
        try:
            data, addr = sock.recvfrom(4096)
            
            try:
                # Tentiamo di decodificare il JSON
                json_data = json.loads(data.decode('utf-8'))
                
                # CASO 1: Messaggio dal WEB SERVER (da inviare a un ESP32)
                if "target_id" in json_data and "command" in json_data:
                    target_id = json_data["target_id"]
                    command = json_data["command"]
                    
                    logger.info(f"[WEB->ESP] Comando per {target_id}")

                    if target_id in device_map:
                        target_ip, target_port = device_map[target_id]
                        
                        # FIX CRITICO: Se command è un dizionario, convertilo in stringa JSON
                        if isinstance(command, dict):
                            command_to_send = json.dumps(command)
                        else:
                            command_to_send = str(command)
                            
                        # Invia all'ESP32
                        sock.sendto(command_to_send.encode('utf-8'), (target_ip, target_port))
                        logger.info(f"Inviato a {target_ip}: {command_to_send}")
                    else:
                        logger.warning(f"Target {target_id} non trovato nella mappa dispositivi.")
                
                # CASO 2: Messaggio dall'ESP32 (da inviare al Web Server)
                else:
                    # È un messaggio da un dispositivo
                    # Salviamo/Aggiorniamo l'indirizzo IP del dispositivo
                    # Il formato atteso dall'ESP è: {"id": "...", "type": "...", "payload": ...}
                    
                    device_id = json_data.get('id')
                    if device_id:
                        device_map[device_id] = addr # Salva IP e Porta
                        # logger.info(f"Aggiornato indirizzo per {device_id}: {addr}")

                    # Inoltra al Web Server via HTTP POST
                    try:
                        payload = {
                            "parsed_data": json_data,
                            "device_ip_info": addr
                        }
                        requests.post(WEB_SERVER_URL, json=payload, timeout=1)
                    except Exception as e:
                        logger.error(f"Errore inoltro a Web Server: {e}")

            except json.JSONDecodeError:
                logger.error(f"Pacchetto non JSON ricevuto da {addr}")
                
        except Exception as e:
            logger.error(f"Errore loop bridge: {e}")

if __name__ == "__main__":
    start_bridge()