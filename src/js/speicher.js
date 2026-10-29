/* Termine, Urlaube, Notizen, das Depot, die Shortcuts und die persönlichen Angaben. Sie liegen in der Datenbank auf dem Server (server/server.py),
   damit jedes Gerät dieselben Daten sieht.
   - Eine Kopie bleibt im Browser (localStorage): Die Seite zeigt sofort etwas an und funktioniert weiter,
     wenn der Server kurz nicht erreichbar ist.
   - Jede Änderung wird sofort angezeigt und kommt in eine Warteschlange, die an den Server geht.
     Klappt das nicht, bleibt sie gespeichert und wird später nochmal geschickt.
   - Alle paar Sekunden wird nachgesehen, ob ein anderes Gerät etwas geändert hat.
   Wer sich für Änderungen interessiert, meldet sich mit beiAenderung() an, für den Verbindungsstand mit beiStatus(). */

const STORE_T = 'intranet.termine.v1';          // Kopie der Daten (vor der Datenbank lagen hier die Daten des Geräts)
const STORE_U = 'intranet.urlaube.v1';
const STORE_N = 'intranet.notizen.v1';
const STORE_D = 'intranet.depot.v1';
const STORE_P = 'intranet.profil.v1';
const STORE_S = 'intranet.shortcuts.v1';
const STORE_SI = 'intranet.sicherheit.v1';
const STORE_W = 'intranet.warteschlange.v1';    // Änderungen, die noch nicht beim Server angekommen sind
const STORE_V = 'intranet.version.v1';          // Stand der Kopie (zählt der Server bei jeder Änderung hoch)
const STORE_M = 'intranet.uebernommen.v1';      // alte Daten dieses Geräts sind schon an den Server gegangen
const ABFRAGE_SEK = 10;                          // so oft bei anderen Geräten nachsehen
const NOCHMAL_SEK = 15;                          // so lange nach einem Fehler warten

/* termine: { 'JJJJ-MM-TT': [{ id, text, zeit }] }, urlaube: [{ id, text, von, bis }],
   depot: [{ id, symbol, name, art, boerse, menge, einkauf }] – menge und einkauf (Euro gesamt, '' = unbekannt) als Text,
   profil: { name, hub, ort: { name, info, lat, lon, bundesland } | null } – Begrüßung, Name des Intranets, Ort für
   Wetter/Sonne/Feiertage, shortcuts: [{ id, name, url }],
   sicherheit: { pin, gesperrt } – PIN für die Einstellungen an, Konfiguration auf den Seiten gesperrt (sicherheit.js) */
const PROFIL_LEER = { name: '', hub: '', ort: null };
const SICHERHEIT_LEER = { pin: false, gesperrt: false };
export const daten = { termine: {}, urlaube: [], notizen: '', depot: [], profil: { ...PROFIL_LEER }, shortcuts: [],
  sicherheit: { ...SICHERHEIT_LEER } };

const lies = (k, standard) => { try { return JSON.parse(localStorage.getItem(k)) ?? standard; } catch (e) { return standard; } };
const schreib = (k, w) => { try { localStorage.setItem(k, JSON.stringify(w)); } catch (e) {} };

function kopieLaden() {
  daten.termine = lies(STORE_T, {});
  daten.urlaube = lies(STORE_U, []);
  daten.depot = lies(STORE_D, []);
  daten.profil = { ...PROFIL_LEER, ...lies(STORE_P, {}) };
  daten.shortcuts = lies(STORE_S, []);
  daten.sicherheit = { ...SICHERHEIT_LEER, ...lies(STORE_SI, {}) };
  try { daten.notizen = localStorage.getItem(STORE_N) || ''; } catch (e) {}   // Notizen als reiner Text
}
function kopieSpeichern() {
  schreib(STORE_T, daten.termine);
  schreib(STORE_U, daten.urlaube);
  schreib(STORE_D, daten.depot);
  schreib(STORE_P, daten.profil);
  schreib(STORE_S, daten.shortcuts);
  schreib(STORE_SI, daten.sicherheit);
  try { localStorage.setItem(STORE_N, daten.notizen); } catch (e) {}
}

kopieLaden();
let warteschlange = lies(STORE_W, []);
let version = lies(STORE_V, null);

/* Einmalig: Was dieses Gerät vor der Datenbank gespeichert hat, an den Server schicken.
   Termine und Urlaube kommen dazu, alte Notizen werden an die vorhandenen angehängt – überschrieben wird nichts. */
if (!lies(STORE_M, false)) {
  for (const [datum, liste] of Object.entries(daten.termine))
    liste.forEach(t => warteschlange.push({ op: 'termin+', id: String(t.id), datum, zeit: t.zeit || '', text: t.text }));
  daten.urlaube.forEach(u => warteschlange.push({ op: 'urlaub+', id: String(u.id), text: u.text, von: u.von, bis: u.bis }));
  if (daten.notizen.trim()) warteschlange.push({ op: 'notizen-anhaengen', text: daten.notizen });
  schreib(STORE_W, warteschlange);
  schreib(STORE_M, true);
}

/* ================= Beobachter ================= */
const beobachter = [], statusBeobachter = [];
export const beiAenderung = fn => beobachter.push(fn);
const melden = () => beobachter.forEach(fn => fn());

/* Verbindungsstand: 'verbinde' (noch keine Antwort), 'ok' (alles beim Server), 'offline' (Server nicht erreichbar, wird nachgeholt),
   'lokal' (ohne Server geöffnet, z. B. mit Live Server – Daten bleiben auf diesem Gerät) */
let zustand = 'verbinde';
export const beiStatus = fn => { statusBeobachter.push(fn); fn(zustand, warteschlange.length); };
function status(z) {
  zustand = z;
  statusBeobachter.forEach(fn => fn(z, warteschlange.length));
}

/* ================= Änderungen ================= */
/* Wendet eine Änderung auf die Daten im Browser an – genauso, wie es der Server in der Datenbank tut */
function anwenden(a) {
  if (a.op === 'termin+') {
    const liste = daten.termine[a.datum] = daten.termine[a.datum] || [];
    if (!liste.some(t => String(t.id) === a.id)) liste.push({ id: a.id, text: a.text, zeit: a.zeit });
  } else if (a.op === 'termin-') {
    for (const [datum, liste] of Object.entries(daten.termine)) {
      const rest = liste.filter(t => String(t.id) !== a.id);
      if (rest.length) daten.termine[datum] = rest; else delete daten.termine[datum];
    }
  } else if (a.op === 'urlaub+') {
    if (!daten.urlaube.some(u => String(u.id) === a.id)) daten.urlaube.push({ id: a.id, text: a.text, von: a.von, bis: a.bis });
  } else if (a.op === 'urlaub-') {
    daten.urlaube = daten.urlaube.filter(u => String(u.id) !== a.id);
  } else if (a.op === 'depot+') {
    const { op, ...pos } = a, alt = daten.depot.find(p => p.id === a.id);
    if (alt) Object.assign(alt, { menge: a.menge, einkauf: a.einkauf }); else daten.depot.push(pos);
  } else if (a.op === 'depot-') {
    daten.depot = daten.depot.filter(p => p.id !== a.id);
  } else if (a.op === 'profil') {
    const { op, ...felder } = a;
    daten.profil = { ...daten.profil, ...felder };
  } else if (a.op === 'shortcut+') {
    const { op, ...sc } = a, alt = daten.shortcuts.find(x => x.id === a.id);
    if (alt) Object.assign(alt, { name: a.name, url: a.url }); else daten.shortcuts.push(sc);
  } else if (a.op === 'shortcut-') {
    daten.shortcuts = daten.shortcuts.filter(x => x.id !== a.id);
  } else if (a.op === 'notizen') {
    daten.notizen = a.text;
  }                                    // 'notizen-anhaengen' ändert nur den Server, hier steht der Text schon
}

let unterwegs = 0;                     // so viele Einträge vorne in der Warteschlange werden gerade gesendet
function aendern(a, verzoegerung = 0) {
  anwenden(a);
  const letzte = warteschlange[warteschlange.length - 1];
  if (a.op === 'notizen' && letzte?.op === 'notizen' && warteschlange.length > unterwegs)
    warteschlange[warteschlange.length - 1] = a;   // beim Tippen nur den neuesten Stand schicken
  else warteschlange.push(a);
  schreib(STORE_W, warteschlange);
  kopieSpeichern();
  status(zustand);                     // Zahl der wartenden Änderungen auffrischen
  senden(verzoegerung);
}

/* ================= Abgleich mit dem Server ================= */
let sendeTimer = null, sendetGerade = false, mindestVersion = 0;
function senden(verzoegerung = 0) {
  clearTimeout(sendeTimer);
  sendeTimer = setTimeout(abschicken, verzoegerung);
}

async function abschicken() {
  if (sendetGerade) return;
  if (!warteschlange.length) return holen();
  sendetGerade = true;
  unterwegs = warteschlange.length;
  let ok = false;
  try {
    const r = await fetch('api/aenderungen', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(warteschlange.slice(0, unterwegs)) });
    if (r.status === 404 || r.status === 405 || r.status === 501) { status('lokal'); return; }   // kein Server mit Datenbank
    if (!r.ok) throw new Error('Fehler ' + r.status);
    const antwort = await r.json();
    mindestVersion = antwort.version;
    if (antwort.abgelehnt?.length) console.error('Server hat Änderungen abgelehnt:', antwort.abgelehnt);
    warteschlange.splice(0, unterwegs);
    schreib(STORE_W, warteschlange);
    ok = true;
  } catch (e) {
    status('offline');
    senden(NOCHMAL_SEK * 1000);
  } finally {
    sendetGerade = false;
    unterwegs = 0;
  }
  if (ok) warteschlange.length ? abschicken() : holen();   // danach den Stand aller Geräte holen
}

async function holen() {
  try {
    const r = await fetch('api/daten', { cache: 'no-store', headers: version != null ? { 'If-None-Match': `"v${version}"` } : {} });
    if (r.status === 404) return status('lokal');
    if (r.status === 304) return status('ok');
    if (!r.ok) throw new Error('Fehler ' + r.status);
    const d = await r.json();
    if (d.version < mindestVersion) return;   // Antwort ist älter als die eigene, gerade gespeicherte Änderung
    daten.termine = d.termine; daten.urlaube = d.urlaube; daten.notizen = d.notizen; daten.depot = d.depot || [];
    daten.profil = { ...PROFIL_LEER, ...d.profil }; daten.shortcuts = d.shortcuts || [];
    daten.sicherheit = { ...SICHERHEIT_LEER, ...d.sicherheit };
    warteschlange.forEach(anwenden);          // eigene, noch nicht gesendete Änderungen obendrauf
    version = d.version;
    schreib(STORE_V, version);
    kopieSpeichern();
    if (!warteschlange.length) status('ok');
    melden();
  } catch (e) {
    status('offline');
  }
}

abschicken();
setInterval(() => { if (!document.hidden) abschicken(); }, ABFRAGE_SEK * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) abschicken(); });
window.addEventListener('online', () => abschicken());

/* ================= Termine ================= */
const neueId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

export function termineAnlegen(eintraege) {             // [{ datum, zeit, text }]
  eintraege.forEach(({ datum, zeit, text }) => aendern({ op: 'termin+', id: neueId(), datum, zeit: zeit || '', text }));
  melden();
}
export function terminLoeschen(id) {
  aendern({ op: 'termin-', id: String(id) });
  melden();
}

/* ================= Urlaub ================= */
export function urlaubeAnlegen(eintraege) {             // [{ text, von, bis }]
  eintraege.forEach(({ text, von, bis }) => aendern({ op: 'urlaub+', id: neueId(), text, von, bis: bis && bis >= von ? bis : von }));
  melden();
}
export function urlaubLoeschen(id) {
  aendern({ op: 'urlaub-', id: String(id) });
  melden();
}

/* ================= Notizen ================= */
export function notizenSpeichern(text) {
  aendern({ op: 'notizen', text }, 800);   // erst schicken, wenn kurz nicht getippt wurde
}

/* ================= Depot ================= */
export function depotSpeichern(pos) {                    // { id?, symbol, name, art, boerse, menge, einkauf } – mit id = ändern
  aendern({ op: 'depot+', ...pos, id: pos.id || neueId() });
  melden();
}
export function depotLoeschen(id) {
  aendern({ op: 'depot-', id });
  melden();
}

/* ================= Persönliche Angaben ================= */
export function profilSpeichern(felder) {                // { name?, hub?, ort? } – nur diese Felder ändern
  aendern({ op: 'profil', ...felder });
  melden();
}

/* ================= Sicherheit ================= */
/* Geht nicht über die Warteschlange (der PIN soll nicht im Browser liegen bleiben): sicherheit.js schickt die Änderung
   selbst an den Server und meldet hier nur den neuen Stand */
export function sicherheitSetzen(s) {
  daten.sicherheit = { ...SICHERHEIT_LEER, ...s };
  kopieSpeichern();
  melden();
}

/* ================= Shortcuts ================= */
export function shortcutSpeichern(sc) {                 // { id?, name, url } – mit id = ändern
  aendern({ op: 'shortcut+', name: sc.name, url: sc.url, id: sc.id || neueId() });
  melden();
}
export function shortcutLoeschen(id) {
  aendern({ op: 'shortcut-', id });
  melden();
}
