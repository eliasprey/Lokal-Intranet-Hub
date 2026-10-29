/* Fenster „Einstellungen“ (Knopf unten in der Seitenleiste) mit vier Reitern:
   - Versionsverwaltung: die neueste Version von GitHub sofort holen und einstellen, wie oft der Server das von selbst tut
     (alle paar Minuten, 1× am Tag nachts oder gar nicht). Die Updates selbst macht der Server (server.py); die Seite lädt
     sich danach neu.
   - Persönliche Angaben: Name für die Begrüßung und der Ort (Wetter, Sonnenzeiten, Feiertage des Bundeslands).
   - Intranet-Name: steht oben links.
   - Sicherheit: PIN für dieses Fenster und Konfiguration auf den Seiten sperren (sicherheit.js).
   Name, Ort, Intranet-Name und Sicherheit liegen in der Datenbank (speicher.js) und gelten auf allen Geräten. */
import { $, klickDanebenSchliesst } from './hilfen.js';
import { daten, beiAenderung, profilSpeichern } from './speicher.js';
import { BUNDESLAENDER } from './feiertage.js';
import { versionTeile } from './aktualisierung.js';
import { pinAbfragen, sicherheitSenden } from './sicherheit.js';

const geladen = window.INTRANET_CONFIG?.version || '';   // Version, mit der diese Seite ausgeliefert wurde
let info = null, warteAufUpdate = 0, abfrageTimer;

const kurz = v => (v ? v.slice(0, 7) : 'unbekannt');
const wann = sek => new Date(sek * 1000).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
function meldung(text, fehler = false) { $('esMeldung').textContent = text; $('esMeldung').classList.toggle('fehler', fehler); }

async function holen() {
  try {
    const r = await fetch('api/version', { cache: 'no-store' });
    if (!r.ok) throw new Error('Fehler ' + r.status);
    const d = await r.json();
    info = { ...d.update, datum: d.datum };
    /* Server läuft mit einer anderen Version als diese Seite → das Update ist da */
    if (d.version && geladen && d.version !== geladen) {
      meldung(`Neue Version ${kurz(d.version)} installiert – Seite wird neu geladen …`);
      setTimeout(() => location.reload(), 1200);
      return;
    }
    if (warteAufUpdate && !info.laeuft && info.geprueft >= warteAufUpdate) {   // von Hand angestoßene Prüfung ist fertig
      warteAufUpdate = 0;
      $('esZiehen').disabled = false;
      if (info.fehler) meldung('Update fehlgeschlagen: ' + info.fehler, true);
      else if (info.neuester === d.version) meldung('Schon die aktuellste Version.');
    }
  } catch (e) {
    if (warteAufUpdate) return;              // Server startet gerade neu → gleich nochmal
    info = null;
    meldung('Server nicht erreichbar – Einstellungen gehen nur, wenn die Seite vom Server kommt.', true);
  }
  zeigen();
}

function zeigen() {
  const aus = !info?.aktiv;
  const teile = versionTeile(geladen, info?.datum || window.INTRANET_CONFIG?.datum);
  $('esVersion').textContent = `Installiert: ${teile.length > 1 ? `${teile.join(' · ')} (Commit ${kurz(geladen)})` : kurz(geladen)}`
    + (info?.geprueft ? ` · zuletzt auf GitHub nachgesehen: ${wann(info.geprueft)}` : '')
    + (info?.fehler && !warteAufUpdate ? ` · Fehler: ${info.fehler}` : '');
  $('esZiehen').disabled = aus || !!warteAufUpdate;
  $('esMinuten').textContent = `Alle ${info?.minuten ?? 15} Minuten`;
  $('esTaeglich').textContent = `1× am Tag (${info?.uhr ?? 3} Uhr)`;
  document.querySelectorAll('#esModus button').forEach(b => {
    b.disabled = aus;
    b.classList.toggle('on', b.dataset.modus === info?.modus);
  });
  $('esPlan').textContent = !info ? ''
    : aus ? 'Updates sind auf dem Server ausgeschaltet (Container-Variable UPDATE_REPO ist leer).'
    : info.naechste ? `Nächste Prüfung: ${wann(info.naechste)}` : 'Nur von Hand mit „Aktuellste Version ziehen“.';
}

async function senden(pfad, daten = {}) {
  const r = await fetch('api/update/' + pfad, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(daten) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.fehler || 'Fehler ' + r.status);
  return d;
}

async function ziehen() {
  meldung('Sehe auf GitHub nach …');
  warteAufUpdate = Math.floor(Date.now() / 1000) - 1;
  zeigen();
  try {
    info = await senden('jetzt');
  } catch (e) {
    warteAufUpdate = 0; zeigen();
    return meldung('Nicht möglich: ' + e.message, true);
  }
  /* Der Server lädt die neue Version und startet neu – so lange alle 2 Sekunden nachsehen (höchstens 2 Minuten) */
  clearInterval(abfrageTimer);
  const ende = Date.now() + 120e3;
  abfrageTimer = setInterval(() => {
    if (!warteAufUpdate || Date.now() > ende) {
      clearInterval(abfrageTimer);
      if (warteAufUpdate) { warteAufUpdate = 0; meldung('Keine Antwort vom Server – später nochmal versuchen.', true); zeigen(); }
      return;
    }
    holen();
  }, 2000);
}

async function modus(m) {
  try { info = await senden('modus', { modus: m }); meldung(''); } catch (e) { meldung('Nicht gespeichert: ' + e.message, true); }
  zeigen();
}

/* ================= Reiter ================= */
function reiter(name) {
  document.querySelectorAll('#einstellungen .es-reiter').forEach(e => { e.hidden = e.dataset.reiter !== name; });
  document.querySelectorAll('#esTabs button').forEach(b => b.classList.toggle('on', b.dataset.reiter === name));
}

/* ================= Persönliche Angaben ================= */
/* Ortssuche bei Open-Meteo (kostenlos, ohne Anmeldung, nur Deutschland – die Feiertage gibt es je Bundesland) */
const LAND_CODE = Object.fromEntries(Object.entries(BUNDESLAENDER).map(([k, n]) => [n, k]));
let entwurf = null, suchNr = 0;                  // entwurf = gewählter, noch nicht gespeicherter Ort

function ortZeigen() {
  const box = $('esOrt');
  box.replaceChildren();
  if (!entwurf) { box.textContent = 'Noch kein Ort gewählt.'; box.className = 'es-ort leer'; }
  else {
    const b = document.createElement('b'); b.textContent = entwurf.name;
    const sm = document.createElement('small'); sm.textContent = entwurf.info;
    box.append(b, sm); box.className = 'es-ort';
  }
  $('esLand').disabled = !entwurf;
  $('esLand').value = entwurf?.bundesland || '';
}

async function ortSuchen() {
  const q = $('esOrtSuche').value.trim(), box = $('esOrtTreffer'), nr = ++suchNr;
  if (q.length < 2) return box.replaceChildren();
  box.textContent = 'Suche …';
  let treffer;
  try {
    const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=8&language=de&format=json&countryCode=DE&name=' + encodeURIComponent(q));
    if (!r.ok) throw new Error('Fehler ' + r.status);
    treffer = (await r.json()).results || [];
  } catch (e) {
    if (nr === suchNr) box.textContent = 'Ortssuche gerade nicht möglich (' + e.message + ').';
    return;
  }
  if (nr !== suchNr) return;
  box.replaceChildren();
  if (!treffer.length) box.textContent = `Nichts gefunden zu „${q}“ – den Ortsnamen eingeben (Postleitzahlen kennt die Suche nicht immer).`;
  treffer.forEach(t => {
    const info = [t.admin3 || t.admin2, t.admin1].filter(Boolean).join(', ');
    const b = document.createElement('button'); b.type = 'button'; b.className = 'es-treffer-zeile';
    const n = document.createElement('b'); n.textContent = t.name;
    const sm = document.createElement('small'); sm.textContent = info;
    b.append(n, sm);
    b.onclick = () => {
      entwurf = { name: t.name, info, lat: Math.round(t.latitude * 1e4) / 1e4, lon: Math.round(t.longitude * 1e4) / 1e4,
        bundesland: LAND_CODE[t.admin1] || '' };
      box.replaceChildren(); $('esOrtSuche').value = '';
      ortZeigen();
    };
    box.appendChild(b);
  });
}

function personSpeichern(e) {
  e.preventDefault();
  const ort = entwurf ? { ...entwurf, bundesland: $('esLand').value } : null;
  profilSpeichern({ name: $('esName').value.trim(), ort });
  $('esPersonMeldung').textContent = 'Gespeichert.';
}

function hubSpeichern(e) {
  e.preventDefault();
  profilSpeichern({ hub: $('esHub').value.trim() });
  $('esHubMeldung').textContent = 'Gespeichert.';
}

/* ================= Sicherheit ================= */
let pin = '';                                     // beim Öffnen eingegebener PIN – nur solange das Fenster offen ist

function sicherheitMeldung(text, fehler = false) {
  $('esSicherheitMeldung').textContent = text; $('esSicherheitMeldung').classList.toggle('fehler', fehler);
}

function sicherheitZeigen() {
  const { pin: an, gesperrt } = daten.sicherheit;
  $('esPinInfo').textContent = an ? 'An – die Einstellungen öffnen sich nur mit dem 5-stelligen PIN.'
    : 'Aus – jeder kann die Einstellungen öffnen.';
  $('esPin').textContent = an ? 'PIN ausschalten' : 'PIN einschalten';
  $('esSperreInfo').textContent = (gesperrt
    ? 'Gesperrt – Depot, Shortcuts, Google Kalender und die Spotify-Anmeldung lassen sich auf den Seiten nicht ändern. Termine, Notizen und Musik gehen weiter.'
    : 'Offen – auf den Seiten lässt sich alles einrichten.')
    + (an ? '' : ' Ohne PIN kann jeder die Sperre hier wieder aufheben.');
  $('esSperre').textContent = gesperrt ? 'Sperre aufheben' : 'Konfiguration sperren';
}

async function pinUmschalten() {
  sicherheitMeldung('');
  if (daten.sicherheit.pin) {
    if (!confirm('PIN ausschalten? Dann kann jeder die Einstellungen öffnen.')) return;
    try { await sicherheitSenden('pin-aus', { pin }); pin = ''; } catch (e) { sicherheitMeldung(e.message, true); }
    return;
  }
  const neu = await pinAbfragen({ titel: 'PIN festlegen', wiederholen: true,
    text: '5 Ziffern. Danach öffnen sich die Einstellungen auf allen Geräten nur noch mit diesem PIN.',
    senden: p => sicherheitSenden('pin-an', { pin, neu: p }) });
  if (neu) pin = neu;
}

async function sperreUmschalten() {
  sicherheitMeldung('');
  try { await sicherheitSenden(daten.sicherheit.gesperrt ? 'entsperren' : 'sperren', { pin }); }
  catch (e) { sicherheitMeldung(e.message, true); }
}

/* Formulare mit dem gespeicherten Stand füllen (beim Öffnen des Fensters) */
function formulareFuellen() {
  $('esName').value = daten.profil.name;
  $('esHub').value = daten.profil.hub;
  entwurf = daten.profil.ort ? { ...daten.profil.ort } : null;
  $('esOrtSuche').value = ''; $('esOrtTreffer').replaceChildren();
  $('esPersonMeldung').textContent = $('esHubMeldung').textContent = '';
  ortZeigen();
  sicherheitMeldung(''); sicherheitZeigen();
}

export function starteEinstellungen() {
  const fenster = $('einstellungen');
  $('esLand').innerHTML = '<option value="">– nur bundesweite Feiertage –</option>'
    + Object.entries(BUNDESLAENDER).map(([k, n]) => `<option value="${k}">${n}</option>`).join('');
  document.querySelectorAll('#esTabs button').forEach(b => { b.onclick = () => reiter(b.dataset.reiter); });
  $('esPersonForm').addEventListener('submit', personSpeichern);
  $('esHubForm').addEventListener('submit', hubSpeichern);
  $('esOrtLos').onclick = ortSuchen;
  $('esOrtSuche').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ortSuchen(); } });
  ['esName', 'esLand'].forEach(id => $(id).addEventListener('input', () => { $('esPersonMeldung').textContent = ''; }));
  $('esHub').addEventListener('input', () => { $('esHubMeldung').textContent = ''; });

  $('einstellungenBtn').onclick = async () => {
    pin = '';
    if (daten.sicherheit.pin) {                   // Einstellungen → Sicherheit: erst den PIN
      pin = await pinAbfragen({ titel: 'PIN eingeben', text: 'Die Einstellungen sind mit einem PIN geschützt.',
        senden: p => sicherheitSenden('pruefen', { pin: p }) });
      if (!pin) return;
    }
    if (!warteAufUpdate) meldung('');
    formulareFuellen();
    reiter('version');                            // beim Öffnen immer die Versionsverwaltung
    fenster.showModal(); holen();
  };
  $('einstellungenZu').onclick = () => fenster.close();
  fenster.addEventListener('close', () => { pin = ''; });
  klickDanebenSchliesst(fenster);
  $('esPin').onclick = pinUmschalten;
  $('esSperre').onclick = sperreUmschalten;
  beiAenderung(sicherheitZeigen);
  $('esZiehen').onclick = ziehen;
  document.querySelectorAll('#esModus button').forEach(b => { b.onclick = () => modus(b.dataset.modus); });
}
