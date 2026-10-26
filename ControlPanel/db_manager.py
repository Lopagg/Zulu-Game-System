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

        c.execute('''CREATE TABLE IF NOT EXISTS active_roster
                     (uid TEXT PRIMARY KEY, team TEXT, status TEXT)''')
                     
        c.execute('''CREATE TABLE IF NOT EXISTS device_aliases
                     (device_id TEXT PRIMARY KEY, alias TEXT)''')
        
        c.execute('''CREATE TABLE IF NOT EXISTS factions_config
                     (team_id TEXT PRIMARY KEY, display_name TEXT)''')
                     
        try: c.execute("ALTER TABLE factions_config ADD COLUMN hex_color TEXT")
        except sqlite3.OperationalError: pass
        
        c.execute("INSERT OR IGNORE INTO factions_config (team_id, display_name, hex_color) VALUES ('ALPHA', 'ALPHA', '#ff3333')")
        c.execute("INSERT OR IGNORE INTO factions_config (team_id, display_name, hex_color) VALUES ('BRAVO', 'BRAVO', '#55ff55')")
        
        c.execute("UPDATE factions_config SET hex_color = '#ff3333' WHERE team_id = 'ALPHA' AND hex_color IS NULL")
        c.execute("UPDATE factions_config SET hex_color = '#55ff55' WHERE team_id = 'BRAVO' AND hex_color IS NULL")
        conn.commit()

def get_factions_config():
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute("SELECT team_id, display_name, hex_color FROM factions_config")
        rows = c.fetchall()
        config = {
            'ALPHA': {'name': 'ALPHA', 'color': '#ff3333'},
            'BRAVO': {'name': 'BRAVO', 'color': '#55ff55'}
        }
        for row in rows:
            config[row[0]] = {'name': row[1], 'color': row[2] if row[2] else config[row[0]]['color']}
        return config

def set_faction_config(team_id, new_name, hex_color):
    if team_id not in ['ALPHA', 'BRAVO']: return False
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("UPDATE factions_config SET display_name = ?, hex_color = ? WHERE team_id = ?", (new_name, hex_color, team_id))
        conn.commit()
    return True

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
        return [dict(r) for r in c.fetchall()]

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
        c.execute("INSERT OR IGNORE INTO players (uid, alias, registered_at) VALUES (?, ?, ?)", 
                  (uid, f"OP-{uid[:4]}", get_current_time()))
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

def process_match_stats(winner_state):
    winning_team = None
    
    # Il backend ragiona solo sulle keyword standard.
    if winner_state in ['ALPHA WINS', 'OWNED ALPHA', 'T WINS']:
        winning_team = 'ALPHA'
    elif winner_state in ['BRAVO WINS', 'OWNED BRAVO', 'CT WINS']:
        winning_team = 'BRAVO'
        
    try:
        with sqlite3.connect(DB_PATH) as conn:
            c = conn.cursor()
            # Rimosso il filtro status='IN', ora processiamo chiunque sia nel roster attivo
            c.execute("SELECT uid, team FROM active_roster")
            players = c.fetchall()
            for uid, team in players:
                c.execute("UPDATE players SET games_played = games_played + 1 WHERE uid = ?", (uid,))
                if winning_team and team == winning_team:
                    c.execute("UPDATE players SET wins = wins + 1 WHERE uid = ?", (uid,))
            conn.commit()
            logger.info(f"[STATS] Aggiornate statistiche per {len(players)} operatori nel roster. Team Vittorioso: {winning_team or 'NESSUNO'}")
    except Exception as e:
        logger.error(f"[ERROR STATS] {e}")