import paho.mqtt.client as mqtt
import logging
import json
import time
from threading import Lock
import db_manager

logger = logging.getLogger(__name__)

socketio = None  
mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1)
mission_ready_flag = False
background_thread_started = False

def trigger_end_match_sequence(end_state):
    logger.info(f"[GAME ENGINE] Sequenza di Fine Partita innescata: {end_state}")
    try: mqtt_client.publish("zulu/cmd/broadcast", json.dumps({"cmd": "SIREN_LONG"}))
    except: pass
    
    db_manager.process_match_stats(end_state)
    
    if socketio:
        socketio.emit('database_update', db_manager.get_all_players())
        socketio.emit('factions_update', db_manager.get_factions_config())

class BaseGameMode:
    def __init__(self, mission_ctrl): self.mc = mission_ctrl
    def tick(self, alpha_in, bravo_in): pass 
    def handle_event(self, device_id, payload): pass 

class TDMEngine(BaseGameMode):
    def tick(self, alpha_in, bravo_in):
        mc = self.mc
        if mc.global_time_left > 0: mc.global_time_left -= 1
        match_ends = False
        end_state_str = "ACTIVE"
        
        if mc.global_time_left <= 0:
            match_ends = True
            if alpha_in > bravo_in: end_state_str = "ALPHA WINS"
            elif bravo_in > alpha_in: end_state_str = "BRAVO WINS"
            else: end_state_str = "DRAW"
            
        if alpha_in == 0 and bravo_in > 0:
            match_ends = True
            end_state_str = "BRAVO WINS"
        elif bravo_in == 0 and alpha_in > 0:
            match_ends = True
            end_state_str = "ALPHA WINS"
        elif alpha_in == 0 and bravo_in == 0:
            match_ends = True
            end_state_str = "DRAW"
            
        if match_ends:
            mc.state = end_state_str
            trigger_end_match_sequence(end_state_str)
            doc = { "id": "SERVER-TDM", "type": "TDM_UPDATE", "payload": { "mode": "TEAM_DEATHMATCH", "state": end_state_str, "game_time": mc.global_time_left } }
            if socketio: socketio.emit('esp_event', {"parsed_data": doc})
            mqtt_client.publish("zulu/telemetry/SERVER-TDM", json.dumps(doc), qos=1)
        else:
            if mc.state != "STANDBY":
                doc = { "id": "SERVER-TDM", "type": "TDM_UPDATE", "payload": { "mode": "TEAM_DEATHMATCH", "state": mc.state, "game_time": mc.global_time_left } }
                if socketio: socketio.emit('esp_event', {"parsed_data": doc})
                mqtt_client.publish("zulu/telemetry/SERVER-TDM", json.dumps(doc), qos=1)

class SDEngine(BaseGameMode):
    def tick(self, alpha_in, bravo_in):
        mc = self.mc
        if mc.global_time_left > 0: mc.global_time_left -= 1
        match_ends = False
        end_state_str = "ACTIVE"
        
        if mc.global_time_left <= 0:
            match_ends = True
            end_state_str = f"{mc.sd_defender_team} WINS"
            
        if alpha_in == 0 and bravo_in > 0:
            match_ends = True
            end_state_str = "BRAVO WINS"
        elif bravo_in == 0 and alpha_in > 0:
            match_ends = True
            end_state_str = "ALPHA WINS"
        elif alpha_in == 0 and bravo_in == 0:
            match_ends = True
            end_state_str = "STOPPED"
            
        if match_ends:
            mc.state = end_state_str
            cmd_to_send = None
            if end_state_str == f"{mc.sd_attacker_team} WINS":
                cmd_to_send = {"cmd": "FORCE_WIN", "winner": mc.sd_attacker_team, "reason": "SQUADRA ELIMINATA!"}
            elif end_state_str == f"{mc.sd_defender_team} WINS":
                reason_str = "SQUADRA ELIMINATA!" if (alpha_in == 0 or bravo_in == 0) else "TEMPO SCADUTO!"
                cmd_to_send = {"cmd": "FORCE_WIN", "winner": mc.sd_defender_team, "reason": reason_str}
            else:
                cmd_to_send = {"cmd": "FORCE_END_GAME"}
            
            if cmd_to_send:
                try: mqtt_client.publish(f"zulu/cmd/{mc.target_id}", json.dumps(cmd_to_send), qos=1)
                except: pass

    def handle_event(self, device_id, payload):
        mc = self.mc
        event_name = payload.get('event')
        cmd_to_send = None
        
        # FIX: Il server C++ usa "winnerTeam.indexOf("ALPHA")" in SearchDestroyMode.cpp riga 544
        # Quindi diamogli esattamente il NOME DELLA SQUADRA (ALPHA o BRAVO), non T/CT!
        if event_name == 'BOMB_EXPLODED':
            cmd_to_send = {"cmd": "FORCE_WIN", "winner": mc.sd_attacker_team, "reason": "BOMBA ESPLOSA!"}
        elif event_name == 'BOMB_DEFUSED':
            cmd_to_send = {"cmd": "FORCE_WIN", "winner": mc.sd_defender_team, "reason": "BOMBA DISINNESCATA!"}
            
        if cmd_to_send:
            try: mqtt_client.publish(f"zulu/cmd/{mc.target_id}", json.dumps(cmd_to_send), qos=1)
            except Exception as e: logger.error(f"[MQTT ERROR] Impossibile inviare verdetto: {e}")

class MissionController:
    def __init__(self):
        self.lock = Lock()
        self.active_mission = False
        self.mode = None
        self.target_id = None
        self.state = "STANDBY"
        self.global_duration = 0
        self.global_time_left = 0
        self.sd_attacker_team = "ALPHA"
        self.sd_defender_team = "BRAVO"
        self.sd_settings = {}
        self.active_engine = None 

    def start_mission(self, mode, target_id, duration=15):
        with self.lock:
            self.active_mission = True
            self.mode = mode
            self.target_id = target_id
            self.state = "ACTIVE" if mode == 'tdm' else "PREPARING"
            self.global_duration = duration * 60
            self.global_time_left = duration * 60
            
            if mode == 'sd':
                self.sd_attacker_team = self.sd_settings.get('attacker', "ALPHA")
                self.sd_defender_team = "BRAVO" if self.sd_attacker_team == "ALPHA" else "ALPHA"
                self.active_engine = SDEngine(self)
            elif mode == 'tdm':
                self.active_engine = TDMEngine(self)
            else:
                self.active_engine = BaseGameMode(self) 
                
            logger.info(f"[MISSION CONTROL] Missione Globale Avviata: {mode.upper()} su {target_id}")

        if target_id and target_id != "SERVER-TDM":
            try:
                config = db_manager.get_factions_config()
                def hex_to_rgb(hex_code):
                    if not hex_code: return (255, 255, 255)
                    hex_code = str(hex_code).lstrip('#')
                    return tuple(int(hex_code[i:i+2], 16) for i in (0, 2, 4))
                
                # FIX: Ripristinato T1=ALPHA e T2=BRAVO, così i Kiosk possono 
                # purificare correttamente l'RGB!
                payload = {
                    "cmd": "SET_FACTIONS",
                    "t1": config.get('ALPHA', {}).get('name', 'ALPHA'), 
                    "t1_c": hex_to_rgb(config.get('ALPHA', {}).get('color', '#ff3333')),
                    "t2": config.get('BRAVO', {}).get('name', 'BRAVO'), 
                    "t2_c": hex_to_rgb(config.get('BRAVO', {}).get('color', '#55ff55'))
                }
                mqtt_client.publish(f"zulu/cmd/{target_id}", json.dumps(payload))
            except Exception as e:
                logger.error(f"[START MISSION FACTION SYNC ERROR] {e}")

    def end_mission(self):
        with self.lock:
            if not self.active_mission: return False
            self.active_mission = False
            self.state = "STANDBY"
            self.active_engine = None
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
                saved_alias = db_manager.get_device_alias(device_id)
                display_name = saved_alias if saved_alias else device_id
                self.devices[device_id] = { "id": device_id, "name": display_name, "type": "NODE", "mode": "BOOTING...", "version": "Unknown", "ip": "MQTT", "game_state": "STANDBY", "telemetry": {} }
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
                db_manager.set_device_alias(device_id, new_name)
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


def on_mqtt_connect(client, userdata, flags, rc):
    logger.info(f"[MQTT] Connesso al Broker con codice: {rc}")
    client.subscribe("zulu/telemetry/#")

def on_mqtt_message(client, userdata, msg):
    global mission_ready_flag 
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
                cmd_str = payload.get('cmd')
                if cmd_str: 
                    if cmd_str == "GAME_START":
                        can_override_start = not mission_control.active_mission or mission_control.state not in ["ACTIVE", "PREPARING"]
                        
                        if mission_ready_flag and can_override_start:
                            target = mission_control.target_id
                            mode = mission_control.mode
                            dur = int(mission_control.global_duration / 60) if mission_control.global_duration > 0 else 15
                            
                            if target and mode:
                                logger.info(f"[KIOSK OVERRIDE] Avvio Hardware Missione: {mode} su {target}")
                                mission_control.start_mission(mode, target, duration=dur)
                                
                                if mode == 'tdm':
                                    doc = { "id": "SERVER-TDM", "type": "MODE_ENTER", "payload": {"mode": "TEAM_DEATHMATCH"} }
                                    socketio.emit('esp_event', {"parsed_data": doc})
                                    try: mqtt_client.publish("zulu/cmd/broadcast", json.dumps({"cmd": "SIREN_LONG"}))
                                    except: pass
                                else:
                                    cmd_start = "START_SD_GAME" if mode == 'sd' else "START_DOM_GAME"
                                    mqtt_client.publish(f"zulu/cmd/{target}", json.dumps({"cmd": cmd_start}))
                                    
                                socketio.emit('mission_start_success') 
                    
                    elif cmd_str == "FORCE_END_GAME":
                        with mission_control.lock:
                            if mission_control.active_mission:
                                logger.info("[KIOSK OVERRIDE] Chiusura Forzata Hardware della Missione")
                                
                                if mission_control.mode == 'tdm':
                                    mission_control.state = "STOPPED"
                                    trigger_end_match_sequence("STOPPED")
                                    doc = { "id": "SERVER-TDM", "type": "TDM_UPDATE", "payload": { "mode": "TEAM_DEATHMATCH", "state": "STOPPED", "game_time": mission_control.global_time_left } }
                                    socketio.emit('esp_event', {"parsed_data": doc})
                                else:
                                    mqtt_client.publish(f"zulu/cmd/{mission_control.target_id}", json.dumps({"cmd": "FORCE_END_GAME"}), qos=1)

                    socketio.emit('kiosk_hardware_cmd', {'cmd': cmd_str})
                return

            elif msg_type == 'TAG_SCANNED':
                uid = payload.get('uid')
                reply_action = "UNKNOWN"
                if uid:
                    if socketio: socketio.emit('raw_tag_scanned', {'uid': uid})
                    
                    row = db_manager.get_player_status(uid)
                    if row:
                        new_status = db_manager.toggle_player_status(uid, row[0])
                        reply_action = f"{new_status}_{row[1]}" 
                        socketio.emit('roster_update', db_manager.get_full_roster())
                    else:
                        reply_action = "WAIT_ASSIGN"
                mqtt_client.publish(f"zulu/cmd/{device_id}", json.dumps({"cmd": "KIOSK_REPLY", "action": reply_action}), qos=1)

            elif msg_type == 'TAG_ASSIGN':
                if payload.get('uid') and payload.get('team'):
                    db_manager.register_player(payload.get('uid'), payload.get('team'))
                    socketio.emit('roster_update', db_manager.get_full_roster())
            
            mode = payload.get('mode') or parsed.get('mode')
            version = payload.get('version') or parsed.get('version')
            has_changed = registry.update_device(device_id, msg_type, mode, version)

            if msg_type == 'MODE_CHANGE' and parsed.get('payload', {}).get('new_mode') == 'MAIN_MENU':
                if mission_control.active_mission and device_id == mission_control.target_id:
                    if mission_control.state == "PAUSED_OFFLINE":
                        mission_control.state = "PREPARING"
                    last_tel = registry.devices.get(device_id, {}).get("telemetry", {})
                    sd_state = last_tel.get("state", "SAFE")
                    bomb_time = last_tel.get("bomb_time", 0)
                    
                    resume_payload = {
                        "cmd": "RESUME_MISSION",
                        "mode": mission_control.mode,
                        "sd_state": sd_state,
                        "bomb_time_left": bomb_time,
                        "global_time_left": mission_control.global_time_left
                    }
                    try: mqtt_client.publish(f"zulu/cmd/{device_id}", json.dumps(resume_payload), qos=1)
                    except Exception as e: logger.error(f"[DISASTER RECOVERY ERROR] {e}")
            
            if msg_type == 'MODE_EXIT':
                if mission_control.is_authorized_node(device_id):
                    if payload.get('mode') == 'OFFLINE':
                        logger.warning(f"[WARNING] Nodo {device_id} andato offline durante una missione!")
                        mission_control.state = "PAUSED_OFFLINE"
                    else:
                        mission_control.end_mission()

            if msg_type == 'MATCH_EVENT':
                if mission_control.is_authorized_node(device_id) and mission_control.active_engine:
                    mission_control.active_engine.handle_event(device_id, payload)

            if msg_type == 'SETTINGS_UPDATE' and not mission_control.active_mission:
                if payload.get("bomb_time") is not None:
                    # Rimuoviamo il salvataggio in locale: il web comanda!
                    pass

            if msg_type in ['MODE_ENTER', 'SD_UPDATE', 'DOM_UPDATE']:
                if mission_control.is_authorized_node(device_id):
                    if mission_control.mode == 'sd' and mission_control.sd_settings:
                        # Iniettiamo costantemente i settaggi (es. attacker, duration) per il web
                        for k, v in mission_control.sd_settings.items():
                            if k not in ['cmd', 'target_id']:
                                parsed['payload'][k] = v

            if msg_type not in ['TAG_SCANNED', 'TAG_ASSIGN', 'TERMINAL_INPUT', 'MATCH_EVENT']:
                if msg_type in ['SD_UPDATE', 'DOM_UPDATE', 'COUNTDOWN_UPDATE', 'TIME_UPDATE', 'MODE_ENTER', 'MODE_EXIT', 'TDM_UPDATE']:
                     if mission_control.is_authorized_node(device_id):
                          if msg_type == 'SD_UPDATE':
                              state = parsed['payload'].get('state', '')
                              parsed['payload']['game_time'] = mission_control.global_time_left
                              
                              # Ora il C++ manda direttamente T WINS/CT WINS (offline) o "ALPHA WINS" (online dal server)
                              # Se per caso arriva T WINS, traduciamo l'attaccante correttamente.
                              if state == 'T WINS': parsed['payload']['state'] = f"{mission_control.sd_attacker_team} WINS"
                              elif state == 'CT WINS': parsed['payload']['state'] = f"{mission_control.sd_defender_team} WINS"
                              
                          socketio.emit('esp_event', {"parsed_data": parsed})

            if msg_type in ['SD_UPDATE', 'DOM_UPDATE']:
                if mission_control.is_authorized_node(device_id):
                    new_state = payload.get('state')
                    old_state = registry.devices[device_id].get("game_state", "STANDBY")
                    
                    if mission_control.mode == 'sd':
                        # Interpretiamo per il database
                        if new_state == 'T WINS': new_state = f"{mission_control.sd_attacker_team} WINS"
                        elif new_state == 'CT WINS': new_state = f"{mission_control.sd_defender_team} WINS"

                    if registry.update_telemetry(device_id, payload, new_state):
                        if new_state in ['T WINS', 'CT WINS', 'ALPHA WINS', 'BRAVO WINS', 'DRAW', 'STOPPED'] and old_state not in ['T WINS', 'CT WINS', 'ALPHA WINS', 'BRAVO WINS', 'DRAW', 'STOPPED']:
                            trigger_end_match_sequence(new_state)
                            mission_control.state = new_state
                        
                        if old_state == 'PREPARING' and new_state in ['ACTIVE', 'SAFE', 'NEUTRAL']:
                            mission_control.state = "ACTIVE"
                            try: mqtt_client.publish("zulu/cmd/broadcast", json.dumps({"cmd": "SIREN_LONG"}))
                            except: pass
                            
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
            game_is_running = mission_control.active_mission and mission_control.state in ["ACTIVE", "PREPARING"]
            
        if game_is_running:
            mission_ready_flag = False

        try:
            mqtt_client.publish("zulu/cmd/NODE-KIOSK-1", json.dumps({
                "cmd": "KIOSK_LED_SYNC", 
                "all_players_in": (players_out == 0) and (len(players) > 0), 
                "game_running": game_is_running, 
                "game_ready": mission_ready_flag,
                "mission_state": mission_control.state  
            }))
        except: pass

        with mission_control.lock:
            if mission_control.active_mission and mission_control.state == "ACTIVE":
                if mission_control.active_engine:
                    mission_control.active_engine.tick(alpha_in, bravo_in)

        if tick_counter % 2 == 0:
            active_devs, rem = registry.get_active_devices()
            if rem and socketio: socketio.emit('devices_update', active_devs)
        
        if tick_counter % 10 == 0:
            weather_data = fetch_weather_callback()
            if socketio: socketio.emit('weather_update', {'weather': weather_data})
            
            with mission_control.lock:
                if mission_control.active_mission and mission_control.state == "ACTIVE" and mission_control.target_id:
                    if mission_control.mode in ['sd', 'dom']:
                        sync_payload = {
                            "cmd": "SYNC_TIME",
                            "global_time_left": mission_control.global_time_left
                        }
                        try:
                            mqtt_client.publish(f"zulu/cmd/{mission_control.target_id}", json.dumps(sync_payload), qos=0)
                        except Exception as e:
                            logger.error(f"[SYNC ERROR] {e}")