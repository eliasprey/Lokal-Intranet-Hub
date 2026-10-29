/* Uhr, Datum, Begrüßung und das Bild „Mein Zuhause“ (je nach Jahreszeit und Tageszeit) */
import { BILDER_ORDNER, ZEITEN, GRUSS } from './einstellungen.js';
import { $, pad, kalenderwoche } from './hilfen.js';
import { sonnenzeiten } from './sonne.js';
import { daten } from './speicher.js';

/* ================= Bild „Mein Zuhause“ ================= */
function jahreszeit(d) {
  const m = d.getMonth() + 1;
  if (m >= 3 && m <= 5) return 'fruehling';
  if (m >= 6 && m <= 8) return 'sommer';
  if (m >= 9 && m <= 11) return 'herbst';
  return 'winter';
}
function tageszeit(d) {
  const h = d.getHours();
  if (h >= ZEITEN.nachts || h < ZEITEN.morgens) return 'nachts';
  if (h >= ZEITEN.abends) return 'abends';
  if (h >= ZEITEN.mittags) return 'mittags';
  return 'morgens';
}
/* Fürs Bild zählt ab Sonnenuntergang die Nacht (im Winter also schon am Nachmittag); vorher bleibt es höchstens Abend,
   auch wenn die Sonne im Sommer erst nach ZEITEN.nachts untergeht. Die Begrüßung richtet sich weiter nur nach ZEITEN.
   Ohne Ort in den persönlichen Angaben gelten nur die Uhrzeiten aus ZEITEN. */
let sonne = { schluessel: '', unter: null };
function bildTageszeit(d) {
  const ort = daten.profil.ort, schluessel = d.toDateString() + (ort ? `|${ort.lat}|${ort.lon}` : '');
  if (sonne.schluessel !== schluessel) sonne = { schluessel, unter: sonnenzeiten(d)?.unter ?? null };
  const tz = tageszeit(d);
  if (!sonne.unter) return tz;
  if (d >= sonne.unter) return 'nachts';
  return tz === 'nachts' && d.getHours() >= ZEITEN.morgens ? 'abends' : tz;
}
const NAMEN = { fruehling: 'Frühling', sommer: 'Sommer', herbst: 'Herbst', winter: 'Winter',
  morgens: 'Morgen', mittags: 'Mittag', abends: 'Abend', nachts: 'Nacht' };

const layers = [$('bgA'), $('bgB')];
let aktiv = 0, aktuellesBild = null;
function setzeHintergrund(d) {
  const k = jahreszeit(d) + '_' + bildTageszeit(d);
  if (k === aktuellesBild) return;
  // ?v=… : Bilder werden eine Woche zwischengespeichert – nach einem Update (neue Version) holt der Browser sie neu
  const v = window.INTRANET_CONFIG?.version, url = BILDER_ORDNER + k + '.jpg' + (v ? '?v=' + v.slice(0, 7) : '');
  const next = layers[1 - aktiv];
  const img = new Image();
  img.onload = () => {
    next.querySelectorAll('.fill, .main').forEach(e => e.style.backgroundImage = `url("${url}")`);
    next.classList.add('active');
    layers[aktiv].classList.remove('active');
    aktiv = 1 - aktiv; aktuellesBild = k;
  };
  img.src = url;
}

/* ================= Uhr & Datum ================= */
/* Vorschau: index.html?zeit=2027-01-15T07:30 zeigt die Seite zu dieser Uhrzeit (Uhr läuft von dort weiter) */
const testZeit = Date.parse(new URLSearchParams(location.search).get('zeit') || '');
const zeitVersatz = isNaN(testZeit) ? 0 : testZeit - Date.now();

/* Jede Ziffer steckt in einem eigenen Kasten: ändert sie sich, rollt die alte nach oben weg und die neue kommt von unten */
function setzeZiffern(el, text) {
  if (el.children.length !== text.length) {
    el.innerHTML = [...text].map(z => `<span class="ziffer"><span>${z}</span></span>`).join('');
    return;
  }
  [...text].forEach((z, i) => {
    const kasten = el.children[i], alt = kasten.lastElementChild;
    if (alt.textContent === z) return;
    while (kasten.firstElementChild !== alt) kasten.firstElementChild.remove();   // Reste, falls eine Animation nicht fertig lief (Tab im Hintergrund)
    const neu = document.createElement('span');
    neu.textContent = z; neu.className = 'rein';
    alt.className = 'raus';
    alt.addEventListener('animationend', () => alt.remove(), { once: true });
    kasten.append(neu);
  });
}

const tagImJahr = d => Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(d.getFullYear(), 0, 1)) / 864e5) + 1;

let lastDay = new Date().toDateString();
function tick(neuerTag) {
  const d = new Date(Date.now() + zeitVersatz);
  const jz = jahreszeit(d), tz = tageszeit(d), kw = kalenderwoche(d);
  setzeZiffern($('time'), `${pad(d.getHours())}:${pad(d.getMinutes())}`);
  setzeZiffern($('sek'), `:${pad(d.getSeconds())}`);
  $('uhrWochentag').textContent = d.toLocaleDateString('de-DE', { weekday: 'long' });
  $('unterzeile').textContent = d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    + ` · KW ${kw}`;
  $('chipKw').textContent = `KW ${kw}`;
  $('chipTag').textContent = `Tag ${tagImJahr(d)}`;
  $('chipJahreszeit').textContent = NAMEN[jz];
  $('chipTageszeit').textContent = NAMEN[bildTageszeit(d)];   // passend zum Bild
  document.body.dataset.jahreszeit = jz;
  $('gruss').textContent = GRUSS[tz] + (daten.profil.name ? ', ' + daten.profil.name : '');   // Name aus den persönlichen Angaben
  setzeHintergrund(d);
  if (d.toDateString() !== lastDay) { lastDay = d.toDateString(); neuerTag(); }
}

/* neuerTag wird um Mitternacht aufgerufen (z. B. damit der Kalender "heute" weiterschiebt) */
export function starteUhr(neuerTag) {
  tick(neuerTag);
  setInterval(() => tick(neuerTag), 1000);
}
