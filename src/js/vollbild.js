/* Button oben rechts: Browser in den Vollbildmodus versetzen und wieder zurück */
import { $ } from './hilfen.js';

export function starteVollbild() {
  const knopf = $('vollbild');
  const d = document;
  const erlaubt = d.fullscreenEnabled || d.webkitFullscreenEnabled;
  if (!erlaubt) return;                       // z. B. iPhone-Safari: kein Vollbild für Webseiten → Button bleibt versteckt
  knopf.hidden = false;

  const aktiv = () => !!(d.fullscreenElement || d.webkitFullscreenElement);

  knopf.addEventListener('click', () => {
    const el = d.documentElement;
    if (aktiv()) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    else (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
  });

  /* Symbol und Tooltip anpassen – auch wenn der Vollbildmodus mit Esc / F11 verlassen wird */
  const zeige = () => {
    const an = aktiv();
    knopf.classList.toggle('an', an);
    knopf.title = an ? 'Vollbild beenden' : 'Vollbild';
    knopf.setAttribute('aria-label', knopf.title);
  };
  d.addEventListener('fullscreenchange', zeige);
  d.addEventListener('webkitfullscreenchange', zeige);
  zeige();
}
