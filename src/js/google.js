/* Google Kalender: Termine aus den eigenen Google Kalendern (nur lesen). Der Server holt sie über die geheime
   iCal-Adresse jedes Kalenders (server.py) und liefert sie für den Zeitraum, den der Kalender gerade zeigt.
   Verbunden und entfernt werden die Kalender unter Einstellungen → Kalender (einstellungsfenster.js ruft googleReiter auf). */
import { $ } from './hilfen.js';

const NEU_MIN = 5;                       // so oft die Termine neu holen (der Server fragt Google höchstens alle 5 min)

/* termine: { 'JJJJ-MM-TT': [{ zeit, text, von?, bis? }] } – von/bis: Teil des Termins an diesem Tag, fehlt bei ganztägigen */
export const google = { kalender: [], termine: {} };
let bereich = '', nachLaden = () => {};

export const googleAn = k => google.termine[k] || [];

/* Der Kalender meldet bei jedem Zeichnen, welche Tage er braucht – ist das ein neuer Zeitraum, wird nachgeladen */
export function googleBereich(von, bis) {
  if (`${von}|${bis}` === bereich) return;
  bereich = `${von}|${bis}`;
  holen();
}

async function holen() {
  const [von, bis] = bereich.split('|');
  try {
    const r = await fetch(`api/google?von=${von}&bis=${bis}`, { cache: 'no-store' });
    if (!r.ok) return;
    const d = await r.json();
    if (`${von}|${bis}` !== bereich) return;          // inzwischen weitergeblättert
    google.kalender = d.kalender; google.termine = d.termine;
  } catch (e) { return; }                // kein Server (z. B. Live Server) oder kurz nicht erreichbar
  nachLaden();
  liste();
}

/* ================= Einstellungen → Kalender: verbinden und entfernen ================= */
async function post(pfad, daten) {
  const r = await fetch('api/google/' + pfad, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(daten) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.fehler || 'Fehler ' + r.status);
}

function liste() {
  const box = $('gListe');
  box.innerHTML = '';
  google.kalender.forEach(k => {
    const zeile = document.createElement('div'); zeile.className = 'gk-zeile';
    const txt = document.createElement('div');
    const b = document.createElement('b'); b.textContent = k.name;
    const sm = document.createElement('small'); sm.textContent = k.fehler ? 'Fehler: ' + k.fehler : 'Verbunden';
    if (k.fehler) sm.className = 'fehler';
    txt.append(b, sm);
    const weg = document.createElement('button'); weg.textContent = 'Entfernen';
    weg.type = 'button';
    weg.onclick = async () => {
      if (!confirm(`„${k.name}“ nicht mehr anzeigen?`)) return;
      try { await post('entfernen', { id: k.id }); } catch (e) { return meldung(e.message); }
      holen();
    };
    zeile.append(txt, weg);
    box.appendChild(zeile);
  });
  if (!google.kalender.length) {
    const e = document.createElement('p'); e.className = 'es-info'; e.textContent = 'Noch kein Kalender verbunden.'; box.appendChild(e);
  }
}
const meldung = (text, fehler = true) => { $('gMeldung').textContent = text; $('gMeldung').classList.toggle('fehler', fehler); };

/* Beim Öffnen der Einstellungen: Liste zeigen und frisch holen (z. B. ob eine Adresse inzwischen ungültig ist) */
export function googleReiter() {
  meldung(''); $('gAdresse').value = '';
  liste();
  if (bereich) holen();
}

/* neuGezeichnet wird aufgerufen, sobald neue Termine da sind (der Kalender zeichnet sich dann neu) */
export function starteGoogle(neuGezeichnet) {
  nachLaden = neuGezeichnet;
  setInterval(() => { if (bereich) holen(); }, NEU_MIN * 60e3);

  $('gForm').addEventListener('submit', async e => {
    e.preventDefault();
    const adresse = $('gAdresse').value.trim();
    if (!adresse) return $('gAdresse').focus();
    meldung('Verbinde …', false); $('gOk').disabled = true;
    try {
      await post('kalender', { adresse });
      $('gAdresse').value = ''; meldung('Verbunden.', false);
      await holen();
    } catch (e) { meldung(e.message); }
    $('gOk').disabled = false;
  });
}
