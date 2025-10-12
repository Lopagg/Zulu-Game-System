import socket
import requests
import threading
import sys

# --- Variabili Globali Condivise tra i Thread ---
last_device_addr = None
main_socket = None
ip_lock = threading.Lock()

def parse_message(data_str):
    parts = data_str.strip().split(';')
    message_dict = {}
    for part in parts:
        if ':' in part:
            key, value = part.split(':', 1)
            message_dict[key] = value
    return message_dict

def esp_listener():
    """Thread che ascolta i pacchetti in arrivo dall'ESP32."""
    global last_device_addr, main_socket

    UDP_PORT = 1234
    HOST_IP = '0.0.0.0'
    FORWARD_URL = 'http://localhost:5000/internal/forward_data'
    
    print(f"[LISTENER ESP] Avvio su {HOST_IP}:{UDP_PORT}...")
    
    # Crea il socket principale e lo rende globale
    main_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    
    try:
        main_socket.bind((HOST_IP, UDP_PORT))
        print(f"[LISTENER ESP] Bind OK. Inoltro dati a {FORWARD_URL}")
        
        while True:
            data, addr = main_socket.recvfrom(1024)
            
            # Aggiorna l'ultimo indirizzo noto del dispositivo
            with ip_lock:
                last_device_addr = addr
            
            message_str = data.decode('utf-8', errors='ignore')
            print(f"[LISTENER ESP] Ricevuto da {addr}, inoltro a web server...")
            
            parsed_data = parse_message(message_str)
            
            if parsed_data:
                try:
                    payload = { "parsed_data": parsed_data, "device_ip": addr[0] }
                    requests.post(FORWARD_URL, json=payload, timeout=0.5)
                except requests.exceptions.RequestException as e:
                    print(f"  - ERRORE durante l'inoltro: {e}")

    except Exception as e:
        print(f"[!!!] ERRORE CRITICO in esp_listener: {e}")
        sys.exit(1)
    finally:
        if main_socket:
            main_socket.close()

def command_sender():
    """Thread che ascolta i comandi dal web server e li invia all'ESP32."""
    global last_device_addr, main_socket
    
    CMD_PORT = 12345
    CMD_HOST = '127.0.0.1'
    
    print(f"[*] Avvio listener comandi su {CMD_HOST}:{CMD_PORT}...")
    
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as cmd_sock:
        try:
            cmd_sock.bind((CMD_HOST, CMD_PORT))
            print("[+] Listener comandi attivo.")
            
            while True:
                data, _ = cmd_sock.recvfrom(1024) # Riceve il comando
                
                target_addr = None
                with ip_lock:
                    if last_device_addr:
                        target_addr = last_device_addr

                if target_addr and main_socket:
                    command_str = data.decode('utf-8', errors='ignore')
                    print(f"[SENDER ESP] Invio comando '{command_str}' a {target_addr}")
                    # Usa il socket principale per inviare il dato!
                    main_socket.sendto(data, target_addr)
                else:
                    print("[!] Ricevuto comando, ma IP del dispositivo non noto. Impossibile inviare.")

        except Exception as e:
            print(f"[!!!] ERRORE CRITICO in command_sender: {e}")
            sys.exit(1)

if __name__ == '__main__':
    print("[BRIDGE] Avvio dei thread...")
    
    esp_thread = threading.Thread(target=esp_listener, daemon=True)
    cmd_thread = threading.Thread(target=command_sender, daemon=True)
    
    esp_thread.start()
    cmd_thread.start()
    
    # Mantiene il programma principale in esecuzione
    esp_thread.join()
    cmd_thread.join()