import sqlite3
import datetime
import logging

logger = logging.getLogger(__name__)
DB_PATH = 'philanthropy_arena.db'

def get_current_time():
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute('''CREATE TABLE IF NOT EXISTS players
                     (uid TEXT PRIMARY KEY, alias TEXT, games_played INTEGER DEFAULT 0, wins INTEGER DEFAULT 0)''')
        
        try: c.execute("ALTER TABLE players ADD COLUMN registered_at TEXT")
        except sqlite3.OperationalError: pass
        try: c.execute("ALTER TABLE players ADD COLUMN notes TEXT")
        except sqlite3.OperationalError: pass
        try: c.execute("ALTER TABLE players ADD COLUMN photo TEXT")
        except sqlite3.OperationalError: pass
        try: c.execute("ALTER TABLE players ADD COLUMN games_played INTEGER DEFAULT 0")
        except sqlite3.OperationalError: pass
        try: c.execute("ALTER TABLE players ADD COLUMN wins INTEGER DEFAULT 0")
        except sqlite3.OperationalError: pass
        try: c.execute("ALTER TABLE players ADD COLUMN deaths INTEGER DEFAULT 0") # <--- NUOVA COLONNA
        except sqlite3.OperationalError: pass
        try: c.execute("ALTER TABLE players ADD COLUMN karma INTEGER DEFAULT 0")
        except sqlite3.OperationalError: pass
        try: c.execute("ALTER TABLE players ADD COLUMN is_pro INTEGER DEFAULT 0")
        except sqlite3.OperationalError: pass
        try: c.execute("ALTER TABLE players ADD COLUMN tag_info TEXT DEFAULT 'NTAG215'")
        except sqlite3.OperationalError: pass
        try: c.execute("ALTER TABLE players ADD COLUMN original_alias TEXT")
        except sqlite3.OperationalError: pass
        try: c.execute("ALTER TABLE players ADD COLUMN asd_team TEXT DEFAULT 'NESSUNA'")
        except sqlite3.OperationalError: pass
        try: c.execute("ALTER TABLE players ADD COLUMN username TEXT UNIQUE")
        except sqlite3.OperationalError: pass
        try: c.execute("ALTER TABLE players ADD COLUMN password_hash TEXT")
        except sqlite3.OperationalError: pass

        c.execute("UPDATE players SET games_played = 0 WHERE games_played IS NULL")
        c.execute("UPDATE players SET wins = 0 WHERE wins IS NULL")
        c.execute("UPDATE players SET deaths = 0 WHERE deaths IS NULL") # <--- DEFAULT A 0
        c.execute("UPDATE players SET karma = 0 WHERE karma IS NULL")
        c.execute("UPDATE players SET is_pro = 0 WHERE is_pro IS NULL")
        c.execute("UPDATE players SET asd_team = 'NESSUNA' WHERE asd_team IS NULL")
        c.execute("UPDATE players SET original_alias = alias WHERE original_alias IS NULL")

        c.execute('''CREATE TABLE IF NOT EXISTS active_roster (uid TEXT PRIMARY KEY, team TEXT, status TEXT)''')
        c.execute('''CREATE TABLE IF NOT EXISTS device_aliases (device_id TEXT PRIMARY KEY, alias TEXT)''')
        c.execute('''CREATE TABLE IF NOT EXISTS factions_config (team_id TEXT PRIMARY KEY, display_name TEXT)''')
                     
        try: c.execute("ALTER TABLE factions_config ADD COLUMN hex_color TEXT")
        except sqlite3.OperationalError: pass
        try: c.execute("ALTER TABLE factions_config ADD COLUMN daily_wins INTEGER DEFAULT 0")
        except sqlite3.OperationalError: pass
        
        c.execute("INSERT OR IGNORE INTO factions_config (team_id, display_name, hex_color, daily_wins) VALUES ('ALPHA', 'ALPHA', '#ff3333', 0)")
        c.execute("INSERT OR IGNORE INTO factions_config (team_id, display_name, hex_color, daily_wins) VALUES ('BRAVO', 'BRAVO', '#55ff55', 0)")
        c.execute("UPDATE factions_config SET hex_color = '#ff3333' WHERE team_id = 'ALPHA' AND hex_color IS NULL")
        c.execute("UPDATE factions_config SET hex_color = '#55ff55' WHERE team_id = 'BRAVO' AND hex_color IS NULL")
        c.execute("UPDATE factions_config SET daily_wins = 0 WHERE daily_wins IS NULL")
        conn.commit()

def register_player_manual(uid, alias, is_pro, tag_info, asd_team):
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute("SELECT uid FROM players WHERE uid = ?", (uid,))
        if c.fetchone():
            c.execute("UPDATE players SET alias = ?, original_alias = ?, is_pro = ?, tag_info = ?, asd_team = ? WHERE uid = ?", (alias, alias, is_pro, tag_info, asd_team, uid))
        else:
            c.execute("INSERT INTO players (uid, alias, original_alias, registered_at, games_played, wins, karma, is_pro, tag_info, asd_team) VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?, ?)", 
                      (uid, alias, alias, get_current_time(), is_pro, tag_info, asd_team))
        conn.commit()

def get_factions_config():
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute("SELECT team_id, display_name, hex_color, daily_wins FROM factions_config")
        rows = c.fetchall()
        config = {
            'ALPHA': {'name': 'ALPHA', 'color': '#ff3333', 'daily_wins': 0},
            'BRAVO': {'name': 'BRAVO', 'color': '#55ff55', 'daily_wins': 0}
        }
        for row in rows:
            config[row[0]] = {'name': row[1], 'color': row[2] if row[2] else config[row[0]]['color'], 'daily_wins': row[3] or 0}
        return config

def set_faction_config(team_id, new_name, hex_color):
    if team_id not in ['ALPHA', 'BRAVO']: return False
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("UPDATE factions_config SET display_name = ?, hex_color = ? WHERE team_id = ?", (new_name, hex_color, team_id))
        conn.commit()
    return True

def update_faction_wins(team_id, wins):
    if team_id not in ['ALPHA', 'BRAVO']: return False
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("UPDATE factions_config SET daily_wins = ? WHERE team_id = ?", (wins, team_id))
        conn.commit()
    return True

# --- NUOVA FUNZIONE ---
def reset_daily_wins():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("UPDATE factions_config SET daily_wins = 0")
        conn.commit()
        logger.info("[DB] Vittorie di fazione odierne azzerate.")

def get_device_alias(device_id):
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute("SELECT alias FROM device_aliases WHERE device_id = ?", (device_id,))
        row = c.fetchone()
        return row[0] if row else None

def set_device_alias(device_id, alias):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("INSERT OR REPLACE INTO device_aliases (device_id, alias) VALUES (?, ?)", (device_id, alias))
        conn.commit()

def get_full_roster():
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute('''
            SELECT a.uid, p.alias as name, a.team, a.status 
            FROM active_roster a 
            JOIN players p ON a.uid = p.uid
        ''')
        rows = c.fetchall()
        roster = {}
        for r in rows:
            roster[r['uid']] = { 'uid': r['uid'], 'name': r['name'], 'team': r['team'], 'status': r['status'] }
        return roster

def get_active_roster_status():
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute("SELECT uid, team, status FROM active_roster")
        return c.fetchall()

def get_player_status(uid):
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute("SELECT status, team FROM active_roster WHERE uid = ?", (uid,))
        return c.fetchone()

def get_all_players():
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute("SELECT * FROM players ORDER BY alias")
        players = [dict(r) for r in c.fetchall()]
        # Rimuove le password prima di inviare i dati al Frontend
        for p in players: p.pop('password_hash', None)
        return players

def get_player_profile(uid):
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute("SELECT * FROM players WHERE uid = ?", (uid,))
        row = c.fetchone()
        return dict(row) if row else None

def register_player(uid, team):
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute("INSERT OR IGNORE INTO players (uid, alias, original_alias, registered_at) VALUES (?, ?, ?, ?)", 
                  (uid, f"OP-{uid[:4]}", f"OP-{uid[:4]}", get_current_time()))
        c.execute("INSERT OR REPLACE INTO active_roster (uid, team, status) VALUES (?, ?, 'FUORI')", 
                  (uid, team))
        conn.commit()

def toggle_player_status(uid, current_status):
    new_status = 'FUORI' if current_status == 'IN' else 'IN'
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute("UPDATE active_roster SET status = ? WHERE uid = ?", (new_status, uid))
        conn.commit()
    return new_status

def rename_player(uid, new_name):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("UPDATE players SET alias = ? WHERE uid = ?", (new_name, uid))
        conn.commit()

def swap_player_team(uid):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("UPDATE active_roster SET team = CASE WHEN team='ALPHA' THEN 'BRAVO' ELSE 'ALPHA' END WHERE uid = ?", (uid,))
        conn.commit()

def remove_from_roster(uid):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("DELETE FROM active_roster WHERE uid = ?", (uid,))
        conn.commit()

def delete_player_permanently(uid):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("DELETE FROM players WHERE uid = ?", (uid,))
        conn.execute("DELETE FROM active_roster WHERE uid = ?", (uid,))
        conn.commit()

def clear_active_roster():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("DELETE FROM active_roster")
        conn.commit()

def update_player_notes(uid, notes):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("UPDATE players SET notes = ? WHERE uid = ?", (notes, uid))
        conn.commit()

def update_player_photo(uid, filename):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("UPDATE players SET photo = ? WHERE uid = ?", (filename, uid))
        conn.commit()

def reset_player_stats(uid):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("UPDATE players SET games_played = 0, wins = 0, deaths = 0, karma = 0, notes = '' WHERE uid = ?", (uid,))
        conn.commit()

def delete_player_photo(uid):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("UPDATE players SET photo = NULL WHERE uid = ?", (uid,))
        conn.commit()

def update_player_karma(uid, new_karma):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("UPDATE players SET karma = ? WHERE uid = ?", (new_karma, uid))
        conn.commit()

def update_player_asd(uid, asd_team):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("UPDATE players SET asd_team = ? WHERE uid = ?", (asd_team, uid))
        conn.commit()

def toggle_pro_status(uid):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("UPDATE players SET is_pro = CASE WHEN is_pro = 1 THEN 0 ELSE 1 END WHERE uid = ?", (uid,))
        conn.commit()

def purge_guest_data():
    with sqlite3.connect(DB_PATH) as conn:
        # Aggiunto deaths = 0
        conn.execute("UPDATE players SET alias = original_alias, games_played = 0, wins = 0, deaths = 0, karma = 0, notes = '', photo = NULL, asd_team = 'NESSUNA' WHERE is_pro = 0")
        conn.commit()
        logger.info("[DB] Eseguita pulizia massiva (Purge) e ripristino per tutti i GUEST.")

def increment_death(uid):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("UPDATE players SET deaths = COALESCE(deaths, 0) + 1 WHERE uid = ?", (uid,))
        conn.commit()

def process_match_stats(winner_state):
    raw_state = str(winner_state).strip().upper()
    logger.info(f"[DB] Analisi verdetto di fine partita per statistiche: '{raw_state}'")
    
    # Rimosso 'DRAW'. Le partite fermate in manuale o annullate restano escluse.
    if raw_state in ['STOPPED', 'STANDBY', 'PREPARING']:
        logger.info("[DB] Nessuna partita valida salvata (Partita abortita o in preparazione).")
        return
        
    winning_team = None
    config = get_factions_config()
    alpha_name = config.get('ALPHA', {}).get('name', 'ALPHA').upper()
    bravo_name = config.get('BRAVO', {}).get('name', 'BRAVO').upper()
    
    # Se è pareggio, il winning_team resta volutamente None
    if raw_state == 'DRAW':
        winning_team = None
    elif "ALPHA" in raw_state or "T WINS" in raw_state or alpha_name in raw_state:
        winning_team = 'ALPHA'
    elif "BRAVO" in raw_state or "CT WINS" in raw_state or bravo_name in raw_state:
        winning_team = 'BRAVO'
        
    if not winning_team and raw_state != 'DRAW':
        logger.warning(f"[DB] ATTENZIONE: Impossibile determinare la squadra vincente da '{raw_state}'.")
        return

    try:
        with sqlite3.connect(DB_PATH) as conn:
            c = conn.cursor()
            
            c.execute("SELECT uid, team FROM active_roster")
            players = c.fetchall()
            p_count = 0
            w_count = 0
            for uid, team in players:
                p_count += 1
                # Incrementiamo in ogni caso le Partite Giocate per tutti
                c.execute("UPDATE players SET games_played = COALESCE(games_played, 0) + 1 WHERE uid = ?", (uid,))
                
                # Assegniamo le vittorie solo se non è pareggio e la squadra corrisponde
                if winning_team and team == winning_team:
                    w_count += 1
                    c.execute("UPDATE players SET wins = COALESCE(wins, 0) + 1 WHERE uid = ?", (uid,))
            
            if winning_team:
                c.execute("UPDATE factions_config SET daily_wins = COALESCE(daily_wins, 0) + 1 WHERE team_id = ?", (winning_team,))
            
            conn.commit()
            
            if winning_team:
                logger.info(f"[STATS SALVATE] +1 Partita a {p_count} giocatori | +1 Vittoria a {w_count} giocatori del Team {winning_team} e +1 Vittoria Fazione.")
            else:
                logger.info(f"[STATS SALVATE] PAREGGIO: +1 Partita aggiunta a {p_count} giocatori, nessuna vittoria assegnata.")
    except Exception as e:
        logger.error(f"[ERROR STATS] {e}")

def set_player_credentials(uid, username, password_hash):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("UPDATE players SET username = ?, password_hash = ? WHERE uid = ?", (username, password_hash, uid))
        conn.commit()

def get_player_by_username(username):
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute("SELECT * FROM players WHERE username = ?", (username,))
        row = c.fetchone()
        return dict(row) if row else None