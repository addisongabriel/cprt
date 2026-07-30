/**
 * Config helper
 *
 * Every component opens with a CONFIG object holding its tunable values, so a
 * change is a literal edit and a commit rather than a read of the logic. This
 * merges per-instance `data-*` overrides on top, which lets the same values be
 * tuned in the Webflow Designer with no commit at all.
 */

const kebab = (key: string): string => key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());

/**
 * Merges data-* attribute overrides over a config object.
 *
 * Without a prefix, CONFIG key `fadeDuration` reads `data-fade-duration`.
 * With prefix `tabs`, it reads `data-tabs-fade-duration` — used where a
 * component already has a documented attribute contract on the Webflow side.
 *
 * Numbers and booleans are coerced to match the default's type, so a malformed
 * value falls back to the default instead of poisoning the config.
 */
export function readConfig<T extends Record<string, any>>(
  el: HTMLElement,
  defaults: T,
  prefix?: string
): T {
  const out = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const attr = `data-${prefix ? kebab(prefix) + '-' : ''}${kebab(String(key))}`;
    const raw = el.getAttribute(attr);
    if (raw === null) continue;

    const fallback = defaults[key];
    if (typeof fallback === 'number') {
      const n = parseFloat(raw);
      if (!Number.isNaN(n)) out[key] = n as T[keyof T];
    } else if (typeof fallback === 'boolean') {
      out[key] = (raw === 'true' || raw === '') as T[keyof T];
    } else {
      out[key] = raw as T[keyof T];
    }
  }
  return out;
}
