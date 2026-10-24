import sqlite3
import datetime
import logging

logger = logging.getLogger(__name__)
DB_PATH = 'philanthropy_arena.db'

def get_current_time():
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def init_db():
    """Inizializza il database e crea le tabelle se non esistono."""
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute('''CREATE TABLE IF NOT EXISTS players
                     (uid TEXT PRIMARY KEY, alias TEXT, games_played INTEGER DEFAULT 0, wins INTEGER DEFAULT 0)''')
        
        # Aggiunta colonne retrocompatibili
        try: c.execute("ALTER TABLE players ADD COLUMN registered_at TEXT")
        except sqlite3.OperationalError: pass
        try: c.execute("ALTER TABLE players ADD COLUMN notes TEXT")
        except sqlite3.OperationalError: pass
        try: c.execute("ALTER TABLE players ADD COLUMN photo TEXT")
        except sqlite3.OperationalError: pass

        c.execute('''CREATE TABLE IF NOT EXISTS active_roster
                     (uid TEXT PRIMARY KEY, team TEXT, status TEXT)''')
        conn.commit()

def get_full_roster():
    """Restituisce il dizionario del roster attivo combinato con i nomi dei giocatori."""
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
            roster[r['uid']] = {
                'uid': r['uid'],
                'name': r['name'],
                'team': r['team'],
                'status': r['status']
            }
        return roster

def get_active_roster_status():
    """Recupera la lista cruda dei giocatori attualmente nel roster."""
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute("SELECT uid, team, status FROM active_roster")
        return c.fetchall()

def get_player_status(uid):
    """Restituisce lo stato (IN/FUORI) e il team di un operatore specifico."""
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute("SELECT status, team FROM active_roster WHERE uid = ?", (uid,))
        return c.fetchone()

def get_all_players():
    """Recupera l'elenco completo dei giocatori per il pannello Database."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute("SELECT * FROM players ORDER BY alias")
        return [dict(r) for r in c.fetchall()]

def get_player_profile(uid):
    """Recupera tutti i dati di un singolo profilo."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute("SELECT * FROM players WHERE uid = ?", (uid,))
        row = c.fetchone()
        return dict(row) if row else None

def register_player(uid, team):
    """Registra un nuovo giocatore e lo inserisce nel roster attivo."""
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute("INSERT OR IGNORE INTO players (uid, alias, registered_at) VALUES (?, ?, ?)", 
                  (uid, f"OP-{uid[:4]}", get_current_time()))
        c.execute("INSERT OR REPLACE INTO active_roster (uid, team, status) VALUES (?, ?, 'FUORI')", 
                  (uid, team))
        conn.commit()

def toggle_player_status(uid, current_status):
    """Inverte lo stato IN/FUORI del giocatore nel roster."""
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
    """Assegna vittorie e partite giocate agli operatori IN CAMPO al termine di un match."""
    winning_team = None
    if winner_state in ['ALPHA WINS', 'OWNED ALPHA', 'T WINS']:
        winning_team = 'ALPHA'
    elif winner_state in ['BRAVO WINS', 'OWNED BRAVO', 'CT WINS']:
        winning_team = 'BRAVO'
        
    try:
        with sqlite3.connect(DB_PATH) as conn:
            c = conn.cursor()
            c.execute("SELECT uid, team FROM active_roster WHERE status='IN'")
            players = c.fetchall()
            for uid, team in players:
                c.execute("UPDATE players SET games_played = games_played + 1 WHERE uid = ?", (uid,))
                if winning_team and team == winning_team:
                    c.execute("UPDATE players SET wins = wins + 1 WHERE uid = ?", (uid,))
            conn.commit()
            logger.info(f"[STATS] Aggiornate statistiche per {len(players)} operatori. Team Vittorioso: {winning_team or 'NESSUNO'}")
    except Exception as e:
        logger.error(f"[ERROR STATS] {e}")