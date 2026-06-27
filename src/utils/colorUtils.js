/**
 * Converts RGB values to HSL.
 * r, g, b each in [0, 255].
 * Returns [hue (0–360), saturation (0–100), lightness (0–100)].
 */
function rgbToHsl(r, g, b) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) return [0, 0, Math.round(l * 100)];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  switch (max) {
    case rn: h = (gn - bn) / d + (gn < bn ? 6 : 0); break;
    case gn: h = (bn - rn) / d + 2; break;
    default: h = (rn - gn) / d + 4; break;
  }

  return [Math.round((h / 6) * 360), Math.round(s * 100), Math.round(l * 100)];
}

function parseHsl(hex) {
  if (!hex) return null;
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return null;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  return rgbToHsl(r, g, b);
}

/**
 * Adapts a team's primary (and optional alternate) color so it is always
 * readable as an accent on a dark background.
 *
 * Strategy:
 *  1. Primary color is bright enough → use it unchanged.
 *  2. Primary is too dark, but alternate is bright AND visibly saturated → use alternate.
 *  3. Otherwise → boost the primary color's lightness to the minimum threshold.
 *
 * This fixes teams like the Eagles (midnight green), Detroit Tigers (navy),
 * and Yankees (navy) whose dark primaries disappear against dark UI backgrounds.
 *
 * @param {string|null} primaryHex  – e.g. "#004c54" or null
 * @param {string|null} altHex      – e.g. "#fa4616" or null
 * @param {string}      fallback    – returned when primaryHex is null/empty
 * @returns {string}                – a CSS color string safe for dark backgrounds
 */
export function adaptColorForDarkBg(primaryHex, altHex = null, fallback = '#7c3aed') {
  const MIN_LIGHTNESS   = 40; // % — minimum lightness for visibility on ~10% lightness bg
  const MIN_ALT_SATURATION = 25; // % — alternate must be visibly colorful, not just gray

  if (!primaryHex) return fallback;

  const primaryHsl = parseHsl(primaryHex);
  if (!primaryHsl) return primaryHex;

  const [pH, pS, pL] = primaryHsl;

  // Primary is already bright enough
  if (pL >= MIN_LIGHTNESS) return primaryHex;

  // Primary is too dark — try the alternate color
  if (altHex) {
    const altHsl = parseHsl(altHex);
    if (altHsl) {
      const [, aS, aL] = altHsl;
      if (aL >= MIN_LIGHTNESS && aS >= MIN_ALT_SATURATION) {
        return altHex;
      }
    }
  }

  // Boost primary lightness to minimum while preserving hue and saturation
  return `hsl(${pH}, ${pS}%, ${MIN_LIGHTNESS}%)`;
}
