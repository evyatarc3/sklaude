// Tiny GitHub REST client: token auth, rate-limit waits, retries. No dependencies.

const API = 'https://api.github.com';
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const stats = { api: 0, raw: 0, errors: 0 };
/** Remaining core REST quota (search has its own quota). Updated from response headers. */
export const rate = { remaining: Infinity };

// Search endpoints have per-minute limits; serialize calls so concurrent workers can't burst.
const queues = { search: Promise.resolve(), code: Promise.resolve() };
function throttled(kind, gapMs, fn) {
  const run = queues[kind].then(fn);
  queues[kind] = run.catch(() => {}).then(() => sleep(gapMs));
  return run;
}

async function request(url, { accept = 'application/vnd.github+json', raw = false } = {}) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const headers = { Accept: accept, 'User-Agent': 'skills-radar-collector', 'X-GitHub-Api-Version': '2022-11-28' };
    if (token && !raw) headers.Authorization = `Bearer ${token}`;
    let res;
    try {
      res = await fetch(url, { headers });
    } catch (e) {
      if (attempt >= 1) break; // host unreachable: fail fast
      await sleep(1500);
      continue;
    }
    raw ? stats.raw++ : stats.api++;
    if (!raw && !url.includes('/search/')) {
      const rem = res.headers.get('x-ratelimit-remaining');
      if (rem !== null) rate.remaining = Number(rem);
    }
    if (res.ok) return raw ? res.text() : res.json();
    if (res.status === 404 || res.status === 409 || res.status === 451) return null;
    const remaining = res.headers.get('x-ratelimit-remaining');
    const reset = Number(res.headers.get('x-ratelimit-reset') || 0) * 1000;
    const retryAfter = Number(res.headers.get('retry-after') || 0) * 1000;
    if (res.status === 403 || res.status === 429) {
      let wait = retryAfter || (remaining === '0' && reset ? reset - Date.now() + 1500 : 15000 * (attempt + 1));
      if (wait > 10 * 60 * 1000) {
        console.warn(`  rate limit reset too far away (${Math.round(wait / 1000)}s), giving up on ${url}`);
        stats.errors++;
        return null;
      }
      console.warn(`  rate limited, waiting ${Math.round(wait / 1000)}s`);
      await sleep(Math.max(wait, 1000));
      continue;
    }
    if (res.status >= 500) { await sleep(2000 * (attempt + 1)); continue; }
    console.warn(`  HTTP ${res.status} for ${url}`);
    stats.errors++;
    return null;
  }
  stats.errors++;
  return null;
}

export const api = (path) => request(`${API}${path}`);

export async function searchRepos(q, pages = 1) {
  const out = [];
  for (let page = 1; page <= pages; page++) {
    const data = await throttled('search', 2200, () => api(`/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=100&page=${page}`)); // 30/min
    if (!data?.items) break;
    out.push(...data.items);
    if (data.items.length < 100) break;
  }
  return out;
}

export async function searchCode(q, pages = 1) {
  const out = [];
  for (let page = 1; page <= pages; page++) {
    const data = await throttled('code', 6500, () => api(`/search/code?q=${encodeURIComponent(q)}&per_page=100&page=${page}`)); // 10/min
    if (!data?.items) break;
    out.push(...data.items);
    if (data.items.length < 100) break;
  }
  return out;
}

export const getRepo = (fullName) => api(`/repos/${fullName}`);

export const getTree = (fullName, ref) =>
  api(`/repos/${fullName}/git/trees/${encodeURIComponent(ref)}?recursive=1`);

export function rawFile(fullName, ref, path) {
  const p = path.split('/').map(encodeURIComponent).join('/');
  return request(`https://raw.githubusercontent.com/${fullName}/${encodeURIComponent(ref)}/${p}`, { raw: true });
}

export async function fetchText(url) {
  return request(url, { raw: true, accept: 'text/plain, text/markdown, text/html;q=0.5, */*;q=0.1' });
}

export async function pMap(items, fn, concurrency = 8) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try { results[i] = await fn(items[i], i); } catch (e) { results[i] = undefined; stats.errors++; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}
