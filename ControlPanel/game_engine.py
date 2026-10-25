import paho.mqtt.client as mqtt
import logging
import json
import time
from threading import Lock
import db_manager

logger = logging.getLogger(__name__)

class MissionController:
    def __init__(self):
        self.lock = Lock()
        self.active_mission = False
        self.mode = None
        self.target_id = None
        self.state = "STANDBY"
        self.tdm_duration = 0
        self.tdm_time_left = 0

    def start_mission(self, mode, target_id, duration=15):
        with self.lock:
            self.active_mission = True
            self.mode = mode
            self.target_id = target_id
            self.state = "ACTIVE" if mode == 'tdm' else "PREPARING"
            
            if mode == 'tdm':
                self.tdm_duration = duration * 60
                self.tdm_time_left = duration * 60
            
            logger.info(f"[MISSION CONTROL] Missione Globale Avviata dal Server: {mode.upper()} su {target_id}")

    def adopt_mission(self, mode, target_id):
        """Se una partita viene avviata localmente sul RAT e il server è libero, la adotta."""
        with self.lock:
            if not self.active_mission:
                self.active_mission = True
                self.mode = mode
                self.target_id = target_id
                self.state = "ACTIVE"
                logger.info(f"[MISSION CONTROL] Missione Locale Auto-Adottata: {mode.upper()} su {target_id}")
                return True
            return False

    def end_mission(self, final_state="STOPPED"):
        with self.lock:
            if not self.active_mission: return False
            self.active_mission = False
            self.state = final_state
            logger.info(f"[MISSION CONTROL] Missione Globale Terminata. Server sganciato.")
            return True

    def is_authorized_node(self, device_id):
        with self.lock:
            if not self.active_mission: return False
            if self.mode == 'tdm' or device_id == self.target_id: return True
            return False

mission_control = MissionController()

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
                self.devices[device_id] = { "id": device_id, "name": device_id, "type": "NODE", "mode": "BOOTING...", "version": "Unknown", "ip": "MQTT", "game_state": "STANDBY", "telemetry": {} }
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
                if now - data["last_seen"] > self.timeout_seconds: to_remove.append(d_id)
                else: active_list.append(data)
            for d_id in to_remove:
                del self.devices[d_id]
                needs_update = True
        return active_list, needs_update

registry = DeviceRegistry()
mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1)
socketio = None  
mission_ready_flag = False
background_thread_started = False

def trigger_siren(cmd_type="SIREN_LONG"):
    try: mqtt_client.publish("zulu/cmd/broadcast", json.dumps({"cmd": cmd_type}))
    except: pass

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
            if msg_type == 'KIOSK_CMD':
                if payload.get('cmd'): socketio.emit('kiosk_hardware_cmd', {'cmd': payload.get('cmd')})
                return

            elif msg_type == 'TAG_SCANNED':
                uid = payload.get('uid')
                reply_action = "UNKNOWN"
                if uid:
                    row = db_manager.get_player_status(uid)
                    if row:
                        new_status = db_manager.toggle_player_status(uid, row[0])
                        reply_action = f"{new_status}_{row[1]}" 
                        socketio.emit('roster_update', db_manager.get_full_roster())
                    else:
                        reply_action = "WAIT_ASSIGN"
                mqtt_client.publish(f"zulu/cmd/{device_id}", json.dumps({"cmd": "KIOSK_REPLY", "action": reply_action}))

            elif msg_type == 'TAG_ASSIGN':
                if payload.get('uid') and payload.get('team'):
                    db_manager.register_player(payload.get('uid'), payload.get('team'))
                    socketio.emit('roster_update', db_manager.get_full_roster())
            
            mode = payload.get('mode') or parsed.get('mode')
            version = payload.get('version') or parsed.get('version')
            has_changed = registry.update_device(device_id, msg_type, mode, version)
            
            # 1. AUTO-ADOZIONE: Se un RAT entra in modalità o avvia un countdown e noi siamo fermi, agganciamolo!
            if msg_type in ['MODE_ENTER', 'COUNTDOWN_UPDATE', 'SD_UPDATE', 'DOM_UPDATE']:
                if mode and not mission_control.active_mission:
                    mission_control.adopt_mission(mode, device_id)
            
            # 2. RILASCIO MISSIONE: Se il RAT esce esplicitamente al menu, scolleghiamo il server
            if msg_type == 'MODE_EXIT':
                if mission_control.is_authorized_node(device_id):
                    mission_control.end_mission()

            # 3. INVIO DATI ALLA UI (Solo per la missione attualmente adottata/avviata)
            if msg_type not in ['TAG_SCANNED', 'TAG_ASSIGN']:
                if msg_type in ['SD_UPDATE', 'DOM_UPDATE', 'COUNTDOWN_UPDATE', 'TIME_UPDATE', 'MODE_ENTER', 'MODE_EXIT', 'SETTINGS_UPDATE']:
                     if mission_control.is_authorized_node(device_id):
                          socketio.emit('esp_event', {"parsed_data": parsed})
                else:
                     socketio.emit('esp_event', {"parsed_data": parsed})

            # --- ARBITRO LOCALE ---
            if msg_type in ['SD_UPDATE', 'DOM_UPDATE']:
                if mission_control.is_authorized_node(device_id):
                    new_state = payload.get('state')
                    old_state = registry.devices[device_id].get("game_state", "STANDBY")
                    if registry.update_telemetry(device_id, payload, new_state):
                        if new_state in ['T WINS', 'CT WINS', 'ALPHA WINS', 'BRAVO WINS', 'DRAW', 'STOPPED'] and old_state not in ['T WINS', 'CT WINS', 'ALPHA WINS', 'BRAVO WINS', 'DRAW', 'STOPPED']:
                            trigger_siren("SIREN_LONG")
                            db_manager.process_match_stats(new_state)
                        if old_state == 'PREPARING' and new_state in ['ACTIVE', 'SAFE', 'NEUTRAL']:
                            trigger_siren("SIREN_LONG")
                            
            elif msg_type == 'MODE_ENTER':
                registry.update_telemetry(device_id, {}, "PREPARING")
            
            if has_changed:
                active_devs, _ = registry.get_active_devices()
                socketio.emit('devices_update', active_devs)
    except Exception as e:
        logger.error(f"[MQTT ERROR] Eccezione parsing: {e}")

mqtt_client.on_connect = on_mqtt_connect
mqtt_client.on_message = on_mqtt_message

def start_mqtt(sio_instance):
    global socketio
    socketio = sio_instance
    try:
        mqtt_client.connect("127.0.0.1", 1883, 60)
        mqtt_client.loop_start()
    except Exception as e:
        logger.error(f"[CRITICAL MQTT] {e}")

def background_cleanup(fetch_weather_callback):
    global mission_ready_flag
    tick_counter = 0
    while True:
        if socketio: socketio.sleep(1) 
        tick_counter += 1
        
        players = db_manager.get_active_roster_status()
        players_out = sum(1 for p in players if p[2] != 'IN')
        alpha_in = sum(1 for p in players if p[1] == 'ALPHA' and p[2] == 'IN')
        bravo_in = sum(1 for p in players if p[1] == 'BRAVO' and p[2] == 'IN')
        
        with mission_control.lock:
            game_is_running = mission_control.active_mission
        if game_is_running:
            mission_ready_flag = False

        try:
            mqtt_client.publish("zulu/cmd/NODE-KIOSK-1", json.dumps({"cmd": "KIOSK_LED_SYNC", "all_players_in": (players_out == 0) and (len(players) > 0), "game_running": game_is_running, "game_ready": mission_ready_flag}))
        except: pass

        with mission_control.lock:
            if mission_control.active_mission and mission_control.mode == 'tdm':
                if mission_control.tdm_time_left > 0: mission_control.tdm_time_left -= 1
                state_str = "ACTIVE"
                tdm_ends = False
                if alpha_in == 0 and bravo_in > 0: state_str = "BRAVO WINS"; tdm_ends = True
                elif bravo_in == 0 and alpha_in > 0: state_str = "ALPHA WINS"; tdm_ends = True
                elif alpha_in == 0 and bravo_in == 0: state_str = "DRAW"; tdm_ends = True
                elif mission_control.tdm_time_left <= 0:
                    if alpha_in > bravo_in: state_str = "ALPHA WINS"
                    elif bravo_in > alpha_in: state_str = "BRAVO WINS"
                    else: state_str = "DRAW"
                    tdm_ends = True
                if tdm_ends:
                    trigger_siren("SIREN_LONG") 
                    db_manager.process_match_stats(state_str)
                    mission_control.active_mission = False
                
                doc = { "id": "SERVER-TDM", "type": "TDM_UPDATE", "payload": { "mode": "TEAM_DEATHMATCH", "state": state_str, "game_time": mission_control.tdm_time_left } }
                if socketio: socketio.emit('esp_event', {"parsed_data": doc})
                mqtt_client.publish("zulu/telemetry/SERVER-TDM", json.dumps(doc))

        with mission_control.lock:
            if mission_control.active_mission and mission_control.target_id:
                if alpha_in == 0 or bravo_in == 0:
                    cmd_to_send = None
                    if alpha_in == 0 and bravo_in > 0: cmd_to_send = {"cmd": "FORCE_WIN", "winner": "BRAVO"}
                    elif bravo_in == 0 and alpha_in > 0: cmd_to_send = {"cmd": "FORCE_WIN", "winner": "ALPHA"}
                    elif alpha_in == 0 and bravo_in == 0: cmd_to_send = {"cmd": "FORCE_END_GAME"}
                    if cmd_to_send:
                        try: mqtt_client.publish(f"zulu/cmd/{mission_control.target_id}", json.dumps(cmd_to_send))
                        except: pass

        if tick_counter % 2 == 0:
            active_devs, rem = registry.get_active_devices()
            if rem and socketio: socketio.emit('devices_update', active_devs)
        if tick_counter % 10 == 0:
            weather_data = fetch_weather_callback()
            if socketio: socketio.emit('weather_update', {'weather': weather_data})