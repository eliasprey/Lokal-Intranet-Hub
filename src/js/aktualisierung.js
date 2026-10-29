/* Neue Version der Seite übernehmen. Der Server holt Updates selbst aus dem GitHub-Repository (server.py).
   Hier wird jede Minute nachgesehen, ob er inzwischen eine andere Version ausliefert als die, mit der diese
   Seite geladen wurde – dann lädt sie sich neu, sobald eine Minute lang nichts eingegeben wurde. Wichtig fürs Wandtablet,
   das die Seite sonst nie neu lädt. Noch nicht gesendete Einträge bleiben dabei im Browser gespeichert.
   Außerdem steht die Version klein über dem Knopf Einstellungen. */
import { $ } from './hilfen.js';

const ALLE_SEK = 60;

let geladen = window.INTRANET_CONFIG?.version ?? null;   // Version, mit der die Seite ausgeliefert wurde

/* Angezeigte Version = Zeitpunkt des Commits: v2026.10.29 · 20:04. Jeder Commit auf main wird sofort eingespielt
   (oft mehrere am Tag), deshalb mit Uhrzeit; der Commit selbst steht im Tooltip. → ['v2026.10.29', '20:04'] oder [] */
export function versionTeile(version, datum) {
  const d = new Date(datum || NaN), z = n => String(n).padStart(2, '0');
  if (isNaN(d)) return version ? [version.slice(0, 7)] : [];
  return [`v${d.getFullYear()}.${z(d.getMonth() + 1)}.${z(d.getDate())}`, `${z(d.getHours())}:${z(d.getMinutes())}`];
}

function versionZeigen(version, datum) {
  const teile = versionTeile(version, datum), el = $('appVersion');
  el.replaceChildren(...teile.map(t => Object.assign(document.createElement('span'), { textContent: t })));
  el.hidden = !teile.length;               // ohne Server (Live Server) gibt es keine Version
  el.title = version ? `Commit ${version.slice(0, 7)}` : '';
}

/* Nicht mitten in einer Eingabe neu laden. Nur auf den Cursor zu achten reicht nicht: Am PC steht er beim
   Öffnen automatisch in der Suchleiste. */
let letzteEingabe = 0;
['input', 'keydown', 'change'].forEach(art => document.addEventListener(art, () => { letzteEingabe = Date.now(); }, true));
const beschaeftigt = () => Date.now() - letzteEingabe < 60e3 || document.querySelector('dialog[open]');

async function pruefen() {
  try {
    const r = await fetch('api/version', { cache: 'no-store' });
    if (!r.ok) return;                       // ohne Server (Live Server) gibt es keine Updates
    const { version, datum } = await r.json();
    if (!geladen) geladen = version;
    if (version === geladen) versionZeigen(version, datum);   // Zeitpunkt kann der Server erst nachträglich kennen
    else if (version && !beschaeftigt()) location.reload();
  } catch (e) {}                             // Server gerade nicht erreichbar → nächstes Mal
}

export function starteAktualisierung() {
  versionZeigen(geladen, window.INTRANET_CONFIG?.datum);
  pruefen();
  setInterval(pruefen, ALLE_SEK * 1000);
}
