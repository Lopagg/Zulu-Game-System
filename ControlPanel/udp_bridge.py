import socket
import requests # Useremo questa libreria per fare richieste HTTP

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
    FORWARD_URL = 'zuluserver.ddns.net:5000/internal/forward_data'

    print(f"[*] Avvio UDP Bridge. Ascolto sulla porta {UDP_PORT}...")
    
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        try:
            sock.bind((HOST_IP, UDP_PORT))
            print(f"[+] Bind eseguito. Inoltro dei dati a {FORWARD_URL}")
            
            while True:
                data, addr = sock.recvfrom(1024)
                message_str = data.decode('utf-8', errors='ignore')
                print(f"Ricevuto pacchetto da {addr}, inoltro in corso...")
                
                parsed_data = parse_message(message_str)
                
                if parsed_data:
                    try:
                        # Prepara il pacchetto di dati da inviare come JSON
                        payload = {
                            "parsed_data": parsed_data,
                            "device_ip": addr[0]
                        }
                        # Inoltra i dati al server web principale tramite una richiesta POST
                        requests.post(FORWARD_URL, json=payload, timeout=0.5)
                    except requests.exceptions.RequestException as e:
                        print(f"  - Errore durante l'inoltro dei dati: {e}")

        except Exception as e:
            print(f"[!!!] ERRORE CRITICO NEL BRIDGE UDP: {e}")

if __name__ == '__main__':
    udp_listener()
