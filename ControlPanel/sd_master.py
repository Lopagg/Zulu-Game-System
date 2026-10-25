import time
import json
import logging

logger = logging.getLogger(__name__)

class SearchDestroyMaster:
    def __init__(self, mqtt_client, target_id, settings):
        self.mqtt = mqtt_client
        self.target_id = target_id
        
        # Recupero parametri (impostati dalla pagina Setup del Web)
        self.game_duration = settings.get('game_duration', 15) * 60
        self.bomb_time = settings.get('bomb_time', 10) * 60
        self.arm_time = settings.get('arm_time', 5)
        self.defuse_time = settings.get('defuse_time', 10)
        self.use_arm_pin = settings.get('use_arm_pin', True)
        self.use_defuse_pin = settings.get('use_defuse_pin', True)
        self.arm_pin = settings.get('arm_pin', "1234")
        self.defuse_pin = settings.get('defuse_pin', "4321")
        
        # Stati e timer interni
        self.state = "AWAIT_ARM"
        self.action_start_time = 0
        self.bomb_start_time = 0
        self.game_start_time = time.time()
        self.pin_buffer = ""
        self.last_telemetry_time = 0
        
        # Schermata iniziale inviata alla valigetta appena il gioco parte
        self._send_ui(
            lcd0="CERCA & DISTRUGGI", 
            lcd1="PIANTA LA BOMBA", 
            lcd2="Tieni premuto P1", 
            lcd3=f"per {self.arm_time} sec",
            oled1="INNESCA"
        )
        logger.info(f"[SD_MASTER] C&D avviato sul Thin Client: {self.target_id}")

    def _send_ui(self, lcd0="", lcd1="", lcd2="", lcd3="", oled1="", oled2="", led=None, sound=None, clear=True):
        """Prepara il pacchetto grafico e lo invia al RAT"""
        payload = {"cmd": "UPDATE_UI", "clear_lcd": clear, "clear_oled": clear}
        
        if lcd0: payload["lcd_0"] = lcd0
        if lcd1: payload["lcd_1"] = lcd1
        if lcd2: payload["lcd_2"] = lcd2
        if lcd3: payload["lcd_3"] = lcd3
        if oled1: payload["oled_1"] = oled1
        if oled2: payload["oled_2"] = oled2
        
        if led:
            payload["led_r"], payload["led_g"], payload["led_b"] = led
        else:
            payload["led_off"] = True
            
        if sound:
            payload["sound_freq"], payload["sound_dur"] = sound
        else:
            payload["sound_off"] = True
            
        self.mqtt.publish(f"zulu/cmd/{self.target_id}", json.dumps(payload))

    def handle_input(self, data):
        """Riceve la pressione dei pulsanti dalla valigetta ed esegue il calcolo."""
        if self.state in ["ENDED", "DEFUSED"]:
            return
            
        btn1 = data.get("btn1")
        btn2 = data.get("btn2")
        key = data.get("key")
        now = time.time()
        
        # 1. LOGICA INNESCO
        if self.state == "AWAIT_ARM":
            if btn1 == "click" or btn1 == "hold":
                self.state = "IS_ARMING"
                self.action_start_time = now
                self._send_ui(lcd1="INNESCO IN CORSO...", clear=True)
                
        elif self.state == "IS_ARMING":
            if not btn1:
                self.state = "AWAIT_ARM"
                self._send_ui(lcd1="PIANTA LA BOMBA", lcd2="Tieni premuto P1", oled1="INNESCA")
            else:
                elapsed = now - self.action_start_time
                if elapsed >= self.arm_time:
                    if self.use_arm_pin:
                        self.state = "ENTER_ARM_PIN"
                        self.pin_buffer = ""
                        self._send_ui(lcd0="INSERIRE PIN INNESCO", lcd2="_", oled1="ANNULLA")
                    else:
                        self._arm_bomb(now)
                else:
                    freq = int(400 + (800 * (elapsed / self.arm_time)))
                    self._send_ui(lcd1="INNESCO IN CORSO...", clear=False, sound=(freq, 100))

        elif self.state == "ENTER_ARM_PIN":
            if btn1 == "click":
                self.state = "AWAIT_ARM"
                self._send_ui(lcd1="PIANTA LA BOMBA", lcd2="Tieni premuto P1", oled1="INNESCA")
                return
            if key and key != '*':
                self.pin_buffer += key
                self._send_ui(lcd0="INSERIRE PIN INNESCO", lcd2=self.pin_buffer + "_", oled1="ANNULLA", sound=(700, 30))
                if len(self.pin_buffer) >= len(self.arm_pin):
                    if self.pin_buffer == self.arm_pin:
                        self._arm_bomb(now)
                    else:
                        self.pin_buffer = ""
                        self._send_ui(lcd1="PIN ERRATO", lcd2="Riprovare", sound=(200, 500))
                        time.sleep(1)
                        self._send_ui(lcd0="INSERIRE PIN INNESCO", lcd2="_", oled1="ANNULLA")

        # 2. LOGICA DISINNESCO
        elif self.state == "ARMED":
            if btn2 == "click" or btn2 == "hold":
                self.state = "IS_DEFUSING"
                self.action_start_time = now
                self._send_ui(lcd1="DISINNESCO IN CORSO...", clear=True)

        elif self.state == "IS_DEFUSING":
            if not btn2:
                self.state = "ARMED"
            else:
                elapsed = now - self.action_start_time
                if elapsed >= self.defuse_time:
                    if self.use_defuse_pin:
                        self.state = "ENTER_DEFUSE_PIN"
                        self.pin_buffer = ""
                        self._send_ui(lcd0="INSERIRE PIN", lcd2="_", oled1="ANNULLA", clear=True)
                    else:
                        self._defuse_bomb()
                else:
                    freq = int(1200 - (800 * (elapsed / self.defuse_time)))
                    self._send_ui(lcd1="DISINNESCO IN CORSO...", clear=False, sound=(freq, 100))
                    
        elif self.state == "ENTER_DEFUSE_PIN":
            if btn1 == "click":
                self.state = "ARMED"
                return
            if key and key != '*':
                self.pin_buffer += key
                self._send_ui(lcd0="INSERIRE PIN", lcd2=self.pin_buffer + "_", oled1="ANNULLA", sound=(700, 30))
                if len(self.pin_buffer) >= len(self.defuse_pin):
                    if self.pin_buffer == self.defuse_pin:
                        self._defuse_bomb()
                    else:
                        self.pin_buffer = ""
                        self._send_ui(lcd1="PIN ERRATO", lcd2="Riprovare", sound=(200, 500))
                        time.sleep(1)
                        self._send_ui(lcd0="INSERIRE PIN", lcd2="_", oled1="ANNULLA")

        self._send_telemetry(now)

    def _arm_bomb(self, now):
        self.state = "ARMED"
        self.bomb_start_time = now
        self._send_ui(lcd1="BOMBA INNESCATA!", oled2="DISINNESCA", led=(255, 0, 0), sound=(1500, 500))
        logger.info(f"[SD_MASTER] Bomba Innescata su {self.target_id}")

    def _defuse_bomb(self):
        self.state = "DEFUSED"
        self._send_ui(lcd1="BOMBA DISINNESCATA", lcd2="VINCONO I CT", led=(0, 255, 0), sound=(2000, 2000))
        logger.info(f"[SD_MASTER] Bomba Disinnescata su {self.target_id}")
        self._send_telemetry(time.time())

    def tick(self):
        """Funzione chiamata ciclicamente in background dal game_engine.py."""
        now = time.time()
        
        # Scadenza tempo globale (CT Vincono)
        game_elapsed = now - self.game_start_time
        if game_elapsed >= self.game_duration and self.state not in ["ENDED", "DEFUSED"]:
            self.state = "DEFUSED"
            self._send_ui(lcd1="TEMPO SCADUTO!", lcd2="VINCONO I CT", led=(0, 255, 0), sound=(2000, 2000))
            self._send_telemetry(now)
            return

        if self.state == "ARMED":
            remaining = int(self.bomb_time - (now - self.bomb_start_time))
            if remaining <= 0:
                self.state = "ENDED"
                self._send_ui(lcd1="BOMBA ESPLOSA!", lcd2="VINCONO I T", led=(255, 100, 0), sound=(2000, 2000))
            else:
                m, s = divmod(remaining, 60)
                timer_str = f"{m:02d} : {s:02d}"
                if remaining % 60 == 0:
                    self._send_ui(lcd1="BOMBA INNESCATA!", lcd2=timer_str, led=(255, 0, 0), sound=(1500, 150), clear=False)
                else:
                    self._send_ui(lcd1="BOMBA INNESCATA!", lcd2=timer_str, led=(50, 0, 0), clear=False)
                    
        # Ritmo di aggiornamento della telemetria web (~ 1 Hz)
        if now - self.last_telemetry_time >= 1.0:
            self._send_telemetry(now)
            self.last_telemetry_time = now

    def _send_telemetry(self, now):
        """Inganna il sistema inviando un finto aggiornamento hardware."""
        state_map = {
            "AWAIT_ARM": "SAFE",
            "IS_ARMING": "ARMING...",
            "ENTER_ARM_PIN": "ARMING...",
            "ARMED": "ARMED",
            "IS_DEFUSING": "DEFUSING...",
            "ENTER_DEFUSE_PIN": "DEFUSING...",
            "ENDED": "T WINS",
            "DEFUSED": "CT WINS"
        }
        
        arm_prog, def_prog, bomb_time = 0, 0, 0
        game_time = int(self.game_duration - (now - self.game_start_time))
        if game_time < 0: game_time = 0
        
        if self.state == "IS_ARMING": arm_prog = int(((now - self.action_start_time) / self.arm_time) * 100)
        elif self.state == "ENTER_ARM_PIN": arm_prog = 100
            
        if self.state == "IS_DEFUSING": def_prog = int(((now - self.action_start_time) / self.defuse_time) * 100)
        elif self.state == "ENTER_DEFUSE_PIN": def_prog = 100
            
        if self.state in ["ARMED", "IS_DEFUSING", "ENTER_DEFUSE_PIN"]:
            bomb_time = int(self.bomb_time - (now - self.bomb_start_time))
            if bomb_time < 0: bomb_time = 0
            
        doc = {
            "id": self.target_id,
            "type": "SD_UPDATE",
            "payload": {
                "mode": "SEARCH_AND_DESTROY",
                "state": state_map.get(self.state, "SAFE"),
                "arm_prog": arm_prog,
                "def_prog": def_prog,
                "bomb_time": bomb_time,
                "game_time": game_time
            }
        }
        # Invia l'aggiornamento al broker. Il file game_engine.py lo riceverà e lo inoltrerà al Web Monitor!
        self.mqtt.publish(f"zulu/telemetry/{self.target_id}", json.dumps(doc))