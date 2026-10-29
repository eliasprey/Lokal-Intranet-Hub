# Lokal-Intranet-Hub

Startseite für das Wandtablet und den PC. Die Seite läuft im Browser; ein kleiner Python-Server
(`server/server.py`, nur Standardbibliothek) liefert sie aus und speichert Termine, Urlaube, Notizen und das Depot
in einer SQLite-Datenbank – so sind auf jedem Gerät dieselben Daten. Aus dem Internet kommen nur die
Schriftart (Google Fonts), das Wetter (Deutscher Wetterdienst über Bright Sky), die Börsenkurse (Yahoo Finance)
und – wenn eingerichtet – Spotify und die Termine aus Google Kalender.

## Ordner

```
Lokal-Intranet-Hub/
├─ server/server.py        Webserver + Datenbank (SQLite) für Termine, Urlaube, Notizen, Depot; holt Kurse
├─ src/                    ← nur dieser Ordner wird im Browser ausgeliefert
│  ├─ index.html           Aufbau der Seite (nur HTML)
│  ├─ config.js            Einstellungen, die der Docker-Container beim Start einträgt (sonst leer)
│  ├─ css/style.css        Aussehen
│  ├─ js/                  Logik, ein Modul pro Aufgabe
│  │  ├─ main.js           Start: schaltet alle Teile ein
│  │  ├─ aktualisierung.js Seite neu laden, wenn der Server eine neue Version hat
│  │  ├─ seiten.js         Blättern zwischen Finanzen, Kalender, Dashboard, Shortcuts und Smarthome
│  │  ├─ sonne.js          Sonnenauf- und -untergang
│  │  ├─ einstellungen.js  alle Einstellungen an einem Ort
│  │  ├─ hilfen.js         kleine Hilfsfunktionen (Datum, Kalenderwoche …)
│  │  ├─ speicher.js       Termine, Urlaube, Notizen, Depot: Abgleich mit der Datenbank, Kopie im Browser
│  │  ├─ uhr.js            Uhr, Datum, Begrüßung, Bild „Mein Zuhause“
│  │  ├─ feiertage.js      Feiertage je Bundesland
│  │  ├─ kalender.js       Kalender (Anlegen/Löschen), „Anstehend“
│  │  ├─ google.js         Termine aus Google Kalender (nur lesen), Fenster zum Verbinden
│  │  ├─ notizen.js        Notiz unten im Dashboard
│  │  ├─ wetter.js         Wetter
│  │  ├─ spotify.js        Spotify-Player
│  │  ├─ suche.js          Suchleiste
│  │  ├─ finanzen.js       Seite „Finanzen“: Depot mit Live-Kursen, Suche (Aktien, ETFs, Fonds, Kryptos)
│  │  ├─ diagramm.js       Kursdiagramm (SVG) für die Seite „Finanzen“
│  │  ├─ einstellungsfenster.js  Fenster „Einstellungen“: Versionsverwaltung, persönliche Angaben, Intranet-Name, Sicherheit
│  │  ├─ sicherheit.js     PIN für die Einstellungen, Konfiguration auf den Seiten sperren
│  │  └─ shortcuts.js      Seite „Shortcuts“: Kacheln anlegen, ändern, entfernen
│  └─ assets/backgrounds/  16 Hintergrundbilder, benannt nach <jahreszeit>_<tageszeit>.jpg
├─ Dockerfile              baut das Docker-Image (Python + Seite, Datenbank unter /data)
├─ docker-compose.yml      Start mit Docker Compose auf jedem Linux-Rechner
├─ .github/workflows/      baut bei jedem Push auf main das Docker-Image (GitHub Actions, amd64 + arm64)
├─ systemd/                Dienst-Datei für den Betrieb ohne Docker
├─ unraid/                 Vorlage für Unraid (optional)
├─ .vscode/settings.json   Live Server liefert nur src/ aus
└─ README.md
```

## Aufbau der Seite

Dunkles Dashboard mit Seitenleiste. Es gibt fünf Seiten: **Finanzen | Kalender | Dashboard | Shortcuts | Smarthome**. Gewechselt
wird über das Menü links, die Pfeile oben rechts, die Pfeiltasten ← → oder durch Wischen (Touch).
Kopfzeile (Begrüßung, Suche) bleibt immer stehen.

```
┌────────┬──────────────────────────────────────────────────────────────┐
│ Logo   │ Guten Tag, Elias ☀ (groß)  [ Suche …          / ]   ☁  ‹ ›   │
│        │ Montag, 12. Oktober 2026 · KW 42                             │
│ ▣ Dash │ [Außen] [Heute] [Wind] [Luftfeuchte] [Regen]                 │
│ ▣ Kal. │ ┌ Mein Zuhause (Bild) ───────────┐ ┌ Spotify ──────────────┐ │
│ ▣ Fin. │ │                                │ │ ▣ Titel     ⏮ ▶ ⏭     │ │
│ ▣ Short│ └ Herbst · Mittag  ↑07:25 ↓18:29 ┘ └───────────────────────┘ │
│ ▣ Smart│ [Wettervorschau für Ort · 7 Tage] [Uhrzeit] [Anstehend]      │
│ ⚙ Einst│ Notiz [ hier direkt eintippen …                         ]    │
└────────┴──────────────────────────────────────────────────────────────┘
```

| Breite | Anordnung |
|---|---|
| ab 1400 px | Seitenleiste mit Text, wie oben |
| 600–1399 px | schmale Seitenleiste nur mit Symbolen (z. B. Tablet quer) |
| Hochformat oder unter 1000 px | Karten untereinander, die Seite scrollt |
| unter 600 px | Menü als Leiste unten (Handy) |

## Was macht der Code? (grob)

- **Mein Zuhause** (`uhr.js`): Je nach Jahreszeit und Tageszeit wird das passende Bild in der Karte
  „Mein Zuhause“ geladen und weich überblendet. Ab Sonnenuntergang kommt immer das Nachtbild (im Winter also
  schon am Nachmittag); bis dahin höchstens das Abendbild.
- **Uhr & Datum** (`uhr.js`): Wird jede Sekunde aktualisiert; die Sekunden laufen im Ring der Karte
  „Uhrzeit“. Zeigt außerdem Kalenderwoche, Tag im Jahr und die Begrüßung („Guten Morgen, Anna“ usw., Name aus den Einstellungen).
- **Sonnenzeiten** (`sonne.js`): Sonnenauf- und -untergang für den Ort aus den Einstellungen, selbst berechnet. Stehen
  unten rechts im Bild „Mein Zuhause“.
- **Feiertage** (`feiertage.js`): Die gesetzlichen Feiertage des Bundeslands, das in den Einstellungen beim Ort
  steht (ohne Ort nur die bundesweiten). Werden für jedes Jahr selbst berechnet, auch die beweglichen rund um Ostern
  und der Buß- und Bettag; in Augsburg kommt das Friedensfest dazu.
- **Seiten** (`seiten.js`): Blättert zwischen Finanzen, Kalender, Dashboard, Shortcuts und Smarthome – über das Menü, die Pfeile,
  die Pfeiltasten oder Wischen (die Seite folgt dem Finger).
- **Kalender** (`kalender.js`): Große Monatsansicht auf eigener Seite mit Kalenderwochen, Feiertagen,
  Urlaub und Terminen. Man kann mehrere Tage oder einen Zeitraum (erster Tag → späterer Tag) auswählen
  und dafür auf einmal einen Termin oder Urlaub anlegen – oder mit „Einträge löschen“ alle Termine und Urlaube
  dieser Tage entfernen (nach Rückfrage, die alles auflistet).
- **Google Kalender** (`google.js`, Abruf in `server.py`): Termine aus den eigenen Google Kalendern erscheinen
  lila im Kalender und unter „Anstehend“ (nur anzeigen – ändern weiter in Google). Einrichtung siehe unten.
- **Anstehend** (`kalender.js`): Dashboard-Karte mit allem, was von heute bis in 6 Tagen ansteht.
- **Notiz** (`notizen.js`): Textfeld ganz unten im Dashboard – einfach hineintippen, es wird automatisch
  gespeichert und ist auf allen Geräten gleich. Das Feld wächst bis 4 Zeilen mit.
- **Finanzen** (`finanzen.js`, Diagramm in `diagramm.js`, Kurse über `server.py`): Rechts zwei Reiter.
  Unter **Hinzufügen** nach Aktien, ETFs, Fonds oder Kryptos suchen (Name, Börsenkürzel, ISIN oder z. B. „Bitcoin“ –
  WKN kennt Yahoo nicht), einen Treffer antippen, Stückzahl (bis 8 Nachkommastellen) und optional den Einkaufskurs pro
  Stück in Euro eintragen. Unter **Assets** steht oben „Gesamt“, darunter jede Position mit aktuellem Kurs (alle
  5 Sekunden neu, leuchtet beim Steigen grün und beim Fallen rot auf), Wert und Gewinn. Stift = Stückzahl/Einkaufskurs
  ändern, Mülleimer = entfernen.
  Was unter Assets gewählt ist (Gesamt oder ein einzelnes Asset), zeigt die linke Seite: oben der **Gesamtwert** und
  der **Gewinn/Verlust seit dem Kauf** in Euro und Prozent (aktueller Wert − Einkaufskurs × Stückzahl, bezogen auf den
  Einkaufswert; nur Positionen mit Einkaufskurs). Beispiel: A 100 × 10 € → jetzt 15 €, B 50 × 10 € → jetzt 5 €:
  Gesamtwert 1.750 €, Gewinn +250 € = +16,67 %. Darunter das **Diagramm** über Intraday, 1W, 1M, 3M, 1J, 3J, 5J
  oder MAX – für ein Asset der Kurs in seiner Börsenwährung, für Gesamt der Wert aller Assets zusammen in Euro (mit
  den heutigen Stückzahlen gerechnet, Kaufdaten sind nicht bekannt). Mit Maus oder Finger darüberfahren zeigt
  Datum und Wert. Kurse in Dollar o. ä. werden mit dem Wechselkurs des jeweiligen Zeitpunkts umgerechnet.
  Die Kurse kommen kostenlos und ohne Anmeldung von Yahoo Finance (je nach Börse leicht verzögert). Aktuelle Kurse
  werden nur abgefragt, solange die Seite Finanzen zu sehen ist; der Server holt sie für alle Geräte zusammen
  höchstens alle 4 Sekunden, den Verlauf je nach Zeitraum alle 1–60 Minuten.
- **Shortcuts** (`shortcuts.js`): Eigene Seite (Menüpunkt „Shortcuts“) mit großen Kacheln, die Webseiten und
  Geräte im Heimnetz öffnen. Unten rechts **Shortcut hinzufügen** (Name und Adresse, z. B. `fritz.box` oder
  `http://192.168.178.1`) und **Shortcuts bearbeiten**: Dann öffnet ein Antippen der Kachel das Fenster zum Ändern
  oder Entfernen. Die Liste liegt in der Datenbank und gilt auf allen Geräten. Beim allerersten Start stehen
  Google Kalender und Gmail drin. Das Symbol (Mail, Kalender, Router, Drucker, Cloud …) wird am Namen erkannt.
- **Smarthome**: Eigene Seite ganz rechts, noch ohne Inhalt.
- **Wetter** (`wetter.js`): Aktuelles Wetter für den Ort aus den Einstellungen in den Kacheln oben (Temperatur,
  Höchst/Tiefst, Wind, Luftfeuchte, Regenrisiko) und eine Vorschau für heute und die nächsten 6 Tage (7 Tage):
  je Tag ein Balken von Tiefst- bis Höchstwert, dazu die Regenwahrscheinlichkeit (ab 10 %). Die Daten stammen vom Deutschen Wetterdienst (DWD) und kommen
  kostenlos und ohne Anmeldung über <https://brightsky.dev>. Sie werden alle 15 Minuten neu geladen und
  im Browser zwischengespeichert, damit nach dem Neuladen sofort etwas dasteht.
- **Spotify** (`spotify.js`, Anmeldung in `server.py`): Einmal mit dem Spotify-Konto anmelden, dann steuern
  alle Geräte dasselbe Konto – auch über `http://`. Der Player zeigt, was gerade läuft (großes Cover, Titel,
  Fortschritt), rechts daneben die laufende Playlist bzw. das Album zum Durchscrollen – antippen spielt ab diesem
  Titel (läuft nichts aus einer Playlist, steht dort die Warteschlange; ist die Karte sehr niedrig, z. B. am Tablet
  quer, bleibt die Liste weg). Abspielen/Pause, vor/zurück, springen, Lautstärke und Wiedergabegerät wählen. Über „Musik“
  öffnet sich ein Fenster zum Suchen von Liedern und mit den eigenen Playlists. Ein gesuchtes Lied wird im
  zugehörigen Album weitergespielt. Einrichtung siehe unten.
- **Suche** (`suche.js`): Sucht bei Google. Adressen wie `wetter.de` oder IP-Adressen werden direkt geöffnet.
- **Einstellungen** (`einstellungsfenster.js`): Knopf unten in der Seitenleiste (nicht auf dem Handy), vier Reiter:
  - **Versionsverwaltung:** „Aktuellste Version ziehen“ holt sofort die neueste Version von GitHub; darunter wählt
    man, wie oft der Server das von selbst tut: alle 15 Minuten, 1× am Tag (nachts um 3 Uhr) oder aus.
  - **Persönliche Angaben:** Name für die Begrüßung und der Ort (Suche über Open-Meteo, nur Deutschland) für
    Wetter, Sonnenzeiten und Feiertage. Das Bundesland wird beim Ort vorgeschlagen und lässt sich ändern.
  - **Intranet-Name:** steht oben links und im Browser-Tab.
  - **Sicherheit** (`sicherheit.js`): **PIN einschalten** – ab dann öffnen sich die Einstellungen nur mit einem
    5-stelligen PIN. Geprüft wird auf dem Server, in der Datenbank liegt nur ein Hash; nach 5 falschen Versuchen
    gibt es 5 Minuten Pause. **Konfiguration sperren** – auf den Seiten lässt sich dann nichts mehr einrichten:
    Depot (Finanzen), Shortcuts, Google Kalender verbinden/entfernen und Spotify an-/abmelden. Die Knöpfe dafür
    verschwinden, und der Server lehnt solche Änderungen ab. Termine, Urlaube, Notizen und Musik gehen weiter.
    Ohne PIN kann jeder die Sperre in den Einstellungen wieder aufheben.
  Alles davon liegt in der Datenbank und gilt auf allen Geräten.
- **Tablet** (`main.js`): Große Tippflächen, Seitenwechsel durch Wischen. Nach dem Sperren und
  Entsperren wird die Seite neu geladen.

## Wo werden die Daten gespeichert?

**Termine, Urlaube, Notizen, das Depot, die Shortcuts und die persönlichen Angaben** liegen in der Datenbank auf dem Server (`intranet.db`, im Container
unter `/data`, siehe [Installation auf Linux](#installation-auf-linux)). Jedes Gerät – PC, Tablet, Handy – sieht dieselben Einträge.

- Jede Änderung erscheint sofort und wird an den Server geschickt. Die anderen Geräte sehen sie nach
  spätestens 10 Sekunden (beim Entsperren des Tablets sofort).
- Oben rechts zeigt eine Wolke den Stand: **grün „Synchron“** = alles in der Datenbank, **gelb
  „Offline“** = Server gerade nicht erreichbar. Die Änderungen sind dann im Browser gesichert und werden
  automatisch nachgeholt. **Grau „Nur lokal“** = Seite ohne Server geöffnet (z. B. mit Live Server).
- Jeder Browser behält eine Kopie, damit die Seite sofort etwas zeigt. Die Kopie wird bei jedem Abgleich
  durch den Stand der Datenbank ersetzt.
- Bei den Notizen gilt: Die letzte Änderung gewinnt. Tippen zwei Geräte gleichzeitig, bleibt der Text
  des Geräts, auf dem zuletzt getippt wurde.
- **Umstieg:** Was ein Gerät vor der Datenbank gespeichert hatte, schickt es beim ersten Öffnen einmalig
  an den Server. Termine und Urlaube kommen dazu, alte Notizen werden an die vorhandenen angehängt.
  Überschrieben wird nichts.

Auch die **Spotify-Anmeldung** liegt auf dem Server und gilt für alle Geräte. Nur die
zwischengespeicherten Wetterdaten bleiben pro Gerät.

**Sicherung:** Den Daten-Ordner mit ins Backup nehmen – bei Docker Compose `daten/` neben der
`docker-compose.yml`, ohne Docker `/var/lib/lokal-intranet-hub`, auf Unraid `/mnt/user/appdata/lokal-intranet-hub`.
Die Datenbank lässt sich mit jedem SQLite-Programm öffnen.

Die Schnittstelle ist im Heimnetz ohne Passwort erreichbar – wer die Seite öffnen kann, kann auch
Einträge ändern. Die Seite deshalb nicht ungeschützt ins Internet stellen.

## Häufige Anpassungen

| Was | Wo |
|---|---|
| Kacheln auf der Seite „Shortcuts“ | auf der Seite selbst: „Shortcut hinzufügen“ / „Shortcuts bearbeiten“ |
| Spotify-App (Client-ID, Client-Secret) | Container-Variablen `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` |
| Name, Ort (Wetter, Sonne, Feiertage), Name des Intranets | Einstellungen → Persönliche Angaben / Intranet-Name |
| Anzahl Tage in der Wettervorschau | `WETTER_TAGE` in `src/js/einstellungen.js` |
| Suchmaschine | `SUCHMASCHINE` in `src/js/einstellungen.js` |
| Wie oft die Börsenkurse neu geholt werden | `LIVE_ALLE_SEK` (aktueller Kurs), `KURSE_ALLE_MIN` (Verlauf) in `src/js/einstellungen.js` |
| Uhrzeiten für Morgen / Mittag / Abend / Nacht | `ZEITEN` in `src/js/einstellungen.js` |
| Begrüßungstexte | `GRUSS` in `src/js/einstellungen.js` |
| Anzahl Tage in der Übersicht | `UEBERSICHT_TAGE` in `src/js/einstellungen.js` |
| Farben (Hintergrund, Karten, Akzent-Blau) | Variablen in `:root` oben in `src/css/style.css` |
| Hintergrundbilder | Dateien in `src/assets/backgrounds/` mit gleichem Namen ersetzen |

## Ausprobieren

Die Skripte sind JavaScript-Module. Browser laden Module nur von einem Webserver, **ein Doppelklick auf
`index.html` reicht deshalb nicht mehr**.

- **Mit Datenbank (wie auf dem Server):** `python3 server/server.py` → `http://127.0.0.1:8080`.
  Die Datenbank landet dabei in `daten/intranet.db` (von Git ignoriert).
- **Nur die Seite, in VS Code:** Mit der Erweiterung „Live Server“ unten rechts auf **Go Live** klicken. Die Einstellung in
  `.vscode/settings.json` sorgt dafür, dass Live Server nur den Ordner `src/` ausliefert – es erscheint
  also gleich die Startseite unter `http://127.0.0.1:5500` statt einer Ordnerliste.
- **Nur die Seite, ohne VS Code:** `python3 -m http.server 8000 -d src` → `http://127.0.0.1:8000`

Ohne `server.py` gibt es keine Datenbank: Oben rechts steht dann „Nur lokal“, die Einträge bleiben in
diesem Browser.

Spotify braucht den Server; zum Ausprobieren `SPOTIFY_CLIENT_ID` und `SPOTIFY_CLIENT_SECRET` als
Umgebungsvariablen setzen, z. B.
`SPOTIFY_CLIENT_ID=… SPOTIFY_CLIENT_SECRET=… python3 server/server.py`.

**Andere Uhrzeit oder Jahreszeit ansehen:** Hänge `?zeit=…` an die Adresse, z. B.
`http://127.0.0.1:5500/?zeit=2027-01-15T07:30` für einen Wintermorgen.

## Google Kalender verbinden

Die Termine kommen über die **geheime iCal-Adresse** des Kalenders – ohne Google-Anmeldung und ohne
Google-Cloud-Projekt. Der Server holt sie höchstens alle 5 Minuten für alle Geräte zusammen.

1. Google Kalender **am PC** öffnen (<https://calendar.google.com>) → Zahnrad → **Einstellungen**.
2. Links unter „Einstellungen für meine Kalender“ den Kalender wählen → **Kalender integrieren**.
3. **Geheime Adresse im iCal-Format** kopieren (beginnt mit `https://calendar.google.com/calendar/ical/…`).
4. Auf der Startseite: Seite **Kalender** → Knopf **Google** → Adresse einfügen → **Verbinden**.

Für weitere Kalender (z. B. Familie, Geburtstage) Schritte 2–4 wiederholen. Die Adressen liegen nur in der Datenbank
auf dem Server und gehen nie an den Browser. Wer sie kennt, kann den Kalender lesen. Gerät sie in falsche Hände,
in Google unter derselben Stelle **Zurücksetzen** wählen und die neue Adresse verbinden.
Neue Termine in Google erscheinen mit etwas Verzögerung (Google aktualisiert die iCal-Datei nicht sofort).

## Spotify einrichten

Spotify erlaubt die Steuerung nur für eine **eigene „App“** im Spotify-Entwicklerbereich. Das ist
kostenlos und dauert ein paar Minuten.

### Einmalig im Spotify-Dashboard

1. Auf <https://developer.spotify.com/dashboard> mit dem Spotify-Konto anmelden und **Create app** wählen
   (oder die schon vorhandene App öffnen).
   - Name und Beschreibung: beliebig, z. B. „Lokal-Intranet-Hub“
   - **Redirect URI:** genau **`http://127.0.0.1:8888/callback`** eintragen → **Add**
   - Bei „Which API/SDKs are you planning to use?“ **Web API** ankreuzen.
2. In der App unter **Settings** die **Client ID** kopieren und bei **View client secret** das **Client
   Secret**.
3. Unter **User Management** die E-Mail-Adresse jedes Spotify-Kontos eintragen, das sich anmelden soll
   (höchstens 5).

### Auf dem Server

Client-ID und Client-Secret als `SPOTIFY_CLIENT_ID` und `SPOTIFY_CLIENT_SECRET` eintragen:

- **Docker Compose:** in der `docker-compose.yml` unter `environment`, dann `docker compose up -d`.
- **Ohne Docker:** `sudo systemctl edit lokal-intranet-hub`, dort unter `[Service]` je eine Zeile
  `Environment=SPOTIFY_CLIENT_ID=…` und `Environment=SPOTIFY_CLIENT_SECRET=…`, dann
  `sudo systemctl restart lokal-intranet-hub`.
- **Unraid:** beim Container **Spotify Client-ID** und **Spotify Client-Secret** → **Apply**.

Das Secret bleibt auf dem Server und kommt nie in den Browser.

### Anmelden (einmal, an einem beliebigen Gerät)

1. Im Spotify-Feld auf **„1. Bei Spotify anmelden“** tippen. Es öffnet sich ein neuer Tab mit Spotify.
2. Anmelden und **Zustimmen**.
3. Danach zeigt der Browser eine **Fehlerseite** („127.0.0.1 … nicht erreichbar“). **Das ist richtig so.**
   Die Adresse aus der Adresszeile dieser Seite kopieren (sie beginnt mit
   `http://127.0.0.1:8888/callback?code=…`) und den Tab schließen.
4. Die Adresse im Spotify-Feld bei **„2. Adresse der Fehlerseite hier einfügen“** einfügen →
   **Übernehmen**.

Fertig – ab jetzt zeigen alle Geräte den Player. Der Server merkt sich die Anmeldung in der Datenbank und
erneuert sie selbst. **Abmelden** (oben im Spotify-Feld) meldet alle Geräte ab.

Warum der Umweg? Spotify lässt als Rücksprung-Adresse nur `https://…` oder `http://127.0.0.1` zu, nicht
`http://192.168.178.50`. Deshalb kommt der Anmelde-Code über die kopierte Adresse zum Server.

Wichtig:

- **Spotify Premium** ist nötig – für den Besitzer der App und zum Steuern.
- **Wo kommt der Ton raus?** Auf einem Spotify-Gerät: die Spotify-App auf Handy, Tablet oder PC, ein
  Lautsprecher, der Fernseher … Das Gerät wählt man unten im Spotify-Feld. Taucht ein Gerät nicht auf,
  einmal kurz die Spotify-App darauf öffnen. Im Browser selbst wird nicht abgespielt.
- Ganz entziehen lässt sich der Zugriff unter <https://www.spotify.com/account/apps/>.

## Installation auf Linux

Der Hub läuft auf jedem Linux-Rechner im Heimnetz, der dauerhaft an ist – Server, NAS, alter PC oder Raspberry Pi.
Am einfachsten mit Docker; ohne Docker reicht Python ab 3.9 (ohne Zusatzpakete).

Bei jedem Push auf `main` baut GitHub automatisch ein fertiges Docker-Image
(`.github/workflows/docker.yml`) für **amd64** (Intel/AMD) und **arm64** (Raspberry Pi 4/5, 64-Bit-System) und
legt es unter **`ghcr.io/eliasprey/lokal-intranet-hub:latest`** ab. Im Image liefert `server/server.py` den Ordner
`src/` auf Port 80 aus und speichert die Daten in `/data/intranet.db`.

Ist das Image auf GitHub privat (**Packages → lokal-intranet-hub → Package settings**), muss man sich auf dem
Rechner einmal anmelden: `docker login ghcr.io -u eliasprey` (als Passwort ein GitHub-Token mit dem Recht
`read:packages`). Steht es auf **Public**, entfällt das – es enthält keine Zugangsdaten.

### Mit Docker Compose (empfohlen)

1. Docker mit dem Compose-Plugin installieren (<https://docs.docker.com/engine/install/>; auf Debian, Ubuntu und
   Raspberry Pi OS z. B. `curl -fsSL https://get.docker.com | sudo sh`).
2. Einen Ordner anlegen und die `docker-compose.yml` aus diesem Repository hineinlegen:
   ```sh
   sudo mkdir -p /opt/lokal-intranet-hub && cd /opt/lokal-intranet-hub
   sudo curl -fsSLO https://raw.githubusercontent.com/eliasprey/Lokal-Intranet-Hub/main/docker-compose.yml
   ```
3. Optional in der Datei Spotify Client-ID und Client-Secret eintragen oder den Port ändern.
4. `sudo docker compose up -d` → die Seite ist unter **`http://<IP des Rechners>:8080`** erreichbar
   (die IP zeigt `hostname -I`).

Die Datenbank liegt in `daten/` neben der `docker-compose.yml`. Der Container startet nach einem Neustart des
Rechners von selbst. Log ansehen: `sudo docker compose logs -f`.

Ohne Compose geht dasselbe mit einem Befehl:
`docker run -d --name lokal-intranet-hub --restart unless-stopped -p 8080:80 -v /opt/lokal-intranet-hub/daten:/data ghcr.io/eliasprey/lokal-intranet-hub:latest`

### Ohne Docker (systemd)

Für Rechner, auf denen kein Docker laufen soll. Braucht nur `python3` (ab 3.9) und `git`:

```sh
sudo git clone https://github.com/eliasprey/Lokal-Intranet-Hub.git /opt/lokal-intranet-hub
sudo cp /opt/lokal-intranet-hub/systemd/lokal-intranet-hub.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now lokal-intranet-hub
```

→ **`http://<IP des Rechners>:8080`**. Der Dienst läuft mit einem eigenen Benutzer ohne Rechte, die Datenbank und
geladene Updates liegen in `/var/lib/lokal-intranet-hub`. Log ansehen: `journalctl -u lokal-intranet-hub -f`.
Port, Spotify usw. ändern: `sudo systemctl edit lokal-intranet-hub` (Variablen siehe oben in `server/server.py`).

### Unraid

1. Die Vorlage `unraid/lokal-intranet-hub.xml` nach `/boot/config/plugins/dockerMan/templates-user/`
   kopieren (z. B. über die Netzwerkfreigabe `flash` → `config/plugins/dockerMan/templates-user/`).
2. Im Docker-Tab **Container hinzufügen** → Vorlage **lokal-intranet-hub** wählen. Netzwerk ist schon
   **Custom: br0** mit der festen IP **192.168.178.50** (siehe „Feste IP-Adresse“ unten). Den Ordner
   **Daten** (Standard `/mnt/user/appdata/lokal-intranet-hub`) und optional Spotify Client-ID und
   Client-Secret eintragen → **Anwenden**. Die Seite ist dann unter **`http://192.168.178.50`** erreichbar.
3. **Wer den Container schon vorher eingerichtet hat** und dort noch keinen Ordner „Daten“ hat: im Container
   **Edit → Add another Path** mit Container-Pfad `/data` und Host-Pfad `/mnt/user/appdata/lokal-intranet-hub`
   ergänzen. Ohne diesen Pfad liegt die Datenbank im Container und ist bei einem Update weg.

#### Feste IP-Adresse (192.168.178.50)

Der Container bekommt eine eigene Adresse im Heimnetz, wie ein eigenes Gerät. Die Seite läuft dort
direkt auf Port 80: `http://192.168.178.50` – ohne `:8080`. Die Port-Einstellung der Vorlage gilt nur,
wenn man wieder auf Netzwerk-Typ `bridge` umstellt.

Einmalig vorbereiten:

1. **FritzBox:** Die FritzBox vergibt Adressen standardmäßig von `.20` bis `.200` – `.50` liegt mitten
   drin und könnte schon an ein anderes Gerät vergeben sein. Unter **Heimnetz → Netzwerk →
   Netzwerkeinstellungen → IPv4-Einstellungen** den DHCP-Bereich so ändern, dass `.50` außerhalb liegt
   (z. B. von `192.168.178.100` bis `192.168.178.200`). Geräte, die schon eine Adresse unter `.100`
   haben, bekommen nach dem nächsten Neuverbinden eine neue.
2. **Unraid:** **Settings → Docker** → Docker auf **Disabled** stellen (Erweiterte Ansicht oben rechts),
   dann bei **IPv4 custom network on interface br0** einen Haken setzen: Subnet `192.168.178.0/24`,
   Gateway `192.168.178.1` → **Apply** → Docker wieder auf **Enabled**.
   Ist bei Unraid die Netzwerkbrücke ausgeschaltet (Standard ab Unraid 6.12), heißt das Netzwerk
   **eth0** statt **br0** – dann in der Vorlage bzw. beim Container **Custom: eth0** wählen.
3. **Bestehender Container:** Im Docker-Tab auf den Container → **Edit** → **Network Type:
   Custom: br0**, **Fixed IP address: 192.168.178.50** → **Apply**.

**Unraid selbst erreicht die Adresse zunächst nicht.** Alle anderen Geräte im Heimnetz schon. Soll
der Unraid-Server oder ein anderer Container im Netzwerk `bridge` (z. B. ein Reverse-Proxy) die Seite
erreichen, unter **Settings → Docker** die Option **Host access to custom networks** auf **Enabled** stellen.

### Automatische Updates

Der Server sieht alle **15 Minuten** auf GitHub nach, ob auf `main` ein neuer Commit liegt – oder, je nach Wahl
unter **Einstellungen** (Knopf unten in der Seitenleiste), nur 1× am Tag nachts um 3 Uhr oder gar nicht von selbst.
Dort holt **„Aktuellste Version ziehen“** ein Update sofort. Gibt es einen neuen Commit:

1. lädt er `src/` und `server/` dieses Commits in den Daten-Ordner (`code/<commit>`),
2. prüft, ob `server.py` fehlerfrei ist – sonst bleibt alles beim Alten und er versucht es beim nächsten Mal,
3. startet sich mit dem neuen Code neu (dauert unter einer Sekunde; die Datenbank bleibt, wie sie ist),
4. die offenen Seiten (Tablet, PC) merken die neue Version innerhalb einer Minute und laden sich neu –
   aber erst, wenn eine Minute lang nichts eingegeben wurde. Noch nicht gespeicherte Einträge gehen nicht
   verloren.

Das gilt für alle drei Wege oben gleich. Nach einem Push ist die Änderung also nach spätestens etwa 16 Minuten
überall zu sehen (bei „1× am Tag“ am nächsten Morgen, mit „Aktuellste Version ziehen“ sofort). Was sich am
Docker-Image selbst ändert (`Dockerfile`, Python-Version), kommt nur mit einem neuen Image:
`sudo docker compose pull && sudo docker compose up -d`, auf Unraid **Aktualisieren** im Docker-Tab bzw. das
Plugin **CA Auto Update Applications**.

**Versionsnummer:** Klein über dem Knopf **Einstellungen** steht, welcher Stand läuft, z. B. `v2026.10.29 · 20:04`.
Das ist der Zeitpunkt des Commits (Jahr.Monat.Tag · Uhrzeit), der Commit selbst steht im Tooltip. Die Nummer entsteht
von selbst, man muss nichts hochzählen. Mit Uhrzeit, weil oft mehrere Commits am selben Tag kommen. So sieht man
z. B. am Wandtablet sofort, ob es schon den neuesten Stand hat.

**Kein Token nötig:** Das Repository ist öffentlich, der Server holt die Updates ohne Anmeldung. GitHub erlaubt
so 60 Anfragen pro Stunde je Internetanschluss – alle 15 Minuten nachsehen braucht davon 4.

Im Log (siehe oben; Unraid: Container-Symbol → **Logs**) steht, was passiert, z. B.
`Neue Version 3f2a1b9 von GitHub geladen – Server startet neu`. Steht dort `GitHub antwortet 404`, ist das
Repository nicht (mehr) öffentlich oder `UPDATE_REPO` falsch; bei `403` oder `429` ist das Anfrage-Limit erreicht.

Einstellungen (Umgebungsvariablen): `UPDATE_MINUTEN` (Standard `15`, `0` schaltet die Updates ab),
`UPDATE_REPO` (im Image und in der systemd-Datei `eliasprey/Lokal-Intranet-Hub`), `UPDATE_ZWEIG` (Standard `main`).
Lokal mit `python3 server/server.py` gibt es keine Updates, solange `UPDATE_REPO` nicht gesetzt ist.

### Gut zu wissen

- Die Datenbank liegt im Daten-Ordner, nicht im Container. Ein Update oder Neuaufsetzen des
  Containers löscht also nichts.
- **Spotify** funktioniert auch unter einer Adresse wie `http://192.168.178.50` – die Anmeldung läuft über den
  Server (siehe „Spotify einrichten“).
- **Feste Adresse:** Damit Tablet und Lesezeichen den Hub immer finden, dem Rechner im Router eine feste IP geben
  (FritzBox: **Heimnetz → Netzwerk → Gerät bearbeiten → Diesem Netzwerkgerät immer die gleiche IPv4-Adresse
  zuweisen**).
- Image selbst bauen und testen: `docker build -t lokal-intranet-hub . && docker run --rm -p 127.0.0.1:8080:80 -v "$PWD/daten:/data" lokal-intranet-hub`
  → `http://127.0.0.1:8080`
