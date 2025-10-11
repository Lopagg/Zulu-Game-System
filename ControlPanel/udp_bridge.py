import sys
import socket
# Aggiungiamo print e flush dopo ogni import per essere sicuri di vederli nel log
print("[BRIDGE_LOG] Modulo 'sys' e 'socket' importati con successo.")
sys.stdout.flush()

try:
    import requests
    print("[BRIDGE_LOG] Modulo 'requests' importato con successo.")
    sys.stdout.flush()
except ImportError as e:
    print(f"[!!!] ERRORE FATALE: Impossibile importare la libreria 'requests': {e}")
    sys.stdout.flush()
    sys.exit(1) # Esce con un codice di errore per far fallire il servizio

def parse_message(data_str):
    """Semplice parser per i messaggi chiave:valore;"""
    parts = data_str.strip().split(';')
    message_dict = {}
    for part in parts:
        if ':' in part:
            key, value = part.split(':', 1)
            message_dict[key] = value
    return message_dict

def udp_listener():
    UDP_PORT = 1234
    HOST_IP = '0.0.0.0'
    FORWARD_URL = 'http://localhost:5000/internal/forward_data'

    print(f"[*] UDP Bridge in avvio. In ascolto su {HOST_IP}:{UDP_PORT}...")
    sys.stdout.flush()
    
    sock = None
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        print("[+] Socket creato.")
        sys.stdout.flush()

        sock.bind((HOST_IP, UDP_PORT))
        print(f"[+] Bind sulla porta {UDP_PORT} eseguito con successo. Inoltro dati a {FORWARD_URL}")
        sys.stdout.flush()
        
        while True:
            data, addr = sock.recvfrom(1024)
            message_str = data.decode('utf-8', errors='ignore')
            print(f"[BRIDGE_RX] Ricevuto da {addr}, inoltro in corso...")
            sys.stdout.flush()
            
            parsed_data = parse_message(message_str)
            
            if parsed_data:
                try:
                    payload = {
                        "parsed_data": parsed_data,
                        "device_ip": addr[0]
                    }
                    response = requests.post(FORWARD_URL, json=payload, timeout=0.5)
                    print(f"  - Inoltrato. Risposta del server web: {response.status_code}")
                    sys.stdout.flush()
                except requests.exceptions.RequestException as e:
                    print(f"  - [!!!] ERRORE durante l'inoltro: {e}")
                    sys.stdout.flush()

    except Exception as e:
        print(f"[!!!] ERRORE CRITICO NEL BRIDGE UDP: {e}")
        sys.stdout.flush()
    finally:
        if sock:
            sock.close()
            print("[*] Socket chiuso.")
            sys.stdout.flush()

if __name__ == '__main__':
    print("[BRIDGE_LOG] Avvio dello script udp_bridge.py...")
    sys.stdout.flush()
    udp_listener()
