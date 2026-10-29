/* Feste Einstellungen der Startseite. Name, Ort und Name des Intranets stellt man auf der Seite unter Einstellungen ein,
   die Shortcuts auf der Seite Shortcuts – beides liegt in der Datenbank. Spotify wird auf dem Server eingerichtet (Container-Variablen SPOTIFY_CLIENT_ID und SPOTIFY_CLIENT_SECRET, siehe README). */

export const BILDER_ORDNER = 'assets/backgrounds/';
export const ZEITEN = { morgens: 5, mittags: 10, abends: 17, nachts: 21 };   // ab dieser Stunde gilt die Tageszeit
export const GRUSS = { morgens: 'Guten Morgen', mittags: 'Guten Tag', abends: 'Guten Abend', nachts: 'Gute Nacht' };

export const UEBERSICHT_TAGE = 7;                   // Karte "Anstehend": heute + 6 Tage

export const WETTER_TAGE = 7;                       // heute + 6 Tage
export const WETTER_ALLE_MIN = 15;                  // so oft das Wetter neu holen

export const KURSE_ALLE_MIN = 2;                   // Finanzen: so oft den Kursverlauf (Tag/Woche/…) neu holen
export const LIVE_ALLE_SEK = 5;                     // Finanzen: so oft den aktuellen Kurs holen, solange die Seite offen ist

export const SUCHMASCHINE = 'https://www.google.com/search?q=';   // z. B. 'https://duckduckgo.com/?q=' oder 'https://www.ecosia.org/search?q='
