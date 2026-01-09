import socket
import threading
import json
import sys
import requests

# --- Variabili Globali Condivise ---
main_socket = None
last_known_device_addrs = {} 
addr_lock = threading.Lock()

def esp_listener():
    """Thread che ascolta i pacchetti JSON dagli ESP32."""
    global main_socket

    UDP_PORT = 1234
    HOST_IP = '0.0.0.0'
    FORWARD_URL = 'http://127.0.0.1:5000/internal/forward_data'
    
    print(f"[LISTENER ESP] Avvio su {HOST_IP}:{UDP_PORT} (Mode: JSON)...")
    main_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    
    try:
        main_socket.bind((HOST_IP, UDP_PORT))
        
        while True:
            data, addr = main_socket.recvfrom(2048) # Buffer aumentato per JSON
            message_str = data.decode('utf-8', errors='ignore')
            
            try:
                # 1. Tenta di decodificare il JSON ricevuto dall'ESP32
                parsed_data = json.loads(message_str)
                device_id = parsed_data.get('id')

                if device_id:
                    with addr_lock:
                        last_known_device_addrs[device_id] = addr
                    
                    # Log pulito (mostra solo il tipo di evento per non intasare la console)
                    event_type = parsed_data.get('type', 'UNKNOWN')
                    print(f"[RX] {device_id} -> {event_type}")
                    
                    # 2. Inoltra al Web Server (Flask)
                    payload = { "parsed_data": parsed_data, "device_ip_info": addr }
                    try:
                        requests.post(FORWARD_URL, json=payload, timeout=0.5)
                    except requests.exceptions.RequestException:
                        pass # Ignora errori di timeout del server locale

            except json.JSONDecodeError:
                print(f"[!] Errore: Ricevuto pacchetto non JSON da {addr}: {message_str[:20]}...")

    except Exception as e:
        print(f"[!!!] ERRORE CRITICO in esp_listener: {e}")
        sys.exit(1)
    finally:
        if main_socket:
            main_socket.close()

def command_sender():
    """Thread invio comandi (Invariato nella logica, ma pulito)"""
    global main_socket
    CMD_PORT = 12345
    CMD_HOST = '127.0.0.1'
    
    print(f"[*] Listener comandi attivo su {CMD_HOST}:{CMD_PORT}")
    
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as cmd_sock:
        cmd_sock.bind((CMD_HOST, CMD_PORT))
        
        while True:
            data, _ = cmd_sock.recvfrom(1024)
            try:
                payload = json.loads(data.decode('utf-8'))
                command = payload.get('command') # Stringa grezza o JSON da inviare
                target_id = payload.get('target_id')
                
                target_addr = None
                with addr_lock:
                    target_addr = last_known_device_addrs.get(target_id)

                if target_addr and main_socket:
                    print(f"[TX] {target_id} <- {command}")
                    main_socket.sendto(command.encode('utf-8'), target_addr)
                else:
                    print(f"[!] Impossibile inviare a {target_id}: indirizzo sconosciuto.")
            except Exception as e:
                print(f"[!] Errore sender: {e}")

if __name__ == '__main__':
    threading.Thread(target=esp_listener, daemon=True).start()
    threading.Thread(target=command_sender, daemon=True).start()
    
    # Loop vuoto per mantenere vivo il main thread
    while True: 
        import time
        time.sleep(1)