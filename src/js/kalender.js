/* Kalender (große Monatsansicht, nur anzeigen) und die Karte „Nächste 7 Tage“ im Dashboard.
   Angezeigt werden die Feiertage (feiertage.js) und die Termine aus Google Kalender (google.js) –
   Termine werden nur in Google angelegt und geändert. */
import { UEBERSICHT_TAGE } from './einstellungen.js';
import { $, key, parseKey, addDays, kalenderwoche } from './hilfen.js';
import { feiertagAn } from './feiertage.js';
import { googleAn, googleBereich, starteGoogle } from './google.js';

let ansicht = new Date(); ansicht.setDate(1);

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
      + (k === todayKey ? ' today' : '');
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

const monat = n => { ansicht.setMonth(ansicht.getMonth() + n); render(); };

/* ================= Bedienung ================= */
export function starteKalender() {
  starteGoogle(render);
  $('prev').onclick = () => monat(-1);
  $('next').onclick = () => monat(1);
  $('todayBtn').onclick = () => {
    ansicht = new Date(); ansicht.setDate(1); render();
  };

  render();
}
