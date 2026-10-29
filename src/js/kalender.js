/* Kalender (große Monatsansicht mit Mehrfachauswahl zum Anlegen und Löschen)
   und die Karte "Anstehend" im Dashboard.
   Die Einträge selbst kommen aus speicher.js, die Termine aus Google Kalender aus google.js. */
import { UEBERSICHT_TAGE } from './einstellungen.js';
import { $, key, parseKey, addDays, kalenderwoche } from './hilfen.js';
import { feiertagAn } from './feiertage.js';
import { daten, termineAnlegen, terminLoeschen, urlaubeAnlegen, urlaubLoeschen } from './speicher.js';
import { googleAn, googleBereich, starteGoogle } from './google.js';

let ansicht = new Date(); ansicht.setDate(1);
let letzterKlick = null;                  // letzterKlick = Anfangstag eines möglichen Zeitraums
const auswahl = new Set();

const urlaubeAn = k => daten.urlaube.filter(u => u.von <= k && k <= u.bis);
const termineAn = k => (daten.termine[k] || []).slice().sort((a, b) => (a.zeit || '').localeCompare(b.zeit || ''));
/* Eigene Termine und die aus Google zusammen, nach Uhrzeit: [{ art: '' | 'g', zeit, text }] */
const alleTermineAn = k => [...termineAn(k).map(t => ({ ...t, art: '' })), ...googleAn(k).map(t => ({ ...t, art: 'g' }))]
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
  // Google-Termine für alle sichtbaren Tage und die Karte „Anstehend“
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
      + (urlaubeAn(k).length ? ' urlaub' : '')
      + (k === todayKey ? ' today' : '')
      + (auswahl.has(k) ? ' sel' : '');
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
    el.onclick = () => {
      if (letzterKlick && k > letzterKlick) {
        // Zweiter Tag liegt nach dem ersten → alle Tage von … bis auswählen
        for (let x = parseKey(letzterKlick); x <= d; x = addDays(x, 1)) auswahl.add(key(x));
        letzterKlick = null;
      } else if (auswahl.has(k)) {
        auswahl.delete(k);                     // erneut angetippt → abwählen
        if (letzterKlick === k) letzterKlick = null;
      } else {
        auswahl.add(k); letzterKlick = k;      // neuer Anfangstag
      }
      render();
    };
    grid.appendChild(el);
  }
  renderAnstehend(naechsteTage());
  updateMehrfach();
}

/* Beschriftungen in den Tagesfeldern */
function labels(d, k) {
  const box = document.createElement('div'); box.className = 'lbls';
  const arr = [];
  const ft = feiertagAn(d); if (ft) arr.push(['f', ft]);
  urlaubeAn(k).forEach(u => arr.push(['u', u.text]));
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
/* Liefert { 'JJJJ-MM-TT': [{ art, zeit, text }] } – art: 'f' Feiertag, 'u' Urlaub, '' Termin, 'g' Termin aus Google */
function naechsteTage() {
  const heute = new Date(); heute.setHours(0, 0, 0, 0);
  const hk = key(heute), ende = key(addDays(heute, UEBERSICHT_TAGE - 1));
  const tage = {};
  const dazu = (k, e) => (tage[k] = tage[k] || []).push(e);
  const kurz = k => parseKey(k).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' });

  for (let i = 0; i < UEBERSICHT_TAGE; i++) {
    const d = addDays(heute, i), ft = feiertagAn(d);
    if (ft) dazu(key(d), { art: 'f', zeit: '', text: ft });
  }
  // Urlaub nur einmal auflisten: am ersten Tag (bzw. heute, wenn er schon läuft)
  daten.urlaube.filter(u => u.bis >= hk && u.von <= ende).forEach(u =>
    dazu(u.von > hk ? u.von : hk, { art: 'u', zeit: 'Urlaub', text: u.von === u.bis ? u.text : `${u.text} (bis ${kurz(u.bis)})` }));
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

/* Dashboard-Karte „Anstehend“ */
const ART_NAME = { f: 'Feiertag', u: 'Urlaub', '': 'Termin', g: 'Google' };
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
    const sm = document.createElement('small'); sm.textContent = tagName(e.k) + ((e.art === '' || e.art === 'g') && e.zeit ? ' · ' + e.zeit + ' Uhr' : '');
    txt.append(b, sm);
    const p = document.createElement('span'); p.className = 'pille'; p.textContent = ART_NAME[e.art];
    li.append(txt, p);
    ul.appendChild(li);
  });
  if (!alle.length) { const e = document.createElement('li'); e.className = 'empty'; e.textContent = 'Nichts geplant.'; ul.appendChild(e); }
}

const monat = n => { ansicht.setMonth(ansicht.getMonth() + n); render(); };

/* ================= Mehrfachauswahl ================= */
function updateMehrfach() {
  const n = auswahl.size;
  $('selCount').textContent = !n
    ? 'Keine Tage ausgewählt – ersten Tag antippen'
    : `${n} ${n === 1 ? 'Tag' : 'Tage'} ausgewählt` + (letzterKlick ? ' – für einen Zeitraum den letzten Tag antippen' : '');
  $('mAdd').disabled = !n;
  $('mLoeschen').disabled = !eintraegeIn([...auswahl]).length;
  $('mTime').style.display = $('mArt').value === 'termin' ? '' : 'none';
}
function mehrfachAnlegen() {
  if (!auswahl.size) return;
  const art = $('mArt').value;
  const input = $('mText');
  const text = input.value.trim() || (art === 'urlaub' ? 'Urlaub' : '');
  if (!text) { input.focus(); return; }
  const tage = [...auswahl].sort();
  auswahl.clear(); letzterKlick = null;
  input.value = '';
  if (art === 'termin') {
    termineAnlegen(tage.map(datum => ({ datum, zeit: $('mTime').value, text })));
  } else {
    // Aufeinanderfolgende Tage werden zu einem Urlaub zusammengefasst
    const urlaube = [];
    let von = tage[0], prev = tage[0];
    for (let i = 1; i < tage.length; i++) {
      if (key(addDays(parseKey(prev), 1)) !== tage[i]) { urlaube.push({ text, von, bis: prev }); von = tage[i]; }
      prev = tage[i];
    }
    urlaube.push({ text, von, bis: prev });
    urlaubeAnlegen(urlaube);
  }
  $('mTime').value = '';
}

/* Termine und Urlaube an den ausgewählten Tagen. Ein Urlaub zählt, wenn er einen der Tage berührt. */
function eintraegeIn(tage) {
  const kurz = k => parseKey(k).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' });
  const termine = tage.sort().flatMap(k => termineAn(k).map(t => ({
    loeschen: () => terminLoeschen(t.id), text: `${kurz(k)}${t.zeit ? ' ' + t.zeit : ''}  ${t.text}` })));
  const urlaube = daten.urlaube.filter(u => tage.some(k => u.von <= k && k <= u.bis)).map(u => ({
    loeschen: () => urlaubLoeschen(u.id), text: `Urlaub ${kurz(u.von)}${u.bis !== u.von ? '–' + kurz(u.bis) : ''}  ${u.text}` }));
  return [...termine, ...urlaube];
}
function mehrfachLoeschen() {
  const liste = eintraegeIn([...auswahl]);
  if (!liste.length) return;
  const zeilen = liste.slice(0, 12).map(e => '• ' + e.text);
  if (liste.length > 12) zeilen.push(`… und ${liste.length - 12} weitere`);
  if (!confirm(`${liste.length === 1 ? 'Diesen Eintrag' : `Diese ${liste.length} Einträge`} löschen?\n\n${zeilen.join('\n')}`)) return;
  auswahl.clear(); letzterKlick = null;
  liste.forEach(e => e.loeschen());
}

/* ================= Bedienung ================= */
export function starteKalender() {
  starteGoogle(render);
  $('prev').onclick = () => monat(-1);
  $('next').onclick = () => monat(1);
  $('todayBtn').onclick = () => {
    ansicht = new Date(); ansicht.setDate(1); render();
  };

  $('mArt').onchange = updateMehrfach;
  $('mAdd').onclick = mehrfachAnlegen;
  $('mText').addEventListener('keydown', e => { if (e.key === 'Enter') mehrfachAnlegen(); });
  $('mLoeschen').onclick = mehrfachLoeschen;
  $('mClear').onclick = () => { auswahl.clear(); letzterKlick = null; render(); };

  render();
}
