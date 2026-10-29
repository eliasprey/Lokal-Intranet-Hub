/* Sonnenaufgang und -untergang für den Ort aus den persönlichen Angaben, selbst berechnet
   (NOAA-Näherung, auf ca. 1–2 Minuten genau). Ohne Ort: null. */
import { $ } from './hilfen.js';
import { daten } from './speicher.js';

export function sonnenzeiten(datum, ort = daten.profil.ort) {
  if (!ort) return null;
  const { lat, lon } = ort;
  const rad = Math.PI / 180;
  const jahresTag = Math.round((Date.UTC(datum.getFullYear(), datum.getMonth(), datum.getDate()) - Date.UTC(datum.getFullYear(), 0, 1)) / 864e5);
  const g = 2 * Math.PI / 365 * jahresTag;                    // Stellung im Jahr (Mittag)
  const zeitgleichung = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
    - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));          // in Minuten
  const dekl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g)
    + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const stundenwinkel = Math.acos(Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(dekl))
    - Math.tan(lat * rad) * Math.tan(dekl)) / rad;
  const utc = minuten => new Date(Date.UTC(datum.getFullYear(), datum.getMonth(), datum.getDate(), 0, Math.round(minuten)));
  return {
    auf: utc(720 - 4 * (lon + stundenwinkel) - zeitgleichung),
    unter: utc(720 - 4 * (lon - stundenwinkel) - zeitgleichung),
  };
}

/* Wird beim Start, um Mitternacht und nach einer Änderung des Orts aufgerufen */
export function zeigeSonne() {
  const z = sonnenzeiten(new Date());
  const hhmm = d => (z ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '–');
  $('aufgang').textContent = hhmm(z?.auf);
  $('untergang').textContent = hhmm(z?.unter);
}
