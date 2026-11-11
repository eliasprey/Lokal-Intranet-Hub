/* Karte „Notiz“ unten im Dashboard: freies Textfeld, das beim Tippen automatisch gespeichert wird.
   Das Feld füllt die Karte, bei langem Text scrollt es. */
import { $ } from './hilfen.js';
import { daten, beiAenderung, notizenSpeichern } from './speicher.js';

export function starteNotizen() {
  const feld = $('notizText'), status = $('notizStatus');
  let statusTimer;
  feld.value = daten.notizen;
  feld.addEventListener('input', () => {
    notizenSpeichern(feld.value);
    status.classList.add('on');
    clearTimeout(statusTimer); statusTimer = setTimeout(() => status.classList.remove('on'), 1500);
  });
  /* Änderung von einem anderen Gerät übernehmen – nicht, während hier getippt wird */
  beiAenderung(() => { if (document.activeElement !== feld) feld.value = daten.notizen; });
}
