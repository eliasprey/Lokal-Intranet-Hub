/* Finanzen: links Gesamtwert und Gewinn/Verlust seit dem Kauf, darunter das Diagramm (Verlauf über Intraday … MAX),
   rechts die Reiter „Hinzufügen“ (Aktien, ETFs, Fonds und Kryptos suchen und mit Stückzahl und Einkaufskurs hinzufügen)
   und „Assets“ (oben „Gesamt“, darunter jede Position). Was dort gewählt ist – Gesamt oder ein einzelnes Asset –,
   zeigen Summe und Diagramm. Die Positionen liegen in der Datenbank (speicher.js), die Kurse holt der Server bei
   Yahoo Finance (server.py): den Verlauf alle paar Minuten, den aktuellen Kurs alle 5 Sekunden, solange die Seite offen ist.
   Werte und Gewinn sind in Euro (inkl. Wechselkurs), der Kurs einer Position in ihrer Börsenwährung. */
import { KURSE_ALLE_MIN, LIVE_ALLE_SEK } from './einstellungen.js';
import { $ } from './hilfen.js';
import { daten, beiAenderung, depotSpeichern, depotLoeschen } from './speicher.js';
import { diagramm } from './diagramm.js';
import { gesperrt } from './sicherheit.js';

const STORE_K = 'intranet.kurse.v1';                   // letzte Kurse, damit nach dem Neuladen sofort etwas dasteht
const STORE_A = 'intranet.finanzen.ansicht.v1';        // gewähltes Asset und Zeitraum (nur auf diesem Gerät)
const ZEITRAUM_NAME = { '1t': 'Intraday', '1w': '1 Woche', '1m': '1 Monat', '3m': '3 Monate', '1j': '1 Jahr', '3j': '3 Jahre', '5j': '5 Jahre', max: 'seit Beginn' };

let kurse = {}, live = {}, stand = null, kursFehler = false;
try { ({ kurse, live = {}, stand } = JSON.parse(localStorage.getItem(STORE_K)) || { kurse: {} }); } catch (e) {}
const merken = () => { try { localStorage.setItem(STORE_K, JSON.stringify({ kurse, live, stand })); } catch (e) {} };

let auswahl = null, zeitraum = '1j';                    // auswahl: id der Position, null = Gesamt
try { ({ auswahl = null, zeitraum = '1j' } = JSON.parse(localStorage.getItem(STORE_A)) || {}); } catch (e) {}
if (!ZEITRAUM_NAME[zeitraum]) zeitraum = '1j';
const ansichtMerken = () => { try { localStorage.setItem(STORE_A, JSON.stringify({ auswahl, zeitraum })); } catch (e) {} };

/* ================= Zahlen ================= */
function geld(n, waehrung = 'EUR', stellen = 2) {
  const f = { minimumFractionDigits: stellen, maximumFractionDigits: stellen };
  try { return n.toLocaleString('de-DE', { style: 'currency', currency: waehrung, ...f }); }
  catch (e) { return n.toLocaleString('de-DE', f) + ' ' + waehrung; }
}
const kursText = (n, w) => geld(n, w, n >= 1 ? 2 : n >= 0.01 ? 4 : 8);   // Kryptos kosten oft nur Bruchteile eines Cents
const stueck = t => Number(t).toLocaleString('de-DE', { maximumFractionDigits: 8 });
const vz = n => (n > 0 ? '+' : n < 0 ? '−' : '±');        // Vorzeichen, damit Plus/Minus nicht nur an der Farbe hängt
const prozent = p => vz(p) + Math.abs(p * 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
const differenz = (d, w = 'EUR') => vz(d) + (w === 'EUR' ? geld(Math.abs(d)) : kursText(Math.abs(d), w));
const richtung = n => (n > 0 ? 'plus' : n < 0 ? 'minus' : '');
function uhrzeit(sek) {                                   // heute nur die Uhrzeit, sonst mit Wochentag
  const d = new Date(sek * 1000);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString('de-DE')
    : d.toLocaleString('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

/* Eingaben: Komma oder Punkt als Dezimaltrennzeichen. Beim Einkaufskurs sind Tausenderpunkte erlaubt (1.500,50). */
function mengeLesen(t) {
  t = t.trim().replace(',', '.');
  if (!/^\d{1,12}(\.\d{1,8})?$/.test(t)) return null;
  return Number(t) > 0 ? t.replace(/^0+(?=\d)/, '') : null;
}
function betragLesen(t) {
  t = t.trim().replace(/\s|€/g, '');
  if (!t) return '';
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  return /^\d{1,10}(\.\d{1,8})?$/.test(t) ? t : null;
}
const eingabe = t => String(t).replace('.', ',');     // gespeicherten Wert wieder ins Feld schreiben

/* ================= Kurse ================= */
async function abfrage(art, symbole, mehr = '') {
  const r = await fetch(`api/finanzen/${art}?symbole=` + encodeURIComponent(symbole.join(',')) + mehr, { cache: 'no-store' });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).fehler || 'Fehler ' + r.status);
  return r.json();
}
const depotSymbole = () => [...new Set(daten.depot.map(p => p.symbol))].sort();

/* Kurse samt Wechselkurs, alle paar Minuten */
let laedt = false;
async function aktualisieren() {
  const symbole = depotSymbole();
  if (!symbole.length || laedt) return zeigeDepot();
  laedt = true;
  try {
    Object.assign(kurse, await abfrage('kurse', symbole));
    stand = Date.now(); kursFehler = false;
    merken();
  } catch (e) {
    kursFehler = true;
  } finally {
    laedt = false;
  }
  zeigeDepot();
}

/* Aktueller Kurs, alle paar Sekunden – nur solange die Seite Finanzen zu sehen ist */
let liveLaedt = false;
const sichtbar = () => !document.hidden && !document.querySelector('.fin').inert;
async function liveHolen() {
  const symbole = depotSymbole();
  if (!symbole.length || liveLaedt || !sichtbar()) return;
  liveLaedt = true;
  try {
    Object.assign(live, await abfrage('live', symbole));
    stand = Date.now(); kursFehler = false;
    merken();
    zeigeDepot();
  } catch (e) {
    kursFehler = true;
    zeigeDepot();
  } finally {
    liveLaedt = false;
  }
}

/* ================= Summe (links oben) und Assets (rechts) ================= */
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

/* Rechnet je Position: aktueller Kurs, Wert in Euro, Gewinn gegenüber dem Einkauf */
function berechne(pos) {
  const k = kurse[pos.symbol], l = live[pos.symbol], m = Number(pos.menge);
  if (!k || k.fehler) return { pos, fehler: k?.fehler || (kursFehler ? 'Kurs nicht abrufbar' : 'Kurs wird geladen …') };
  const kurs = l && !l.fehler ? l.kurs : k.kurs;
  const zeit = l && !l.fehler ? l.zeit : k.zeit;
  const eur = l && !l.fehler && l.eur != null ? l.eur : k.eur?.kurs;
  const wert = eur != null ? m * kurs * eur : null;
  const einkauf = pos.einkauf === '' ? null : Number(pos.einkauf);   // pro Stück in Euro
  const kosten = einkauf != null ? einkauf * m : null;
  const gewinn = kosten != null && wert != null ? wert - kosten : null;
  return { pos, kurs, zeit, waehrung: k.waehrung, wert, einkauf, kosten, gewinn };
}

/* Summe über Positionen: Wert nur mit Kurs; Gewinn nur über Positionen mit Einkaufskurs.
   Beispiel: A 100 × 10 € → jetzt 15 €, B 50 × 10 € → jetzt 5 €: Wert 1.750 €, Kosten 1.500 €, Gewinn +250 € = +16,67 % */
function summe(zeilen) {
  const mitWert = zeilen.filter(z => z.wert != null), mitEinkauf = mitWert.filter(z => z.kosten != null);
  return { zeilen, mitWert, mitEinkauf,
    wert: mitWert.reduce((s, z) => s + z.wert, 0),
    kosten: mitEinkauf.reduce((s, z) => s + z.kosten, 0),
    gewinn: mitEinkauf.reduce((s, z) => s + z.gewinn, 0) };
}
const gewinnText = s => s.mitEinkauf.length ? differenz(s.gewinn) + (s.kosten > 0 ? ' · ' + prozent(s.gewinn / s.kosten) : '') : '';

function zeigeDepot() {
  const zeilen = daten.depot.map(berechne);
  if (auswahl && !zeilen.some(z => z.pos.id === auswahl)) { auswahl = null; ansichtMerken(); }
  $('depotAnzahl').textContent = zeilen.length || '';
  $('depotStand').textContent = kursFehler ? 'Kurse gerade nicht abrufbar'
    : stand ? 'Stand ' + new Date(stand).toLocaleTimeString('de-DE') + ' · Yahoo Finance' : '';
  $('depotStand').classList.toggle('warnung', kursFehler);

  /* Oben links: Gesamt oder das gewählte Asset */
  const gewaehlt = auswahl ? zeilen.filter(z => z.pos.id === auswahl) : zeilen;
  const s = summe(gewaehlt), n = s.mitEinkauf.length;
  $('depotTitel').textContent = auswahl ? gewaehlt[0].pos.name : 'Mein Depot';
  $('depotWert').textContent = s.mitWert.length ? geld(s.wert) : '–';
  $('depotGewinn').textContent = n ? differenz(s.gewinn) : '–';
  $('depotGewinn').className = n ? richtung(s.gewinn) : '';
  $('depotGewinnProz').textContent = n && s.kosten > 0 ? prozent(s.gewinn / s.kosten) : s.mitWert.length ? 'Einkaufskurs eintragen' : '';
  $('depotGewinnProz').className = n ? richtung(s.gewinn) : 'leer';
  $('depotGewinnProz').title = n && n < s.mitWert.length ? 'Nur Positionen mit Einkaufskurs' : '';

  /* Rechts: „Gesamt“ und jede Position */
  const liste = $('depotListe');
  if (!zeilen.length) {
    zeilenEl.clear();
    liste.replaceChildren(el('div', 'empty', 'Noch nichts im Depot – unter „Hinzufügen“ suchen und hinzufügen.'));
    zeichneChart();
    return;
  }
  liste.querySelector(':scope > .empty')?.remove();
  if (liste.firstChild !== gesamtEl.box) liste.prepend(gesamtEl.box);
  fuelleGesamt(summe(zeilen));
  const ids = new Set(zeilen.map(z => z.pos.id));
  for (const [id, z] of zeilenEl) if (!ids.has(id)) { z.box.remove(); zeilenEl.delete(id); }
  zeilen.forEach((z, i) => {                      // vorhandene Zeilen nur auffrischen, damit ein Tippen nicht verloren geht
    let e = zeilenEl.get(z.pos.id);
    if (!e) { e = neueZeile(z.pos.id); zeilenEl.set(z.pos.id, e); }
    if (liste.children[i + 1] !== e.box) liste.insertBefore(e.box, liste.children[i + 1] || null);
    fuelle(e, z);
  });
  zeichneChart();
}

/* Gesamt oder ein Asset anzeigen */
function zeigeAsset(id) {
  auswahl = id; ansichtMerken();
  zeigeDepot();
}

/* ---- eine Zeile: einmal aufbauen, danach nur Texte ändern ---- */
const zeilenEl = new Map();                       // id → { box, …Felder }
const feld = (cls) => { const f = el('div', cls); f.b = el('b'); f.s = el('small'); f.append(f.b, f.s); return f; };
function anklickbar(box, aktion) {
  box.tabIndex = 0; box.setAttribute('role', 'button');
  box.onclick = aktion;
  box.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === box) { e.preventDefault(); aktion(); } };
}

const gesamtEl = (() => {
  const e = { box: el('div', 'pos gesamt'), name: feld('pos-name'), wert: feld('pos-wert') };
  e.box.append(e.name, e.wert);
  anklickbar(e.box, () => zeigeAsset(null));
  return e;
})();
function fuelleGesamt(s) {
  gesamtEl.box.classList.toggle('on', auswahl === null);
  const anzahl = s.zeilen.length === 1 ? '1 Asset' : `${s.zeilen.length} Assets`;
  setze(gesamtEl.name, 'Gesamt', anzahl + ' zusammen');
  setze(gesamtEl.wert, s.mitWert.length ? geld(s.wert) : '–', gewinnText(s) || ' ', '', s.mitEinkauf.length ? richtung(s.gewinn) : '');
}

function neueZeile(id) {
  const e = { box: el('div', 'pos'), name: feld('pos-name'), kurs: feld('pos-kurs'), wert: feld('pos-wert') };
  const knoepfe = el('div', 'pos-knoepfe');
  const aendern = el('button'); aendern.innerHTML = svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>');
  aendern.title = aendern.ariaLabel = 'Stückzahl oder Einkaufskurs ändern';
  aendern.onclick = ev => { ev.stopPropagation(); const p = daten.depot.find(x => x.id === id); if (p) bearbeiten(p); };
  const weg = el('button', 'weg'); weg.innerHTML = svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>');
  weg.title = weg.ariaLabel = 'Aus dem Depot entfernen';
  weg.onclick = ev => {
    ev.stopPropagation();
    const p = daten.depot.find(x => x.id === id);
    if (p && confirm(`„${p.name}“ (${stueck(p.menge)} Stück) aus dem Depot entfernen?`)) { if (bearbeitet === id) formZu(); depotLoeschen(id); }
  };
  knoepfe.append(aendern, weg);
  e.box.append(e.name, e.kurs, e.wert, knoepfe);
  anklickbar(e.box, () => zeigeAsset(id));
  return e;
}

function setze(f, b, s, bKlasse = '', sKlasse = '') {
  if (f.b.textContent !== b) f.b.textContent = b;
  if (f.s.textContent !== s) f.s.textContent = s;
  f.b.className = bKlasse; f.s.className = sKlasse;
}

function fuelle(e, z) {
  const { pos } = z;
  e.box.classList.toggle('on', auswahl === pos.id);
  setze(e.name, pos.name, [pos.symbol, pos.art].filter(Boolean).join(' · '));
  /* Unter dem aktuellen Kurs steht die Stückzahl */
  if (z.fehler) {
    setze(e.kurs, '–', z.fehler, '', 'warnung');
  } else {
    let blinken = '';                             // Kurs kurz grün bzw. rot aufleuchten lassen, wenn er sich geändert hat
    if (e.letzterKurs != null && z.kurs !== e.letzterKurs) {
      e.kurs.b.classList.remove('auf', 'ab'); void e.kurs.b.offsetWidth;
      blinken = z.kurs > e.letzterKurs ? 'auf' : 'ab';
    } else if (e.kurs.b.classList.contains('auf') || e.kurs.b.classList.contains('ab')) {
      blinken = e.kurs.b.className;               // Aufleuchten nicht abbrechen
    }
    setze(e.kurs, kursText(z.kurs, z.waehrung), stueck(pos.menge) + ' Stück', blinken);
    e.kurs.title = 'Kurs von ' + uhrzeit(z.zeit) + (z.einkauf != null ? ' · Kauf ' + kursText(z.einkauf, 'EUR') : '');
    e.letzterKurs = z.kurs;
  }
  const s = summe([z]);
  setze(e.wert, z.wert != null ? geld(z.wert) : '–', z.gewinn != null ? gewinnText(s) : z.fehler ? ' ' : 'kein Einkaufskurs',
    '', z.gewinn != null ? richtung(z.gewinn) : 'leer');
}

/* ================= Diagramm ================= */
let chart = null;
const verlauf = {};                               // 'zeitraum|A,B' → { zeit, daten } – Antwort von api/finanzen/verlauf
let verlaufLaedt = '';
const verlaufSchluessel = () => zeitraum + '|' + depotSymbole().join();

/* Holt den Verlauf aller Wertpapiere im gewählten Zeitraum (für Gesamt und jedes einzelne) */
async function verlaufHolen() {
  const symbole = depotSymbole(), k = verlaufSchluessel(), alt = verlauf[k];
  if (!symbole.length) return zeichneChart();
  if (alt && Date.now() - alt.zeit < (zeitraum === '1t' ? 60e3 : 10 * 60e3)) return zeichneChart();
  if (verlaufLaedt === k) return;
  verlaufLaedt = k;
  if (!alt) { zeichneChart(); chart.meldung('Verlauf wird geladen …'); }
  try {
    verlauf[k] = { zeit: Date.now(), daten: await abfrage('verlauf', symbole, '&zeitraum=' + zeitraum) };
  } catch (e) {
    if (!alt && k === verlaufSchluessel()) chart.meldung('Verlauf gerade nicht abrufbar – ' + e.message);
    return;
  } finally {
    if (verlaufLaedt === k) verlaufLaedt = '';
  }
  zeichneChart();
}

/* Wert aller Positionen in Euro zu jedem Zeitpunkt, an dem irgendein Kurs vorliegt. Fehlt einem Wertpapier dort ein Kurs
   (andere Börsenzeiten, Wochenende), zählt sein letzter Kurs davor – vor seinem ersten Kurs der erste. Gerechnet wird mit
   den heutigen Stückzahlen (wann gekauft wurde, ist nicht bekannt). */
function gesamtVerlauf(zeilen, v) {
  const mengen = {};
  zeilen.forEach(z => { mengen[z.pos.symbol] = (mengen[z.pos.symbol] || 0) + Number(z.pos.menge); });
  const reihen = [], fehlt = [];
  for (const [symbol, menge] of Object.entries(mengen)) {
    const r = v[symbol], fest = r?.waehrung === 'EUR' ? 1 : kurse[symbol]?.eur?.kurs;   // fester Wechselkurs, falls der Verlauf fehlt
    if (!r || r.fehler || (!r.eur && fest == null)) { fehlt.push(zeilen.find(z => z.pos.symbol === symbol).pos.name); continue; }
    reihen.push({ symbol, menge, kurs: r.punkte, eur: r.eur, fest });
  }
  const wertAn = (liste, z, t) => { while (z.i + 1 < liste.length && liste[z.i + 1][0] <= t) z.i++; return liste[z.i][1]; };
  const zeiger = reihen.map(() => ({ k: { i: 0 }, e: { i: 0 } }));
  const zeiten = [...new Set(reihen.flatMap(r => r.kurs.map(p => p[0])))].sort((a, b) => a - b);
  const punkte = zeiten.map(t => [t, reihen.reduce((s, r, j) =>
    s + r.menge * wertAn(r.kurs, zeiger[j].k, t) * (r.eur ? wertAn(r.eur, zeiger[j].e, t) : r.fest), 0)]);
  /* Zum Schluss der aktuelle Wert, damit das Diagramm mit der Summe oben endet */
  const dabei = zeilen.filter(z => reihen.some(r => r.symbol === z.pos.symbol));
  const jetzt = Math.max(...dabei.map(z => z.zeit || 0));
  if (punkte.length && dabei.every(z => z.wert != null) && jetzt > punkte.at(-1)[0]) punkte.push([jetzt, dabei.reduce((s, z) => s + z.wert, 0)]);
  return { punkte, fehlt };
}

const datum = (sek, o) => new Date(sek * 1000).toLocaleString('de-DE', o);
function achse(sek) {                             // Beschriftung der x-Achse je Zeitraum
  const d = new Date(sek * 1000);
  if (zeitraum === '1t') return [d.getHours(), datum(sek, { hour: '2-digit', minute: '2-digit' })];
  if (zeitraum === '1w') return [d.toDateString(), datum(sek, { weekday: 'short', day: 'numeric' }) + '.'];
  if (zeitraum === '1m') return [d.toDateString(), datum(sek, { day: '2-digit', month: '2-digit' }) + '.'];
  if (zeitraum === '3m' || zeitraum === '1j') return [d.getFullYear() * 12 + d.getMonth(),
    d.getMonth() ? datum(sek, { month: 'short' }) : String(d.getFullYear())];
  if (zeitraum === '3j') return [d.getFullYear() * 4 + Math.floor(d.getMonth() / 3), datum(sek, { month: 'short', year: '2-digit' })];
  return [d.getFullYear(), String(d.getFullYear())];
}
const zeitText = sek => ['1t', '1w', '1m'].includes(zeitraum)
  ? datum(sek, { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  : datum(sek, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });

function zeichneChart() {
  if (!chart) return;
  document.querySelectorAll('#zeitraeume button').forEach(b => b.classList.toggle('on', b.dataset.zeitraum === zeitraum));
  const zeilen = daten.depot.map(berechne), aenderung = $('chartAenderung');
  const einzeln = auswahl ? zeilen.find(z => z.pos.id === auswahl) : null;
  $('chartTitel').textContent = einzeln ? einzeln.pos.name : 'Gesamtes Depot';
  aenderung.textContent = ''; aenderung.className = '';
  if (!zeilen.length) return chart.meldung('Noch nichts im Depot – rechts unter „Hinzufügen“ ein Wertpapier suchen.');
  const v = verlauf[verlaufSchluessel()]?.daten;
  if (!v) return;                                 // wird gerade geladen

  let punkte, waehrung = 'EUR', fehlt = [];
  if (einzeln) {
    const r = v[einzeln.pos.symbol];
    if (!r || r.fehler) return chart.meldung(r?.fehler || 'Kein Verlauf für dieses Wertpapier.');
    punkte = r.punkte.slice(); waehrung = r.waehrung;
    if (!einzeln.fehler && einzeln.zeit > punkte.at(-1)[0]) punkte.push([einzeln.zeit, einzeln.kurs]);   // aktueller Kurs
  } else {
    ({ punkte, fehlt } = gesamtVerlauf(zeilen, v));
  }
  if (punkte.length < 2) return chart.meldung('Zu wenige Kurse in diesem Zeitraum.');

  const erster = punkte[0][1], diff = punkte.at(-1)[1] - erster;
  aenderung.textContent = [erster ? prozent(diff / erster) : null, differenz(diff, waehrung), ZEITRAUM_NAME[zeitraum]].filter(Boolean).join(' · ')
    + (fehlt.length ? ` · ohne ${fehlt.join(', ')}` : '');
  aenderung.className = richtung(diff);
  const wertText = w => waehrung === 'EUR' && !einzeln ? geld(w) : kursText(w, waehrung);
  chart.setze({ punkte, wertText, zeitText, achse,
    beschreibung: `${einzeln ? einzeln.pos.name + ', Kurs' : 'Wert des Depots'} über ${ZEITRAUM_NAME[zeitraum]}: ${wertText(erster)} bis ${wertText(punkte.at(-1)[1])}` });
}

/* ================= Reiter rechts ================= */
let reiterVonHand = false;                        // solange nicht selbst gewählt: mit Depot „Assets“, ohne „Hinzufügen“
function reiter(name) {                           // 'assets' oder 'neu'
  $('finAssets').hidden = name !== 'assets';
  $('finNeu').hidden = name !== 'neu';
  $('finTabAssets').classList.toggle('on', name === 'assets');
  $('finTabNeu').classList.toggle('on', name === 'neu');
}

/* ================= Suchen und hinzufügen (rechts) ================= */
let gewaehlt = null, bearbeitet = null, suchNr = 0, suchTimer;

async function suchen(q) {
  const box = $('finTreffer'), nr = ++suchNr;
  q = q.trim();
  if (q.length < 2) { zeigeHinweis(); return; }
  box.replaceChildren(el('div', 'empty', 'Suche …'));
  let treffer;
  try {
    const r = await fetch('api/finanzen/suche?q=' + encodeURIComponent(q), { cache: 'no-store' });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).fehler || 'Fehler ' + r.status);
    treffer = await r.json();
  } catch (e) {
    if (nr === suchNr) box.replaceChildren(el('div', 'empty warnung', 'Suche gerade nicht möglich – ' + e.message));
    return;
  }
  if (nr !== suchNr) return;                     // inzwischen wurde weitergetippt
  box.replaceChildren();
  if (!treffer.length) box.appendChild(el('div', 'empty', `Nichts gefunden zu „${q}“. Tipp: Name, Börsenkürzel oder ISIN.`));
  treffer.forEach(t => {
    const b = el('button', 'treffer');
    const txt = el('span');
    txt.append(el('b', '', t.name), el('small', '', [t.symbol, t.boerse].filter(Boolean).join(' · ')));
    b.append(txt, el('span', 'pille' + (t.art === 'Krypto' ? ' krypto' : ''), t.art));
    b.onclick = () => waehlen(t);
    box.appendChild(b);
  });
}

function zeigeHinweis() {
  $('finTreffer').replaceChildren(el('div', 'empty', 'Aktien, ETFs, Fonds oder Kryptos suchen – z. B. „Apple“, „MSCI World“, eine ISIN oder „Bitcoin“. Dann antippen, Stückzahl eintragen und hinzufügen.'));
}

/* Vorschau des gewählten Wertpapiers: Kurs und heutige Entwicklung */
async function vorschau(symbol) {
  const f = $('finKurs');
  f.textContent = 'Kurs wird geladen …'; f.className = 'fin-kurs';
  try {
    const k = (await abfrage('kurse', [symbol]))[symbol];
    if (gewaehlt?.symbol !== symbol) return;
    if (k.fehler) throw new Error(k.fehler);
    kurse[symbol] = k;
    const p = k.ref.tag ? k.kurs / k.ref.tag - 1 : null;
    f.textContent = kursText(k.kurs, k.waehrung) + (p != null ? ` · heute ${prozent(p)}` : '');
    f.className = 'fin-kurs ' + (p != null ? richtung(p) : '');
  } catch (e) {
    if (gewaehlt?.symbol === symbol) { f.textContent = 'Kurs nicht abrufbar (' + e.message + ')'; f.className = 'fin-kurs warnung'; }
  }
}

function formAuf(t) {
  gewaehlt = t;
  $('finName').textContent = t.name;
  $('finInfo').textContent = [t.symbol, t.boerse, t.art].filter(Boolean).join(' · ');
  $('finFehler').textContent = '';
  $('finSuche').hidden = $('finTreffer').hidden = true;
  $('finForm').hidden = false;
  vorschau(t.symbol);
}

function waehlen(t) {
  bearbeitet = null;
  $('finTitel').textContent = 'Hinzufügen';
  $('finOk').textContent = 'Zum Depot hinzufügen';
  $('finMenge').value = ''; $('finEinkauf').value = '';
  formAuf(t);
  $('finMenge').focus();
}

function bearbeiten(pos) {
  bearbeitet = pos.id;
  $('finTitel').textContent = 'Position ändern';
  $('finOk').textContent = 'Speichern';
  $('finMenge').value = eingabe(pos.menge);
  $('finEinkauf').value = eingabe(pos.einkauf);
  formAuf(pos);
  reiter('neu');
}

function formZu() {
  gewaehlt = bearbeitet = null;
  $('finTitel').textContent = 'Hinzufügen';
  $('finForm').hidden = true;
  $('finSuche').hidden = $('finTreffer').hidden = false;
}

function speichern(e) {
  e.preventDefault();
  const menge = mengeLesen($('finMenge').value), einkauf = betragLesen($('finEinkauf').value);
  if (menge == null) { $('finFehler').textContent = 'Bitte eine Stückzahl größer als 0 eintragen – höchstens 8 Nachkommastellen.'; $('finMenge').focus(); return; }
  if (einkauf == null) { $('finFehler').textContent = 'Einkaufskurs bitte als Euro-Betrag pro Stück, z. B. 320,09 oder 1.500,50.'; $('finEinkauf').focus(); return; }
  const { symbol, name, art, boerse } = gewaehlt;
  depotSpeichern({ id: bearbeitet || undefined, symbol, name, art, boerse, menge, einkauf });
  formZu();
  reiter('assets');                               // die neue bzw. geänderte Position gleich sehen
  aktualisieren();
}

/* ================= Start ================= */
export function starteFinanzen() {
  chart = diagramm($('chart'));
  zeigeHinweis();
  reiter(daten.depot.length || gesperrt() ? 'assets' : 'neu');
  $('finTabAssets').onclick = () => { reiterVonHand = true; reiter('assets'); };
  $('finTabNeu').onclick = () => { reiterVonHand = true; reiter('neu'); };
  document.querySelectorAll('#zeitraeume button').forEach(b => {
    b.onclick = () => { zeitraum = b.dataset.zeitraum; ansichtMerken(); zeichneChart(); verlaufHolen(); };
  });
  $('finSuche').addEventListener('submit', e => { e.preventDefault(); clearTimeout(suchTimer); suchen($('finSuchText').value); });
  $('finSuchText').addEventListener('input', () => { clearTimeout(suchTimer); suchTimer = setTimeout(() => suchen($('finSuchText').value), 450); });
  $('finForm').addEventListener('submit', speichern);
  $('finAbbrechen').onclick = formZu;
  ['finMenge', 'finEinkauf'].forEach(id => $(id).addEventListener('input', () => { $('finFehler').textContent = ''; }));

  let bekannte = '';
  beiAenderung(() => {                            // neue Wertpapiere (auch von anderen Geräten) → gleich Kurse holen
    const jetzt = depotSymbole().join();
    if (gesperrt()) { if (gewaehlt) formZu(); reiter('assets'); }   // Einstellungen → Sicherheit: nur ansehen
    else if (!reiterVonHand && !gewaehlt) reiter(daten.depot.length ? 'assets' : 'neu');   // Depot kam erst vom Server
    if (jetzt !== bekannte) { bekannte = jetzt; aktualisieren().then(liveHolen); if (sichtbar()) verlaufHolen(); } else zeigeDepot();
  });
  bekannte = depotSymbole().join();
  aktualisieren();
  setInterval(() => { if (!document.hidden) aktualisieren(); }, KURSE_ALLE_MIN * 60e3);
  setInterval(liveHolen, LIVE_ALLE_SEK * 1000);
  setInterval(() => { if (sichtbar()) verlaufHolen(); }, 60e3);   // Verlauf: Intraday jede Minute, sonst alle 10 Minuten neu
  document.addEventListener('seitenwechsel', e => { if (e.detail === 'Finanzen') { liveHolen(); verlaufHolen(); } });   // sofort frische Kurse
  document.addEventListener('visibilitychange', liveHolen);
}
