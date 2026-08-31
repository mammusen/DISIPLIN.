// Sentral liste over tilgjengelige temaer. Brukes av server (validering) og
// gjenspeiles i public/style.css (CSS-variabler per data-theme) og
// public/app.js (temavelgeren).
const THEMES = [
  { key: 'dark', label: 'Samurai (standard)' },
  { key: 'ocean', label: 'Hav' },
  { key: 'forest', label: 'Skog' },
  { key: 'sunset', label: 'Solnedgang' },
];

const THEME_KEYS = THEMES.map((t) => t.key);
const DEFAULT_THEME = 'dark';

module.exports = { THEMES, THEME_KEYS, DEFAULT_THEME };
