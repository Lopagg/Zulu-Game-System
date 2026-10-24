import paho.mqtt.client as mqtt
import logging
import json
import time
from threading import Lock
import db_manager

logger = logging.getLogger(__name__)

# --- DEVICE REGISTRY ---
class DeviceRegistry:
    def __init__(self):
        self.devices = {}
        self.timeout_seconds = 15 
        self.lock = Lock()

    def update_device(self, device_id, msg_type, mode=None, version=None):
        now = time.time()
        changed = False
        with self.lock:
            if device_id not in self.devices:
                self.devices[device_id] = { 
                    "id": device_id, 
                    "name": device_id, 
                    "type": "NODE", 
                    "mode": "BOOTING...", 
                    "version": "Unknown", 
                    "ip": "MQTT",
                    "game_state": "STANDBY",
                    "telemetry": {}
                }
                changed = True 
                
            self.devices[device_id]["last_seen"] = now
            self.devices[device_id]["status"] = "ONLINE"
            
            if version and self.devices[device_id].get("version") != version:
                self.devices[device_id]["version"] = version
                changed = True
                
            if mode and self.devices[device_id].get("mode") != mode:
                 self.devices[device_id]["mode"] = mode
                 changed = True
                 
            elif msg_type == "MODE_EXIT" and self.devices[device_id].get("mode") != "MAIN MENU":
                self.devices[device_id]["mode"] = "MAIN MENU"
                self.devices[device_id]["game_state"] = "STANDBY"
                self.devices[device_id]["telemetry"] = {}
                changed = True
                
        return changed

    def update_telemetry(self, device_id, payload, new_state=None):
        changed = False
        with self.lock:
            if device_id in self.devices:
                self.devices[device_id]["telemetry"].update(payload)
                if new_state and self.devices[device_id]["game_state"] != new_state:
                    self.devices[device_id]["game_state"] = new_state
                    changed = True
        return changed

    def rename_device(self, device_id, new_name):
        with self.lock:
            if device_id in self.devices:
                self.devices[device_id]["name"] = new_name
                return True
        return False

    def get_active_devices(self):
        now = time.time()
        to_remove = []
        active_list = []
        needs_update = False
        with self.lock:
            for d_id, data in self.devices.items():
                if now - data["last_seen"] > self.timeout_seconds:
                    to_remove.append(d_id)
                else:
                    active_list.append(data)
            for d_id in to_remove:
                del self.devices[d_id]
                needs_update = True
        return active_list, needs_update

# --- ISTANZE GLOBALI DEL MOTORE DI GIOCO ---
registry = DeviceRegistry()
mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1)
socketio = None  # Verrà iniettato da control_panel.py

tdm_state = { "active": False, "time_left": 0, "duration": 0 }
mission_ready_flag = False
background_thread_started = False

def trigger_siren(cmd_type="SIREN_LONG"):
    try:
        command_str = json.dumps({"cmd": cmd_type})
        mqtt_client.publish("zulu/cmd/broadcast", command_str)
    except Exception as e:
        logger.error(f"[ERROR SIREN SERVER] {e}")

def on_mqtt_connect(client, userdata, flags, rc):
    logger.info(f"[MQTT] Connesso al Broker con codice: {rc}")
    client.subscribe("zulu/telemetry/#")

def on_mqtt_message(client, userdata, msg):
    if not socketio: return
    try:
        payload_str = msg.payload.decode('utf-8')
        parsed = json.loads(payload_str)
        
        device_id = parsed.get('id')
        msg_type = parsed.get('type')
        payload = parsed.get('payload', {})
        
        if msg_type not in ['HEARTBEAT', 'TIME_UPDATE', 'DOM_UPDATE', 'SD_UPDATE']:
            logger.info(f"[MQTT RX] {device_id} -> TYPE: {msg_type} | PAYLOAD: {payload}")
        
        if device_id:
            # --- GESTIONE KIOSK ---
            if msg_type == 'KIOSK_CMD':
                cmd = payload.get('cmd')
                if cmd:
                    socketio.emit('kiosk_hardware_cmd', {'cmd': cmd})
                return

            elif msg_type == 'TAG_SCANNED':
                uid = payload.get('uid')
                reply_action = "UNKNOWN"
                if uid:
                    row = db_manager.get_player_status(uid)
                    if row:
                        current_status, team = row
                        new_status = db_manager.toggle_player_status(uid, current_status)
                        reply_action = f"{new_status}_{team}" 
                        socketio.emit('roster_update', db_manager.get_full_roster())
                    else:
                        reply_action = "WAIT_ASSIGN"
                
                reply_payload = {"cmd": "KIOSK_REPLY", "action": reply_action}
                mqtt_client.publish(f"zulu/cmd/{device_id}", json.dumps(reply_payload))

            elif msg_type == 'TAG_ASSIGN':
                uid = payload.get('uid')
                team = payload.get('team')
                if uid and team:
                    db_manager.register_player(uid, team)
                    socketio.emit('roster_update', db_manager.get_full_roster())
            
            # --- AGGIORNAMENTO REGISTRO NODI ---
            mode = payload.get('mode') or parsed.get('mode')
            version = payload.get('version') or parsed.get('version')
            has_changed = registry.update_device(device_id, msg_type, mode, version)
            
            if msg_type not in ['TAG_SCANNED', 'TAG_ASSIGN']:
                socketio.emit('esp_event', {"parsed_data": parsed})

            # --- GESTIONE TELEMETRIA & ARBITRO PER SINGOLO NODO ---
            if msg_type in ['SD_UPDATE', 'DOM_UPDATE']:
                new_state = payload.get('state')
                old_state = registry.devices[device_id].get("game_state", "STANDBY")
                
                state_changed = registry.update_telemetry(device_id, payload, new_state)
                
                if state_changed:
                    end_states = ['T WINS', 'CT WINS', 'ALPHA WINS', 'BRAVO WINS', 'DRAW', 'STOPPED']
                    start_states = ['ACTIVE', 'SAFE', 'NEUTRAL']
                    
                    if new_state in end_states and old_state not in end_states:
                        logger.info(f"[ARBITRO SERVER] Partita su nodo {device_id} terminata ({new_state}).")
                        trigger_siren("SIREN_LONG")
                        db_manager.process_match_stats(new_state) 
                    
                    if old_state == 'PREPARING' and new_state in start_states:
                        logger.info(f"[ARBITRO SERVER] Partita su nodo {device_id} iniziata ({new_state}).")
                        trigger_siren("SIREN_LONG")
                            
            elif msg_type == 'MODE_ENTER':
                registry.update_telemetry(device_id, {}, "PREPARING")
            
            if has_changed:
                active_devs, _ = registry.get_active_devices()
                socketio.emit('devices_update', active_devs)

    except Exception as e:
        logger.error(f"[MQTT ERROR] Eccezione nel parsing del messaggio: {e}")

mqtt_client.on_connect = on_mqtt_connect
mqtt_client.on_message = on_mqtt_message

def start_mqtt(sio_instance):
    """Inizializza MQTT e lega Socket.IO al motore di gioco."""
    global socketio
    socketio = sio_instance
    try:
        mqtt_client.connect("127.0.0.1", 1883, 60)
        mqtt_client.loop_start()
        logger.info("[MQTT] Servizio MQTT in background avviato.")
    except Exception as e:
        logger.error(f"[CRITICAL MQTT] Impossibile collegarsi a Mosquitto: {e}")

def background_cleanup(fetch_weather_callback):
    """L'arbitro globale e gestore della pulizia."""
    global mission_ready_flag
    logger.info("[SYSTEM] Task di Pulizia e Arbitro Globale AVVIATO.")
    tick_counter = 0
    while True:
        if socketio: socketio.sleep(1) 
        tick_counter += 1
        
        players = db_manager.get_active_roster_status()
        players_out = sum(1 for p in players if p[2] != 'IN')
        alpha_in = sum(1 for p in players if p[1] == 'ALPHA' and p[2] == 'IN')
        bravo_in = sum(1 for p in players if p[1] == 'BRAVO' and p[2] == 'IN')
        total_players = len(players)

        all_players_in = (players_out == 0) and (total_players > 0)
        game_is_running = tdm_state['active']
        
        with registry.lock:
            for dev_id, data in registry.devices.items():
                state = data.get("game_state")
                if state in ['ARMING...', 'ARMED', 'DEFUSING...', 'NEUTRAL', 'OWNED ALPHA', 'OWNED BRAVO', 'CAPTURING A...', 'CAPTURING B...', 'ACTIVE']:
                    game_is_running = True
                
        if game_is_running:
            global mission_ready_flag
            mission_ready_flag = False

        kiosk_state_payload = {
            "cmd": "KIOSK_LED_SYNC",
            "all_players_in": all_players_in,
            "game_running": game_is_running,
            "game_ready": mission_ready_flag
        }
        try:
            mqtt_client.publish("zulu/cmd/NODE-KIOSK-1", json.dumps(kiosk_state_payload))
        except Exception:
            pass

        # --- ARBITRO TEAM DEATHMATCH ---
        if tdm_state['active']:
            if tdm_state['time_left'] > 0:
                tdm_state['time_left'] -= 1
            
            state_str = "ACTIVE"
            tdm_ends = False
            
            if alpha_in == 0 and bravo_in > 0:
                state_str = "BRAVO WINS"
                tdm_ends = True
            elif bravo_in == 0 and alpha_in > 0:
                state_str = "ALPHA WINS"
                tdm_ends = True
            elif alpha_in == 0 and bravo_in == 0:
                state_str = "DRAW"
                tdm_ends = True
            elif tdm_state['time_left'] <= 0:
                if alpha_in > bravo_in: state_str = "ALPHA WINS"
                elif bravo_in > alpha_in: state_str = "BRAVO WINS"
                else: state_str = "DRAW"
                tdm_ends = True
                
            if tdm_ends:
                tdm_state['active'] = False
                trigger_siren("SIREN_LONG") 
                db_manager.process_match_stats(state_str)
            
            doc = { "id": "SERVER-TDM", "type": "TDM_UPDATE", "payload": { "mode": "TEAM_DEATHMATCH", "state": state_str, "game_time": tdm_state['time_left'] } }
            if socketio: socketio.emit('esp_event', {"parsed_data": doc})
            mqtt_client.publish("zulu/telemetry/SERVER-TDM", json.dumps(doc))

        # --- ARBITRO TERMINALI HARDWARE ---
        active_hw_states = ['SAFE', 'ARMING...', 'ARMED', 'DEFUSING...', 'NEUTRAL', 'OWNED ALPHA', 'OWNED BRAVO', 'CAPTURING A...', 'CAPTURING B...']
        
        with registry.lock:
            for dev_id, data in registry.devices.items():
                state = data.get("game_state")
                if state in active_hw_states:
                    cmd_to_send = None
                    if alpha_in == 0 and bravo_in > 0:
                        cmd_to_send = {"cmd": "FORCE_WIN", "winner": "BRAVO"}
                    elif bravo_in == 0 and alpha_in > 0:
                        cmd_to_send = {"cmd": "FORCE_WIN", "winner": "ALPHA"}
                    elif alpha_in == 0 and bravo_in == 0:
                        cmd_to_send = {"cmd": "FORCE_END_GAME"}
                    
                    if cmd_to_send:
                        data["game_state"] = 'WAITING_END_ACK' 
                        logger.info(f"[ARBITRO SERVER] Rilevata eliminazione team! Invio comando MQTT al nodo {dev_id}")
                        try:
                            mqtt_client.publish(f"zulu/cmd/{dev_id}", json.dumps(cmd_to_send))
                        except Exception as e:
                            logger.error(f"[ERROR MQTT FORCE_WIN] {e}")

        if tick_counter % 2 == 0:
            active_devs, removed_something = registry.get_active_devices()
            if removed_something and socketio:
                socketio.emit('devices_update', active_devs)
                
        if tick_counter % 10 == 0:
            weather_data = fetch_weather_callback()
            if socketio: socketio.emit('weather_update', {'weather': weather_data})