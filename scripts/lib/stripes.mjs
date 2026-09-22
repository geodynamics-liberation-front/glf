// Sea-floor magnetic stripes: the geomagnetic polarity time scale for the last
// ~5.3 Myr (ages in Ma, after the GPTS 2012 compilation), mirrored about a
// spreading ridge. Normal-polarity intervals are drawn as ink, reversed as paper.

const NORMAL_INTERVALS = [
  [0.000, 0.781], // Brunhes
  [0.988, 1.072], // Jaramillo
  [1.173, 1.185], // Cobb Mountain
  [1.778, 1.945], // Olduvai
  [2.128, 2.148], // Réunion
  [2.581, 3.032], // Gauss (upper)
  [3.116, 3.207], // Gauss (between Kaena and Mammoth)
  [3.330, 3.596], // Gauss (lower)
  [4.187, 4.300], // Cochiti
  [4.493, 4.631], // Nunivak
  [4.799, 4.896], // Sidufjall
  [4.997, 5.235], // Thvera
];

export const STRIPES_MAX_AGE = 5.3;

// Returns an inline SVG string. width/height are the viewBox size; the ridge
// axis sits at the horizontal centre and age grows outward on both sides.
export function stripesSVG({ width = 1200, height = 96, maxAge = STRIPES_MAX_AGE, axisClass = 'stripes-axis' } = {}) {
  const half = width / 2;
  const scale = half / maxAge; // px per Myr (a symmetric half-spreading rate)
  const rects = [];
  for (const [a, b] of NORMAL_INTERVALS) {
    const x0 = a * scale, x1 = Math.min(b, maxAge) * scale;
    const w = Math.max(x1 - x0, 0.75);
    rects.push(`<rect x="${(half + x0).toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${height}"/>`);
    rects.push(`<rect x="${(half - x1).toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${height}"/>`);
  }
  return `<svg class="stripes" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true" focusable="false">` +
    `<g class="stripes-normal">${rects.join('')}</g>` +
    `<line class="${axisClass}" x1="${half}" y1="0" x2="${half}" y2="${height}"/>` +
    `</svg>`;
}
