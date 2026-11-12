/* Karte „Notiz“ unten im Dashboard: freies Textfeld, das beim Tippen automatisch gespeichert wird.
   Das Feld füllt die Karte, bei langem Text scrollt es. */
import { $ } from './hilfen.js';
import { daten, beiAenderung, notizenSpeichern } from './speicher.js';

export function starteNotizen() {
  const feld = $('notizText'), status = $('notizStatus');
  const TIPP_PAUSE_MS = 2000;            // so lange nach dem letzten Tastendruck keine fremden Änderungen einsetzen
  let statusTimer, getippt = 0, spaeter;
  feld.value = daten.notizen;
  feld.addEventListener('input', () => {
    getippt = Date.now();
    notizenSpeichern(feld.value);
    status.classList.add('on');
    clearTimeout(statusTimer); statusTimer = setTimeout(() => status.classList.remove('on'), 1500);
  });
  /* Änderung von einem anderen Gerät sofort übernehmen – auch wenn das Feld den Fokus hat (Cursor bleibt stehen),
     nur nicht mitten im Tippen: dann kurz nach der letzten Eingabe */
  function uebernehmen() {
    clearTimeout(spaeter);
    if (feld.value === daten.notizen) return;
    const fokus = document.activeElement === feld, rest = TIPP_PAUSE_MS - (Date.now() - getippt);
    if (fokus && rest > 0) { spaeter = setTimeout(uebernehmen, rest); return; }
    const { selectionStart: a, selectionEnd: b, scrollTop } = feld;
    feld.value = daten.notizen;
    if (fokus) { feld.setSelectionRange(Math.min(a, feld.value.length), Math.min(b, feld.value.length)); feld.scrollTop = scrollTop; }
  }
  beiAenderung(uebernehmen);
}
