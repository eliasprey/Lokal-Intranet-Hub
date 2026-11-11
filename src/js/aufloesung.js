/* Auflösung dieses Geräts (Einstellungen → Auflösung).
   Die Seite ist für WQHD gebaut (2560 × 1440, Skalierung 100 %). Ist eine andere Auflösung gewählt, wird alles mit CSS-zoom
   so vergrößert oder verkleinert, dass die Seite aussieht wie dort: genauso breit und mindestens so hoch
   (bei 16:10, z. B. 3K, bleibt unten etwas mehr Platz). Die Skalierung des Betriebssystems (devicePixelRatio) wird
   dabei herausgerechnet – ein 3K-Laptop mit 200 % zeigt also dasselbe Bild wie der WQHD-Bildschirm.
   Die Wahl gilt nur für dieses Gerät (localStorage): Wandtablet, PC und Laptop haben verschiedene Bildschirme.
   Läuft als normales Skript im <head> (nicht als Modul), damit die Seite schon beim ersten Zeichnen die richtige Größe hat. */
(function () {
  const STORE = 'intranet.aufloesung.v1';
  const REFERENZ = { breite: 2560, hoehe: 1440 };
  const LISTE = {
    fullhd: { name: 'FullHD', breite: 1920, hoehe: 1080 },
    wqhd: { name: 'WQHD', breite: 2560, hoehe: 1440 },
    '3k': { name: 'WQXGA+ / 3K', breite: 2880, hoehe: 1800 },
  };

  let wahl = '';                                   // '' = keine Anpassung
  try { wahl = localStorage.getItem(STORE) || ''; } catch (e) {}
  if (!LISTE[wahl]) wahl = '';

  /* Vergrößerung gegenüber der Seite ohne Anpassung (1 = unverändert) */
  function faktor() {
    const a = LISTE[wahl];
    if (!a) return 1;
    const f = Math.min(a.breite / REFERENZ.breite, a.hoehe / REFERENZ.hoehe) / (window.devicePixelRatio || 1);
    return Math.round(f * 1000) / 1000;
  }

  function anwenden() {
    const f = faktor();
    document.documentElement.style.zoom = f === 1 ? '' : String(f);
  }

  /* Was der Browser über den Bildschirm meldet (nur als Hinweis in den Einstellungen) */
  function erkannt() {
    const dpr = window.devicePixelRatio || 1;
    const breite = Math.round(screen.width * dpr), hoehe = Math.round(screen.height * dpr);
    const passt = Object.keys(LISTE).find(k => {
      const a = LISTE[k];
      return (a.breite === breite && a.hoehe === hoehe) || (a.breite === hoehe && a.hoehe === breite);
    }) || '';
    return { breite, hoehe, skalierung: Math.round(dpr * 100), passt };
  }

  anwenden();
  // Fenster auf einen anderen Bildschirm geschoben oder Skalierung geändert: devicePixelRatio ist neu
  window.addEventListener('resize', anwenden);

  window.aufloesung = {
    LISTE, REFERENZ, faktor, erkannt,
    wahl: () => wahl,
    setzen(neu) {
      wahl = LISTE[neu] ? neu : '';
      try { if (wahl) localStorage.setItem(STORE, wahl); else localStorage.removeItem(STORE); } catch (e) {}
      anwenden();
    },
  };
})();
