#!/usr/bin/env node
// Skills Radar collector. Runs daily in GitHub Actions (free) and writes static JSON for the site.
// Usage: GITHUB_TOKEN=... node scripts/collect.mjs        (QUICK=1 for a small local test run)

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchRepos, searchCode, getRepo, getTree, rawFile, fetchText, pMap, stats, rate } from './lib/github.mjs';
import { parseFrontmatter } from './lib/frontmatter.mjs';
import { buildClassifier, safetySignals, normalizeKey } from './lib/analyze.mjs';
import { publish } from './lib/publish.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const QUICK = process.env.QUICK === '1';
const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

const readJson = async (p, fallback) => {
  try { return JSON.parse(await readFile(join(ROOT, p), 'utf8')); } catch { return fallback; }
};
async function writeJson(p, value, { linePerItem } = {}) {
  const file = join(ROOT, p);
  await mkdir(dirname(file), { recursive: true });
  let text;
  if (linePerItem && Array.isArray(value[linePerItem])) {
    // One item per line keeps daily git diffs small and readable.
    const { [linePerItem]: items, ...rest } = value;
    const head = JSON.stringify(rest).slice(0, -1);
    text = `${head}${head.length > 1 ? ',' : ''}\n"${linePerItem}":[\n${items.map((i) => JSON.stringify(i)).join(',\n')}\n]}\n`;
  } else {
    text = JSON.stringify(value, null, 2) + '\n';
  }
  await writeFile(file, text);
}

const cfg = await readJson('config/sources.json', {});
const { categories } = await readJson('config/categories.json', { categories: [] });
const limits = { ...cfg.limits, ...(QUICK ? { maxRepos: 8, searchPagesPerQuery: 1 } : {}) };
const classify = buildClassifier(categories);
const state = await readJson('data/state.json', { repos: {} });
const history = await readJson('data/stars-history.json', {});
const submissions = await readJson('data/submissions.json', []);

/** full_name(lowercase) -> { meta, sources:Set, paths:Set } */
const candidates = new Map();
function addCandidate(fullName, source, meta = null, path = null) {
  if (!fullName || !/^[\w.-]+\/[\w.-]+$/.test(fullName)) return;
  const key = fullName.toLowerCase().replace(/\.git$/, '');
  const c = candidates.get(key) || { name: fullName.replace(/\.git$/, ''), meta: null, sources: new Set(), paths: new Set() };
  if (meta) c.meta = meta;
  c.sources.add(source);
  if (path) c.paths.add(path);
  candidates.set(key, c);
}

const GH_LINK = /https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)(?:\/(?:tree|blob)\/[^/\s)]+\/([^\s)#?"'>]+))?/g;
function extractGithubLinks(text, source) {
  const found = new Set();
  for (const m of text.matchAll(GH_LINK)) {
    const [, owner, repo, path] = m;
    if (['topics', 'search', 'orgs', 'sponsors', 'apps', 'marketplace', 'features', 'settings'].includes(owner)) continue;
    const full = `${owner}/${repo.replace(/\.git$/, '')}`;
    addCandidate(full, source, null, path ? decodeURIComponent(path).replace(/\/SKILL\.md$/i, '') : null);
    found.add(full);
  }
  return found;
}

// ---------- 1. discovery ----------
console.log('▸ repository search');
const sinceQueries = (cfg.newRepoQueries || []).map((q) => q.replace('{SINCE_14D}', daysAgo(14)));
for (const q of [...(cfg.repoSearchQueries || []), ...sinceQueries].slice(0, QUICK ? 2 : undefined)) {
  const items = await searchRepos(q, limits.searchPagesPerQuery);
  console.log(`  ${items.length.toString().padStart(4)}  ${q}`);
  for (const r of items) addCandidate(r.full_name, 'search', r);
}

if (!QUICK) {
  console.log('▸ code search');
  for (const q of cfg.codeSearchQueries || []) {
    const items = await searchCode(q, 2);
    console.log(`  ${items.length.toString().padStart(4)}  ${q}`);
    for (const it of items) addCandidate(it.repository?.full_name, 'code-search');
  }
}

console.log('▸ awesome lists');
for (const list of cfg.awesomeLists || []) {
  const text = (await rawFile(list, 'HEAD', 'README.md')) || '';
  const n = extractGithubLinks(text, 'awesome-list').size;
  console.log(`  ${n.toString().padStart(4)}  ${list}`);
}

for (const r of cfg.pinnedRepos || []) addCandidate(r, 'pinned');

console.log('▸ community buzz (Hacker News)');
const buzz = [];
if (cfg.buzz?.hackerNewsQueries?.length) {
  const since = Math.floor((Date.now() - (cfg.buzz.days || 30) * 864e5) / 1000);
  const seen = new Set();
  for (const q of cfg.buzz.hackerNewsQueries) {
    const txt = await fetchText(
      `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&numericFilters=created_at_i>${since}&hitsPerPage=50`,
    );
    if (!txt) { console.log(`     -  ${q} (unavailable)`); continue; }
    let hits = [];
    try { hits = JSON.parse(txt).hits || []; } catch {}
    console.log(`  ${hits.length.toString().padStart(4)}  ${q}`);
    for (const h of hits) {
      if (seen.has(h.objectID) || (h.points || 0) < 3) continue;
      seen.add(h.objectID);
      buzz.push({
        title: h.title,
        url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        discussion: `https://news.ycombinator.com/item?id=${h.objectID}`,
        points: h.points || 0,
        comments: h.num_comments || 0,
        date: (h.created_at || '').slice(0, 10),
        source: 'Hacker News',
      });
      if (h.url) extractGithubLinks(h.url, 'buzz');
    }
  }
  buzz.sort((a, b) => b.points - a.points);
}

// ---------- 2. manual submissions (incl. skills hosted outside GitHub) ----------
console.log('▸ submissions');
const external = [];
for (const s of submissions) {
  const gh = [...String(s.url).matchAll(GH_LINK)][0];
  if (gh) {
    const path = gh[3] ? decodeURIComponent(gh[3]).replace(/\/SKILL\.md$/i, '') : null;
    addCandidate(`${gh[1]}/${gh[2]}`, 'submission', null, path);
    continue;
  }
  let name = s.name, description = s.description, flags = [], risk = 'unknown';
  if (!QUICK) {
    const text = await fetchText(s.url);
    if (text) {
      const fm = parseFrontmatter(text).data;
      if (fm.name || fm.description) {
        name = name || fm.name;
        description = description || fm.description;
        ({ flags, risk } = safetySignals(text, []));
      }
    }
  }
  if (!name) continue;
  const text = `${name} ${description || ''} ${(s.tags || []).join(' ')}`;
  external.push({
    id: `ext:${s.url}`,
    name,
    description: (description || '').slice(0, 600),
    url: s.url,
    host: safeHost(s.url),
    repo: null,
    stars: 0,
    categories: s.categories?.length ? s.categories : classify(text),
    flags,
    risk,
    sources: ['submission'],
    added: s.date || today,
    updated: s.date || today,
  });
}
console.log(`  ${submissions.length} submissions, ${external.length} hosted outside GitHub`);

function safeHost(u) { try { return new URL(u).host; } catch { return ''; } }

// ---------- 3. repo metadata + filtering ----------
console.log(`▸ ${candidates.size} candidate repos, fetching missing metadata`);
// The Actions token allows ~1000 REST calls/hour. Keep a reserve; whatever doesn't fit is
// served from cached metadata and refreshed on a later run.
const RESERVE = 120;
const metaCache = state.meta || {};
const needMeta = [...candidates.values()].filter((c) => !c.meta);
needMeta.sort((a, b) => (metaCache[b.name.toLowerCase()]?.stargazers_count || 0) - (metaCache[a.name.toLowerCase()]?.stargazers_count || 0));
let metaFromCache = 0;
await pMap(needMeta, async (c) => {
  if (!QUICK && rate.remaining > RESERVE) c.meta = await getRepo(c.name);
  if (!c.meta && metaCache[c.name.toLowerCase()]) { c.meta = metaCache[c.name.toLowerCase()]; metaFromCache++; }
}, 8);
if (metaFromCache) console.log(`  ${metaFromCache} repos used cached metadata`);

const trusted = (c) => c.sources.has('pinned') || c.sources.has('submission') || c.sources.has('awesome-list');
let repos = [...candidates.values()].filter(
  (c) => c.meta && !c.meta.fork && !c.meta.archived &&
    (trusted(c) || (c.meta.stargazers_count || 0) >= limits.minStarsFromSearch),
);
repos.sort((a, b) => Number(trusted(b)) - Number(trusted(a)) || b.meta.stargazers_count - a.meta.stargazers_count);
repos = repos.slice(0, limits.maxRepos);
console.log(`  keeping ${repos.length} repos`);

// ---------- 4. find & parse SKILL.md in each repo ----------
console.log('▸ scanning repos for SKILL.md');
const slimMeta = (m) => ({
  full_name: m.full_name, stargazers_count: m.stargazers_count, description: m.description, topics: m.topics,
  default_branch: m.default_branch, pushed_at: m.pushed_at, created_at: m.created_at,
  license: m.license ? { spdx_id: m.license.spdx_id } : null, fork: m.fork, archived: m.archived,
});
// Bump when the per-skill cache shape changes; older caches are rescanned once.
const STATE_VERSION = 2;
const cacheValid = state.version === STATE_VERSION;
const nextState = { version: STATE_VERSION, repos: {}, meta: Object.fromEntries([...candidates.values()].filter((c) => c.meta).map((c) => [c.name.toLowerCase(), slimMeta(c.meta)])) };
let reused = 0;
let deferred = 0;
let codeFallbacks = QUICK ? 8 : 20;
const repoSkills = await pMap(repos, async (c) => {
  const m = c.meta;
  const full = m.full_name;
  const prev = state.repos[full];
  if (cacheValid && prev && prev.pushedAt === m.pushed_at && Array.isArray(prev.skills)) {
    reused++;
    nextState.repos[full] = prev;
    return prev.skills;
  }
  if (rate.remaining <= RESERVE) {
    // Out of budget: keep last known skills (if any) and rescan next run.
    deferred++;
    if (prev) nextState.repos[full] = { ...prev, pushedAt: null };
    return prev?.skills || [];
  }
  const ref = m.default_branch || 'HEAD';
  const tree = await getTree(full, ref);
  let blobs = tree?.tree?.filter((t) => t.type === 'blob').map((t) => t.path);
  if (!blobs && codeFallbacks-- > 0) {
    // Tree unavailable: fall back to code search for SKILL.md paths (sibling files unknown).
    blobs = (await searchCode(`filename:SKILL.md repo:${full}`, 1)).map((it) => it.path);
  }
  if (!blobs?.length) { if (prev) nextState.repos[full] = prev; return prev?.skills || []; }
  let skillFiles = blobs.filter(
    (p) => /(^|\/)skill\.md$/i.test(p) && !/(^|\/)(node_modules|\.git|vendor|dist|build|test|tests|fixtures|templates?)\//i.test(p),
  );
  if (c.paths.size) {
    // Links that point at a specific folder get priority.
    const wanted = [...c.paths];
    skillFiles.sort((a, b) => Number(wanted.some((w) => b.startsWith(w))) - Number(wanted.some((w) => a.startsWith(w))));
  }
  skillFiles = skillFiles.slice(0, limits.maxSkillsPerRepo);
  const parsed = await pMap(skillFiles, async (path) => {
    const text = await rawFile(full, ref, path);
    if (!text) return null;
    const { data } = parseFrontmatter(text);
    const dir = posix.dirname(path) === '.' ? '' : posix.dirname(path);
    const name = String(data.name || posix.basename(dir) || m.name).slice(0, 80);
    const description = String(data.description || '').replace(/\s+/g, ' ').trim();
    if (!description) return null;
    const siblings = blobs.filter((b) => (dir ? b.startsWith(dir + '/') : !b.includes('/'))).map((b) => (dir ? b.slice(dir.length + 1) : b));
    const { flags, risk } = safetySignals(text, siblings);
    return {
      name,
      description: description.slice(0, 600),
      path: dir,
      files: siblings.length,
      fileList: siblings.slice(0, 60),
      file: posix.basename(path) !== 'SKILL.md' ? posix.basename(path) : undefined,
      flags,
      risk,
      license: data.license ? String(data.license).slice(0, 40) : undefined,
    };
  }, 10);
  const skills = parsed.filter(Boolean);
  nextState.repos[full] = { pushedAt: m.pushed_at, skills };
  if (process.env.VERBOSE) console.log(`  ${String(skills.length).padStart(4)}/${skillFiles.length}  ${full}`);
  return skills;
}, 6);
console.log(`  ${reused} repos unchanged since last run (reused), ${deferred} deferred to next run (API budget)`);

// ---------- 5. stars history & trends ----------
const historyCutoff = daysAgo(limits.historyDays || 45);
const nextHistory = {};
for (const c of repos) {
  const full = c.meta.full_name;
  const h = { ...(history[full] || {}) };
  h[today] = c.meta.stargazers_count;
  for (const d of Object.keys(h)) if (d < historyCutoff) delete h[d];
  nextHistory[full] = h;
}
function trend(full, stars, createdAt) {
  const h = nextHistory[full] || {};
  const dates = Object.keys(h).sort();
  const target = daysAgo(7);
  const base = dates.filter((d) => d <= target).pop() || (dates[0] !== today ? dates[0] : null);
  if (base) {
    const span = Math.max(1, (Date.parse(today) - Date.parse(base)) / 864e5);
    // Less than a week of history: extrapolate the gain to a 7-day rate.
    const gain = stars - h[base];
    return { delta7: Math.round(span >= 7 ? gain : (gain * 7) / span), trendEstimated: span < 7 };
  }
  // No history yet: average weekly stars since creation (only meaningful for young repos).
  const ageDays = Math.max(7, (Date.now() - Date.parse(createdAt)) / 864e5);
  return { delta7: ageDays < 180 ? Math.round((stars / ageDays) * 7) : 0, trendEstimated: true };
}

// ---------- 6. assemble ----------
const byKey = new Map();
repos.forEach((c, i) => {
  const m = c.meta;
  const t = trend(m.full_name, m.stargazers_count, m.created_at);
  for (const s of repoSkills[i] || []) {
    const text = `${s.name.replace(/[_-]/g, ' ')} ${s.description} ${(s.path.split('/').pop() || '').replace(/[_-]/g, ' ')}`;
    const skill = {
      id: `${m.full_name}/${s.path}`.replace(/\/$/, ''),
      name: s.name,
      description: s.description,
      repo: m.full_name,
      path: s.path,
      branch: m.default_branch,
      url: `https://github.com/${m.full_name}${s.path ? `/tree/${m.default_branch}/${s.path}` : ''}`,
      stars: m.stargazers_count,
      delta7: t.delta7,
      trendEstimated: t.trendEstimated || undefined,
      repoSkills: (repoSkills[i] || []).length,
      categories: classify(text, `${(m.topics || []).join(' ').replace(/-/g, ' ')} ${m.description || ''}`),
      flags: s.flags,
      risk: s.risk,
      files: s.files,
      fileList: s.fileList,
      file: s.file,
      license: s.license || m.license?.spdx_id || undefined,
      repoLicense: m.license?.spdx_id && m.license.spdx_id !== 'NOASSERTION' ? m.license.spdx_id : undefined,
      official: /^anthropics\//i.test(m.full_name) || undefined,
      added: state.firstSeen?.[`${m.full_name}/${s.path}`] || today,
      updated: (m.pushed_at || '').slice(0, 10),
    };
    const key = normalizeKey(s.name, s.description);
    const existing = byKey.get(key);
    if (!existing) byKey.set(key, skill);
    else {
      existing.copies = (existing.copies || 1) + 1;
      if (skill.stars > existing.stars) { skill.copies = existing.copies; byKey.set(key, skill); }
    }
  }
});

const skills = [...byKey.values(), ...external];
nextState.firstSeen = Object.fromEntries(skills.filter((s) => s.repo).map((s) => [`${s.repo}/${s.path}`, s.added]));

const catCounts = Object.fromEntries(categories.map((c) => [c.id, 0]));
catCounts.other = 0;
for (const s of skills) for (const c of s.categories) catCounts[c] = (catCounts[c] || 0) + 1;

const output = {
  generatedAt: new Date().toISOString(),
  stats: {
    skills: skills.length,
    repos: repos.length,
    external: external.length,
    newThisWeek: skills.filter((s) => s.added >= daysAgo(7)).length,
  },
  categories: [
    ...categories.map((c) => ({ id: c.id, label: c.label, he: c.he, keywords: c.keywords.slice(0, 12), count: catCounts[c.id] })),
    { id: 'other', label: 'אחר', he: [], keywords: [], count: catCounts.other },
  ],
  skills,
};

if (!QUICK || process.env.WRITE === '1') {
  const pub = await publish(ROOT, output);
  console.log(`  published index: ${pub.skills} skills, ${pub.repos} repos, ${pub.shards} detail files`);
  await writeJson('site/data/buzz.json', { generatedAt: output.generatedAt, items: buzz.slice(0, 60) });
  await writeJson('data/state.json', nextState);
  await writeJson('data/stars-history.json', nextHistory);
}
console.log(`✔ ${skills.length} skills from ${repos.length} repos (+${external.length} external), ${buzz.length} buzz items`);
console.log(`  requests: api=${stats.api} raw=${stats.raw} errors=${stats.errors}`);
