/* Wetter vom Deutschen Wetterdienst (DWD) über Bright Sky (https://brightsky.dev) – kostenlos, ohne Anmeldung.
   Der Ort kommt aus den persönlichen Angaben (Einstellungen), die Anzahl Tage aus einstellungen.js. */
import { WETTER_TAGE, WETTER_ALLE_MIN } from './einstellungen.js';
import { $, key, parseKey, addDays } from './hilfen.js';
import { daten, beiAenderung } from './speicher.js';

const STORE_W = 'intranet.wetter.v2';
const NIEDERSCHLAG = new Set(['rain', 'sleet', 'snow', 'hail', 'thunderstorm']);

const WETTER_TEXT = { 'clear-day': 'Sonnig', 'clear-night': 'Klar', 'partly-cloudy-day': 'Teils bewölkt',
  'partly-cloudy-night': 'Teils bewölkt', cloudy: 'Bewölkt', fog: 'Nebel', wind: 'Windig', rain: 'Regen',
  sleet: 'Schneeregen', snow: 'Schnee', hail: 'Hagel', thunderstorm: 'Gewitter' };

/* Symbole farbig ausgefüllt (24 × 24) */
const W_FARBE = { sonne: '#fbbf24', mond: '#fde68a', wolke: '#e2e8f0', wolkeHinten: '#94a3b8', regenwolke: '#a3b1c6',
  tropfen: '#38bdf8', schnee: '#f8fafc', hagel: '#bae6fd', blitz: '#facc15', nebel: '#94a3b8', wind: '#7dd3fc' };
const W_WOLKE = 'M7.5 18.5h9.5a4 4 0 0 0 0-8h-.3A5.5 5.5 0 0 0 6 11.5a3.5 3.5 0 0 0 1.5 7z';
const wolke = (farbe, transform = '') => `<path d="${W_WOLKE}" fill="${farbe}"${transform && ` transform="${transform}"`}/>`;
const W_SONNE = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${W_FARBE.sonne}"/><path fill="none" stroke="${W_FARBE.sonne}" stroke-width="${r * .45}" d="`
  + [0, 45, 90, 135, 180, 225, 270, 315].map(w => {
    const c = Math.cos(w * Math.PI / 180), s = Math.sin(w * Math.PI / 180);
    return `M${x + c * r * 1.55} ${y + s * r * 1.55}L${x + c * r * 2.1} ${y + s * r * 2.1}`;
  }).join('') + '"/>';
const W_MOND = (x, y, r) => `<path fill="${W_FARBE.mond}" d="M${x + r} ${y + r * .35}A${r} ${r} 0 1 1 ${x - r * .35} ${y - r}A${r * .8} ${r * .8} 0 0 0 ${x + r} ${y + r * .35}z"/>`;
const W_OBEN = wolke(W_FARBE.regenwolke, 'translate(0 -3)');      // Wolke etwas höher, darunter Regen/Schnee
const tropfen = (x, y) => `<path fill="${W_FARBE.tropfen}" d="M${x} ${y - 2}s1.4 1.6 1.4 2.7a1.4 1.4 0 0 1-2.8 0c0-1.1 1.4-2.7 1.4-2.7z"/>`;
const kugel = (x, y, r, farbe) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${farbe}"/>`;
const W_SYMBOL = {
  'clear-day': W_SONNE(12, 12, 4.5),
  'clear-night': W_MOND(12, 12, 7.5),
  'partly-cloudy-day': W_SONNE(8, 8, 2.8) + wolke(W_FARBE.wolke, 'translate(3 3) scale(.85)'),
  'partly-cloudy-night': W_MOND(8.5, 8, 4.5) + wolke(W_FARBE.wolke, 'translate(3 3) scale(.85)'),
  cloudy: wolke(W_FARBE.wolkeHinten, 'translate(7 -1.5) scale(.7)') + wolke(W_FARBE.wolke, 'translate(-1 1)'),
  fog: W_OBEN + `<path fill="none" stroke="${W_FARBE.nebel}" stroke-width="1.8" d="M5 18.5h14M7 21.5h10"/>`,
  wind: `<path fill="none" stroke="${W_FARBE.wind}" stroke-width="2" d="M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7"/>`,
  rain: W_OBEN + tropfen(8, 19.5) + tropfen(12, 21) + tropfen(16, 19.5),
  sleet: W_OBEN + tropfen(8, 19.5) + kugel(12, 20.5, 1.3, W_FARBE.schnee) + tropfen(16, 19.5),
  snow: W_OBEN + kugel(8, 19.5, 1.3, W_FARBE.schnee) + kugel(12, 21, 1.3, W_FARBE.schnee) + kugel(16, 19.5, 1.3, W_FARBE.schnee),
  hail: W_OBEN + kugel(8, 19.5, 1.5, W_FARBE.hagel) + kugel(12, 21, 1.5, W_FARBE.hagel) + kugel(16, 19.5, 1.5, W_FARBE.hagel),
  thunderstorm: W_OBEN + `<path fill="${W_FARBE.blitz}" d="M13 14l-3.8 5.3h3.1L11 23.5l4.8-6.3h-3.1L14.4 14z"/>`,
};
const TROPFEN = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/></svg>';
const wetterSvg = icon => `<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">${W_SYMBOL[icon] || W_SYMBOL.cloudy}</svg>`;

/* ================= Daten holen und aufbereiten ================= */
const stunde = zeitstempel => Number(zeitstempel.slice(11, 13));   // Zeitstempel kommen in Ortszeit (tz=Europe/Berlin)

/* Messwerte haben nicht immer ein Symbol – dann aus Niederschlag, Bewölkung und Tageszeit ableiten */
function symbolJetzt(w) {
  if (w.icon) return w.icon;
  if (NIEDERSCHLAG.has(w.condition) || w.condition === 'fog') return w.condition;
  if (w.cloud_cover > 75) return 'cloudy';
  const nacht = stunde(w.timestamp) < 7 || stunde(w.timestamp) >= 19;
  return (w.cloud_cover > 25 ? 'partly-cloudy-' : 'clear-') + (nacht ? 'night' : 'day');
}

/* Stündliche Werte → ein Eintrag pro Tag: Min/Max, häufigstes Symbol tagsüber, höchste Regenwahrscheinlichkeit */
function tage(stunden) {
  const nachTag = {};
  stunden.forEach(s => (nachTag[s.timestamp.slice(0, 10)] = nachTag[s.timestamp.slice(0, 10)] || []).push(s));
  return Object.keys(nachTag).sort().map(datum => {
    const h = nachTag[datum], temps = h.map(s => s.temperature).filter(t => t != null);
    const tagsueber = h.filter(s => stunde(s.timestamp) >= 8 && stunde(s.timestamp) <= 20);
    const punkte = {};
    (tagsueber.length ? tagsueber : h).forEach(s => {
      if (!s.icon) return;
      const icon = s.icon.replace('-night', '-day');
      punkte[icon] = (punkte[icon] || 0) + (NIEDERSCHLAG.has(icon) ? 2 : 1);   // Regen zählt doppelt, sonst geht er neben Wolken unter
    });
    return {
      datum,
      icon: Object.keys(punkte).sort((a, b) => punkte[b] - punkte[a])[0] || 'cloudy',
      min: temps.length ? Math.round(Math.min(...temps)) : null,
      max: temps.length ? Math.round(Math.max(...temps)) : null,
      regen: Math.max(0, ...h.map(s => s.precipitation_probability || 0)),
    };
  });
}

const ortSchluessel = () => { const o = daten.profil.ort; return o ? `${o.lat},${o.lon}` : ''; };

async function abrufen() {
  const o = daten.profil.ort, ort = `lat=${o.lat}&lon=${o.lon}&tz=Europe/Berlin`;
  const heute = new Date(); heute.setHours(0, 0, 0, 0);
  const holen = pfad => fetch('https://api.brightsky.dev' + pfad).then(r => r.ok ? r.json() : Promise.reject(new Error('Fehler ' + r.status)));
  const [jetzt, vorhersage] = await Promise.all([
    holen(`/current_weather?${ort}`),
    holen(`/weather?${ort}&date=${key(heute)}&last_date=${key(addDays(heute, WETTER_TAGE))}`)]);
  const w = jetzt.weather;
  return {
    zeit: Date.now(),
    ort: `${o.lat},${o.lon}`,
    stand: w.timestamp,
    jetzt: { icon: symbolJetzt(w), temperatur: w.temperature, wind: w.wind_speed_10, feuchte: w.relative_humidity },
    tage: tage(vorhersage.weather),
  };
}

/* ================= Anzeige ================= */
const windText = kmh => kmh < 6 ? 'Windstill' : kmh < 20 ? 'Leichte Brise' : kmh < 39 ? 'Mäßiger Wind' : kmh < 62 ? 'Starker Wind' : 'Sturm';
const feuchteText = p => p < 40 ? 'Trocken' : p <= 65 ? 'Angenehm' : 'Feucht';

let geladen = false;
function zeigen(w) {
  geladen = true;
  const j = w.jetzt, hk = key(new Date());
  const tage = w.tage.filter(t => t.datum >= hk).slice(0, WETTER_TAGE), heute = tage[0];

  /* Kacheln oben + Symbol neben der Begrüßung */
  $('kAussenIcon').innerHTML = $('grussIcon').innerHTML = wetterSvg(j.icon);
  $('kAussen').textContent = j.temperatur != null ? Math.round(j.temperatur) + ' °C' : '–';
  $('kAussenText').textContent = WETTER_TEXT[j.icon] || '';
  $('kHeute').textContent = heute ? `${heute.max ?? '–'}° / ${heute.min ?? '–'}°` : '–';
  $('kWind').textContent = j.wind != null ? Math.round(j.wind) + ' km/h' : '–';
  $('kWindText').textContent = j.wind != null ? windText(j.wind) : '';
  $('kFeuchte').textContent = j.feuchte != null ? j.feuchte + ' %' : '–';
  $('kFeuchteText').textContent = j.feuchte != null ? feuchteText(j.feuchte) : '';
  $('kRegen').textContent = heute ? heute.regen + ' %' : '–';
  $('wetterStand').textContent = 'DWD · Stand ' + new Date(w.stand).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  $('wetterStand').title = 'Quelle: Deutscher Wetterdienst, über brightsky.dev';

  /* Vorschau: je Tag ein Balken von Tiefst- bis Höchstwert, alle Tage auf derselben Skala */
  const werte = tage.flatMap(t => [t.min, t.max]).filter(t => t != null);
  const unten = Math.min(...werte), oben = Math.max(...werte), spanne = Math.max(1, oben - unten);
  const pos = t => (t - unten) / spanne * 100;            // 0 % = kältester Wert, 100 % = wärmster
  const box = $('wetterTage');
  box.innerHTML = '';
  box.style.gridTemplateColumns = `repeat(${tage.length}, minmax(0, 1fr))`;
  tage.forEach(t => {
    const istHeute = t.datum === hk, name = istHeute ? 'Heute' : parseKey(t.datum).toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '');
    const e = document.createElement('div');
    e.className = 'w-tag' + (istHeute ? ' heute' : '');
    e.title = `${name}: ${WETTER_TEXT[t.icon] || ''}, ${t.max ?? '–'}° / ${t.min ?? '–'}°, Regen ${t.regen} %`;
    // Höchstwert steht direkt über dem Balken, Tiefstwert direkt darunter
    const spur = t.min == null || t.max == null ? '' : `<span class="w-balken" style="top:${100 - pos(t.max)}%;bottom:${pos(t.min)}%"></span>`
      + `<span class="w-wert" style="bottom:${pos(t.max)}%">${t.max}°</span>`
      + `<span class="w-wert min" style="top:${100 - pos(t.min)}%">${t.min}°</span>`;
    e.innerHTML = `<small>${name}</small><span class="w-icon">${wetterSvg(t.icon)}</span>`
      + `<span class="w-spur">${spur}</span>`
      + `<span class="regen">${t.regen >= 10 ? TROPFEN + t.regen + ' %' : '&nbsp;'}</span>`;
    box.appendChild(e);
  });
}

async function laden() {
  if (!ortSchluessel()) return ohneOrt();
  try {
    const w = await abrufen();
    if (w.ort !== ortSchluessel()) return;     // inzwischen ein anderer Ort gewählt
    try { localStorage.setItem(STORE_W, JSON.stringify(w)); } catch (e) {}
    zeigen(w);
  } catch (e) {
    if (geladen) return;                     // offline: die zuletzt gezeigten Werte stehen lassen
    $('kAussenText').textContent = 'Keine Wetterdaten';
  }
}

/* Noch kein Ort in den persönlichen Angaben */
function ohneOrt() {
  geladen = false;
  ['kAussen', 'kHeute', 'kWind', 'kFeuchte', 'kRegen'].forEach(id => { $(id).textContent = '–'; });
  ['kWindText', 'kFeuchteText', 'wetterStand'].forEach(id => { $(id).textContent = ''; });
  $('kAussenIcon').innerHTML = $('grussIcon').innerHTML = '';
  $('kAussenText').textContent = 'Kein Ort eingestellt';
  $('wetterTage').innerHTML = '<p class="empty">Unter Einstellungen → Persönliche Angaben einen Ort eintragen.</p>';
  $('wetterTage').style.gridTemplateColumns = '';
}

function ortZeigen() {
  const name = daten.profil.ort?.name || '';
  $('zuhauseOrt').textContent = name;
  $('zuhauseOrt').hidden = !name;
}

export function starteWetter() {
  ortZeigen();
  // Zuletzt geladene Werte sofort zeigen (wenn sie zum Ort passen); neu holen, wenn sie älter als 10 Minuten sind
  let alt = null;
  try { alt = JSON.parse(localStorage.getItem(STORE_W)); } catch (e) {}
  if (alt && alt.ort !== ortSchluessel()) alt = null;
  if (alt) zeigen(alt); else if (!ortSchluessel()) ohneOrt();
  if (!alt || Date.now() - alt.zeit > 10 * 60e3 || alt.tage.filter(t => t.datum >= key(new Date())).length < WETTER_TAGE) laden();   // nach dem Neuladen am Tablet nicht jedes Mal abfragen
  setInterval(laden, WETTER_ALLE_MIN * 60e3);
  let bisher = ortSchluessel();
  beiAenderung(() => {                       // anderer Ort gewählt (auch auf einem anderen Gerät) → gleich neu laden
    ortZeigen();
    if (ortSchluessel() === bisher) return;
    bisher = ortSchluessel();
    geladen = false;
    laden();
  });
}
