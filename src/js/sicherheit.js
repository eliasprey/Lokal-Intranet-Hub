/* Einstellungen → Sicherheit:
   - PIN: 5 Ziffern, ohne die sich das Fenster Einstellungen nicht öffnet. Geprüft wird auf dem Server (server.py),
     der nur einen Hash kennt – der PIN selbst wird nirgends im Browser gespeichert.
   - Konfiguration sperren: Auf den Seiten lässt sich nichts mehr einrichten (Depot, Shortcuts, Google Kalender,
     Spotify-Anmeldung). Die Knöpfe dafür verschwinden (Klasse konfig-gesperrt am <body>, siehe style.css), und der
     Server lehnt solche Änderungen ab. Termine, Notizen und Musik bleiben bedienbar.
   Beides liegt in der Datenbank und gilt auf allen Geräten. */
import { $, klickDanebenSchliesst } from './hilfen.js';
import { daten, beiAenderung, sicherheitSetzen } from './speicher.js';

export const gesperrt = () => daten.sicherheit.gesperrt;

/* aktion: 'pruefen' | 'pin-an' | 'pin-aus' | 'sperren' | 'entsperren' – Fehler (z. B. „PIN falsch“) als Exception */
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
   klappt das nicht, bleibt das Fenster mit der Fehlermeldung offen. → Promise mit dem PIN, null = abgebrochen */
let fertig = null, ergebnis = null, senden = null;

export function pinAbfragen({ titel, text, wiederholen = false, senden: s }) {
  fertig?.(null);
  senden = s; ergebnis = null;
  $('pinTitel').textContent = titel;
  $('pinText').textContent = text;
  $('pinFeld2').hidden = !wiederholen;
  $('pin1').value = $('pin2').value = '';
  $('pinFehler').textContent = '';
  $('pinFenster').showModal();
  $('pin1').focus();
  return new Promise(r => { fertig = r; });
}

async function pinOk(e) {
  e.preventDefault();
  const pin = $('pin1').value;
  if (!/^\d{5}$/.test(pin)) { $('pinFehler').textContent = 'Bitte genau 5 Ziffern eingeben.'; return $('pin1').focus(); }
  if (!$('pinFeld2').hidden && $('pin2').value !== pin) { $('pinFehler').textContent = 'Die beiden PINs sind verschieden.'; return $('pin2').focus(); }
  $('pinOk').disabled = true;
  try {
    await senden(pin);
    ergebnis = pin;
    $('pinFenster').close();
  } catch (e) {
    $('pinFehler').textContent = e.message;
    $('pin1').value = $('pin2').value = '';
    $('pin1').focus();
  }
  $('pinOk').disabled = false;
}

export function starteSicherheit() {
  const zeigen = () => document.body.classList.toggle('konfig-gesperrt', gesperrt());
  beiAenderung(zeigen);
  zeigen();

  const fenster = $('pinFenster');
  $('pinForm').addEventListener('submit', pinOk);
  ['pin1', 'pin2'].forEach(id => $(id).addEventListener('input', () => {
    $(id).value = $(id).value.replace(/\D/g, '').slice(0, 5);   // nur Ziffern
    $('pinFehler').textContent = '';
  }));
  $('pinAbbrechen').onclick = $('pinZu').onclick = () => fenster.close();
  klickDanebenSchliesst(fenster);
  fenster.addEventListener('close', () => { const f = fertig; fertig = null; f?.(ergebnis); });
}
