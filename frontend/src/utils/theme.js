export function hexToRgba(hex, alpha = 1) {
   if (!hex || typeof hex !== 'string') return `rgba(214, 8, 8, ${alpha})`;
   let c = hex.replace('#', '').trim();
   if (c.length === 3) {
      c = c.split('').map((x) => x + x).join('');
   }
   if (c.length !== 6) return `rgba(214, 8, 8, ${alpha})`;
   const r = parseInt(c.substring(0, 2), 16);
   const g = parseInt(c.substring(2, 4), 16);
   const b = parseInt(c.substring(4, 6), 16);
   return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function adjustBrightness(hex, percent) {
   if (!hex || typeof hex !== 'string') return '#b00606';
   let c = hex.replace('#', '').trim();
   if (c.length === 3) {
      c = c.split('').map((x) => x + x).join('');
   }
   if (c.length !== 6) return '#b00606';
   const num = parseInt(c, 16);
   const amt = Math.round(2.55 * percent);
   const R = Math.max(0, Math.min(255, (num >> 16) + amt));
   const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00ff) + amt));
   const B = Math.max(0, Math.min(255, (num & 0x0000ff) + amt));
   return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

export function getTopicThemeVars(color) {
   const primary = color && /^#[0-9A-Fa-f]{3,8}$/.test(color.trim()) ? color.trim() : '#D60808';
   return {
      '--primary-color': primary,
      '--primary-color-dark': adjustBrightness(primary, -15),
      '--primary-color-light': adjustBrightness(primary, 40),
      '--primary-color-surface': hexToRgba(primary, 0.05),
      '--primary-color-surface-hover': hexToRgba(primary, 0.12),
      '--primary-color-border': hexToRgba(primary, 0.22),
      '--primary-color-focus-ring': hexToRgba(primary, 0.18),
      '--primary-color-shadow': hexToRgba(primary, 0.25),
      '--primary-color-nav-bg': hexToRgba(primary, 0.04),
      '--primary-color-blockquote-bg': hexToRgba(primary, 0.06),
      '--primary-color-done': hexToRgba(primary, 0.45),
   };
}
