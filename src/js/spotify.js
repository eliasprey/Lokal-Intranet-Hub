/* Spotify: Die Anmeldung liegt beim Server (server/server.py). Einmal anmelden – danach steuern alle Geräte
   dasselbe Spotify-Konto, auch wenn die Seite über http:// läuft. Abgespielt wird auf einem Spotify-Gerät
   (App auf Handy, Tablet oder PC, Lautsprecher …). Alle Befehle gehen über den Server an die Spotify Web API.
   Einrichtung siehe README. */
import { $, pad, klickDanebenSchliesst } from './hilfen.js';
import { beiAenderung } from './speicher.js';
import { gesperrt } from './sicherheit.js';
const SP_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z"/></svg>';
const SP_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';

let spServer = null;                // Antwort von api/spotify/status; null = kein Server (z. B. Live Server)
let angemeldet = false;
try { localStorage.removeItem('intranet.spotify.v1'); } catch (e) {}   // Anmeldung der alten Version (pro Gerät) aufräumen

let spMeldungTimer;
function spMeldung(text) {
  $('spMeldung').textContent = text;
  clearTimeout(spMeldungTimer); spMeldungTimer = setTimeout(() => $('spMeldung').textContent = '', 8000);
}
function spFehler(e) {
  spMeldung(e.grund === 'PREMIUM_REQUIRED' ? 'Zum Abspielen wird Spotify Premium benötigt.'
    : e.grund === 'NO_ACTIVE_DEVICE' || e.status === 404 ? 'Kein Gerät aktiv – unten ein Gerät wählen oder die Spotify-App öffnen.'
    : e.status === 429 ? 'Zu viele Anfragen – bitte kurz warten.'
    : 'Spotify: ' + e.message);
}

/* --- Anmeldung (über den Server) --- */
async function spStatusHolen() {
  try {
    const r = await fetch('api/spotify/status', { cache: 'no-store' });
    spServer = r.ok ? await r.json() : null;
  } catch (e) { return; }                   // Server kurz nicht erreichbar → bisherigen Stand behalten
  const vorher = angemeldet;
  angemeldet = !!spServer?.angemeldet;
  spAnsicht();
  if (angemeldet && !vorher) { spAktualisieren(); spGeraeteLaden(); }
}
async function spServerPost(pfad, daten) {
  const r = await fetch('api/spotify/' + pfad, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(daten || {}) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.fehler || 'Fehler ' + r.status);
  return d;
}
/* Schritt 2: Adresse der Fehlerseite (http://127.0.0.1:…?code=…) einfügen */
$('spCodeForm').addEventListener('submit', async e => {
  e.preventDefault();
  const adresse = $('spCode').value.trim();
  if (!adresse) return $('spCode').focus();
  try {
    await spServerPost('code', { adresse });
    $('spCode').value = '';
    await spStatusHolen();
  } catch (e) { spMeldung('Anmeldung fehlgeschlagen: ' + e.message); }
});
$('spAbmelden').onclick = async () => {
  if (!confirm('Spotify auf allen Geräten abmelden?')) return;
  try { await spServerPost('abmelden'); } catch (e) {}
  angemeldet = false;
  spStatusHolen();
};

/* --- Web API (über den Server) --- */
async function spApi(pfad, methode = 'GET', body) {
  const r = await fetch('api/spotify/web' + pfad, { method: methode,
    headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let d = null;
  try { d = text ? JSON.parse(text) : null; } catch (e) {}
  if (!r.ok) {
    const fehler = Object.assign(new Error(d?.error?.message || 'Fehler ' + r.status), { status: r.status, grund: d?.error?.reason });
    if (fehler.grund === 'NICHT_ANGEMELDET') { angemeldet = false; spStatusHolen(); }
    throw fehler;
  }
  return d;
}

/* --- Player-Anzeige --- */
let spStatus = null, spStand = 0, spZiehen = false;    // spStand = Zeitpunkt der letzten Abfrage
const mmss = ms => Math.floor(ms / 60000) + ':' + pad(Math.floor(ms / 1000) % 60);
const spBild = (bilder, klein) => { bilder = bilder || []; return (klein ? bilder[bilder.length - 1] : bilder[1] || bilder[0])?.url || ''; };

async function spAktualisieren() {
  if (!angemeldet || document.hidden) return;
  try { spStatus = await spApi('/me/player?additional_types=episode'); spStand = Date.now(); } catch (e) { return; }
  const g = spStatus?.device;
  if (g?.id && g.id !== spGeraetId) { spGeraetId = g.id; spGeraeteLaden(); }
  spZeigen();
  spKontextLaden();
}
function spZeigen() {
  const s = spStatus, it = s?.item;
  $('spSong').textContent = it ? it.name : 'Gerade läuft nichts';
  $('spKuenstler').textContent = !it ? 'Über „Musik“ ein Lied auswählen'
    : (it.artists || []).map(a => a.name).join(', ') || it.show?.name || '';
  const url = it ? spBild((it.album || it.show || {}).images) : '';
  const cover = $('spCover');
  if (cover.getAttribute('src') !== url) url ? cover.src = url : cover.removeAttribute('src');
  const spielt = !!s?.is_playing;
  $('spPlay').innerHTML = spielt ? SP_PAUSE : SP_PLAY;
  $('spPlay').title = $('spPlay').ariaLabel = spielt ? 'Pause' : 'Abspielen';
  const laut = $('spLaut');
  laut.disabled = !s?.device || s.device.supports_volume === false;
  if (!spZiehen && s?.device?.volume_percent != null) laut.value = s.device.volume_percent;
  spFuellen(laut);
  spFortschrittZeigen();
  spListeMarkieren();
}
/* Schieberegler: der Teil links vom Knopf ist farbig (--wert, siehe style.css) */
const spFuellen = r => r.style.setProperty('--wert', (r.value - r.min) / (r.max - r.min) * 100 + '%');
function spFortschrittZeigen() {
  const s = spStatus, dauer = s?.item?.duration_ms || 0;
  const pos = Math.min(dauer, (s?.progress_ms || 0) + (s?.is_playing ? Date.now() - spStand : 0));
  $('spPos').textContent = mmss(pos);
  $('spDauer').textContent = mmss(dauer);
  if (!spZiehen) $('spFortschritt').value = dauer ? Math.round(pos / dauer * 1000) : 0;
  $('spFortschritt').disabled = !dauer;
  spFuellen($('spFortschritt'));
}

/* --- Liste neben dem Song: die laufende Playlist bzw. das Album (antippen = ab diesem Titel abspielen).
       Läuft nichts aus einer Playlist oder einem Album (oder gibt Spotify sie nicht heraus), die Warteschlange. --- */
const SP_API = 'https://api.spotify.com/v1', SP_MAX_TITEL = 500;
let spKontext = null, spKontextLaedt = '', spMarkiert = null;   // spKontext: { schluessel, name, art, uri, titel: [...] }

const spTitelDaten = (t, bilder) => ({ uri: t.uri, name: t.name, dauer: t.duration_ms,
  kuenstler: (t.artists || []).map(a => a.name).join(', ') || t.show?.name || '', bild: spBild(t.album?.images || bilder, true) });

async function spSammlung(typ, id) {             // typ: 'playlist' oder 'album'
  const d = await spApi(`/${typ}s/${id}`);
  const titel = [];
  let seite = d.tracks || d.items;               // je nach Stand der Spotify-API heißt die Liste „tracks“ oder „items“
  while (seite) {
    (seite.items || []).forEach(x => { const t = x.track || x.item || x; if (t?.uri && t.name) titel.push(spTitelDaten(t, d.images)); });
    if (!seite.next || titel.length >= SP_MAX_TITEL) break;
    seite = await spApi(seite.next.replace(SP_API, ''));   // nächste Seite (je 50–100 Titel)
  }
  return { name: d.name, art: typ === 'album' ? 'Album' : 'Playlist', uri: d.uri, titel };
}
async function spWarteschlange() {
  const d = await spApi('/me/player/queue');
  return { name: 'Als Nächstes', art: 'Warteschlange', uri: null, titel: (d?.queue || []).filter(t => t?.uri).map(t => spTitelDaten(t)) };
}

async function spKontextLaden() {
  const ctx = spStatus?.context, typ = ctx?.type;
  if (!spStatus?.item) { spKontext = null; spKontextLaedt = ''; return spListeZeigen(); }
  const sammlung = typ === 'playlist' || typ === 'album';
  const schluessel = sammlung ? ctx.uri : 'warteschlange:' + spStatus.item.uri;   // Warteschlange bei jedem Titelwechsel neu
  if (schluessel === spKontext?.schluessel || schluessel === spKontextLaedt) return;
  spKontextLaedt = schluessel;
  let neu = null;
  if (sammlung) try { neu = await spSammlung(typ, ctx.uri.split(':').pop()); } catch (e) {}
  if (!neu?.titel.length) try { neu = await spWarteschlange(); } catch (e) {}
  if (spKontextLaedt !== schluessel) return;      // inzwischen läuft etwas anderes
  spKontextLaedt = '';
  spKontext = neu ? { ...neu, schluessel } : null;
  spListeZeigen();
}

function spListeZeigen() {
  const box = $('spPlaylist'), k = spKontext;
  $('spListeName').textContent = k?.name || 'Playlist';
  $('spListeInfo').textContent = k ? `${k.art} · ${k.titel.length} Titel` : '';
  box.replaceChildren();
  spMarkiert = null;
  if (!k?.titel.length) {
    const e = document.createElement('div'); e.className = 'empty';
    e.textContent = !spStatus?.item ? 'Gerade läuft nichts.' : 'Keine Titel – Spotify gibt diese Liste nicht heraus.';
    return box.appendChild(e);
  }
  k.titel.forEach((t, i) => {
    const z = document.createElement(k.uri ? 'button' : 'div');
    z.className = 'sp-zeile'; z.dataset.uri = t.uri;
    const nr = document.createElement('span'); nr.className = 'sp-nr'; nr.textContent = i + 1;
    const img = document.createElement('img'); img.alt = ''; img.loading = 'lazy'; if (t.bild) img.src = t.bild;
    const txt = document.createElement('span');
    const b = document.createElement('b'); b.textContent = t.name;
    const sm = document.createElement('small'); sm.textContent = t.kuenstler;
    txt.append(b, sm);
    const d = document.createElement('span'); d.className = 'sp-dauer'; d.textContent = t.dauer ? mmss(t.dauer) : '';
    z.append(nr, img, txt, d);
    if (k.uri) z.onclick = () => spAbspielen({ context_uri: k.uri, offset: { uri: t.uri } });
    box.appendChild(z);
  });
  spListeMarkieren();
}

/* Laufenden Titel hervorheben und bei einem Titelwechsel in die Liste scrollen (ohne die Seite zu verschieben) */
function spListeMarkieren() {
  const jetzt = spStatus?.item?.uri || null;
  if (jetzt === spMarkiert) return;
  spMarkiert = jetzt;
  const box = $('spPlaylist');
  box.querySelectorAll('.sp-zeile.on').forEach(z => z.classList.remove('on'));
  const z = jetzt && [...box.children].find(e => e.dataset.uri === jetzt);
  if (!z) return;
  z.classList.add('on');
  const oben = box.scrollTop + z.getBoundingClientRect().top - box.getBoundingClientRect().top;
  box.scrollTo({ top: oben - box.clientHeight / 3, behavior: 'smooth' });
}
const spBald = () => [500, 1500].forEach(t => setTimeout(spAktualisieren, t));   // Spotify braucht kurz, bis der neue Stand da ist

function spAnsicht() {
  const s = spServer, bereit = !!s?.eingerichtet && !angemeldet;
  $('spLogin').hidden = angemeldet;
  $('spPlayer').hidden = $('spAbmelden').hidden = !angemeldet;
  $('spSchritte').hidden = !bereit;
  $('spHinweis').textContent = !s
    ? 'Spotify braucht den Server (server/server.py) – mit Live Server geht es nicht.'
    : !s.eingerichtet
    ? `Noch nicht eingerichtet: Client-ID und Client-Secret der Spotify-App als Container-Variablen SPOTIFY_CLIENT_ID und SPOTIFY_CLIENT_SECRET eintragen. Redirect URI im Spotify-Dashboard: ${s.rueckSprung} (siehe README).`
    : gesperrt()
    ? 'Spotify ist nicht angemeldet. Anmelden geht erst wieder, wenn die Konfiguration entsperrt ist (Einstellungen → Sicherheit).'
    : 'Einmal anmelden – danach steuern alle Geräte Spotify. Nach der Anmeldung zeigt der Browser eine Fehlerseite '
      + `(„${s.rueckSprung.replace(/^https?:\/\//, '').split('/')[0]} … nicht erreichbar“) – das ist richtig so: die Adresse aus deren Adresszeile kopieren und unten einfügen.`;
  if (s?.anmeldeUrl) $('spAnmelden').href = s.anmeldeUrl;
  if (angemeldet) spZeigen();
}

/* --- Geräte (Handy, Tablet, PC, Lautsprecher …) --- */
let spGeraetId = null;
async function spGeraeteLaden() {
  let liste;
  try { liste = ((await spApi('/me/player/devices'))?.devices || []).filter(g => g.id); } catch (e) { return; }
  if (!liste.some(g => g.id === spGeraetId))
    spGeraetId = (liste.find(g => g.is_active) || liste[0] || {}).id || null;
  const sel = $('spGeraet');
  sel.innerHTML = '';
  if (!liste.length) sel.add(new Option('Kein Gerät gefunden – Spotify-App öffnen', ''));
  liste.forEach(g => sel.add(new Option(g.name, g.id)));
  sel.value = spGeraetId || '';
}
$('spGeraet').onchange = async () => {
  spGeraetId = $('spGeraet').value || null;
  if (!spGeraetId || !spStatus?.device) return;      // läuft gerade nichts: Gerät wird beim nächsten Abspielen benutzt
  try { await spApi('/me/player', 'PUT', { device_ids: [spGeraetId], play: !!spStatus.is_playing }); spBald(); }
  catch (e) { spFehler(e); }
};

/* --- Steuerung --- */
async function spAbspielen(body) {
  try {
    await spApi('/me/player/play' + (spGeraetId ? '?device_id=' + encodeURIComponent(spGeraetId) : ''), 'PUT', body);
    if (spStatus) { spStatus.is_playing = true; spZeigen(); }
    spBald();
  } catch (e) { spFehler(e); }
}
async function spBefehl(pfad, methode) {
  try { await spApi(pfad, methode); spBald(); } catch (e) { spFehler(e); }
}
$('spPlay').onclick = () => {
  if (!spStatus?.is_playing) return spAbspielen();
  spStatus.is_playing = false; spStand = Date.now(); spZeigen();
  spBefehl('/me/player/pause', 'PUT');
};
$('spZurueck').onclick = () => spBefehl('/me/player/previous', 'POST');
$('spWeiter').onclick = () => spBefehl('/me/player/next', 'POST');
['spFortschritt', 'spLaut'].forEach(id => $(id).addEventListener('input', () => { spZiehen = true; spFuellen($(id)); }));
$('spFortschritt').addEventListener('change', () => {
  spZiehen = false;
  const dauer = spStatus?.item?.duration_ms;
  if (!dauer) return;
  const pos = Math.round($('spFortschritt').value / 1000 * dauer);
  spStatus.progress_ms = pos; spStand = Date.now();
  spBefehl('/me/player/seek?position_ms=' + pos, 'PUT');
});
$('spLaut').addEventListener('change', () => {
  spZiehen = false;
  spBefehl('/me/player/volume?volume_percent=' + $('spLaut').value, 'PUT');
});

/* --- Fenster "Musik": Suche und eigene Playlists --- */
const musikFenster = $('musik');
let spSuchwort = '', spOffset = 0;
function spTreffer(bild, titel, unten, onclick) {
  const b = document.createElement('button'); b.className = 'sp-treffer';
  const img = document.createElement('img'); img.alt = ''; if (bild) img.src = bild;
  const t = document.createElement('span');
  const n = document.createElement('b'); n.textContent = titel;
  const u = document.createElement('small'); u.textContent = unten;
  t.append(n, u); b.append(img, t);
  b.onclick = () => { onclick(); musikFenster.close(); };
  return b;
}
function spListeText(text) {
  const e = document.createElement('div'); e.className = 'empty'; e.textContent = text;
  $('spListe').replaceChildren(e);
}
function spTab(listen) {
  $('spTabSuche').classList.toggle('on', !listen);
  $('spTabListen').classList.toggle('on', listen);
  $('spSuche').hidden = listen;
  listen ? spPlaylists() : spSuchen(false);
}
async function spSuchen(weitere) {
  if (!weitere) { spSuchwort = $('spSuchText').value.trim(); spOffset = 0; }
  if (!spSuchwort) return spListeText('Nach einem Lied, Künstler oder Album suchen.');
  if (!weitere) spListeText('Suche …');
  let d;
  try { d = await spApi('/search?' + new URLSearchParams({ q: spSuchwort, type: 'track', limit: 10, offset: spOffset })); }
  catch (e) { return spListeText('Suche fehlgeschlagen: ' + e.message); }
  const liste = $('spListe'), lieder = d?.tracks?.items || [];
  if (!weitere) liste.innerHTML = '';
  liste.querySelector('.sp-mehr')?.remove();
  if (!lieder.length && !spOffset) return spListeText('Nichts gefunden.');
  lieder.forEach(t => liste.appendChild(spTreffer(spBild(t.album.images, true), t.name,
    t.artists.map(a => a.name).join(', ') + ' · ' + t.album.name,
    () => spAbspielen({ context_uri: t.album.uri, offset: { uri: t.uri } }))));   // im Album weiterspielen
  spOffset += lieder.length;
  if (d.tracks.next) {
    const mehr = document.createElement('button'); mehr.className = 'sp-mehr'; mehr.textContent = 'Mehr anzeigen';
    mehr.onclick = () => spSuchen(true);
    liste.appendChild(mehr);
  }
}
async function spPlaylists() {
  spListeText('Lade Playlists …');
  let d;
  try { d = await spApi('/me/playlists?limit=50'); } catch (e) { return spListeText('Playlists konnten nicht geladen werden: ' + e.message); }
  const listen = (d?.items || []).filter(Boolean);
  if (!listen.length) return spListeText('Keine Playlists gefunden.');
  $('spListe').innerHTML = '';
  listen.forEach(p => {
    const anzahl = (p.items || p.tracks)?.total;
    $('spListe').appendChild(spTreffer(spBild(p.images, true), p.name,
      anzahl != null ? anzahl + ' Titel' : '', () => spAbspielen({ context_uri: p.uri })));
  });
}
$('spMusikBtn').onclick = () => {
  musikFenster.showModal();
  spGeraeteLaden();
  if (!$('spListe').childElementCount) spTab(false);
  if (matchMedia('(pointer: fine)').matches && !$('spSuche').hidden) $('spSuchText').focus();
};
$('musikZu').onclick = () => musikFenster.close();
klickDanebenSchliesst(musikFenster);
$('spSuche').addEventListener('submit', e => { e.preventDefault(); spSuchen(false); });
$('spTabSuche').onclick = () => spTab(false);
$('spTabListen').onclick = () => spTab(true);

/* --- Start: Anmeldestand holen, dann regelmäßig den Stand abfragen --- */
export function starteSpotify() {
  spAnsicht();
  let warGesperrt = gesperrt();
  beiAenderung(() => { if (gesperrt() !== warGesperrt) { warGesperrt = gesperrt(); spAnsicht(); } });   // Einstellungen → Sicherheit
  spStatusHolen();
  let spSekunde = 0;
  setInterval(() => {
    if (document.hidden) return;
    spSekunde++;
    if (!angemeldet) { if (spSekunde % 30 === 0) spStatusHolen(); return; }   // vielleicht hat sich ein anderes Gerät angemeldet
    if (spSekunde % 3 === 0) spAktualisieren();       // alle 3 s den Stand holen
    if (spSekunde % 15 === 0) spGeraeteLaden();       // alle 15 s die Geräteliste
    spFortschrittZeigen();
  }, 1000);
}
