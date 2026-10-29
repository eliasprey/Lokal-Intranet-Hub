/* Start der Seite: alle Teile einschalten */
import { daten, beiAenderung, beiStatus } from './speicher.js';
import { $ } from './hilfen.js';
import { starteUhr } from './uhr.js';
import { render, starteKalender } from './kalender.js';
import { starteNotizen } from './notizen.js';
import { starteShortcuts } from './shortcuts.js';
import { starteFinanzen } from './finanzen.js';
import { starteSuche } from './suche.js';
import { starteWetter } from './wetter.js';
import { starteSpotify } from './spotify.js';
import { starteSeiten } from './seiten.js';
import { zeigeSonne } from './sonne.js';
import { starteAktualisierung } from './aktualisierung.js';
import { starteEinstellungen } from './einstellungsfenster.js';
import { starteSicherheit } from './sicherheit.js';

starteKalender();
zeigeSonne();
starteUhr(() => { render(); zeigeSonne(); });   // um Mitternacht Kalender und Sonnenzeiten erneuern
beiAenderung(render);                    // nach jedem neuen oder gelöschten Eintrag (und bei anderem Bundesland: Feiertage)
beiAenderung(zeigeSonne);                // anderer Ort

/* Name des Intranets oben links und im Browser-Tab (Einstellungen → Intranet-Name) */
function zeigeHub() {
  $('hubName').textContent = daten.profil.hub || 'Intranet';
  document.title = daten.profil.hub || 'Zuhause';
}
zeigeHub();
beiAenderung(zeigeHub);
starteNotizen();
starteFinanzen();
starteShortcuts();
starteSuche();
starteWetter();
starteSpotify();
starteSeiten();
starteSicherheit();
starteEinstellungen();
starteAktualisierung();                  // neue Version vom Server → Seite neu laden

/* Anzeige oben rechts: Sind alle Änderungen in der Datenbank? */
const SYNC_TEXT = {
  verbinde: ['Verbinde …', 'Verbindung zur Datenbank wird aufgebaut.'],
  ok: ['Synchron', 'Alle Änderungen sind in der Datenbank gespeichert.'],
  offline: ['Offline', 'Server nicht erreichbar – Änderungen sind auf diesem Gerät gespeichert und werden nachgeholt.'],
  lokal: ['Nur lokal', 'Seite ohne Server geöffnet – Änderungen bleiben auf diesem Gerät.'],
};
beiStatus((zustand, wartend) => {
  const [kurz, lang] = SYNC_TEXT[zustand];
  $('sync').dataset.zustand = zustand;
  $('syncText').textContent = zustand !== 'ok' && wartend ? `${kurz} · ${wartend} offen` : kurz;
  $('sync').title = lang;
});

/* Tablet: Nach dem Sperren und Entsperren wird die Seite neu geladen, damit alles frisch ist.
   Nur auf Touch-Geräten – am PC soll ein Tabwechsel die Seite nicht jedes Mal neu laden. */
if (matchMedia('(pointer: coarse)').matches) {
  let warVerborgen = false;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) warVerborgen = true;        // Bildschirm gesperrt / App gewechselt
    else if (warVerborgen) location.reload();        // wieder entsperrt
  });
  window.addEventListener('pageshow', e => { if (e.persisted) location.reload(); });  // aus dem Zwischenspeicher zurückgeholt
}
