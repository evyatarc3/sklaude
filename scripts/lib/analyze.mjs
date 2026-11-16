// Topic tagging and static safety signals. Pure functions, no network.

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function buildClassifier(categories) {
  const rules = categories.map((c) => ({
    id: c.id,
    re: new RegExp(`(?<![\\p{L}\\p{N}])(?:${c.keywords.map(esc).join('|')})(?![\\p{L}\\p{N}])`, 'giu'),
  }));
  // Primary text (skill name/description) decides; fallback text (repo topics) is used only if nothing matched.
  // Best category is always kept; extra ones need at least 2 distinct keyword hits. Max 3.
  return function classify(text, fallbackText = '') {
    for (const t of [text, fallbackText]) {
      const clean = t.replace(/claude[ -]?code/gi, ' ');
      const scored = [];
      for (const r of rules) {
        const hits = clean.match(r.re);
        if (hits) scored.push([r.id, new Set(hits.map((h) => h.toLowerCase())).size, hits.length]);
      }
      if (!scored.length) continue;
      scored.sort((a, b) => b[1] - a[1] || b[2] - a[2]);
      return scored.filter((c, i) => i === 0 || c[1] >= 2).slice(0, 3).map(([id]) => id);
    }
    return ['other'];
  };
}

const SCRIPT_EXT = /\.(py|sh|bash|zsh|js|mjs|cjs|ts|rb|pl|php|ps1|bat|cmd|go|rs)$/i;
const BINARY_EXT = /\.(exe|dll|so|dylib|bin|jar|msi|apk|dmg)$/i;

const TEXT_SIGNALS = [
  ['network', /\b(curl|wget|requests\.(get|post|put)|urllib|httpx|axios|fetch\(|Invoke-WebRequest|nc -e)\b/i],
  ['secrets', /\b(api[_ -]?key|access[_ -]?token|bearer token|password|private key|credentials?|\.env\b|ssh key)/i],
  ['destructive', /(rm\s+-rf\s+[/~$]|sudo\s|chmod\s+777|mkfs|dd\s+if=|:\(\)\s*\{|git\s+push\s+--force)/i],
  ['obfuscation', /(base64\s+(-d|--decode)|b64decode|atob\(|eval\(|exec\(|\\x[0-9a-f]{2}\\x[0-9a-f]{2}\\x)/i],
  ['autorun', /(curl[^\n|]*\|\s*(ba)?sh|wget[^\n|]*\|\s*(ba)?sh|iex\s*\(|crontab|launchctl|systemctl\s+enable)/i],
];

/**
 * @param {string} text SKILL.md content
 * @param {string[]} files paths of sibling files inside the skill directory (relative)
 */
export function safetySignals(text, files) {
  const flags = new Set();
  if (files.some((f) => SCRIPT_EXT.test(f))) flags.add('scripts');
  if (files.some((f) => BINARY_EXT.test(f))) flags.add('binary');
  for (const [flag, re] of TEXT_SIGNALS) if (re.test(text)) flags.add(flag);
  const high = ['destructive', 'obfuscation', 'autorun', 'binary'].some((f) => flags.has(f));
  const medium = ['scripts', 'network', 'secrets'].some((f) => flags.has(f));
  return { flags: [...flags], risk: high ? 'high' : medium ? 'medium' : 'low' };
}

export function normalizeKey(name, description) {
  return `${(name || '').toLowerCase().replace(/[^a-z0-9֐-׿]+/g, '')}|${(description || '')
    .toLowerCase()
    .replace(/[^a-z0-9֐-׿]+/g, '')
    .slice(0, 120)}`;
}
