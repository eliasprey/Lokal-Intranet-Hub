/* Kalender (große Monatsansicht, nur anzeigen), die Tagesansicht und die Karte „Nächste 7 Tage“ im Dashboard.
   Angezeigt werden die Feiertage (feiertage.js) und die Termine aus Google Kalender (google.js) –
   Termine werden nur in Google angelegt und geändert (Knopf „Kalender“ öffnet Google Kalender).
   Klick auf einen Tag öffnet rechts die Tagesansicht (ein Drittel des Kalenders) mit allen 24 Stunden. */
import { UEBERSICHT_TAGE } from './einstellungen.js';
import { $, key, parseKey, addDays, kalenderwoche, pad } from './hilfen.js';
import { feiertagAn } from './feiertage.js';
import { googleAn, googleBereich, starteGoogle } from './google.js';

let ansicht = new Date(); ansicht.setDate(1);
let gewaehlt = null;                     // Tag in der Tagesansicht ('JJJJ-MM-TT'), null = Tagesansicht zu
const GOOGLE_URL = 'https://calendar.google.com/calendar/';

/* Termine aus Google an einem Tag, nach Uhrzeit: [{ art: 'g', zeit, text }] */
const alleTermineAn = k => googleAn(k).map(t => ({ ...t, art: 'g' }))
  .sort((a, b) => (a.zeit || '').localeCompare(b.zeit || ''));

/* ================= Monatsansicht ================= */
export function render() {
  const grid = $('grid');
  grid.innerHTML = '';
  ['KW', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].forEach(n => {
    const e = document.createElement('div'); e.className = 'dow'; e.textContent = n; grid.appendChild(e);
  });
  $('monthLabel').textContent = ansicht.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

  const start = new Date(ansicht);
  start.setDate(1 - ((start.getDay() + 6) % 7));
  const todayKey = key(new Date());
  // Google-Termine für alle sichtbaren Tage und die Karte „Nächste 7 Tage“
  const bis = [key(addDays(start, 41)), key(addDays(new Date(), UEBERSICHT_TAGE - 1))].sort()[1];
  googleBereich(key(start) < todayKey ? key(start) : todayKey, bis);

  const kwHeute = kalenderwoche(new Date());
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i), k = key(d);
    if (i % 7 === 0) {                      // Kalenderwoche am Anfang jeder Zeile
      const kw = kalenderwoche(d), e = document.createElement('div');
      e.className = 'kw' + (kw === kwHeute && Math.abs(d - new Date()) < 7 * 864e5 ? ' jetzt' : '');
      e.textContent = kw; grid.appendChild(e);
    }
    const ft = feiertagAn(d);
    const el = document.createElement('div');
    el.className = 'day'
      + (d.getMonth() !== ansicht.getMonth() ? ' other' : '')
      + (ft ? ' feiertag' : '')
      + (k === todayKey ? ' today' : '')
      + (k === gewaehlt ? ' gewaehlt' : '');
    el.onclick = () => tagOeffnen(k === gewaehlt ? null : k);   // nochmal auf denselben Tag = schließen
    const num = document.createElement('span'); num.textContent = d.getDate(); el.appendChild(num);
    if (ft) {
      el.title = ft;
      const name = document.createElement('span'); name.className = 'ft-name';
      name.textContent = ft.length > 10 ? ft.slice(0, 10).trimEnd() + '…' : ft;   // max. 10 Buchstaben
      el.appendChild(name);
    }
    const termine = alleTermineAn(k);
    if (termine.length) {
      const dot = document.createElement('span'); dot.className = 'dot';
      dot.innerHTML = termine.slice(0, 3).map(t => `<i class="${t.art}"></i>`).join('');
      el.appendChild(dot);
    }
    el.appendChild(labels(d, k));
    grid.appendChild(el);
  }
  renderAnstehend(naechsteTage());
  renderTag();
}

/* Beschriftungen in den Tagesfeldern */
function labels(d, k) {
  const box = document.createElement('div'); box.className = 'lbls';
  const arr = [];
  const ft = feiertagAn(d); if (ft) arr.push(['f', ft]);
  alleTermineAn(k).forEach(t => arr.push([t.art, (t.zeit ? t.zeit + ' ' : '') + t.text]));
  arr.slice(0, 3).forEach(([c, t]) => {
    const e = document.createElement('div'); e.className = 'lbl ' + c; e.textContent = t; box.appendChild(e);
  });
  if (arr.length > 3) {
    const e = document.createElement('div'); e.className = 'lbl m'; e.textContent = '+' + (arr.length - 3) + ' weitere'; box.appendChild(e);
  }
  return box;
}

/* ================= Alles in den nächsten 7 Tagen ================= */
/* Liefert { 'JJJJ-MM-TT': [{ art, zeit, text }] } – art: 'f' Feiertag, 'g' Termin aus Google */
function naechsteTage() {
  const heute = new Date(); heute.setHours(0, 0, 0, 0);
  const tage = {};
  const dazu = (k, e) => (tage[k] = tage[k] || []).push(e);

  for (let i = 0; i < UEBERSICHT_TAGE; i++) {
    const d = addDays(heute, i), ft = feiertagAn(d);
    if (ft) dazu(key(d), { art: 'f', zeit: '', text: ft });
  }
  for (let i = 0; i < UEBERSICHT_TAGE; i++) {
    const k = key(addDays(heute, i));
    alleTermineAn(k).forEach(t => dazu(k, { art: t.art, zeit: t.zeit || '', text: t.text }));
  }
  return tage;
}

/* "Heute", "Morgen" oder z. B. "Mi., 14.10." */
function tagName(k) {
  const heute = new Date(); heute.setHours(0, 0, 0, 0);
  const d = parseKey(k), abstand = Math.round((d - heute) / 864e5);
  if (abstand === 0) return 'Heute';
  if (abstand === 1) return 'Morgen';
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
}

/* Dashboard-Karte „Nächste 7 Tage“ */
const ART_NAME = { f: 'Feiertag', g: 'Google' };
function renderAnstehend(tage) {
  const ul = $('anstehend');
  ul.innerHTML = '';
  const alle = Object.keys(tage).sort().flatMap(k => tage[k].map(e => ({ ...e, k })));
  $('anstehendAnzahl').textContent = `${alle.length} in ${UEBERSICHT_TAGE} Tagen`;
  alle.forEach(e => {
    const li = document.createElement('li');
    li.className = 'a-zeile ' + e.art;
    const txt = document.createElement('div'); txt.className = 'a-text';
    const b = document.createElement('b'); b.textContent = e.text;
    const sm = document.createElement('small'); sm.textContent = tagName(e.k) + (e.art === 'g' && e.zeit ? ' · ' + e.zeit + ' Uhr' : '');
    txt.append(b, sm);
    const p = document.createElement('span'); p.className = 'pille'; p.textContent = ART_NAME[e.art];
    li.append(txt, p);
    ul.appendChild(li);
  });
  if (!alle.length) { const e = document.createElement('li'); e.className = 'empty'; e.textContent = 'Nichts geplant.'; ul.appendChild(e); }
}

/* ================= Tagesansicht ================= */
const STD_PX = 52;                       // Höhe einer Stunde im Raster (muss zu --std in style.css passen)
const minuten = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
let gezeichnet = '';                     // zuletzt gezeichneter Tag – nur beim Tageswechsel neu scrollen

/* k = Tag öffnen (Monat springt mit, falls nötig), null = schließen */
function tagOeffnen(k) {
  gewaehlt = k;
  if (k) {
    const d = parseKey(k);
    if (d.getMonth() !== ansicht.getMonth() || d.getFullYear() !== ansicht.getFullYear()) {
      ansicht = new Date(d.getFullYear(), d.getMonth(), 1);
    }
  }
  render();
}

/* Überlappende Termine nebeneinander: jeder bekommt eine Spalte, je Gruppe gleich viele Spalten */
function spaltenVerteilen(termine) {
  let gruppe = [], gruppeEnde = -1;
  const fertig = () => { const n = Math.max(...gruppe.map(t => t.spalte)) + 1; gruppe.forEach(t => { t.spalten = n; }); gruppe = []; };
  termine.forEach(t => {
    if (gruppe.length && t.start >= gruppeEnde) fertig();
    const belegt = new Set(gruppe.filter(x => x.ende > t.start).map(x => x.spalte));
    t.spalte = 0; while (belegt.has(t.spalte)) t.spalte++;
    gruppe.push(t); gruppeEnde = Math.max(gruppeEnde, t.ende);
  });
  if (gruppe.length) fertig();
}

function renderTag() {
  const panel = $('tagPanel');
  $('kal').classList.toggle('mit-tag', !!gewaehlt);
  panel.hidden = !gewaehlt;
  if (!gewaehlt) { gezeichnet = ''; return; }

  const d = parseKey(gewaehlt), heute = key(new Date()) === gewaehlt;
  $('tagTitel').textContent = d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  const ft = feiertagAn(d);
  const alle = alleTermineAn(gewaehlt);
  const ganz = alle.filter(t => !t.von), mitZeit = alle.filter(t => t.von);
  $('tagInfo').textContent = (heute ? 'Heute · ' : '') + `KW ${kalenderwoche(d)} · `
    + (alle.length ? `${alle.length} Termin${alle.length === 1 ? '' : 'e'}` : 'keine Termine');

  // Feiertag und ganztägige Termine oben
  const oben = $('tagGanz');
  oben.replaceChildren();
  if (ft) ganz.unshift({ art: 'f', text: ft });
  ganz.forEach(t => {
    const e = document.createElement('div'); e.className = 'tag-ganz-zeile ' + t.art;
    e.textContent = t.text; e.title = t.text; oben.appendChild(e);
  });
  oben.hidden = !ganz.length;

  // Stundenraster 0–24 Uhr mit den Terminen darin
  const box = $('tagStunden');
  const raster = document.createElement('div'); raster.className = 'tag-raster';
  for (let h = 0; h < 24; h++) {
    const z = document.createElement('div'); z.className = 'tag-std';
    const l = document.createElement('span'); l.textContent = pad(h) + ':00';
    z.appendChild(l); raster.appendChild(z);
  }
  const termine = mitZeit.map(t => {
    const start = minuten(t.von), ende = Math.max(minuten(t.bis), start + 30);   // kurze Termine mindestens ½ Stunde hoch
    return { ...t, start, ende: Math.min(ende, 24 * 60) };
  }).sort((a, b) => a.start - b.start || b.ende - a.ende);
  spaltenVerteilen(termine);
  const spur = document.createElement('div'); spur.className = 'tag-spur';
  termine.forEach(t => {
    const e = document.createElement('div'); e.className = 'tag-termin ' + t.art;
    e.style.top = (t.start / 60 * STD_PX) + 'px';
    e.style.height = ((t.ende - t.start) / 60 * STD_PX - 2) + 'px';
    e.style.left = `calc(${t.spalte} * 100% / ${t.spalten})`;
    e.style.width = `calc(100% / ${t.spalten} - 4px)`;
    const zeit = t.von === '00:00' && t.bis === '24:00' ? 'ganzer Tag' : `${t.von} – ${t.bis}`;
    e.title = `${zeit}  ${t.text}`;
    const b = document.createElement('b'); b.textContent = t.text;
    const sm = document.createElement('small'); sm.textContent = zeit;
    e.append(b, sm);
    if (t.ende - t.start <= 45) e.classList.add('kurz');      // Titel und Uhrzeit in einer Zeile
    spur.appendChild(e);
  });
  if (heute) {
    const jetzt = new Date(), linie = document.createElement('div');
    linie.className = 'tag-jetzt';
    linie.style.top = ((jetzt.getHours() * 60 + jetzt.getMinutes()) / 60 * STD_PX) + 'px';
    spur.appendChild(linie);
  }
  raster.appendChild(spur);
  const scroll = box.scrollTop;
  box.replaceChildren(raster);

  // Beim Öffnen eines Tages dorthin scrollen, wo etwas los ist: jetzt, der erste Termin oder 7 Uhr
  if (gezeichnet !== gewaehlt) {
    const ab = heute ? new Date().getHours() * 60 + new Date().getMinutes() - 60 : termine.length ? termine[0].start - 30 : 7 * 60;
    box.scrollTop = Math.max(0, ab) / 60 * STD_PX;
    gezeichnet = gewaehlt;
  } else box.scrollTop = scroll;
}

const monat = n => { ansicht.setMonth(ansicht.getMonth() + n); render(); };

/* ================= Bedienung ================= */
export function starteKalender() {
  starteGoogle(render);
  $('prev').onclick = () => monat(-1);
  $('next').onclick = () => monat(1);
  $('todayBtn').onclick = () => {
    if (gewaehlt) return tagOeffnen(key(new Date()));          // Tagesansicht offen: auf heute springen
    ansicht = new Date(); ansicht.setDate(1); render();
  };
  $('kalenderBtn').onclick = () => window.open(GOOGLE_URL, '_blank', 'noopener');

  // Tagesansicht: Tag vor und zurück, schließen (auch mit Esc)
  const tagSchritt = n => tagOeffnen(key(addDays(parseKey(gewaehlt), n)));
  $('tagZurueck').onclick = () => tagSchritt(-1);
  $('tagVor').onclick = () => tagSchritt(1);
  $('tagZu').onclick = () => tagOeffnen(null);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && gewaehlt && !document.querySelector('dialog[open]')) tagOeffnen(null);
  });
  // Linie „jetzt“ jede Minute nachziehen
  setInterval(() => { if (gewaehlt === key(new Date())) renderTag(); }, 60e3);

  render();
}
