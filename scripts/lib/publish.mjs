// Writes the public data files for the site:
//   site/data/index.json        compact index for the list + search (loaded on every visit)
//   site/data/hot.json          readable top lists, for tools/skills that don't want to decode the index
//   site/data/repos/<o>__<r>.json  per-repo details (full descriptions, file lists), loaded on a skill page
// Index format (v2) is documented in README.md.

import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

export const FLAGS = ['scripts', 'network', 'secrets', 'destructive', 'obfuscation', 'autorun', 'binary'];
const RISK = { low: 'l', medium: 'm', high: 'h', unknown: 'u' };
export const shardName = (repo) => `${repo.toLowerCase().replace('/', '__')}.json`;

function shorten(text, max) {
  if (!text || text.length <= max) return text || '';
  const cut = text.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return `${cut.slice(0, sp > max * 0.7 ? sp : max).replace(/[\s,.;:—-]+$/, '')}…`;
}

/**
 * @param {string} root repository root
 * @param {{generatedAt:string, stats:object, categories:object[], skills:object[]}} out
 */
export async function publish(root, out, { descMax = 200 } = {}) {
  const dataDir = join(root, 'site/data');
  const shardDir = join(dataDir, 'repos');
  await rm(shardDir, { recursive: true, force: true });
  await rm(join(dataDir, 'skills.json'), { force: true }); // v1 file, replaced by index.json
  await mkdir(shardDir, { recursive: true });

  const catIndex = Object.fromEntries(out.categories.map((c, i) => [c.id, i]));
  const repoIndex = new Map();
  const repos = [];
  const skills = [];
  const external = [];
  const shards = new Map();

  for (const s of out.skills) {
    const flagBits = (s.flags || []).reduce((acc, f) => (FLAGS.includes(f) ? acc | (1 << FLAGS.indexOf(f)) : acc), 0);
    const cats = s.categories.map((c) => catIndex[c]).filter((i) => i != null);
    if (!s.repo) {
      external.push({ id: s.id, name: s.name, description: s.description, url: s.url, host: s.host, c: cats, f: flagBits, k: RISK[s.risk] || 'u', a: s.added });
      continue;
    }
    if (!repoIndex.has(s.repo)) {
      repoIndex.set(s.repo, repos.length);
      // [full_name, stars, delta7, branch, updated, license, official, trendEstimated]
      repos.push([s.repo, s.stars, s.delta7 || 0, s.branch, s.updated, s.repoLicense || '', s.official ? 1 : 0, s.trendEstimated ? 1 : 0]);
    }
    // [repoIdx, path, name|'' , description(short), categoryIdxs, flagBits, risk, added, copies?]
    // name is "" when it equals the folder name (the common case) to avoid storing it twice.
    const folder = s.path.split('/').pop();
    const row = [repoIndex.get(s.repo), s.path, s.name === folder ? '' : s.name, shorten(s.description, descMax), cats, flagBits, RISK[s.risk] || 'u', s.added];
    if (s.copies > 1) row.push(s.copies);
    skills.push(row);

    if (!shards.has(s.repo)) shards.set(s.repo, { repo: s.repo, branch: s.branch, skills: {} });
    shards.get(s.repo).skills[s.path] = {
      description: s.description,
      files: s.fileList || [],
      fileCount: s.files ?? (s.fileList || []).length,
      file: s.file || undefined,
      license: s.license && s.license !== s.repoLicense ? s.license : undefined,
    };
  }

  const index = {
    v: 2,
    generatedAt: out.generatedAt,
    stats: out.stats,
    categories: out.categories,
    flags: FLAGS,
    repos,
    skills,
    external,
  };
  // One record per line keeps daily git diffs small.
  const lines = (arr) => `[\n${arr.map((x) => JSON.stringify(x)).join(',\n')}\n]`;
  const { repos: _r, skills: _s, external: _e, ...head } = index;
  await writeFile(
    join(dataDir, 'index.json'),
    `${JSON.stringify(head).slice(0, -1)},\n"repos":${lines(repos)},\n"skills":${lines(skills)},\n"external":${lines(external)}}\n`,
  );

  for (const [repo, shard] of shards) await writeFile(join(shardDir, shardName(repo)), JSON.stringify(shard) + '\n');

  // Human/LLM-readable shortlists (max 3 per repo so one big collection can't fill a list).
  const readable = (s) => ({
    name: s.name, repo: s.repo, path: s.path, url: s.url, stars: s.stars, gain7d: s.delta7 || 0,
    description: shorten(s.description, 300), categories: s.categories, risk: s.risk, flags: s.flags,
  });
  const top = (sorter, n = 100) => {
    const per = {};
    return out.skills.filter((s) => s.repo).sort(sorter).filter((s) => ((per[s.repo] = (per[s.repo] || 0) + 1) <= 3)).slice(0, n).map(readable);
  };
  await writeFile(join(dataDir, 'hot.json'), JSON.stringify({
    generatedAt: out.generatedAt,
    note: 'Top lists from the Skills Radar index. Full searchable index: index.json (format in README).',
    hot: top((a, b) => (b.delta7 || 0) - (a.delta7 || 0) || b.stars - a.stars),
    top: top((a, b) => b.stars - a.stars),
    newest: top((a, b) => (b.added || '').localeCompare(a.added || '') || b.stars - a.stars, 50),
  }, null, 1) + '\n');

  return { repos: repos.length, skills: skills.length, shards: shards.size };
}
