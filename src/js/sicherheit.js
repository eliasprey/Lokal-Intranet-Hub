/* Einstellungen → Sicherheit:
   - PIN: 5 Ziffern, ohne die sich das Fenster Einstellungen nicht öffnet. Geprüft wird auf dem Server (server.py),
     der nur einen Hash kennt – der PIN selbst wird nirgends im Browser gespeichert.
   - Konfiguration sperren: Auf den Seiten lässt sich nichts mehr einrichten (Depot, Shortcuts,
     Spotify-Anmeldung). Die Knöpfe dafür verschwinden (Klasse konfig-gesperrt am <body>, siehe style.css), und der
     Server lehnt solche Änderungen ab. Musik bleibt bedienbar.
   - Finanzen sichern: eigener PIN mit mindestens 6 Ziffern. Dann sind auf der Seite Finanzen der Gesamtwert, der
     Gewinn in Euro, das Diagramm des ganzen Depots und bei jedem Asset Stückzahl und Positionswert verschwommen
     (Klasse finanzen-verdeckt am <body>), bis man mit dem PIN entsperrt. Entsperrt wird, sobald der PIN vollständig
     eingegeben ist – ohne OK (der Server nennt dafür seine Länge; nur bei einem PIN, dessen Länge er noch nicht kennt,
     braucht es einmal OK). Entsperrt bleibt es nur auf diesem Gerät und nur, solange jemand etwas tut: Nach
     5 Minuten ohne Eingabe ist wieder alles verschwommen – unabhängig davon, wann es zurück zum Dashboard geht
     (seiten.js). Das ist ein Sichtschutz – die Zahlen kommen weiter vom Server.
   Alles liegt in der Datenbank und gilt auf allen Geräten. */
import { $, klickDanebenSchliesst } from './hilfen.js';
import { daten, beiAenderung, sicherheitSetzen } from './speicher.js';

export const gesperrt = () => daten.sicherheit.gesperrt;
export const PIN_STELLEN = [5, 5];               // PIN der Einstellungen: genau 5 Ziffern
export const FIN_STELLEN = [6, 12];              // PIN der Finanzen: 6 bis 12 Ziffern (wie in server.py)
const FIN_SPERRE_MS = 5 * 60_000;                // so lange ohne Eingabe, dann sind die Finanzen wieder verdeckt

/* aktion: 'pruefen' | 'pin-an' | 'pin-aus' | 'sperren' | 'entsperren' | 'finanzen-an' | 'finanzen-aus' | 'finanzen-pruefen'
   – Fehler (z. B. „PIN falsch“) als Exception */
export async function sicherheitSenden(aktion, felder = {}) {
  let r;
  try {
    r = await fetch('api/sicherheit', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aktion, ...felder }) });
  } catch (e) { throw new Error('Server nicht erreichbar.'); }
  if (r.status === 404 || r.status === 405 || r.status === 501) throw new Error('Geht nur, wenn die Seite vom Server kommt.');
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.fehler || 'Fehler ' + r.status);
  sicherheitSetzen(d);
  return d;
}

/* ================= Fenster: PIN eingeben bzw. neu festlegen ================= */
/* wiederholen = zweites Feld zum Bestätigen (neuer PIN). senden(pin) prüft bzw. speichert ihn auf dem Server –
   klappt das nicht, bleibt das Fenster mit der Fehlermeldung offen. stellen = [mindestens, höchstens] Ziffern.
   auto = Länge des PINs: Sobald so viele Ziffern dastehen, wird ohne OK geprüft (0 = mit OK).
   → Promise mit dem PIN, null = abgebrochen */
let fertig = null, ergebnis = null, senden = null, stellen = PIN_STELLEN, auto = 0, prueft = false;

export function pinAbfragen({ titel, text, wiederholen = false, stellen: st = PIN_STELLEN, auto: a = 0, senden: s }) {
  fertig?.(null);
  senden = s; ergebnis = null; stellen = st; auto = wiederholen ? 0 : a;
  $('pinOk').hidden = !!auto;
  $('pinTitel').textContent = titel;
  $('pinText').textContent = text;
  $('pinFeld2').hidden = !wiederholen;
  ['pin1', 'pin2'].forEach(id => { $(id).maxLength = auto || st[1]; });
  $('pin1').placeholder = auto ? `${auto} Ziffern` : st[0] === st[1] ? `${st[0]} Ziffern` : `mindestens ${st[0]} Ziffern`;
  $('pin1').value = $('pin2').value = '';
  $('pinFehler').textContent = '';
  $('pinFenster').showModal();
  $('pin1').focus();
  return new Promise(r => { fertig = r; });
}

async function pinOk(e) {
  e.preventDefault();
  if (prueft) return;
  const pin = $('pin1').value;
  const [min, max] = stellen;
  if (!/^\d+$/.test(pin) || pin.length < min || pin.length > max) {
    $('pinFehler').textContent = min === max ? `Bitte genau ${min} Ziffern eingeben.` : `Bitte ${min} bis ${max} Ziffern eingeben.`;
    return $('pin1').focus();
  }
  if (!$('pinFeld2').hidden && $('pin2').value !== pin) { $('pinFehler').textContent = 'Die beiden PINs sind verschieden.'; return $('pin2').focus(); }
  $('pinOk').disabled = prueft = true;
  try {
    await senden(pin);
    ergebnis = pin;
    $('pinFenster').close();
  } catch (e) {
    $('pinFehler').textContent = e.message;
    $('pin1').value = $('pin2').value = '';
    $('pin1').focus();
  }
  $('pinOk').disabled = prueft = false;
}

/* ================= Finanzen sichern ================= */
let finanzenOffen = false;                         // auf diesem Gerät mit dem PIN entsperrt (nur im Speicher der Seite)
export const finanzenVerdeckt = () => daten.sicherheit.finanzen && !finanzenOffen;

const SCHLOSS_ZU = '<path d="M6 11h12v10H6z"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>';
const SCHLOSS_AUF = '<path d="M6 11h12v10H6z"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>';
function finanzenZeigen() {
  if (!daten.sicherheit.finanzen) finanzenOffen = false;   // ausgeschaltet → beim nächsten Einschalten wieder zu
  const zu = finanzenVerdeckt(), knopf = $('finSchloss');
  document.body.classList.toggle('finanzen-verdeckt', zu);
  knopf.hidden = !daten.sicherheit.finanzen;
  knopf.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${zu ? SCHLOSS_ZU : SCHLOSS_AUF}</svg>`;
  knopf.append(zu ? 'Entsperren' : 'Sperren');
  knopf.title = zu ? 'Gesamtwert und Positionsgrößen mit dem PIN anzeigen' : 'Gesamtwert und Positionsgrößen wieder verdecken';
}

export async function finanzenEntsperren() {
  if (!finanzenVerdeckt()) return;
  const p = await pinAbfragen({ titel: 'Finanzen entsperren', stellen: FIN_STELLEN, auto: daten.sicherheit.finanzenStellen,
    text: 'Gesamtwert und Positionsgrößen sind mit einem PIN geschützt.',
    senden: p => sicherheitSenden('finanzen-pruefen', { finanzPin: p }) });
  if (p) { finanzenOffen = true; finanzenZeigen(); sperrUhrNeu(); }
}
export function finanzenSperren() { finanzenOffen = false; finanzenZeigen(); clearTimeout(sperrTimer); }

/* 5 Minuten ohne Eingabe → wieder verdecken. Eigene Uhr, unabhängig von der Rückkehr zum Dashboard (seiten.js).
   Ist da gerade ein Fenster offen, wird trotzdem gesperrt – der Sichtschutz geht vor. */
let sperrTimer;
function sperrUhrNeu() {
  clearTimeout(sperrTimer);
  if (finanzenOffen) sperrTimer = setTimeout(finanzenSperren, FIN_SPERRE_MS);
}

export function starteSicherheit() {
  const zeigen = () => document.body.classList.toggle('konfig-gesperrt', gesperrt());
  beiAenderung(zeigen);
  zeigen();

  beiAenderung(finanzenZeigen);
  finanzenZeigen();
  ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'].forEach(t =>
    document.addEventListener(t, sperrUhrNeu, { passive: true, capture: true }));
  $('finSchloss').onclick = () => (finanzenVerdeckt() ? finanzenEntsperren() : finanzenSperren());
  $('depotZahlen').addEventListener('click', () => { if (finanzenVerdeckt()) finanzenEntsperren(); });

  const fenster = $('pinFenster');
  $('pinForm').addEventListener('submit', pinOk);
  ['pin1', 'pin2'].forEach(id => $(id).addEventListener('input', () => {
    $(id).value = $(id).value.replace(/\D/g, '').slice(0, stellen[1]);   // nur Ziffern
    $('pinFehler').textContent = '';
    if (auto && id === 'pin1' && $(id).value.length === auto) $('pinForm').requestSubmit();   // vollständig → gleich prüfen
  }));
  $('pinAbbrechen').onclick = $('pinZu').onclick = () => fenster.close();
  klickDanebenSchliesst(fenster);
  fenster.addEventListener('close', () => { const f = fertig; fertig = null; f?.(ergebnis); });
}
