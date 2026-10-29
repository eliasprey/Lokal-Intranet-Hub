/* Liniendiagramm mit Fläche für die Seite Finanzen (Kursverlauf bzw. Wert des Depots). Reines SVG, passt sich der
   Größe seines Kastens an. Mit Maus oder Finger darüberfahren zeigt Zeitpunkt und Wert.
   Die Punkte stehen gleichmäßig nebeneinander (nicht nach Uhrzeit) – Nächte und Wochenenden ohne Handel lassen so keine Lücken. */
const NS = 'http://www.w3.org/2000/svg';
const RAND = { oben: 12, rechts: 14, unten: 28 };       // links richtet sich nach der Breite der Achsenbeschriftung
let nr = 0;

const svgEl = (tag, attr = {}) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attr)) e.setAttribute(k, v);
  return e;
};

/* „Schöne“ Teilung der y-Achse: Schritte 1, 2, 2,5 oder 5 × 10^n */
function teilung(min, max, anzahl = 5) {
  const roh = (max - min) / anzahl || Math.abs(max) / 10 || 1;
  const basis = 10 ** Math.floor(Math.log10(roh));
  const schritt = [1, 2, 2.5, 5, 10].map(f => f * basis).find(s => s >= roh);
  const werte = [];
  for (let w = Math.ceil(min / schritt) * schritt; w <= max + schritt * 1e-9; w += schritt) werte.push(w);
  const stellen = Math.max(0, -Math.floor(Math.log10(schritt) + 1e-9) + (schritt / basis === 2.5 ? 1 : 0));   // 0,25 → 2 Stellen
  return { werte, stellen };
}

/* box: leeres Element. Rückgabe: { setze({ punkte: [[sek, wert]], wertText, zeitText, achse }) , meldung(text) }
   achse(sek) → [Schlüssel, Beschriftung]: Wo sich der Schlüssel ändert (neuer Tag, Monat …), steht eine Beschriftung. */
export function diagramm(box) {
  const id = 'chartFlaeche' + ++nr;
  const svg = svgEl('svg', { class: 'chart-svg', role: 'img' });
  const tip = document.createElement('div'); tip.className = 'chart-tip'; tip.hidden = true;
  const hinweis = document.createElement('div'); hinweis.className = 'chart-meldung';
  box.append(svg, tip, hinweis);
  let d = null, geom = null, zeiger = null;     // zeiger = Index des Punkts unter Maus/Finger

  function zeichnen() {
    svg.replaceChildren();
    geom = null;
    if (!d || d.punkte.length < 2) return;
    const B = box.clientWidth, H = box.clientHeight;
    if (B < 50 || H < 50) return;
    const werte = d.punkte.map(p => p[1]);
    let min = Math.min(...werte), max = Math.max(...werte);
    const luft = (max - min) * 0.08 || Math.abs(max) * 0.01 || 1;
    min -= luft; max += luft;
    const t = teilung(min, max, H < 220 ? 3 : H < 420 ? 5 : 7);
    const yText = w => w.toLocaleString('de-DE', { minimumFractionDigits: t.stellen, maximumFractionDigits: t.stellen });
    const links = Math.max(...t.werte.map(w => yText(w).length)) * 7.2 + 14;
    const breite = B - links - RAND.rechts, hoehe = H - RAND.oben - RAND.unten;
    const x = i => links + (i / (d.punkte.length - 1)) * breite;
    const y = w => RAND.oben + (1 - (w - min) / (max - min)) * hoehe;
    geom = { x, y, links, breite };
    svg.setAttribute('viewBox', `0 0 ${B} ${H}`);
    svg.setAttribute('width', B); svg.setAttribute('height', H);

    const defs = svgEl('defs'), farbe = svgEl('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 });
    farbe.append(svgEl('stop', { offset: '0%', class: 'chart-stop-oben' }), svgEl('stop', { offset: '100%', class: 'chart-stop-unten' }));
    defs.appendChild(farbe); svg.appendChild(defs);

    // Raster und y-Achse
    t.werte.forEach(w => {
      if (y(w) < RAND.oben - 1 || y(w) > RAND.oben + hoehe + 1) return;
      svg.append(svgEl('line', { class: 'chart-raster', x1: links, x2: B - RAND.rechts, y1: y(w), y2: y(w) }));
      const l = svgEl('text', { class: 'chart-achse', x: links - 8, y: y(w) + 4, 'text-anchor': 'end' }); l.textContent = yText(w);
      svg.append(l);
    });
    // x-Achse: Beschriftung, wo ein neuer Abschnitt beginnt – nicht enger als 90 px
    let letzterSchluessel = null, letztesX = -Infinity;
    d.punkte.forEach(([sek], i) => {
      const [schluessel, text] = d.achse(sek);
      if (schluessel === letzterSchluessel) return;
      letzterSchluessel = schluessel;
      if (i === 0 || x(i) - letztesX < 90 || x(i) > B - RAND.rechts - 24) return;
      letztesX = x(i);
      svg.append(svgEl('line', { class: 'chart-raster senkrecht', x1: x(i), x2: x(i), y1: RAND.oben, y2: RAND.oben + hoehe }));
      const l = svgEl('text', { class: 'chart-achse', x: x(i), y: H - 8, 'text-anchor': 'middle' }); l.textContent = text;
      svg.append(l);
    });
    svg.append(svgEl('line', { class: 'chart-grundlinie', x1: links, x2: B - RAND.rechts, y1: RAND.oben + hoehe, y2: RAND.oben + hoehe }));

    const linie = d.punkte.map(([, w], i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(w).toFixed(1)}`).join('');
    svg.append(svgEl('path', { class: 'chart-flaeche', d: `${linie}L${x(d.punkte.length - 1)},${RAND.oben + hoehe}L${links},${RAND.oben + hoehe}Z`, fill: `url(#${id})` }));
    svg.append(svgEl('path', { class: 'chart-linie', d: linie }));
    zeigeZeiger();
  }

  /* Fadenkreuz und Tooltip am Punkt zeiger */
  function zeigeZeiger() {
    svg.querySelector('.chart-zeiger')?.remove();
    if (zeiger == null || !geom || !d) { tip.hidden = true; return; }
    const i = Math.min(zeiger, d.punkte.length - 1), [sek, w] = d.punkte[i];
    const g = svgEl('g', { class: 'chart-zeiger' });
    g.append(svgEl('line', { x1: geom.x(i), x2: geom.x(i), y1: RAND.oben, y2: box.clientHeight - RAND.unten }),
      svgEl('circle', { cx: geom.x(i), cy: geom.y(w), r: 5 }));
    svg.append(g);
    tip.replaceChildren();
    const b = document.createElement('b'); b.textContent = d.wertText(w);
    const s = document.createElement('small'); s.textContent = d.zeitText(sek);
    tip.append(b, s);
    tip.hidden = false;
    const bx = tip.offsetWidth, px = geom.x(i);
    tip.style.left = Math.max(geom.links, Math.min(box.clientWidth - bx - 4, px - bx / 2)) + 'px';
    tip.style.top = Math.max(0, geom.y(w) - tip.offsetHeight - 14) + 'px';
  }

  const bewegt = e => {
    if (!geom || !d) return;
    const r = svg.getBoundingClientRect();
    const anteil = (e.clientX - r.left - geom.links) / geom.breite;
    zeiger = Math.round(Math.max(0, Math.min(1, anteil)) * (d.punkte.length - 1));
    zeigeZeiger();
  };
  const weg = () => { zeiger = null; zeigeZeiger(); };
  svg.addEventListener('pointerdown', bewegt);
  svg.addEventListener('pointermove', bewegt);
  svg.addEventListener('pointerleave', weg);
  svg.addEventListener('pointercancel', weg);

  new ResizeObserver(zeichnen).observe(box);

  return {
    setze(daten) {
      d = daten;
      hinweis.textContent = '';
      svg.setAttribute('aria-label', daten.beschreibung || 'Verlauf');
      zeichnen();
    },
    meldung(text) {
      d = null; zeiger = null;
      hinweis.textContent = text;
      zeichnen(); zeigeZeiger();
    },
  };
}
