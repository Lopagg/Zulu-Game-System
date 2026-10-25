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
        self.global_duration = 0
        self.global_time_left = 0
        
        # Variabili di fazione per il Cerca e Distruggi
        self.sd_attacker_team = "ALPHA"  # Fazione che pianta la bomba
        self.sd_defender_team = "BRAVO"  # Fazione che disinnesca
        
        self.sd_settings = {}

    def start_mission(self, mode, target_id, duration=15):
        with self.lock:
            self.active_mission = True
            self.mode = mode
            self.target_id = target_id
            self.state = "ACTIVE" if mode == 'tdm' else "PREPARING"
            self.global_duration = duration * 60
            self.global_time_left = duration * 60
            
            # Se la modalità è S&D, memorizziamo le fazioni dal dizionario sd_settings
            if mode == 'sd':
                self.sd_attacker_team = self.sd_settings.get('attacker', "ALPHA")
                self.sd_defender_team = "BRAVO" if self.sd_attacker_team == "ALPHA" else "ALPHA"
                
            logger.info(f"[MISSION CONTROL] Missione Globale Avviata: {mode.upper()} su {target_id}")

    def end_mission(self):
        with self.lock:
            if not self.active_mission: return False
            self.active_mission = False
            self.state = "STANDBY"
            logger.info(f"[MISSION CONTROL] Missione Chiusa Definitivamente.")
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
        
        if msg_type not in ['HEARTBEAT', 'TIME_UPDATE', 'DOM_UPDATE', 'SD_UPDATE', 'TERMINAL_INPUT']:
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
            
            if msg_type == 'MODE_EXIT':
                if mission_control.is_authorized_node(device_id):
                    mission_control.end_mission()

            # --- ARBITRO EVENTI NEUTRALI S&D (Gestione Dinamica delle Fazioni) ---
            if msg_type == 'MATCH_EVENT':
                if mission_control.is_authorized_node(device_id) and mission_control.mode == 'sd':
                    event_name = payload.get('event')
                    cmd_to_send = None
                    
                    if event_name == 'BOMB_EXPLODED':
                        # Se la bomba esplode, vince la fazione Attaccante
                        cmd_to_send = {"cmd": "FORCE_WIN", "winner": mission_control.sd_attacker_team, "reason": "BOMBA ESPLOSA!"}
                    elif event_name == 'BOMB_DEFUSED':
                        # Se la bomba viene disinnescata, vince la fazione Difensore
                        cmd_to_send = {"cmd": "FORCE_WIN", "winner": mission_control.sd_defender_team, "reason": "BOMBA DISINNESCATA!"}
                    
                    if cmd_to_send:
                        try: mqtt_client.publish(f"zulu/cmd/{mission_control.target_id}", json.dumps(cmd_to_send))
                        except Exception as e: logger.error(f"[MQTT ERROR] Impossibile inviare verdetto: {e}")

            # AGGIORNA LA WEB UI
            if msg_type not in ['TAG_SCANNED', 'TAG_ASSIGN', 'TERMINAL_INPUT', 'MATCH_EVENT']:
                if msg_type in ['SD_UPDATE', 'DOM_UPDATE', 'COUNTDOWN_UPDATE', 'TIME_UPDATE', 'MODE_ENTER', 'MODE_EXIT', 'SETTINGS_UPDATE', 'TDM_UPDATE']:
                     if mission_control.is_authorized_node(device_id):
                          if msg_type == 'SD_UPDATE' and mission_control.state not in ['T WINS', 'CT WINS', 'ALPHA WINS', 'BRAVO WINS', 'DRAW', 'STOPPED']:
                              parsed['payload']['game_time'] = mission_control.global_time_left
                              
                              # UI MAPPING: Il Web Monitor si aspetta 'T WINS' o 'CT WINS', 
                              # quindi traduciamo temporaneamente ALPHA/BRAVO WINS prima di inviare al socket
                              if parsed['payload']['state'] == f"{mission_control.sd_attacker_team} WINS":
                                  parsed['payload']['state'] = 'T WINS'
                              elif parsed['payload']['state'] == f"{mission_control.sd_defender_team} WINS":
                                  parsed['payload']['state'] = 'CT WINS'
                                  
                          socketio.emit('esp_event', {"parsed_data": parsed})

            # --- ARBITRO DEL GAME OVER (Statistiche e Suoni) ---
            if msg_type in ['SD_UPDATE', 'DOM_UPDATE']:
                if mission_control.is_authorized_node(device_id):
                    new_state = payload.get('state')
                    old_state = registry.devices[device_id].get("game_state", "STANDBY")
                    
                    # Normalizzazione S&D per le statistiche: Il RAT manda 'T WINS', lo convertiamo nella fazione reale
                    if mission_control.mode == 'sd':
                        if new_state == 'T WINS': new_state = f"{mission_control.sd_attacker_team} WINS"
                        elif new_state == 'CT WINS': new_state = f"{mission_control.sd_defender_team} WINS"

                    if registry.update_telemetry(device_id, payload, new_state):
                        if new_state in ['T WINS', 'CT WINS', 'ALPHA WINS', 'BRAVO WINS', 'DRAW', 'STOPPED'] and old_state not in ['T WINS', 'CT WINS', 'ALPHA WINS', 'BRAVO WINS', 'DRAW', 'STOPPED']:
                            trigger_siren("SIREN_LONG")
                            db_manager.process_match_stats(new_state)
                            mission_control.state = new_state
                        if old_state == 'PREPARING' and new_state in ['ACTIVE', 'SAFE', 'NEUTRAL']:
                            mission_control.state = "ACTIVE"
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
            if mission_control.active_mission:
                
                # --- ARBITRO ELIMINAZIONI E TEMPO GLOBALE ---
                if mission_control.state == "ACTIVE":
                    if mission_control.global_time_left > 0:
                        mission_control.global_time_left -= 1
                    
                    match_ends = False
                    end_state_str = "ACTIVE"
                    
                    # 1. Regola: Tempo Scaduto
                    if mission_control.global_time_left <= 0:
                        match_ends = True
                        if mission_control.mode == 'tdm':
                            if alpha_in > bravo_in: end_state_str = "ALPHA WINS"
                            elif bravo_in > alpha_in: end_state_str = "BRAVO WINS"
                            else: end_state_str = "DRAW"
                        elif mission_control.mode == 'sd':
                            # Se il tempo scade in S&D, vince il Difensore
                            end_state_str = f"{mission_control.sd_defender_team} WINS"
                            
                    # 2. Regola: Eliminazione totale squadra
                    if alpha_in == 0 and bravo_in > 0:
                        match_ends = True
                        end_state_str = "BRAVO WINS"
                    elif bravo_in == 0 and alpha_in > 0:
                        match_ends = True
                        end_state_str = "ALPHA WINS"
                    elif alpha_in == 0 and bravo_in == 0:
                        match_ends = True
                        end_state_str = "DRAW" if mission_control.mode == 'tdm' else "STOPPED"
                    
                    if match_ends:
                        mission_control.state = end_state_str
                        
                        if mission_control.mode == 'tdm':
                            trigger_siren("SIREN_LONG") 
                            db_manager.process_match_stats(end_state_str)
                            doc = { "id": "SERVER-TDM", "type": "TDM_UPDATE", "payload": { "mode": "TEAM_DEATHMATCH", "state": end_state_str, "game_time": mission_control.global_time_left } }
                            if socketio: socketio.emit('esp_event', {"parsed_data": doc})
                            mqtt_client.publish("zulu/telemetry/SERVER-TDM", json.dumps(doc))
                        
                        elif mission_control.mode == 'sd':
                            cmd_to_send = None
                            
                            # Logica Asimmetrica S&D: Confrontiamo il vincitore con l'attaccante designato
                            if end_state_str == f"{mission_control.sd_attacker_team} WINS":
                                cmd_to_send = {"cmd": "FORCE_WIN", "winner": mission_control.sd_attacker_team, "reason": "SQUADRA ELIMINATA!"}
                            elif end_state_str == f"{mission_control.sd_defender_team} WINS":
                                reason_str = "SQUADRA ELIMINATA!" if (alpha_in == 0 or bravo_in == 0) else "TEMPO SCADUTO!"
                                cmd_to_send = {"cmd": "FORCE_WIN", "winner": mission_control.sd_defender_team, "reason": reason_str}
                            else:
                                cmd_to_send = {"cmd": "FORCE_END_GAME"}
                            
                            if cmd_to_send:
                                try: mqtt_client.publish(f"zulu/cmd/{mission_control.target_id}", json.dumps(cmd_to_send))
                                except: pass
                                
                elif mission_control.mode == 'tdm' and mission_control.state != "STANDBY":
                     doc = { "id": "SERVER-TDM", "type": "TDM_UPDATE", "payload": { "mode": "TEAM_DEATHMATCH", "state": mission_control.state, "game_time": 0 } }
                     if socketio: socketio.emit('esp_event', {"parsed_data": doc})
                     mqtt_client.publish("zulu/telemetry/SERVER-TDM", json.dumps(doc))

        if tick_counter % 2 == 0:
            active_devs, rem = registry.get_active_devices()
            if rem and socketio: socketio.emit('devices_update', active_devs)
        if tick_counter % 10 == 0:
            weather_data = fetch_weather_callback()
            if socketio: socketio.emit('weather_update', {'weather': weather_data})