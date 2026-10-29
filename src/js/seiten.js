/* Seiten nebeneinander (Finanzen | Kalender | Dashboard | Shortcuts | Smarthome).
   Wechsel über das Menü (alles mit data-seite), die Pfeile oben, die Pfeiltasten oder per Wischen am Touchscreen. */
import { $ } from './hilfen.js';

const START = 2;                         // die mittlere Seite (Dashboard) ist die Startseite

export function starteSeiten() {
  const leiste = $('seiten'), seiten = [...leiste.children];
  const links = $('pfeilLinks'), rechts = $('pfeilRechts');
  const menue = [...document.querySelectorAll('.menue [data-seite]')];
  const name = i => seiten[i].getAttribute('aria-label');
  const versatz = (i, px = 0) => `translateX(calc(${-i * 100 / seiten.length}% + ${px}px))`;   // % der ganzen Leiste
  let aktuell = START;
  leiste.style.setProperty('--seiten', seiten.length);   // Breite der Leiste passt sich der Zahl der Seiten an
  /* Ältere Browser ohne overflow: clip scrollen beim Fokus auf ein Feld den Ausschnitt seitlich – sofort zurück */
  const ansicht = leiste.parentElement;
  ansicht.addEventListener('scroll', () => { if (ansicht.scrollLeft) ansicht.scrollLeft = 0; });

  document.querySelectorAll('[data-seite]').forEach(b => { b.onclick = () => zeige(Number(b.dataset.seite)); });

  function zeige(i) {
    aktuell = Math.max(0, Math.min(seiten.length - 1, i));
    leiste.style.transition = '';
    leiste.style.transform = versatz(aktuell);
    // Nicht sichtbare Seiten sperren, damit Tab/Fokus nicht auf eine unsichtbare Seite springt
    seiten.forEach((s, n) => { s.inert = n !== aktuell; });
    menue.forEach(b => b.classList.toggle('on', Number(b.dataset.seite) === aktuell));
    links.disabled = aktuell === 0;
    rechts.disabled = aktuell === seiten.length - 1;
    links.ariaLabel = links.title = links.disabled ? '' : 'Zu ' + name(aktuell - 1);
    rechts.ariaLabel = rechts.title = rechts.disabled ? '' : 'Zu ' + name(aktuell + 1);
    document.dispatchEvent(new CustomEvent('seitenwechsel', { detail: name(aktuell) }));   // z. B. Finanzen holt dann sofort Kurse
  }

  links.onclick = () => zeige(aktuell - 1);
  rechts.onclick = () => zeige(aktuell + 1);

  /* Pfeiltasten – nicht beim Tippen in einem Feld und nicht, wenn ein Fenster offen ist */
  document.addEventListener('keydown', e => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.querySelector('dialog[open]')) return;
    if (e.key === 'ArrowLeft') zeige(aktuell - 1);
    else if (e.key === 'ArrowRight') zeige(aktuell + 1);
  });

  /* Wischen: die Seite folgt dem Finger, beim Loslassen wird umgeblättert oder zurückgeschnappt.
     Senkrechtes Wischen bleibt normales Scrollen; Schieberegler (Spotify) und das Diagramm (Finanzen) werden nicht gestört. */
  let startX = 0, startY = 0, startZeit = 0, dx = 0, richtung = null;   // richtung: null = noch offen, 'x' = blättern, 'y' = scrollen
  leiste.addEventListener('touchstart', e => {
    if (e.touches.length > 1 || e.target.closest('input[type=range], select, .chart')) { richtung = 'y'; return; }
    startX = e.touches[0].clientX; startY = e.touches[0].clientY; startZeit = Date.now(); dx = 0; richtung = null;
  }, { passive: true });

  leiste.addEventListener('touchmove', e => {
    if (richtung === 'y') return;
    const x = e.touches[0].clientX - startX, y = e.touches[0].clientY - startY;
    if (!richtung) {
      if (Math.abs(x) < 10 && Math.abs(y) < 10) return;
      richtung = Math.abs(x) > Math.abs(y) ? 'x' : 'y';
      if (richtung === 'y') return;
    }
    dx = x;
    const amRand = (aktuell === 0 && dx > 0) || (aktuell === seiten.length - 1 && dx < 0);
    if (amRand) dx /= 3;                    // am Ende gebremst nachgeben
    leiste.style.transition = 'none';
    leiste.style.transform = versatz(aktuell, dx);
  }, { passive: true });

  const ende = () => {
    if (richtung !== 'x') { richtung = null; return; }
    richtung = null;
    // weit genug gezogen oder kurz und schnell geschnippt
    const schwelle = Date.now() - startZeit < 300 ? 40 : Math.min(120, innerWidth * 0.15);
    zeige(dx < -schwelle ? aktuell + 1 : dx > schwelle ? aktuell - 1 : aktuell);
  };
  leiste.addEventListener('touchend', ende);
  leiste.addEventListener('touchcancel', ende);

  zeige(START);
}
