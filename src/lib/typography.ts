export const typographyFonts = {
  default: "'Cairo', 'Plus Jakarta Sans', sans-serif",
  system: "system-ui, 'Segoe UI', Tahoma, sans-serif",
  classic: "'Noto Naskh Arabic', Georgia, serif",
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
  document.documentElement.style.setProperty('--hala-font', typographyFonts[value.font]);
  document.documentElement.style.fontSize = `${value.size}px`;
  document.documentElement.style.setProperty('--hala-reading-line', String(value.spacing));
}
export function saveTypography(value: Typography): boolean {
  applyTypography(value);
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}
