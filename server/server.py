#!/usr/bin/env python3
"""Lokal-Intranet-Hub: liefert die Seite (Ordner src/) aus und speichert Termine, Urlaube, Notizen und das Depot
in einer SQLite-Datenbank, damit jedes Gerät dieselben Daten sieht. Braucht nur Python 3 (keine Zusatzpakete).

Starten:  python3 server/server.py            → http://127.0.0.1:8080
Einstellungen über Umgebungsvariablen (im Docker-Image schon gesetzt):
  PORT               Port (Standard 8080)
  WEB_ORDNER         Ordner mit der Seite (Standard ../src)
  DATENBANK          Datenbank-Datei (Standard ../daten/intranet.db)
  SPOTIFY_CLIENT_ID      Client-ID der eigenen Spotify-App (optional, siehe README)
  SPOTIFY_CLIENT_SECRET  Client-Secret dieser App – bleibt auf dem Server, kommt nie in den Browser
  SPOTIFY_REDIRECT       Redirect URI, wie im Spotify-Dashboard eingetragen (Standard http://127.0.0.1:8888/callback)
  UPDATE_REPO        GitHub-Repository für automatische Updates, z. B. eliasprey/Lokal-Intranet-Hub (leer = aus)
  UPDATE_ZWEIG       Zweig, der verfolgt wird (Standard main)
  UPDATE_MINUTEN     so oft nach Updates sehen (Standard 15, 0 = aus) – in der Seite unter Einstellungen änderbar
  GITHUB_API         Adresse der GitHub-API (Standard https://api.github.com; zum Testen änderbar)
  SPOTIFY_ACCOUNTS, SPOTIFY_API  Adressen von Spotify (nur zum Testen ändern)
  KURS_API           Adresse von Yahoo Finance (Standard https://query1.finance.yahoo.com; nur zum Testen ändern)
  ZEITZONE           Zeitzone für die Uhrzeiten der Google-Termine (Standard Europe/Berlin)
  APP_VERSION        Commit, aus dem der laufende Code stammt (setzt das Docker-Image bzw. das Update)
  APP_DATUM          Zeitpunkt dieses Commits (ISO 8601) – daraus wird die angezeigte Version v<Jahr>.<Monat>.<Tag>;
                     fehlt er, holt ihn die erste Update-Prüfung von GitHub

Updates: Gibt es auf GitHub einen neuen Commit, lädt der Server src/ und server/ nach <Datenbank-Ordner>/code/<commit>,
prüft sie und startet sich mit dem neuen Code neu. Die Seiten im Browser merken das über /api/version und laden neu.

Schnittstelle:
  GET  /api/daten         → { version, termine: { 'JJJJ-MM-TT': [{ id, zeit, text }] }, urlaube: [...], notizen,
                              depot: [{ id, symbol, name, art, boerse, menge, einkauf }],
                              profil: { name, hub, ort: { name, info, lat, lon, bundesland } | null }, shortcuts: [{ id, name, url }],
                              sicherheit: { pin, gesperrt } }
                            Mit "If-None-Match" kommt 304 zurück, solange sich nichts geändert hat.
  POST /api/aenderungen   ← [{ op, ... }, ...] – alle Änderungen eines Geräts, der Reihe nach (siehe aendern()).
                          → { version, abgelehnt: [...] } – ungültige Änderungen werden übersprungen.
  GET  /api/version       → { version, datum, update: { aktiv, modus, minuten, uhr, repo, geprueft, neuester, fehler, laeuft, naechste } } – Commit des laufenden
                            Codes und Ergebnis der letzten Update-Prüfung (zur Fehlersuche)
  POST /api/update/jetzt  → sofort auf GitHub nach einer neuen Version sehen (Einstellungen: „Aktuellste Version ziehen“)
  POST /api/update/modus  ← { modus: 'minuten' | 'taeglich' | 'aus' } – wie oft von selbst nach Updates gesehen wird
  POST /api/sicherheit    ← { aktion: 'pruefen' | 'pin-an' | 'pin-aus' | 'sperren' | 'entsperren', pin, neu }
                          → { pin, gesperrt } – PIN der Einstellungen und Sperre der Konfiguration (Einstellungen → Sicherheit)
  GET  /api/finanzen/suche?q=…           → [{ symbol, name, art, boerse }] – Aktien, ETFs und Fonds (Yahoo Finance)
  GET  /api/finanzen/kurse?symbole=A,B   → { A: { kurs, zeit, waehrung, name, ref: { tag, woche, monat, jahr, ytd },
                                                eur: { kurs, ref } } | { fehler } } – ref = Schlusskurs zu Beginn des Zeitraums
  GET  /api/finanzen/live?symbole=A,B    → { A: { kurs, zeit, eur } | { fehler } } – aktueller Kurs (alle paar Sekunden abfragbar),
                                           eur = Wechselkurs in Euro
  GET  /api/finanzen/verlauf?symbole=A,B&zeitraum=1t|1w|1m|3m|1j|3j|5j|max
                                         → { A: { waehrung, punkte: [[zeit, kurs]], eur: [[zeit, kurs]] } | { fehler } }
                                           – Kursverlauf fürs Diagramm, eur = Wechselkurs im selben Zeitraum (fehlt bei Euro)
  GET  /api/google?von=JJJJ-MM-TT&bis=JJJJ-MM-TT → { kalender: [{ id, name, fehler }], termine: { 'JJJJ-MM-TT': [{ zeit, text }] } }
                                           – Termine der verbundenen Google Kalender (höchstens 400 Tage)
  POST /api/google/kalender         ← { adresse } – Google Kalender über seine geheime iCal-Adresse verbinden
  POST /api/google/entfernen        ← { id }
  GET  /api/spotify/status          → { eingerichtet, angemeldet, rueckSprung, anmeldeUrl }
  POST /api/spotify/code            ← { adresse } – Adresse, auf die Spotify nach der Anmeldung weitergeleitet hat
  POST /api/spotify/abmelden
  GET|PUT|POST /api/spotify/web/…   → wird an die Spotify Web API (/v1/…) weitergereicht, nur /me…, /search,
                                      /playlists/… und /albums/…
"""
import base64
import calendar
import datetime
import hashlib
import hmac
import itertools
import json
import os
import re
import secrets
import shutil
import signal
import sqlite3
import sys
import tarfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import zoneinfo
from concurrent.futures import ThreadPoolExecutor
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HIER = Path(__file__).resolve().parent
WEB = Path(os.environ.get('WEB_ORDNER') or HIER.parent / 'src')
DATENBANK = Path(os.environ.get('DATENBANK') or HIER.parent / 'daten' / 'intranet.db')
PORT = int(os.environ.get('PORT') or 8080)
SPOTIFY_ID = re.sub(r'[^A-Za-z0-9]', '', os.environ.get('SPOTIFY_CLIENT_ID', ''))
SPOTIFY_SECRET = re.sub(r'[^A-Za-z0-9]', '', os.environ.get('SPOTIFY_CLIENT_SECRET', ''))
SPOTIFY_RUECKSPRUNG = os.environ.get('SPOTIFY_REDIRECT') or 'http://127.0.0.1:8888/callback'
SPOTIFY_KONTEN = (os.environ.get('SPOTIFY_ACCOUNTS') or 'https://accounts.spotify.com').rstrip('/')   # zum Testen änderbar
SPOTIFY_API = (os.environ.get('SPOTIFY_API') or 'https://api.spotify.com').rstrip('/')
MAX_ANFRAGE = 1_000_000                  # Bytes je Anfrage (Notizen + viele Termine passen locker)
APP_VERSION = os.environ.get('APP_VERSION', '')
APP_DATUM = os.environ.get('APP_DATUM', '')
UPDATE_REPO = os.environ.get('UPDATE_REPO', '').strip().strip('/')
UPDATE_ZWEIG = os.environ.get('UPDATE_ZWEIG') or 'main'
UPDATE_MINUTEN = float(os.environ.get('UPDATE_MINUTEN') or 15)
GITHUB_API = (os.environ.get('GITHUB_API') or 'https://api.github.com').rstrip('/')
KURS_API = (os.environ.get('KURS_API') or 'https://query1.finance.yahoo.com').rstrip('/')

# ================= Datenbank =================
DATENBANK.parent.mkdir(parents=True, exist_ok=True)
db = sqlite3.connect(DATENBANK, check_same_thread=False, isolation_level=None)
db.execute('PRAGMA journal_mode=WAL')
db.executescript('''
  CREATE TABLE IF NOT EXISTS termine (id TEXT PRIMARY KEY, datum TEXT NOT NULL, zeit TEXT NOT NULL DEFAULT '', text TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS urlaube (id TEXT PRIMARY KEY, text TEXT NOT NULL, von TEXT NOT NULL, bis TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS werte   (name TEXT PRIMARY KEY, wert TEXT NOT NULL);   -- 'notizen', 'version'
  -- Depot: menge und einkauf (Einkaufskurs pro Stück in Euro) als Text, damit Nachkommastellen genau bleiben; einkauf '' = nicht angegeben
  CREATE TABLE IF NOT EXISTS depot   (id TEXT PRIMARY KEY, symbol TEXT NOT NULL, name TEXT NOT NULL, art TEXT NOT NULL,
                                      boerse TEXT NOT NULL, menge TEXT NOT NULL, einkauf TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS shortcuts (id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL);
''')
sperre = threading.Lock()                # eine Verbindung für alle Anfragen, immer nur eine gleichzeitig

# Beim allerersten Start zwei Beispiel-Shortcuts anlegen (danach nie wieder – auch nicht, wenn alle gelöscht wurden)
if not db.execute("SELECT 1 FROM werte WHERE name = 'shortcuts_angelegt'").fetchone():
    db.executemany('INSERT OR IGNORE INTO shortcuts (id, name, url) VALUES (?, ?, ?)',
                   [('start1', 'Google Kalender', 'https://calendar.google.com'), ('start2', 'Gmail', 'https://mail.google.com')])
    db.execute("INSERT INTO werte (name, wert) VALUES ('shortcuts_angelegt', '1')")


def wert(name, standard=''):
    zeile = db.execute('SELECT wert FROM werte WHERE name = ?', (name,)).fetchone()
    return zeile[0] if zeile else standard


def setze(name, inhalt):
    db.execute('INSERT INTO werte (name, wert) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET wert = excluded.wert', (name, str(inhalt)))


def version():
    return int(wert('version', '0'))


def alles():
    termine = {}
    for id_, datum, zeit, text in db.execute('SELECT id, datum, zeit, text FROM termine ORDER BY rowid'):
        termine.setdefault(datum, []).append({'id': id_, 'zeit': zeit, 'text': text})
    urlaube = [{'id': i, 'text': t, 'von': v, 'bis': b} for i, t, v, b in db.execute('SELECT id, text, von, bis FROM urlaube ORDER BY rowid')]
    depot = [dict(zip(('id', 'symbol', 'name', 'art', 'boerse', 'menge', 'einkauf'), z))
             for z in db.execute('SELECT id, symbol, name, art, boerse, menge, einkauf FROM depot ORDER BY rowid')]
    shortcuts = [{'id': i, 'name': n, 'url': u} for i, n, u in db.execute('SELECT id, name, url FROM shortcuts ORDER BY rowid')]
    return {'version': version(), 'termine': termine, 'urlaube': urlaube, 'notizen': wert('notizen'), 'depot': depot,
            'profil': profil(), 'shortcuts': shortcuts, 'sicherheit': sicherheit()}


# Persönliche Angaben (Einstellungen → Persönliche Angaben / Intranet-Name): Name für die Begrüßung, Name des Intranets
# oben links und der Ort für Wetter, Sonnenzeiten und Feiertage (Bundesland). Gespeichert als JSON im Wert 'profil'.
BUNDESLAENDER = ('BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH')


def profil():
    try:
        p = json.loads(wert('profil', '{}'))
    except ValueError:
        p = {}
    return {'name': p.get('name', ''), 'hub': p.get('hub', ''), 'ort': p.get('ort')}


def ort_pruefen(o):
    if o is None:
        return None
    if not isinstance(o, dict):
        raise Ungueltig('ort muss ein Objekt sein')
    lat, lon = o.get('lat'), o.get('lon')
    if not all(isinstance(x, (int, float)) and not isinstance(x, bool) for x in (lat, lon)) or not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise Ungueltig('ort: lat/lon fehlen oder sind falsch')
    bundesland = o.get('bundesland') or ''
    if bundesland and bundesland not in BUNDESLAENDER:
        raise Ungueltig('ort: unbekanntes Bundesland')
    return {'name': text(o, 'name', 100), 'info': str(o.get('info') or '')[:200], 'lat': lat, 'lon': lon, 'bundesland': bundesland}


# ================= Sicherheit (Einstellungen → Sicherheit) =================
# PIN: 5 Ziffern, ohne ihn öffnet sich das Fenster Einstellungen nicht. In der Datenbank liegt nur ein Hash mit Salz
# (Wert 'pin'), der nie an die Geräte geht – geprüft wird hier. Nach 5 falschen Versuchen 5 Minuten Pause, damit
# niemand alle 100 000 PINs durchprobiert.
# Sperre (Wert 'konfig_gesperrt'): Auf den Seiten lässt sich nichts mehr einrichten – Depot, Shortcuts, Google Kalender
# und die Spotify-Anmeldung. Termine, Notizen und Musik bleiben bedienbar. Der Server lehnt solche Änderungen dann ab.
PIN = re.compile(r'\d{5}')
PIN_VERSUCHE, PIN_PAUSE = 5, 300
pin_fehler = []                          # Zeitpunkte der letzten falschen Eingaben
KONFIGURATION = ('depot+', 'depot-', 'shortcut+', 'shortcut-')   # Änderungen, die die Sperre verhindert


class PinFalsch(Exception):
    pass


def gesperrt():
    return wert('konfig_gesperrt') == '1'


def sicherheit():
    return {'pin': bool(wert('pin')), 'gesperrt': gesperrt()}


def pin_hash(pin, salz):
    return hashlib.pbkdf2_hmac('sha256', pin.encode(), salz, 200_000).hex()


def pin_pruefen(pin, gespeichert):
    """Kein PIN gesetzt oder richtig → ok, sonst PinFalsch (auch bei zu vielen Versuchen)"""
    if not gespeichert:
        return
    jetzt = time.time()
    pin_fehler[:] = [t for t in pin_fehler if jetzt - t < PIN_PAUSE]
    if len(pin_fehler) >= PIN_VERSUCHE:
        raise PinFalsch(f'Zu viele falsche Versuche – in {int(PIN_PAUSE - (jetzt - pin_fehler[0])) // 60 + 1} min nochmal')
    salz, h = gespeichert.split(':')
    if isinstance(pin, str) and PIN.fullmatch(pin) and hmac.compare_digest(pin_hash(pin, bytes.fromhex(salz)), h):
        pin_fehler.clear()
        return
    pin_fehler.append(jetzt)
    raise PinFalsch('PIN falsch')


def sicherheit_aendern(a):
    aktion = a.get('aktion')
    if aktion not in ('pruefen', 'pin-an', 'pin-aus', 'sperren', 'entsperren'):
        raise Ungueltig(f'unbekannte Aktion: {aktion!r}')
    neu = a.get('neu')
    if aktion == 'pin-an' and not (isinstance(neu, str) and PIN.fullmatch(neu)):
        raise Ungueltig('Der PIN muss aus 5 Ziffern bestehen')
    with sperre:
        gespeichert = wert('pin')
    pin_pruefen(a.get('pin'), gespeichert)   # außerhalb der Sperre: das Rechnen dauert etwas
    if aktion == 'pruefen':
        return
    salz = secrets.token_bytes(16)
    with sperre:
        if aktion == 'pin-an':
            setze('pin', f'{salz.hex()}:{pin_hash(neu, salz)}')
        elif aktion == 'pin-aus':
            db.execute("DELETE FROM werte WHERE name = 'pin'")
        else:
            setze('konfig_gesperrt', '1' if aktion == 'sperren' else '0')
        setze('version', version() + 1)      # alle Geräte holen den neuen Stand


# ================= Änderungen prüfen und speichern =================
DATUM = re.compile(r'\d{4}-\d{2}-\d{2}')
ZEIT = re.compile(r'(\d{2}:\d{2})?')
SYMBOL = re.compile(r'[A-Za-z0-9.^=_-]{1,24}')
MENGE = re.compile(r'\d{1,12}(\.\d{1,8})?')          # Stückzahl mit bis zu 8 Nachkommastellen (Kryptos)
BETRAG = re.compile(r'(\d{1,10}(\.\d{1,8})?)?')       # Euro pro Stück, leer = nicht angegeben


class Ungueltig(ValueError):
    pass


def text(a, feld, laenge):
    w = a.get(feld)
    if not isinstance(w, str) or len(w) > laenge:
        raise Ungueltig(f'{feld} fehlt oder ist zu lang')
    return w


def muster(a, feld, regex):
    w = text(a, feld, 10)
    if not regex.fullmatch(w):
        raise Ungueltig(f'{feld} hat ein falsches Format')
    return w


def aendern(a):
    """Eine Änderung anwenden. Alle sind wiederholbar: Kommt dieselbe zweimal an, ändert sich nichts."""
    op = a.get('op') if isinstance(a, dict) else None
    if op in KONFIGURATION and gesperrt():
        raise Ungueltig(f'{op}: Konfiguration ist gesperrt (Einstellungen → Sicherheit)')
    if op == 'termin+':
        db.execute('INSERT OR IGNORE INTO termine (id, datum, zeit, text) VALUES (?, ?, ?, ?)',
                   (text(a, 'id', 64), muster(a, 'datum', DATUM), muster(a, 'zeit', ZEIT), text(a, 'text', 200)))
    elif op == 'termin-':
        db.execute('DELETE FROM termine WHERE id = ?', (text(a, 'id', 64),))
    elif op == 'urlaub+':
        von, bis = muster(a, 'von', DATUM), muster(a, 'bis', DATUM)
        db.execute('INSERT OR IGNORE INTO urlaube (id, text, von, bis) VALUES (?, ?, ?, ?)',
                   (text(a, 'id', 64), text(a, 'text', 200), von, max(von, bis)))
    elif op == 'urlaub-':
        db.execute('DELETE FROM urlaube WHERE id = ?', (text(a, 'id', 64),))
    elif op == 'depot+':                  # Wertpapier hinzufügen oder ändern (gleiche id = ändern)
        menge = text(a, 'menge', 24)
        if not MENGE.fullmatch(menge) or float(menge) <= 0:
            raise Ungueltig('menge muss größer als 0 sein, höchstens 8 Nachkommastellen')
        einkauf = text(a, 'einkauf', 24)
        if not BETRAG.fullmatch(einkauf):
            raise Ungueltig('einkauf hat ein falsches Format')
        symbol = text(a, 'symbol', 24)
        if not SYMBOL.fullmatch(symbol):
            raise Ungueltig('symbol hat ein falsches Format')
        db.execute('''INSERT INTO depot (id, symbol, name, art, boerse, menge, einkauf) VALUES (?, ?, ?, ?, ?, ?, ?)
                      ON CONFLICT(id) DO UPDATE SET menge = excluded.menge, einkauf = excluded.einkauf''',
                   (text(a, 'id', 64), symbol, text(a, 'name', 200), text(a, 'art', 20), text(a, 'boerse', 60), menge, einkauf))
    elif op == 'depot-':
        db.execute('DELETE FROM depot WHERE id = ?', (text(a, 'id', 64),))
    elif op == 'profil':                  # nur die mitgeschickten Felder ändern (letzte Änderung gewinnt)
        p = profil()
        if 'name' in a:
            p['name'] = text(a, 'name', 60).strip()
        if 'hub' in a:
            p['hub'] = text(a, 'hub', 40).strip()
        if 'ort' in a:
            p['ort'] = ort_pruefen(a['ort'])
        setze('profil', json.dumps(p, ensure_ascii=False))
    elif op == 'shortcut+':               # Shortcut anlegen oder ändern (gleiche id = ändern, Platz bleibt)
        name, url = text(a, 'name', 60).strip(), text(a, 'url', 2000).strip()
        if not name:
            raise Ungueltig('name fehlt')
        if not re.fullmatch(r'https?://[^\s<>"]+', url):    # nur Webadressen – kein javascript: o. ä.
            raise Ungueltig('url muss mit http:// oder https:// beginnen')
        db.execute('INSERT INTO shortcuts (id, name, url) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, url = excluded.url',
                   (text(a, 'id', 64), name, url))
    elif op == 'shortcut-':
        db.execute('DELETE FROM shortcuts WHERE id = ?', (text(a, 'id', 64),))
    elif op == 'notizen':                 # ganzen Text ersetzen (letzte Änderung gewinnt)
        setze('notizen', text(a, 'text', 200_000))
    elif op == 'notizen-anhaengen':       # Übernahme alter Notizen eines Geräts: nichts überschreiben
        neu, alt = text(a, 'text', 200_000).strip(), wert('notizen')
        if neu and neu not in alt:
            setze('notizen', f'{alt.rstrip()}\n\n{neu}' if alt.strip() else neu)
    else:
        raise Ungueltig(f'unbekannte Änderung: {op!r}')


# ================= Updates aus dem GitHub-Repository =================
CODE = DATENBANK.parent / 'code'           # hier landen heruntergeladene Versionen: code/<commit>/src, code/<commit>/server


def github(pfad, accept):
    """Das Repository ist öffentlich, ein Token ist nicht nötig (ohne Anmeldung erlaubt GitHub 60 Anfragen pro Stunde)."""
    anfrage = urllib.request.Request(f'{GITHUB_API}/repos/{UPDATE_REPO}/{pfad}', headers={
        'Accept': accept, 'User-Agent': 'Lokal-Intranet-Hub', 'X-GitHub-Api-Version': '2022-11-28'})
    return urllib.request.urlopen(anfrage, timeout=60)


def neuester_commit():
    """→ (Commit, Zeitpunkt). Die Liste mit nur einem Eintrag statt commits/<zweig>: ohne die geänderten Dateien"""
    with github(f'commits?sha={urllib.parse.quote(UPDATE_ZWEIG)}&per_page=1', 'application/vnd.github+json') as r:
        neuester = json.load(r)[0]
    sha, datum = neuester.get('sha', ''), neuester.get('commit', {}).get('committer', {}).get('date', '')
    if not re.fullmatch(r'[0-9a-f]{40}', sha):
        raise ValueError(f'unerwartete Antwort von GitHub: {sha[:60]!r}')
    return sha, datum


def herunterladen(sha):
    """Holt src/ und server/ dieses Commits nach code/<sha> und prüft, ob server.py fehlerfrei übersetzt."""
    ziel = CODE / sha
    if (ziel / 'server' / 'server.py').is_file() and (ziel / 'src' / 'index.html').is_file():
        return ziel                          # schon da (z. B. nach einem Neustart des Containers)
    neu = CODE / f'{sha}.neu'
    shutil.rmtree(neu, ignore_errors=True)
    neu.mkdir(parents=True)
    with github(f'tarball/{sha}', 'application/vnd.github+json') as r, tarfile.open(fileobj=r, mode='r|gz') as tar:
        for eintrag in tar:                  # im Archiv liegt alles unter <besitzer>-<repo>-<commit>/
            teile = eintrag.name.split('/', 1)
            if len(teile) < 2 or not teile[1].startswith(('src/', 'server/')):
                continue
            eintrag.name = teile[1]
            tar.extract(eintrag, neu, filter='data')   # 'data' verhindert Pfade außerhalb des Ordners
    if not (neu / 'src' / 'index.html').is_file():
        raise ValueError('src/index.html fehlt im Repository')
    compile((neu / 'server' / 'server.py').read_text(encoding='utf-8'), 'server.py', 'exec')   # Syntaxfehler → kein Update
    neu.rename(ziel)
    return ziel


update_stand = {'geprueft': None, 'neuester': None, 'fehler': None, 'laeuft': False}   # letzte Prüfung, für /api/version
START = time.time()


def auf_update_pruefen():
    global APP_DATUM
    sha, datum = neuester_commit()
    update_stand['neuester'] = sha
    if sha == APP_VERSION:
        APP_DATUM = APP_DATUM or datum       # z. B. Image von Hand gebaut: Zeitpunkt nachtragen
        return
    ziel = herunterladen(sha)
    for alt in CODE.iterdir():               # nur die neue Version behalten
        if alt != ziel:
            shutil.rmtree(alt, ignore_errors=True)
    print(f'Neue Version {sha[:7]} von GitHub geladen – Server startet neu', flush=True)
    umgebung = dict(os.environ, APP_VERSION=sha, APP_DATUM=datum, WEB_ORDNER=str(ziel / 'src'))
    with sperre:                             # keine Änderung darf gerade halb gespeichert sein
        db.close()
        os.execve(sys.executable, [sys.executable, '-u', str(ziel / 'server' / 'server.py')], umgebung)


# Wie oft nach Updates gesehen wird, stellt man in der Seite ein (Einstellungen) – gespeichert als Wert 'update_modus':
# 'minuten' = alle UPDATE_MINUTEN Minuten, 'taeglich' = einmal am Tag nachts um 3 Uhr, 'aus' = nur von Hand.
# Ohne gespeicherte Wahl gilt UPDATE_MINUTEN (0 = aus).
UPDATE_MODI = ('minuten', 'taeglich', 'aus')
UPDATE_TAEGLICH_UHR = 3
update_jetzt = threading.Event()             # „Aktuellste Version ziehen“ in den Einstellungen


def update_modus():
    with sperre:
        modus = wert('update_modus')
    return modus if modus in UPDATE_MODI else 'minuten' if UPDATE_MINUTEN > 0 else 'aus'


def naechste_pruefung(letzte):
    modus = update_modus()
    if modus == 'aus':
        return None
    if modus == 'taeglich':
        t = datetime.datetime.fromtimestamp(letzte, HEIMAT)
        ziel = t.replace(hour=UPDATE_TAEGLICH_UHR, minute=0, second=0, microsecond=0)
        return (ziel if ziel > t else ziel + datetime.timedelta(days=1)).timestamp()
    return letzte + (UPDATE_MINUTEN if UPDATE_MINUTEN > 0 else 15) * 60


def update_info():
    """Für /api/version und die Einstellungen"""
    naechste = naechste_pruefung(update_stand['geprueft'] or START) if UPDATE_REPO else None
    return {'aktiv': bool(UPDATE_REPO), 'modus': update_modus(), 'minuten': UPDATE_MINUTEN if UPDATE_MINUTEN > 0 else 15,
            'uhr': UPDATE_TAEGLICH_UHR, 'repo': UPDATE_REPO, **update_stand,
            'naechste': int(naechste) if naechste else None}


def update_warten():
    """Bis zur nächsten Prüfung warten. Alle 30 s nachsehen, ob der Modus geändert wurde; „jetzt prüfen“ weckt sofort."""
    while not update_jetzt.wait(30):
        naechste = naechste_pruefung(update_stand['geprueft'] or START)
        if naechste and time.time() >= naechste:
            return


def update_schleife():
    update_jetzt.wait(10)                    # erst einmal in Ruhe starten
    if update_modus() == 'aus' and not update_jetzt.is_set():
        update_warten()
    while True:
        update_jetzt.clear()
        update_stand['geprueft'], update_stand['fehler'], update_stand['laeuft'] = int(time.time()), None, True
        try:
            auf_update_pruefen()
        except urllib.error.HTTPError as e:
            hinweis = {403: ' – Anfrage-Limit erreicht, später erneut', 404: ' – Repository nicht gefunden oder nicht öffentlich',
                       429: ' – Anfrage-Limit erreicht, später erneut'}.get(e.code, '')
            update_stand['fehler'] = f'GitHub antwortet {e.code}{hinweis}'
        except Exception as e:
            update_stand['fehler'] = f'fehlgeschlagen: {e}'
        update_stand['laeuft'] = False
        if update_stand['fehler']:
            print(f'Update-Prüfung: {update_stand["fehler"]}', flush=True)
        update_warten()


# ================= Spotify: Anmeldung und Steuerung über den Server =================
# Spotify erlaubt die Anmeldung nur mit https:// oder http://127.0.0.1 als Rücksprung-Adresse. Deshalb meldet man sich
# einmal an, landet danach auf http://127.0.0.1:… (dort läuft nichts, der Browser zeigt eine Fehlerseite) und kopiert
# diese Adresse in die Seite. Der Server tauscht den Code darin gegen einen Zugang, merkt ihn sich in der Datenbank
# und reicht ab dann alle Befehle der Geräte an Spotify weiter – auch über http.
SPOTIFY_RECHTE = 'user-read-playback-state user-modify-playback-state playlist-read-private playlist-read-collaborative'
sp = {'access': None, 'ablauf': 0.0, 'states': {}, 'cache': {}}   # Zugang im Speicher, offene Anmeldungen, kurzer Zwischenspeicher
sp_sperre = threading.Lock()


class SpotifyFehler(Exception):
    def __init__(self, status, text, grund=None):
        super().__init__(text)
        self.status, self.grund = status, grund

    def json(self):
        return {'error': {'status': self.status, 'message': str(self), 'reason': self.grund}}


def sp_eingerichtet():
    return bool(SPOTIFY_ID and SPOTIFY_SECRET)


def sp_refresh(neu=None, loeschen=False):
    """Den dauerhaften Zugang (Refresh-Token) aus der Datenbank lesen, speichern oder löschen."""
    with sperre:
        if loeschen:
            db.execute("DELETE FROM werte WHERE name = 'spotify_refresh'")
        elif neu:
            setze('spotify_refresh', neu)
        return wert('spotify_refresh')


def sp_token_anfrage(werte):
    kopf = {'Authorization': 'Basic ' + base64.b64encode(f'{SPOTIFY_ID}:{SPOTIFY_SECRET}'.encode()).decode(),
            'Content-Type': 'application/x-www-form-urlencoded'}
    anfrage = urllib.request.Request(f'{SPOTIFY_KONTEN}/api/token', urllib.parse.urlencode(werte).encode(), kopf)
    try:
        with urllib.request.urlopen(anfrage, timeout=20) as r:
            d = json.load(r)
    except urllib.error.HTTPError as e:
        try:
            d = json.loads(e.read() or b'{}')
        except ValueError:
            d = {}
        raise SpotifyFehler(e.code, d.get('error_description') or d.get('error') or f'Fehler {e.code}', d.get('error'))
    sp['access'], sp['ablauf'] = d['access_token'], time.time() + d.get('expires_in', 3600) - 60
    if d.get('refresh_token'):
        sp_refresh(neu=d['refresh_token'])
    return d


def sp_access():
    with sp_sperre:
        if sp['access'] and time.time() < sp['ablauf']:
            return sp['access']
        refresh = sp_refresh()
        if not refresh:
            raise SpotifyFehler(401, 'Nicht bei Spotify angemeldet', 'NICHT_ANGEMELDET')
        try:
            sp_token_anfrage({'grant_type': 'refresh_token', 'refresh_token': refresh})
        except SpotifyFehler as e:
            if e.status == 400:                  # Zugang abgelaufen oder in Spotify widerrufen
                sp_refresh(loeschen=True)
                raise SpotifyFehler(401, 'Spotify-Anmeldung abgelaufen – bitte neu anmelden', 'NICHT_ANGEMELDET')
            raise
        return sp['access']


def sp_anmelde_url():
    jetzt = time.time()
    sp['states'] = {s: t for s, t in sp['states'].items() if jetzt - t < 3600}   # eine Stunde gültig
    while len(sp['states']) >= 20:
        sp['states'].pop(next(iter(sp['states'])))
    state = secrets.token_urlsafe(16)
    sp['states'][state] = jetzt
    return f'{SPOTIFY_KONTEN}/authorize?' + urllib.parse.urlencode({
        'client_id': SPOTIFY_ID, 'response_type': 'code', 'redirect_uri': SPOTIFY_RUECKSPRUNG,
        'scope': SPOTIFY_RECHTE, 'state': state, 'show_dialog': 'true'})


def sp_status():
    angemeldet = bool(sp_refresh())
    return {'eingerichtet': sp_eingerichtet(), 'angemeldet': angemeldet, 'rueckSprung': SPOTIFY_RUECKSPRUNG,
            'anmeldeUrl': sp_anmelde_url() if sp_eingerichtet() and not angemeldet else None}


def sp_code_einloesen(adresse):
    abfrage = urllib.parse.parse_qs(urllib.parse.urlsplit(adresse.strip()).query)
    if 'error' in abfrage:
        raise SpotifyFehler(400, 'Anmeldung bei Spotify abgebrochen')
    code, state = (abfrage.get('code') or [''])[0], (abfrage.get('state') or [''])[0]
    if not code:
        raise SpotifyFehler(400, 'In der Adresse steht kein Code – bitte die ganze Adresse aus der Adresszeile kopieren')
    if sp['states'].pop(state, None) is None:
        raise SpotifyFehler(400, 'Diese Anmeldung ist veraltet – bitte noch einmal „Bei Spotify anmelden“ antippen')
    with sp_sperre:
        sp_token_anfrage({'grant_type': 'authorization_code', 'code': code, 'redirect_uri': SPOTIFY_RUECKSPRUNG})


def sp_abmelden():
    with sp_sperre:
        sp_refresh(loeschen=True)
        sp['access'], sp['ablauf'] = None, 0.0
        sp['cache'].clear()


# nur das eigene Konto, die Suche und Playlists/Alben lesen (Liste neben dem Player)
ERLAUBT = re.compile(r'/(me(/[\w/-]*)?|search|playlists/\w+(/items|/tracks)?|albums/\w+(/tracks)?)(\?[^#]*)?')


def sp_web(methode, pfad, body):
    """Einen Befehl an die Spotify Web API weiterreichen. Gleiche Abfragen mehrerer Geräte (z. B. „was läuft gerade?“
    alle 3 s) werden 2 Sekunden zwischengespeichert, damit Spotify nicht doppelt gefragt wird."""
    if not ERLAUBT.fullmatch(pfad) or '..' in pfad or (methode != 'GET' and not pfad.startswith(('/me/', '/me?'))):
        raise SpotifyFehler(403, 'Nicht erlaubt')    # Playlists und Alben nur lesen
    if methode == 'GET':
        treffer = sp['cache'].get(pfad)
        if treffer and time.time() - treffer[0] < 2:
            return treffer[1], treffer[2]
    else:
        sp['cache'].clear()
    for versuch in (1, 2):
        kopf = {'Authorization': f'Bearer {sp_access()}'}
        if body:
            kopf['Content-Type'] = 'application/json'
        anfrage = urllib.request.Request(f'{SPOTIFY_API}/v1{pfad}', method=methode, headers=kopf,
                                         data=None if methode == 'GET' else (body or b''))   # PUT/POST ohne Inhalt brauchen Länge 0
        try:
            with urllib.request.urlopen(anfrage, timeout=20) as r:
                status, inhalt = r.status, r.read()
        except urllib.error.HTTPError as e:
            status, inhalt = e.code, e.read()
        if status == 401 and versuch == 1:       # Zugang gerade abgelaufen → erneuern und nochmal
            sp['access'] = None
            continue
        break
    if methode == 'GET' and status == 200:
        sp['cache'][pfad] = (time.time(), status, inhalt)
    return status, inhalt


# ================= Finanzen: Suche und Kurse über Yahoo Finance =================
# Yahoo Finance liefert ohne Anmeldung Suche, Kursverläufe und aktuelle Kurse. Der Browser darf dort nicht selbst fragen
# (CORS), deshalb holt der Server die Daten und merkt sie sich – mehrere Geräte lösen so nur eine Abfrage aus:
# den Verlauf (für Tag/Woche/Monat/Jahr) 10 Minuten, die aktuellen Kurse aller Wertpapiere zusammen 4 Sekunden.
ARTEN = {'EQUITY': 'Aktie', 'ETF': 'ETF', 'MUTUALFUND': 'Fonds', 'CRYPTOCURRENCY': 'Krypto'}
UNTEREINHEIT = {'GBp': ('GBP', 100), 'GBX': ('GBP', 100), 'ZAc': ('ZAR', 100), 'ILA': ('ILS', 100)}   # Kurse in Pence o. ä.
KURS_SEK = 600
LIVE_SEK = 4
kurs_cache, kurs_sperre = {}, threading.Lock()
live_cache, live_sperre = {}, threading.Lock()   # symbol → (Abrufzeit, { kurs, zeit } oder None = bei Yahoo unbekannt)


def yahoo(pfad):
    anfrage = urllib.request.Request(KURS_API + pfad, headers={'User-Agent': 'Mozilla/5.0 (Lokal-Intranet-Hub)', 'Accept': 'application/json'})
    for versuch in (1, 2):                   # Yahoo hakt gelegentlich kurz → einmal nachfassen
        try:
            with urllib.request.urlopen(anfrage, timeout=15) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if versuch == 2 or (e.code != 429 and e.code < 500):
                raise
        except (urllib.error.URLError, TimeoutError):
            if versuch == 2:
                raise
        time.sleep(1)


def wertpapier_suche(q):
    d = yahoo('/v1/finance/search?' + urllib.parse.urlencode(
        {'q': q, 'quotesCount': 15, 'newsCount': 0, 'listsCount': 0, 'lang': 'de-DE', 'region': 'DE'}))
    return [{'symbol': t['symbol'], 'name': t.get('longname') or t.get('shortname') or t['symbol'],
             'art': ARTEN[t['quoteType']], 'boerse': '' if t['quoteType'] == 'CRYPTOCURRENCY' else t.get('exchDisp') or t.get('exchange') or ''}
            for t in d.get('quotes') or [] if t.get('quoteType') in ARTEN and SYMBOL.fullmatch(t.get('symbol') or '')]


def tage_zurueck(d, monate=0, jahre=0):
    """Gleicher Tag vor x Monaten/Jahren; gibt es ihn nicht (31.3. → 31.2.), dann der letzte Tag des Monats."""
    m = d.year * 12 + d.month - 1 - monate - 12 * jahre
    j, m = divmod(m, 12)
    return datetime.date(j, m + 1, min(d.day, calendar.monthrange(j, m + 1)[1]))


def kurs_holen(symbol):
    """Aktueller Kurs und die Schlusskurse zu Beginn der Zeiträume (Tag, Woche, Monat, Jahr, seit Jahresanfang)."""
    jetzt = int(time.time())
    d = yahoo(f'/v8/finance/chart/{urllib.parse.quote(symbol)}?' + urllib.parse.urlencode(
        {'period1': jetzt - 400 * 86400, 'period2': jetzt, 'interval': '1d'}))
    ergebnis = ((d.get('chart') or {}).get('result') or [None])[0]
    if not ergebnis:
        raise ValueError(((d.get('chart') or {}).get('error') or {}).get('description') or 'keine Daten')
    meta = ergebnis['meta']
    versatz = meta.get('gmtoffset') or 0     # Handelstag in der Zeitzone der Börse
    tag = lambda ts: datetime.datetime.fromtimestamp(ts + versatz, datetime.timezone.utc).date()
    schluss = (((ergebnis.get('indicators') or {}).get('quote') or [{}])[0].get('close')) or []
    reihe = [(tag(ts), c) for ts, c in zip(ergebnis.get('timestamp') or [], schluss) if c is not None]
    kurs = meta.get('regularMarketPrice') or (reihe[-1][1] if reihe else None)
    if kurs is None:
        raise ValueError('kein Kurs')
    zeit = meta.get('regularMarketTime') or jetzt
    heute = tag(zeit)

    def schluss_bis(datum, vorher=False):    # letzter Schlusskurs an oder vor dem Datum (vorher: davor)
        treffer = [c for t, c in reihe if (t < datum if vorher else t <= datum)]
        return treffer[-1] if treffer else None

    ref = {'tag': schluss_bis(heute, vorher=True),
           'woche': schluss_bis(heute - datetime.timedelta(days=7)),
           'monat': schluss_bis(tage_zurueck(heute, monate=1)),
           'jahr': schluss_bis(tage_zurueck(heute, jahre=1)),
           'ytd': schluss_bis(datetime.date(heute.year - 1, 12, 31))}
    waehrung, teiler = UNTEREINHEIT.get(meta.get('currency'), (meta.get('currency') or '', 1))
    return {'kurs': kurs / teiler, 'zeit': zeit, 'waehrung': waehrung,
            'name': meta.get('longName') or meta.get('shortName') or symbol,
            'ref': {k: (v / teiler if v is not None else None) for k, v in ref.items()}}


def kurs(symbol):
    with kurs_sperre:
        alt = kurs_cache.get(symbol)
    if alt and time.time() - alt[0] < KURS_SEK:
        return alt[1]
    try:
        neu = kurs_holen(symbol)
    except urllib.error.HTTPError as e:
        neu = {'fehler': 'Wertpapier nicht gefunden' if e.code == 404 else f'Yahoo Finance antwortet {e.code}'}
    except (OSError, ValueError, KeyError, TypeError, IndexError) as e:
        neu = {'fehler': f'Kurs nicht abrufbar ({e})'}
    if 'fehler' in neu and alt and 'fehler' not in alt[1]:
        return alt[1]                        # lieber den letzten bekannten Kurs zeigen
    with kurs_sperre:
        kurs_cache[symbol] = (time.time(), neu)
    return neu


def kurse(symbole):
    """Kurse mehrerer Wertpapiere; zu jedem kommt der Wechselkurs in Euro (eur), auch für die Zeitpunkte in ref."""
    with ThreadPoolExecutor(6) as pool:
        ergebnis = dict(zip(symbole, pool.map(kurs, symbole)))
        waehrungen = sorted({k['waehrung'] for k in ergebnis.values() if 'fehler' not in k and k['waehrung'] != 'EUR'})
        wechsel = dict(zip(waehrungen, pool.map(lambda w: kurs(f'{w}EUR=X'), waehrungen)))
    antwort = {}
    for symbol, k in ergebnis.items():
        if 'fehler' in k:
            antwort[symbol] = k
        elif k['waehrung'] == 'EUR':
            antwort[symbol] = {**k, 'eur': {'kurs': 1, 'ref': {z: 1 for z in k['ref']}}}
        elif 'fehler' in wechsel[k['waehrung']]:
            antwort[symbol] = {**k, 'eur': None}   # Wert in Euro unbekannt
        else:
            w = wechsel[k['waehrung']]
            antwort[symbol] = {**k, 'eur': {'kurs': w['kurs'], 'ref': {z: w['ref'][z] or w['kurs'] for z in k['ref']}}}
    return antwort


def spark(symbole):
    """Aktuelle Kurse vieler Wertpapiere mit wenigen Abfragen (Yahoo erlaubt 20 Symbole pro Abfrage)."""
    neu = {}
    for i in range(0, len(symbole), 20):
        d = yahoo('/v7/finance/spark?' + urllib.parse.urlencode({'symbols': ','.join(symbole[i:i + 20]), 'range': '1d', 'interval': '1d'}))
        for r in (d.get('spark') or {}).get('result') or []:
            meta = ((r.get('response') or [{}])[0] or {}).get('meta') or {}
            if r.get('symbol') and meta.get('regularMarketPrice') is not None:
                teiler = UNTEREINHEIT.get(meta.get('currency'), ('', 1))[1]
                neu[r['symbol']] = {'kurs': meta['regularMarketPrice'] / teiler, 'zeit': meta.get('regularMarketTime')}
    return neu


# Kursverlauf fürs Diagramm: Zeitraum → (Abfrage bei Yahoo, so viele Sekunden zwischenspeichern)
VERLAUF = {
    '1t': ({'range': '1d', 'interval': '5m'}, 60),
    '1w': ({'range': '5d', 'interval': '30m'}, 300),
    '1m': ({'range': '1mo', 'interval': '60m'}, 900),
    '3m': ({'range': '3mo', 'interval': '1d'}, 1800),
    '1j': ({'range': '1y', 'interval': '1d'}, 1800),
    '3j': ({'jahre': 3, 'interval': '1d'}, 3600),          # „3y“ kennt Yahoo nicht → von/bis angeben
    '5j': ({'range': '5y', 'interval': '1wk'}, 3600),
    'max': ({'range': 'max', 'interval': '1mo'}, 3600),
}
verlauf_cache, verlauf_sperre = {}, threading.Lock()   # (symbol, zeitraum) → (Abrufzeit, { waehrung, punkte } oder { fehler })


def verlauf_holen(symbol, zeitraum):
    """Schlusskurse im Zeitraum: { waehrung, punkte: [[Zeitpunkt in s, Kurs], …] }"""
    abfrage, sek = VERLAUF[zeitraum]
    with verlauf_sperre:
        alt = verlauf_cache.get((symbol, zeitraum))
    if alt and time.time() - alt[0] < sek:
        return alt[1]
    abfrage = dict(abfrage)
    if 'jahre' in abfrage:
        jetzt = int(time.time())
        abfrage = {'period1': jetzt - abfrage.pop('jahre') * 365 * 86400, 'period2': jetzt, 'interval': abfrage['interval']}
    try:
        d = yahoo(f'/v8/finance/chart/{urllib.parse.quote(symbol)}?' + urllib.parse.urlencode(abfrage))
        ergebnis = ((d.get('chart') or {}).get('result') or [None])[0]
        if not ergebnis:
            raise ValueError(((d.get('chart') or {}).get('error') or {}).get('description') or 'keine Daten')
        waehrung, teiler = UNTEREINHEIT.get(ergebnis['meta'].get('currency'), (ergebnis['meta'].get('currency') or '', 1))
        schluss = (((ergebnis.get('indicators') or {}).get('quote') or [{}])[0].get('close')) or []
        punkte = [[ts, c / teiler] for ts, c in zip(ergebnis.get('timestamp') or [], schluss) if c is not None]
        if not punkte:
            raise ValueError('keine Kurse im Zeitraum')
        neu = {'waehrung': waehrung, 'punkte': punkte}
    except urllib.error.HTTPError as e:
        neu = {'fehler': 'Wertpapier nicht gefunden' if e.code == 404 else f'Yahoo Finance antwortet {e.code}'}
    except (OSError, ValueError, KeyError, TypeError, IndexError) as e:
        neu = {'fehler': f'Verlauf nicht abrufbar ({e})'}
    if 'fehler' in neu and alt and 'fehler' not in alt[1]:
        return alt[1]
    with verlauf_sperre:
        verlauf_cache[(symbol, zeitraum)] = (time.time(), neu)
    return neu


def verlaeufe(symbole, zeitraum):
    """Verlauf mehrerer Wertpapiere; dazu der Wechselkurs in Euro im selben Zeitraum (eur, None bei Euro oder Fehler)."""
    with ThreadPoolExecutor(6) as pool:
        ergebnis = dict(zip(symbole, pool.map(lambda s: verlauf_holen(s, zeitraum), symbole)))
        waehrungen = sorted({v['waehrung'] for v in ergebnis.values() if 'fehler' not in v and v['waehrung'] != 'EUR'})
        wechsel = dict(zip(waehrungen, pool.map(lambda w: verlauf_holen(f'{w}EUR=X', zeitraum), waehrungen)))
    return {s: v if 'fehler' in v or v['waehrung'] == 'EUR' else {**v, 'eur': wechsel[v['waehrung']].get('punkte')}
            for s, v in ergebnis.items()}


def live(symbole):
    """Aktuelle Kurse samt Wechselkurs in Euro. Die Währung kommt aus dem (zwischengespeicherten) Verlauf."""
    with ThreadPoolExecutor(6) as pool:
        basis = dict(zip(symbole, pool.map(kurs, symbole)))
    fx = lambda w: f'{w}EUR=X'
    alle = list(symbole) + sorted({fx(k['waehrung']) for k in basis.values() if 'fehler' not in k and k['waehrung'] != 'EUR'})
    with live_sperre:                        # fragen mehrere Geräte gleichzeitig, holt nur das erste neue Kurse
        jetzt = time.time()
        fehlt = [s for s in alle if jetzt - live_cache.get(s, (0, None))[0] >= LIVE_SEK]
        if fehlt:
            try:
                neu = spark(fehlt)
                for s in fehlt:
                    live_cache[s] = (jetzt, neu.get(s))
            except (OSError, ValueError, KeyError, TypeError):
                pass                         # dann eben die zuletzt bekannten Kurse
        aktuell = {s: live_cache.get(s, (0, None))[1] for s in alle}
    antwort = {}
    for s, k in basis.items():
        if 'fehler' in k:
            antwort[s] = {'fehler': k['fehler']}
            continue
        jetzt_kurs = aktuell[s] or {'kurs': k['kurs'], 'zeit': k['zeit']}
        if k['waehrung'] == 'EUR':
            eur = 1
        else:
            w = aktuell[fx(k['waehrung'])] or kurs(fx(k['waehrung']))
            eur = w.get('kurs')                  # None, wenn der Wechselkurs fehlt
        antwort[s] = {**jetzt_kurs, 'eur': eur}
    return antwort


# ================= Google Kalender: Termine über die geheime iCal-Adresse (nur lesen) =================
# Google bietet für jeden Kalender eine „geheime Adresse im iCal-Format“. Damit holt der Server die Termine ohne
# Anmeldung bei Google. Die Adressen liegen in der Datenbank (Wert 'google_kalender') und gehen nie an den Browser –
# wer sie kennt, kann den Kalender lesen. Abgerufen wird höchstens alle 5 Minuten, für alle Geräte zusammen.
# Wiederholungen werden selbst ausgerechnet (FREQ DAILY/WEEKLY/MONTHLY/YEARLY mit INTERVAL, COUNT, UNTIL, BYDAY,
# BYMONTHDAY und BYMONTH – das, was Google beim Anlegen erzeugt), samt Ausnahmen (EXDATE) und einzeln geänderten Terminen.
GOOGLE_SEK = 300
ICAL_MAX = 20_000_000                    # Bytes je Kalender
ical_cache, ical_sperre = {}, threading.Lock()   # adresse → (Abrufzeit, { name, termine })
WOCHENTAGE = {'MO': 0, 'TU': 1, 'WE': 2, 'TH': 3, 'FR': 4, 'SA': 5, 'SU': 6}


def zone(name):
    try:
        return zoneinfo.ZoneInfo(name)
    except (zoneinfo.ZoneInfoNotFoundError, ValueError):
        return None


HEIMAT = zone(os.environ.get('ZEITZONE') or 'Europe/Berlin')   # in dieser Zeitzone werden die Uhrzeiten angezeigt


def umrechnen(t, von, nach):
    """Uhrzeit t (ohne Zeitzone, gilt in von) in die Zeitzone nach umrechnen. None = ganztägig bzw. unbekannt → unverändert."""
    if von is None or nach is None or von is nach:
        return t
    return t.replace(tzinfo=von).astimezone(nach).replace(tzinfo=None)


def ical_feld(zeile):
    """'DTSTART;TZID=Europe/Berlin:20261028T090000' → ('DTSTART', {'TZID': 'Europe/Berlin'}, '20261028T090000')"""
    in_klammer = False
    for i, c in enumerate(zeile):
        if c == '"':
            in_klammer = not in_klammer
        elif c == ':' and not in_klammer:
            break
    else:
        return None
    name, *teile = zeile[:i].split(';')
    params = {}
    for p in teile:
        k, _, v = p.partition('=')
        params[k.upper()] = v.strip('"')
    return name.upper(), params, zeile[i + 1:]


def ical_text(w):
    return re.sub(r'\\([\\;,nN])', lambda m: '\n' if m.group(1) in 'nN' else m.group(1), w).strip()


def ical_zeit(w, params):
    """→ (Uhrzeit ohne Zeitzone, Zeitzone oder None, ganztägig?)"""
    w = w.strip()
    if params.get('VALUE') == 'DATE' or len(w) == 8:
        return datetime.datetime.strptime(w[:8], '%Y%m%d'), None, True
    t = datetime.datetime.strptime(w[:15], '%Y%m%dT%H%M%S')
    if w.endswith('Z'):
        return t, datetime.timezone.utc, False
    return t, zone(params['TZID']) if params.get('TZID') else None, False


def ical_dauer(w):
    """'P1D', 'PT1H30M', 'P2W' → timedelta"""
    m = re.fullmatch(r'([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?', w.strip())
    if not m:
        return None
    w_, d, h, mi, s = (int(x or 0) for x in m.groups()[1:])
    return (-1 if m.group(1) == '-' else 1) * datetime.timedelta(weeks=w_, days=d, hours=h, minutes=mi, seconds=s)


def ical_lesen(inhalt):
    """iCal-Text → (Name des Kalenders, [Termin]) – Termin: dict mit start, tz, ganz, dauer, text, uid, regel, aus, rid"""
    zeilen = []
    for z in inhalt.replace('\r\n', '\n').replace('\r', '\n').split('\n'):
        if z[:1] in (' ', '\t') and zeilen:
            zeilen[-1] += z[1:]              # umgebrochene Zeile fortsetzen
        elif z:
            zeilen.append(z)
    name, termine, t, tiefe = '', [], None, 0   # t = Termin, der gerade gelesen wird; tiefe = Blöcke darin (z. B. VALARM)
    for z in zeilen:
        feld = ical_feld(z)
        if not feld:
            continue
        k, params, w = feld
        if t is None:
            if k == 'BEGIN' and w.upper() == 'VEVENT':
                t, tiefe = {'aus': set(), 'text': ''}, 0
            elif k == 'X-WR-CALNAME':
                name = ical_text(w)
            continue
        if k == 'BEGIN':
            tiefe += 1
        elif k == 'END':
            if tiefe:
                tiefe -= 1
            else:                            # END:VEVENT
                if 'start' in t and not t.get('kaputt'):
                    termine.append(t)        # abgesagte auch: sie verdecken die Wiederholung, die sie ersetzen
                t = None
        elif tiefe:
            continue                         # z. B. Erinnerungen (VALARM) im Termin
        else:
            try:
                if k == 'DTSTART':
                    t['start'], t['tz'], t['ganz'] = ical_zeit(w, params)
                elif k == 'DTEND':
                    t['ende'] = ical_zeit(w, params)
                elif k == 'DURATION':
                    t['dauer'] = ical_dauer(w)
                elif k == 'SUMMARY':
                    t['text'] = ical_text(w)
                elif k == 'UID':
                    t['uid'] = w.strip()
                elif k == 'STATUS':
                    t['status'] = w.strip().upper()
                elif k == 'RRULE':
                    t['regel'] = w.strip()
                elif k == 'EXDATE':
                    for x in w.split(','):
                        t['aus'].add(ical_zeit(x, params))
                elif k == 'RECURRENCE-ID':
                    t['rid'] = ical_zeit(w, params)
            except ValueError:
                t['kaputt'] = True           # unlesbarer Termin → weglassen, der Rest des Kalenders bleibt
    for t in termine:                        # Dauer aus dem Ende; ohne Ende: ganztägig 1 Tag, sonst 0
        if t.get('dauer') is None:
            if 'ende' in t:
                e, e_tz, _ = t.pop('ende')
                t['dauer'] = max(datetime.timedelta(0), umrechnen(e, e_tz, t['tz']) - t['start'])
            else:
                t['dauer'] = datetime.timedelta(days=1) if t['ganz'] else datetime.timedelta(0)
        t['aus'] = {umrechnen(x, x_tz, t['tz']) for x, x_tz, _ in t['aus']}
    return name, termine


def tage_im_monat(j, m, nr, wochentag):
    """nr. Wochentag im Monat (1 = erster, -1 = letzter, 0 = alle)"""
    alle = [datetime.date(j, m, d) for d in range(1, calendar.monthrange(j, m)[1] + 1) if datetime.date(j, m, d).weekday() == wochentag]
    if not nr:
        return alle
    return [alle[nr - 1 if nr > 0 else nr]] if -len(alle) <= nr <= len(alle) else []


def monatstag(j, m, nr):
    letzter = calendar.monthrange(j, m)[1]
    tag = nr if nr > 0 else letzter + 1 + nr
    return [datetime.date(j, m, tag)] if 1 <= tag <= letzter else []


def wiederholungen(start, tz, regel, bis):
    """Beginn aller Wiederholungen eines Termins bis einschließlich bis (Uhrzeit wie start, in dessen Zeitzone)."""
    r = dict(p.split('=', 1) for p in regel.upper().split(';') if '=' in p)
    freq, n = r.get('FREQ'), max(1, int(r.get('INTERVAL') or 1))
    anzahl = int(r['COUNT']) if r.get('COUNT') else None
    ende = None
    if r.get('UNTIL'):
        u, u_tz, ganz = ical_zeit(r['UNTIL'], {})
        ende = datetime.datetime.combine(u.date(), datetime.time.max) if ganz else umrechnen(u, u_tz, tz)
    tage = [(int(m.group(1) or 0), WOCHENTAGE[m.group(2)]) for m in re.finditer(r'([+-]?\d+)?(MO|TU|WE|TH|FR|SA|SU)', r.get('BYDAY', ''))]
    monatstage = [int(x) for x in r.get('BYMONTHDAY', '').split(',') if x.lstrip('-').isdigit()]
    monate = [int(x) for x in r.get('BYMONTH', '').split(',') if x.isdigit()]
    if freq not in ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'):
        yield start
        return

    def im_monat(j, m):
        if tage:
            return [d for nr, wt in tage for d in tage_im_monat(j, m, nr, wt)]
        return [d for nr in (monatstage or [start.day]) for d in monatstag(j, m, nr)]

    gezaehlt, s = 0, start.date()
    for p in itertools.count():
        if freq == 'DAILY':
            erster = s + datetime.timedelta(days=p * n)
            kandidaten = [erster]
        elif freq == 'WEEKLY':
            erster = s - datetime.timedelta(days=s.weekday()) + datetime.timedelta(weeks=p * n)
            kandidaten = [erster + datetime.timedelta(days=wt) for wt in sorted({wt for _, wt in tage} or {s.weekday()})]
        elif freq == 'MONTHLY':
            j, m = divmod(s.year * 12 + s.month - 1 + p * n, 12)
            erster = datetime.date(j, m + 1, 1)
            kandidaten = im_monat(j, m + 1)
        else:
            j = s.year + p * n
            erster = datetime.date(j, 1, 1)
            kandidaten = [d for m in (monate or [s.month]) for d in im_monat(j, m)]
        if erster > bis.date():
            return
        for d in sorted(set(kandidaten)):
            if (monate and d.month not in monate) or (freq == 'DAILY' and tage and d.weekday() not in {wt for _, wt in tage}):
                continue
            t = datetime.datetime.combine(d, start.time())
            if t < start:
                continue
            if (ende and t > ende) or t > bis:
                return
            yield t
            gezaehlt += 1
            if anzahl and gezaehlt >= anzahl:
                return


def kalender_holen(adresse):
    """iCal-Datei laden und lesen (5 Minuten zwischengespeichert). → { name, termine } oder { fehler }"""
    with ical_sperre:
        alt = ical_cache.get(adresse)
    if alt and time.time() - alt[0] < GOOGLE_SEK:
        return alt[1]
    try:
        anfrage = urllib.request.Request(adresse, headers={'User-Agent': 'Lokal-Intranet-Hub'})
        with urllib.request.urlopen(anfrage, timeout=20) as r:
            inhalt = r.read(ICAL_MAX + 1)
        if len(inhalt) > ICAL_MAX:
            raise ValueError('Kalender zu groß')
        inhalt = inhalt.decode('utf-8', 'replace')
        if 'BEGIN:VCALENDAR' not in inhalt[:2000]:
            raise ValueError('das ist keine iCal-Adresse')
        name, termine = ical_lesen(inhalt)
        neu = {'name': name, 'termine': termine}
    except urllib.error.HTTPError as e:
        neu = {'fehler': 'Adresse ungültig oder zurückgesetzt' if e.code in (401, 403, 404) else f'Google antwortet {e.code}'}
    except (OSError, ValueError) as e:
        neu = {'fehler': f'nicht abrufbar ({e})'}
    if 'fehler' in neu and alt and 'fehler' not in alt[1]:
        return alt[1]                        # lieber den letzten bekannten Stand zeigen
    with ical_sperre:
        ical_cache[adresse] = (time.time(), neu)
    return neu


def termine_zwischen(termine, von, bis):
    """Termine eines Kalenders → { 'JJJJ-MM-TT': [{ zeit, text }] } für die Tage von … bis (date)"""
    serien = {t.get('uid'): t['tz'] for t in termine if t.get('regel') and not t.get('rid')}
    # einzeln geänderte oder abgesagte Wiederholungen: (uid, Beginn in der Zeitzone der Serie)
    geaendert = {(t['uid'], umrechnen(*t['rid'][:2], serien.get(t['uid']))) for t in termine if t.get('rid') and t.get('uid')}
    bis_dt = datetime.datetime.combine(bis, datetime.time.max) + datetime.timedelta(days=1)   # Spielraum für Zeitzonen
    tage = {}
    for t in termine:
        if t.get('status') == 'CANCELLED':
            continue
        if t.get('regel') and not t.get('rid'):
            try:
                beginne = [b for b in wiederholungen(t['start'], t['tz'], t['regel'], bis_dt)
                           if b not in t['aus'] and (t.get('uid'), b) not in geaendert]
            except (ValueError, KeyError, IndexError):
                continue                     # Regel nicht verstanden → Termin weglassen
        else:
            beginne = [t['start']]
        for b in beginne:
            if b + t['dauer'] < datetime.datetime.combine(von, datetime.time.min) - datetime.timedelta(days=1):
                continue                     # endet lange vor dem Zeitraum
            anfang, schluss = umrechnen(b, t['tz'], HEIMAT), umrechnen(b + t['dauer'], t['tz'], HEIMAT)
            letzter = (schluss - datetime.timedelta(microseconds=1)).date() if schluss > anfang else anfang.date()
            tag = max(anfang.date(), von)
            while tag <= min(letzter, bis, anfang.date() + datetime.timedelta(days=62)):
                zeit = '' if t['ganz'] or tag != anfang.date() else anfang.strftime('%H:%M')
                tage.setdefault(tag.isoformat(), []).append({'zeit': zeit, 'text': t['text'] or '(ohne Titel)'})
                tag += datetime.timedelta(days=1)
    return tage


def google_liste():
    with sperre:
        try:
            liste = json.loads(wert('google_kalender', '[]'))
        except ValueError:
            liste = []
    return liste if isinstance(liste, list) else []


def google_speichern(liste):
    with sperre:
        setze('google_kalender', json.dumps(liste, ensure_ascii=False))


def google_termine(von, bis):
    """→ { kalender: [{ id, name, fehler }], termine: { 'JJJJ-MM-TT': [{ zeit, text }] } } – ohne die Adressen"""
    liste = google_liste()
    with ThreadPoolExecutor(4) as pool:
        geholt = list(pool.map(lambda k: kalender_holen(k['adresse']), liste))
    kalender, termine = [], {}
    for k, g in zip(liste, geholt):
        kalender.append({'id': k['id'], 'name': g.get('name') or k.get('name') or 'Google Kalender', 'fehler': g.get('fehler')})
        if 'fehler' not in g:
            for tag, eintraege in termine_zwischen(g['termine'], von, bis).items():
                termine.setdefault(tag, []).extend(eintraege)
    return {'kalender': kalender, 'termine': termine}


def google_hinzufuegen(adresse):
    adresse = re.sub(r'^webcals?://', 'https://', adresse.strip(), flags=re.I)
    if not re.fullmatch(r'https://[^\s]{10,2000}', adresse):
        raise Ungueltig('Bitte die vollständige Adresse einfügen (beginnt mit https://)')
    liste = google_liste()
    if any(k['adresse'] == adresse for k in liste):
        raise Ungueltig('Dieser Kalender ist schon verbunden')
    with ical_sperre:
        ical_cache.pop(adresse, None)
    g = kalender_holen(adresse)
    if 'fehler' in g:
        raise Ungueltig(f'Kalender {g["fehler"]}')
    liste.append({'id': secrets.token_hex(6), 'adresse': adresse, 'name': g['name']})
    google_speichern(liste)


# ================= Webserver =================
class Anfrage(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB), **kwargs)

    def antwort(self, status, daten=None, kopf=None):
        inhalt = json.dumps(daten, ensure_ascii=False).encode() if daten is not None else b''
        self.send_response(status)
        for k, v in (kopf or {}).items():
            self.send_header(k, v)
        if daten is not None:
            self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(inhalt)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(inhalt)

    def do_GET(self):
        pfad = self.path.split('?', 1)[0]
        if pfad == '/api/daten':
            with sperre:
                etag = f'"v{version()}"'
                if self.headers.get('If-None-Match') == etag:
                    return self.antwort(HTTPStatus.NOT_MODIFIED, kopf={'ETag': etag})
                return self.antwort(HTTPStatus.OK, alles(), {'ETag': etag})
        if pfad == '/api/version':
            return self.antwort(HTTPStatus.OK, {'version': APP_VERSION, 'datum': APP_DATUM, 'update': update_info()})
        if pfad in ('/api/finanzen/suche', '/api/finanzen/kurse', '/api/finanzen/live', '/api/finanzen/verlauf'):
            return self.finanzen(pfad)
        if pfad == '/api/google':
            abfrage = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
            try:
                von = datetime.date.fromisoformat((abfrage.get('von') or [''])[0])
                bis = datetime.date.fromisoformat((abfrage.get('bis') or [''])[0])
                if not datetime.timedelta(0) <= bis - von <= datetime.timedelta(days=400):
                    raise ValueError('Zeitraum zu lang')
            except ValueError as e:
                return self.antwort(HTTPStatus.BAD_REQUEST, {'fehler': f'von/bis fehlen oder sind falsch ({e})'})
            return self.antwort(HTTPStatus.OK, google_termine(von, bis))
        if pfad == '/api/spotify/status':
            return self.antwort(HTTPStatus.OK, sp_status())
        if pfad.startswith('/api/spotify/web/'):
            return self.spotify_web('GET')
        if pfad.startswith('/api/'):
            return self.antwort(HTTPStatus.NOT_FOUND, {'fehler': 'unbekannt'})
        if pfad == '/config.js':          # Einstellungen aus den Umgebungsvariablen
            inhalt = f"window.INTRANET_CONFIG = {json.dumps({'version': APP_VERSION, 'datum': APP_DATUM})};\n".encode()
            self.send_response(HTTPStatus.OK)
            self.send_header('Content-Type', 'text/javascript; charset=utf-8')
            self.send_header('Content-Length', str(len(inhalt)))
            self.end_headers()
            return self.wfile.write(inhalt)
        # Immer die Datei selbst schicken, nie „unverändert“ (304): Nach einem Update tragen die Dateien das Datum
        # ihres Commits, das älter sein kann als das der bisherigen – der Browser behielte sonst den alten Stand.
        del self.headers['If-Modified-Since']
        return super().do_GET()

    def do_HEAD(self):
        return self.do_GET() if self.path.startswith(('/api/', '/config.js')) else super().do_HEAD()

    def inhalt_lesen(self):
        laenge = int(self.headers.get('Content-Length') or 0)
        if laenge > MAX_ANFRAGE:
            raise Ungueltig('Anfrage zu groß')
        return self.rfile.read(laenge)

    def finanzen(self, pfad):
        abfrage = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
        try:
            if pfad == '/api/finanzen/suche':
                q = (abfrage.get('q') or [''])[0].strip()
                if not 1 <= len(q) <= 60:
                    return self.antwort(HTTPStatus.BAD_REQUEST, {'fehler': 'Suchbegriff fehlt oder ist zu lang'})
                return self.antwort(HTTPStatus.OK, wertpapier_suche(q))
            symbole = list(dict.fromkeys(s for s in (abfrage.get('symbole') or [''])[0].split(',') if s))
            if not symbole or len(symbole) > 50 or not all(SYMBOL.fullmatch(s) for s in symbole):
                return self.antwort(HTTPStatus.BAD_REQUEST, {'fehler': 'symbole fehlen oder haben ein falsches Format'})
            if pfad == '/api/finanzen/verlauf':
                zeitraum = (abfrage.get('zeitraum') or [''])[0]
                if zeitraum not in VERLAUF:
                    return self.antwort(HTTPStatus.BAD_REQUEST, {'fehler': f'zeitraum muss einer von {", ".join(VERLAUF)} sein'})
                return self.antwort(HTTPStatus.OK, verlaeufe(symbole, zeitraum))
            return self.antwort(HTTPStatus.OK, live(symbole) if pfad == '/api/finanzen/live' else kurse(symbole))
        except (OSError, ValueError, KeyError, TypeError) as e:     # Yahoo nicht erreichbar oder unerwartete Antwort
            return self.antwort(HTTPStatus.BAD_GATEWAY, {'fehler': f'Yahoo Finance nicht erreichbar ({e})'})

    def spotify_web(self, methode):
        try:
            body = self.inhalt_lesen() if methode != 'GET' else None
            status, inhalt = sp_web(methode, self.path[len('/api/spotify/web'):], body)
        except SpotifyFehler as e:
            return self.antwort(e.status, e.json())
        except (Ungueltig, ValueError) as e:
            return self.antwort(HTTPStatus.BAD_REQUEST, {'error': {'status': 400, 'message': str(e)}})
        except OSError as e:                     # Spotify nicht erreichbar
            return self.antwort(HTTPStatus.BAD_GATEWAY, {'error': {'status': 502, 'message': f'Spotify nicht erreichbar ({e})'}})
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(inhalt)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(inhalt)

    def do_PUT(self):
        if self.path.startswith('/api/spotify/web/'):
            return self.spotify_web('PUT')
        return self.antwort(HTTPStatus.NOT_FOUND, {'fehler': 'unbekannt'})

    def do_POST(self):
        if self.path.startswith('/api/spotify/web/'):
            return self.spotify_web('POST')
        if self.path == '/api/sicherheit':
            try:
                anfrage = json.loads(self.inhalt_lesen() or b'{}')
                if not isinstance(anfrage, dict):
                    raise Ungueltig('Objekt erwartet')
                sicherheit_aendern(anfrage)
            except PinFalsch as e:
                return self.antwort(HTTPStatus.FORBIDDEN, {'fehler': str(e)})
            except (Ungueltig, ValueError) as e:
                return self.antwort(HTTPStatus.BAD_REQUEST, {'fehler': str(e)})
            if anfrage['aktion'] != 'pruefen':
                self.log_message('Sicherheit: %s', anfrage['aktion'])
            with sperre:
                return self.antwort(HTTPStatus.OK, sicherheit())
        if self.path in ('/api/spotify/abmelden', '/api/spotify/code', '/api/google/kalender', '/api/google/entfernen'):
            with sperre:
                zu = gesperrt()
            if zu:
                return self.antwort(HTTPStatus.FORBIDDEN, {'fehler': 'Konfiguration ist gesperrt (Einstellungen → Sicherheit)'})
        if self.path == '/api/spotify/abmelden':
            sp_abmelden()
            return self.antwort(HTTPStatus.OK, sp_status())
        if self.path == '/api/spotify/code':
            try:
                adresse = json.loads(self.inhalt_lesen() or b'{}').get('adresse', '')
                if not sp_eingerichtet():
                    raise SpotifyFehler(400, 'Spotify ist auf dem Server nicht eingerichtet')
                sp_code_einloesen(str(adresse))
            except SpotifyFehler as e:
                return self.antwort(HTTPStatus.BAD_REQUEST, {'fehler': str(e)})
            except (Ungueltig, ValueError, AttributeError) as e:
                return self.antwort(HTTPStatus.BAD_REQUEST, {'fehler': f'Ungültige Anfrage ({e})'})
            except OSError as e:
                return self.antwort(HTTPStatus.BAD_GATEWAY, {'fehler': f'Spotify nicht erreichbar ({e})'})
            self.log_message('Spotify: angemeldet')
            return self.antwort(HTTPStatus.OK, sp_status())
        if self.path in ('/api/update/jetzt', '/api/update/modus'):
            if not UPDATE_REPO:
                return self.antwort(HTTPStatus.BAD_REQUEST, {'fehler': 'Updates sind aus (UPDATE_REPO ist leer)'})
            if self.path == '/api/update/modus':
                try:
                    modus = json.loads(self.inhalt_lesen() or b'{}').get('modus')
                except (Ungueltig, ValueError, AttributeError) as e:
                    return self.antwort(HTTPStatus.BAD_REQUEST, {'fehler': str(e)})
                if modus not in UPDATE_MODI:
                    return self.antwort(HTTPStatus.BAD_REQUEST, {'fehler': f'modus muss einer von {", ".join(UPDATE_MODI)} sein'})
                with sperre:
                    setze('update_modus', modus)
            else:
                self.log_message('Update von Hand angestoßen')
                update_stand['fehler'], update_stand['laeuft'] = None, True
                update_jetzt.set()            # Schleife wacht auf und prüft sofort
            return self.antwort(HTTPStatus.OK, update_info())
        if self.path in ('/api/google/kalender', '/api/google/entfernen'):
            try:
                anfrage = json.loads(self.inhalt_lesen() or b'{}')
                if self.path == '/api/google/kalender':
                    google_hinzufuegen(str(anfrage.get('adresse', '')))
                    self.log_message('Google Kalender verbunden')
                else:
                    google_speichern([k for k in google_liste() if k['id'] != anfrage.get('id')])
            except (Ungueltig, ValueError, AttributeError) as e:
                return self.antwort(HTTPStatus.BAD_REQUEST, {'fehler': str(e)})
            return self.antwort(HTTPStatus.OK, {'ok': True})
        if self.path != '/api/aenderungen':
            return self.antwort(HTTPStatus.NOT_FOUND, {'fehler': 'unbekannt'})
        try:
            liste = json.loads(self.inhalt_lesen() or b'[]')
            if not isinstance(liste, list):
                raise Ungueltig('Liste erwartet')
        except (ValueError, UnicodeDecodeError) as e:
            return self.antwort(HTTPStatus.BAD_REQUEST, {'fehler': str(e)})
        abgelehnt = []                    # ungültige Änderungen überspringen, die übrigen trotzdem speichern
        with sperre:
            try:
                db.execute('BEGIN')
                for a in liste:
                    try:
                        aendern(a)
                    except Ungueltig as e:
                        abgelehnt.append(str(e))
                if len(abgelehnt) < len(liste):
                    setze('version', version() + 1)
                db.execute('COMMIT')
            except Exception:
                db.execute('ROLLBACK')
                raise
            if abgelehnt:
                self.log_message('Abgelehnt: %s', '; '.join(abgelehnt))
            return self.antwort(HTTPStatus.OK, {'version': version(), 'abgelehnt': abgelehnt})

    def end_headers(self):
        # Seite, Skripte und Stile immer frisch laden (Updates kommen sofort an); Bilder eine Woche zwischenspeichern
        if not self.path.startswith('/api/'):     # die Schnittstelle setzt ihren eigenen Wert (no-store)
            self.send_header('Cache-Control', 'public, max-age=604800' if self.path.startswith('/assets/') else 'no-cache')
        super().end_headers()

    def list_directory(self, path):       # keine Ordnerlisten zeigen
        self.send_error(HTTPStatus.NOT_FOUND)

    def log_request(self, code='-', size='-'):
        # Das regelmäßige Abfragen der Geräte nicht ins Protokoll schreiben, nur Fehler und Änderungen
        if self.path.startswith(('/api/daten', '/api/version', '/api/spotify/web/me/player', '/api/spotify/status', '/api/finanzen/', '/api/google?')) and str(code) in ('200', '204', '304'):
            return
        if not self.path.startswith('/api/') and str(code)[0] in '23':
            return
        super().log_request(code, size)


def main():
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))   # Docker stoppt den Container sofort statt nach 10 s
    server = ThreadingHTTPServer(('', PORT), Anfrage)
    server.daemon_threads = True
    print(f'Lokal-Intranet-Hub läuft auf Port {PORT}  (Version: {APP_VERSION[:7] or "unbekannt"}, Seite: {WEB}, Datenbank: {DATENBANK})', flush=True)
    if UPDATE_REPO:
        print(f'Updates: {update_modus()} von github.com/{UPDATE_REPO} ({UPDATE_ZWEIG})', flush=True)
        threading.Thread(target=update_schleife, daemon=True).start()
    try:
        server.serve_forever()
    except (KeyboardInterrupt, SystemExit):
        pass
    finally:
        db.close()


if __name__ == '__main__':
    main()
