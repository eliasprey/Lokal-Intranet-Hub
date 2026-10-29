/* Notiz unten im Dashboard: freies Textfeld, das beim Tippen automatisch gespeichert wird.
   Es wächst mit dem Text mit (bis 4 Zeilen, danach scrollt es). */
import { $ } from './hilfen.js';
import { daten, beiAenderung, notizenSpeichern } from './speicher.js';

const MAX_ZEILEN = 4;

export function starteNotizen() {
  const feld = $('notizText'), status = $('notizStatus');
  let statusTimer;
  const anpassen = () => {
    const zeile = parseFloat(getComputedStyle(feld).lineHeight) || 20;
    const rand = feld.offsetHeight - feld.clientHeight;
    feld.style.height = 'auto';
    feld.style.height = Math.min(feld.scrollHeight, zeile * MAX_ZEILEN + 20) + rand + 'px';
  };
  feld.value = daten.notizen;
  anpassen();
  feld.addEventListener('input', () => {
    notizenSpeichern(feld.value);
    anpassen();
    status.classList.add('on');
    clearTimeout(statusTimer); statusTimer = setTimeout(() => status.classList.remove('on'), 1500);
  });
  /* Änderung von einem anderen Gerät übernehmen – nicht, während hier getippt wird */
  beiAenderung(() => { if (document.activeElement !== feld) { feld.value = daten.notizen; anpassen(); } });
  addEventListener('resize', anpassen);
}
