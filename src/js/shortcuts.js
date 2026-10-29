/* Shortcuts: eigene Seite mit Kacheln, die Geräte im Heimnetz, Google usw. öffnen. Die Liste liegt in der Datenbank
   (speicher.js) und wird hier gepflegt: unten rechts „Shortcut hinzufügen“ und „Shortcuts bearbeiten“ – im Bearbeiten-Modus
   öffnet ein Antippen der Kachel das Fenster zum Ändern oder Entfernen statt der Adresse. */
import { $, klickDanebenSchliesst } from './hilfen.js';
import { daten, beiAenderung, shortcutSpeichern, shortcutLoeschen } from './speicher.js';
import { gesperrt } from './sicherheit.js';

/* Symbol und Art werden am Namen erkannt; alles andere gilt als Server */
const ARTEN = [
  [/gmail|mail/i, 'E-Mail', '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'],
  [/kalender|calendar/i, 'Kalender', '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'],
  [/fritz|router/i, 'Router', '<rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 16.5h.01M11 16.5h.01M8.5 9.5a5 5 0 0 1 7 0M6 7a8.5 8.5 0 0 1 12 0"/>'],
  [/drucker|printer/i, 'Drucker', '<path d="M7 8V3h10v5"/><rect x="3" y="8" width="18" height="9" rx="2"/><path d="M7 14h10v7H7z"/>'],
  [/adguard|pihole|dns/i, 'Werbeblocker', '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="m9 12 2 2 4-4"/>'],
  [/cloud/i, 'Cloud', '<path d="M7.5 18.5h9.5a4 4 0 0 0 0-8h-.3A5.5 5.5 0 0 0 6 11.5a3.5 3.5 0 0 0 1.5 7z"/>'],
  [/immich|foto|photo/i, 'Fotos', '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>'],
  [/paperless|dokument/i, 'Dokumente', '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'],
  [/./, 'Server', '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>'],
];
const svg = inhalt => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inhalt}</svg>`;
const PFEIL = svg('<path d="M7 17 17 7M8 7h9v9"/>');

const STIFT = svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>');
let bearbeiten = false, offen = null;            // offen = id des Shortcuts im Fenster, null = neuer

function zeigen() {
  if (gesperrt()) { bearbeiten = false; $('scFenster').close(); }   // Einstellungen → Sicherheit: nur öffnen
  const liste = $('geraeteListe');
  liste.replaceChildren();
  liste.classList.toggle('bearbeiten', bearbeiten);
  daten.shortcuts.forEach(g => {
    const [, art, symbol] = ARTEN.find(([muster]) => muster.test(g.name));
    const a = document.createElement('a');
    a.className = 'geraet'; a.href = g.url; a.target = '_blank'; a.rel = 'noopener';
    a.innerHTML = `<span class="g-icon">${svg(symbol)}</span><span class="g-text"><b></b><small>${art}</small></span><span class="g-pfeil">${bearbeiten ? STIFT : PFEIL}</span>`;
    a.querySelector('b').textContent = g.name;   // nur der Name, die Adresse bleibt verborgen
    if (bearbeiten) a.onclick = e => { e.preventDefault(); fensterAuf(g); };
    liste.appendChild(a);
  });
  if (!daten.shortcuts.length) {
    const e = document.createElement('p'); e.className = 'empty'; e.textContent = gesperrt() ? 'Noch keine Shortcuts.' : 'Noch keine Shortcuts – unten rechts „Shortcut hinzufügen“.';
    liste.appendChild(e);
  }
  const n = daten.shortcuts.length;
  $('geraeteAnzahl').textContent = n === 1 ? '1 Shortcut' : `${n} Shortcuts`;
  $('scBearbeiten').textContent = bearbeiten ? 'Fertig' : 'Shortcuts bearbeiten';
  $('scBearbeiten').classList.toggle('on', bearbeiten);
  $('scBearbeiten').disabled = !n && !bearbeiten;
}

/* ================= Fenster: hinzufügen, ändern, entfernen ================= */
function fensterAuf(g) {
  offen = g ? g.id : null;
  $('scTitel').textContent = g ? 'Shortcut bearbeiten' : 'Shortcut hinzufügen';
  $('scName').value = g ? g.name : '';
  $('scUrl').value = g ? g.url : '';
  $('scFehler').textContent = '';
  $('scLoeschen').hidden = !g;
  $('scFenster').showModal();
  $('scName').focus();
}

/* „fritz.box“ oder „192.168.178.1:8080“ → mit http:// davor; nur http(s)-Adressen ohne Leerzeichen */
function adresse(t) {
  t = t.trim();
  if (/^[a-z][a-z0-9+.-]*:(?!\/\/|\d)/i.test(t)) return null;   // anderes Schema wie „javascript:“ oder „mailto:“
  if (t && !/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) t = 'http://' + t;
  return /^https?:\/\/[^\s<>"]+$/i.test(t) ? t : null;
}

function speichern(e) {
  e.preventDefault();
  const name = $('scName').value.trim(), url = adresse($('scUrl').value);
  if (!name) { $('scFehler').textContent = 'Bitte einen Namen eintragen.'; return $('scName').focus(); }
  if (!url) { $('scFehler').textContent = 'Bitte eine Adresse eintragen, z. B. http://192.168.178.1 oder fritz.box.'; return $('scUrl').focus(); }
  shortcutSpeichern({ id: offen || undefined, name, url });
  $('scFenster').close();
}

export function starteShortcuts() {
  $('scNeu').onclick = () => fensterAuf(null);
  $('scBearbeiten').onclick = () => { bearbeiten = !bearbeiten; zeigen(); };
  $('scForm').addEventListener('submit', speichern);
  $('scAbbrechen').onclick = () => $('scFenster').close();
  $('scZu').onclick = () => $('scFenster').close();
  $('scLoeschen').onclick = () => {
    const g = daten.shortcuts.find(x => x.id === offen);
    if (g && confirm(`Shortcut „${g.name}“ entfernen?`)) { shortcutLoeschen(g.id); $('scFenster').close(); }
  };
  ['scName', 'scUrl'].forEach(id => $(id).addEventListener('input', () => { $('scFehler').textContent = ''; }));
  klickDanebenSchliesst($('scFenster'));
  beiAenderung(zeigen);
  zeigen();
}
