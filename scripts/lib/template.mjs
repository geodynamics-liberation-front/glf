// Tiny template helpers: {{> partial}} includes and {{key}} substitution.
// Values are inserted as-is; call esc() on anything that came from data.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function render(template, vars, partialsDir) {
  // Expand partials first (they may themselves contain {{vars}}), then vars.
  const withPartials = template.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, name) =>
    readFileSync(join(partialsDir, `${name}.html`), 'utf8'));
  return withPartials.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, key) => {
    const v = key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), vars);
    if (v === undefined) throw new Error(`template: no value for {{${key}}}`);
    return String(v);
  });
}
