/* Kleine Hilfsfunktionen, die mehrere Teile der Seite brauchen */

export const $ = id => document.getElementById(id);

/* Datum ↔ Schlüssel 'JJJJ-MM-TT' (so sind auch die Termine auf dem Server abgelegt) */
export const pad = n => String(n).padStart(2, '0');
export const key = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export function kalenderwoche(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 86400000 + 1) / 7);
}

/* Klick neben ein Fenster (<dialog>) schließt es */
export function klickDanebenSchliesst(fenster) {
  fenster.addEventListener('click', e => {
    const r = fenster.getBoundingClientRect();
    if (e.target === fenster && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) fenster.close();
  });
}
