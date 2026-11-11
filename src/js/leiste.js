/* Knopf unten in der Seitenleiste: Leiste einklappen (nur Symbole) und wieder ausklappen.
   Die Wahl gilt nur für dieses Gerät (localStorage). Die Klasse am <html> setzt schon ein kleines Skript im <head>,
   damit die Seite gleich in der richtigen Breite erscheint. Unter 1400 px ist die Leiste ohnehin schmal – dort ist der Knopf versteckt. */
import { $ } from './hilfen.js';

const STORE = 'intranet.leiste.v1';

export function starteLeiste() {
  const knopf = $('einklappenBtn');
  const html = document.documentElement;

  const zeige = () => {
    const zu = html.classList.contains('leiste-zu');
    knopf.title = zu ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen';
    knopf.setAttribute('aria-label', knopf.title);
    knopf.setAttribute('aria-expanded', String(!zu));
    knopf.querySelector('span').textContent = zu ? 'Ausklappen' : 'Einklappen';
  };

  knopf.addEventListener('click', () => {
    const zu = html.classList.toggle('leiste-zu');
    try { if (zu) localStorage.setItem(STORE, 'zu'); else localStorage.removeItem(STORE); } catch (e) {}
    zeige();
    dispatchEvent(new Event('resize'));          // Hauptbereich ist jetzt breiter oder schmaler
  });
  zeige();
}
