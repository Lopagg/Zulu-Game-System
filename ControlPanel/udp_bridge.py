import socket
import threading
import json
import sys
import requests

# --- Variabili Globali Condivise ---
main_socket = None
# Dizionario per memorizzare l'indirizzo (IP, porta) di ogni dispositivo
last_known_device_addrs = {} 
addr_lock = threading.Lock()

def parse_message(data_str):
    parts = data_str.strip().split(';')
    message_dict = {}
    for part in parts:
        if ':' in part:
            key, value = part.split(':', 1)
            message_dict[key] = value
    return message_dict

def esp_listener():
    """Thread che ascolta i pacchetti in arrivo dagli ESP32."""
    global main_socket

    UDP_PORT = 1234
    HOST_IP = '0.0.0.0'
    FORWARD_URL = 'http://127.0.0.1:5000/internal/forward_data'
    
    print(f"[LISTENER ESP] Avvio su {HOST_IP}:{UDP_PORT}...")
    main_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    
    try:
        main_socket.bind((HOST_IP, UDP_PORT))
        print(f"[LISTENER ESP] Bind OK. Inoltro dati a {FORWARD_URL}")
        
        while True:
            data, addr = main_socket.recvfrom(1024)
            message_str = data.decode('utf-8', errors='ignore')
            parsed_data = parse_message(message_str)
            device_id = parsed_data.get('id')

            if device_id:
                # Memorizza l'indirizzo del dispositivo per poter rispondere ai comandi
                with addr_lock:
                    last_known_device_addrs[device_id] = addr
                
                print(f"[LISTENER ESP] Ricevuto da {device_id}@{addr}, inoltro a web server...")
                
                try:
                    # Invia l'indirizzo completo (ip, porta) al pannello di controllo
                    payload = { "parsed_data": parsed_data, "device_ip_info": addr }
                    requests.post(FORWARD_URL, json=payload, timeout=0.5)
                except requests.exceptions.RequestException as e:
                    print(f"  - ERRORE durante l'inoltro a {FORWARD_URL}: {e}")

    except Exception as e:
        print(f"[!!!] ERRORE CRITICO in esp_listener: {e}")
        sys.exit(1)
    finally:
        if main_socket:
            main_socket.close()

def command_sender():
    """Thread che ascolta i comandi dal web server e li invia all'ESP32 corretto."""
    global main_socket
    
    CMD_PORT = 12345
    CMD_HOST = '127.0.0.1'
    
    print(f"[*] Avvio listener comandi su {CMD_HOST}:{CMD_PORT}...")
    
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as cmd_sock:
        try:
            cmd_sock.bind((CMD_HOST, CMD_PORT))
            print("[+] Listener comandi attivo.")
            
            while True:
                data, _ = cmd_sock.recvfrom(1024) # Riceve il comando dal pannello di controllo
                try:
                    # Ora il comando arriva in formato JSON, quindi lo decodifichiamo
                    payload = json.loads(data.decode('utf-8'))
                    command = payload['command']
                    target_id = payload['target_id']
                    
                    target_addr = None
                    with addr_lock:
                        target_addr = last_known_device_addrs.get(target_id)

                    if target_addr and main_socket:
                        print(f"[SENDER ESP] Invio comando '{command}' a {target_id} @ {target_addr}")
                        # Usa il socket principale (quello sulla porta 1234) per inviare il dato!
                        main_socket.sendto(command.encode('utf-8'), target_addr)
                    else:
                        print(f"[!] Ricevuto comando per {target_id}, ma il suo indirizzo non è noto.")
                except (json.JSONDecodeError, KeyError) as e:
                    print(f"[!] ERRORE nel formato del comando ricevuto dal pannello: {e}")

        except Exception as e:
            print(f"[!!!] ERRORE CRITICO in command_sender: {e}")
            sys.exit(1)

if __name__ == '__main__':
    print("[BRIDGE] Avvio dei thread...")
    
    esp_thread = threading.Thread(target=esp_listener, daemon=True)
    cmd_thread = threading.Thread(target=command_sender, daemon=True)
    
    esp_thread.start()
    cmd_thread.start()
    
    # Mantiene il programma principale in esecuzione per permettere ai thread di lavorare
    esp_thread.join()
    cmd_thread.join()