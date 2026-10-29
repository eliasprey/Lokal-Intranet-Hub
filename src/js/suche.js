/* Suchleiste: sucht im Web, Adressen wie "wetter.de" oder IP-Adressen werden direkt geöffnet */
import { SUCHMASCHINE } from './einstellungen.js';
import { $ } from './hilfen.js';

export function starteSuche() {
  const suchText = $('suchText'), suchLeeren = $('suchLeeren');
  $('suche').addEventListener('submit', e => {
    e.preventDefault();
    const q = suchText.value.trim();
    if (!q) return;
    // Sieht die Eingabe wie eine Adresse aus (z. B. "wetter.de", "192.168.0.1"), direkt öffnen – sonst suchen
    const mitProtokoll = /^https?:\/\/\S+$/i.test(q);
    const domain = /^([\w-]+\.)+[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(q);
    const lokal = /^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/\S*)?$/i.test(q);
    location.href = mitProtokoll ? q : domain ? 'https://' + q : lokal ? 'http://' + q : SUCHMASCHINE + encodeURIComponent(q);
  });
  /* X zum Leeren nur zeigen, wenn etwas eingegeben ist */
  suchText.addEventListener('input', () => { suchLeeren.hidden = !suchText.value; });
  suchLeeren.onclick = () => { suchText.value = ''; suchLeeren.hidden = true; suchText.focus(); };
  /* Am PC (Maus) gleich lostippen können; am Tablet nicht, sonst springt die Bildschirmtastatur auf */
  if (matchMedia('(pointer: fine)').matches) suchText.focus();
  /* Taste "/" springt in die Suche */
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) { e.preventDefault(); suchText.focus(); }
  });
}
