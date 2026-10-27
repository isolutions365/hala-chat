export const typographyFonts = {
  default: "'Cairo', 'Plus Jakarta Sans', sans-serif",
  // English & Modern Fonts
  inter: "'Inter', 'Cairo', sans-serif",
  poppins: "'Poppins', 'Cairo', sans-serif",
  playfair: "'Playfair Display', 'Amiri', Georgia, serif",
  spaceGrotesk: "'Space Grotesk', 'Alexandria', sans-serif",
  firaCode: "'Fira Code', 'IBM Plex Sans Arabic', monospace",
  dancingScript: "'Dancing Script', 'Reem Kufi', cursive",
  // Arabic & Regional Fonts
  tajawal: "'Tajawal', 'Plus Jakarta Sans', sans-serif",
  amiri: "'Amiri', 'Playfair Display', Georgia, serif",
  almarai: "'Almarai', 'Plus Jakarta Sans', sans-serif",
  ibmPlex: "'IBM Plex Sans Arabic', 'Plus Jakarta Sans', sans-serif",
  alexandria: "'Alexandria', 'Plus Jakarta Sans', sans-serif",
  reemKufi: "'Reem Kufi', 'Plus Jakarta Sans', sans-serif",
  classic: "'Noto Naskh Arabic', Georgia, serif",
  kufam: "'Kufam', 'Plus Jakarta Sans', sans-serif",
  changa: "'Changa', 'Plus Jakarta Sans', sans-serif",
  elMessiri: "'El Messiri', 'Plus Jakarta Sans', sans-serif",
  lateef: "'Lateef', 'Noto Naskh Arabic', serif",
  arefRuqaa: "'Aref Ruqaa', 'Amiri', serif",
  rakkas: "'Rakkas', 'Cairo', serif",
  marhey: "'Marhey', 'Cairo', cursive",
  lalezar: "'Lalezar', 'Cairo', sans-serif",
  system: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
} as const;
export type Typography = { font: keyof typeof typographyFonts; size: number; spacing: number };
export const defaultTypography: Typography = { font: 'default', size: 16, spacing: 1.5 };
const key = 'hala.typography.v1';
export function normalizeTypography(value: any): Typography {
  return {
    font: value && Object.hasOwn(typographyFonts, value.font) ? value.font : 'default',
    size: [16, 18, 20].includes(value?.size) ? value.size : 16,
    spacing: [1.5, 1.75, 2].includes(value?.spacing) ? value.spacing : 1.5,
  };
}
export function readTypography(): Typography {
  try { return normalizeTypography(JSON.parse(localStorage.getItem(key) || 'null')); }
  catch { return { ...defaultTypography }; }
}
export function applyTypography(value: Typography) {
  const fontStr = typographyFonts[value.font] || typographyFonts.default;
  document.documentElement.style.setProperty('--hala-font', fontStr);
  if (document.body) {
    document.body.style.setProperty('--hala-font', fontStr);
  }
  document.documentElement.style.fontSize = `${value.size}px`;
  document.documentElement.style.setProperty('--hala-reading-line', String(value.spacing));
  
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('hala-typography-changed', { detail: value }));
  }
}
export function saveTypography(value: Typography): boolean {
  applyTypography(value);
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}
