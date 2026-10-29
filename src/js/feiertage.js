/* Gesetzliche Feiertage – je nach Bundesland des Orts aus den persönlichen Angaben (ohne Ort nur die bundesweiten).
   Werden für jedes Jahr selbst berechnet, auch die beweglichen rund um Ostern. */
import { key, addDays } from './hilfen.js';
import { daten } from './speicher.js';

export const BUNDESLAENDER = {
  BW: 'Baden-Württemberg', BY: 'Bayern', BE: 'Berlin', BB: 'Brandenburg', HB: 'Bremen', HH: 'Hamburg', HE: 'Hessen',
  MV: 'Mecklenburg-Vorpommern', NI: 'Niedersachsen', NW: 'Nordrhein-Westfalen', RP: 'Rheinland-Pfalz', SL: 'Saarland',
  SN: 'Sachsen', ST: 'Sachsen-Anhalt', SH: 'Schleswig-Holstein', TH: 'Thüringen',
};

function ostern(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mon = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, mon - 1, day);
}

/* Buß- und Bettag: der Mittwoch vor dem 23. November */
function bussUndBettag(y) {
  const d = new Date(y, 10, 22);
  while (d.getDay() !== 3) d.setDate(d.getDate() - 1);
  return d;
}

const feiertagCache = {};
function feiertage(y, land, stadt) {
  const cacheKey = `${y}|${land}|${stadt}`;
  if (feiertagCache[cacheKey]) return feiertagCache[cacheKey];
  const o = ostern(y), f = {};
  const set = (d, n, laender) => { if (!laender || laender.includes(land)) f[key(d)] = n; };
  set(new Date(y, 0, 1), 'Neujahr');
  set(new Date(y, 0, 6), 'Heilige Drei Könige', ['BW', 'BY', 'ST']);
  set(new Date(y, 2, 8), 'Internationaler Frauentag', ['BE', 'MV']);
  set(addDays(o, -2), 'Karfreitag');
  set(o, 'Ostersonntag', ['BB']);
  set(addDays(o, 1), 'Ostermontag');
  set(new Date(y, 4, 1), 'Tag der Arbeit');
  set(addDays(o, 39), 'Christi Himmelfahrt');
  set(addDays(o, 49), 'Pfingstsonntag', ['BB']);
  set(addDays(o, 50), 'Pfingstmontag');
  set(addDays(o, 60), 'Fronleichnam', ['BW', 'BY', 'HE', 'NW', 'RP', 'SL']);
  if (stadt === 'augsburg') set(new Date(y, 7, 8), 'Augsburger Friedensfest', ['BY']);
  set(new Date(y, 7, 15), land === 'BY' ? 'Mariä Himmelfahrt (kath. Gemeinden)' : 'Mariä Himmelfahrt', ['BY', 'SL']);
  set(new Date(y, 8, 20), 'Weltkindertag', ['TH']);
  set(new Date(y, 9, 3), 'Tag der Deutschen Einheit');
  set(new Date(y, 9, 31), 'Reformationstag', ['BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH']);
  set(new Date(y, 10, 1), 'Allerheiligen', ['BW', 'BY', 'NW', 'RP', 'SL']);
  set(bussUndBettag(y), 'Buß- und Bettag', ['SN']);
  set(new Date(y, 11, 25), '1. Weihnachtstag');
  set(new Date(y, 11, 26), '2. Weihnachtstag');
  return (feiertagCache[cacheKey] = f);
}

export const feiertagAn = d => {
  const ort = daten.profil.ort;
  return feiertage(d.getFullYear(), ort?.bundesland || '', (ort?.name || '').toLowerCase())[key(d)] || null;
};
