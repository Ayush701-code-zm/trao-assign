import * as cheerio from 'cheerio';
import robotsParser from 'robots-parser';
import { config } from '../config.js';
import { assertSafeUrl, resolveUrl } from '../services/urlSafety.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HIRING_HINTS = [
  'career', 'careers', 'job', 'jobs', 'hiring', 'join', 'join-us', 'joinus',
  'work-with', 'work-with-us', 'opportunities', 'openings', 'vacancies',
  'handbook', 'culture', 'values', 'engineering', 'blog', 'about', 'team',
  'life-at', 'people', 'talent', 'recruit',
];

const ABOUT_HINTS = ['about', 'company', 'who-we-are', 'what-we-do', 'mission', 'product', 'platform'];

function scoreLink(url, text = '') {
  const u = url.toLowerCase();
  const t = (text || '').toLowerCase();
  let score = 0;
  for (const h of HIRING_HINTS) {
    if (u.includes(h) || t.includes(h)) score += h.includes('career') || h.includes('hiring') || h === 'jobs' ? 8 : 4;
  }
  for (const h of ABOUT_HINTS) {
    if (u.includes(`/${h}`) || t.includes(h)) score += 3;
  }
  if (u.includes('interview') || t.includes('interview process')) score += 10;
  if (u.includes('how-we-hire') || u.includes('hiring-process')) score += 12;
  if (/\.(pdf|jpg|png|gif|svg|zip|css|js)(\?|$)/i.test(u)) score -= 20;
  if (u.includes('login') || u.includes('signin') || u.includes('privacy') || u.includes('cookie')) score -= 5;
  return score;
}

export async function fetchPage(url, { allowPrivate = config.allowPrivateUrls } = {}) {
  const safe = await assertSafeUrl(url, { allowPrivate });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.crawl.timeoutMs);

  try {
    const res = await fetch(safe.href, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'InterviewPrepKitBot/1.0 (+research for interview preparation; respectful crawling)',
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1',
      },
    });

    if (!res.ok) {
      return { ok: false, url: safe.href, status: res.status, error: `HTTP ${res.status}`, text: '', title: '', links: [] };
    }

    const ctype = (res.headers.get('content-type') || '').toLowerCase();
    if (!ctype.includes('text/html') && !ctype.includes('text/plain') && !ctype.includes('application/xhtml')) {
      return { ok: false, url: safe.href, status: res.status, error: `Unsupported content-type: ${ctype}`, text: '', title: '', links: [] };
    }

    const buf = await res.arrayBuffer();
    if (buf.byteLength > config.crawl.maxBytes) {
      return { ok: false, url: safe.href, status: res.status, error: 'Page too large', text: '', title: '', links: [] };
    }

    const html = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    if (ctype.includes('text/plain') && !ctype.includes('html')) {
      const text = html.slice(0, 20_000);
      return { ok: true, url: safe.href, status: res.status, title: '', text, links: [], error: null };
    }
    const cleaned = cleanHtml(html, safe.href);
    return { ok: true, url: safe.href, status: res.status, ...cleaned, error: null };
  } catch (err) {
    const message = err.name === 'AbortError' ? 'Request timed out' : err.message || 'Fetch failed';
    return { ok: false, url: safe.href, status: 0, error: message, text: '', title: '', links: [] };
  } finally {
    clearTimeout(timer);
  }
}

export function cleanHtml(html, baseUrl) {
  const $ = cheerio.load(html);
  $('script, style, noscript, svg, iframe, nav, footer, header form').remove();
  const title = ($('title').first().text() || $('h1').first().text() || '').trim().slice(0, 200);

  const links = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().replace(/\s+/g, ' ').trim().slice(0, 120);
    const absolute = resolveUrl(baseUrl, href);
    if (!absolute) return;
    try {
      const u = new URL(absolute);
      if (!['http:', 'https:'].includes(u.protocol)) return;
      links.push({ url: u.href, text, score: scoreLink(u.href, text) });
    } catch {
      /* skip */
    }
  });

  const text = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 20_000);
  return { title, text, links };
}

async function loadRobots(origin) {
  try {
    const robotsUrl = new URL('/robots.txt', origin).href;
    const page = await fetchPage(robotsUrl);
    if (!page.ok || !page.text) return null;
    return robotsParser(robotsUrl, page.text);
  } catch {
    return null;
  }
}

export async function crawlCompanySite(companyUrl, onProgress) {
  const notes = [];
  const pagesUsed = [];
  let origin;
  try {
    const u = await assertSafeUrl(companyUrl);
    origin = u.origin;
  } catch (err) {
    return {
      ok: false,
      code: err.code || 'INVALID_URL',
      notes: [err.message],
      pages: [],
      pagesUsed: [],
      hiringPage: null,
      aboutPage: null,
    };
  }

  const home = await fetchPage(companyUrl);
  if (!home.ok) {
    notes.push(`Homepage unreachable: ${home.error || home.status}`);
    return {
      ok: false,
      code: 'COMPANY_UNREACHABLE',
      notes,
      pages: [],
      pagesUsed: [],
      hiringPage: null,
      aboutPage: null,
    };
  }

  pagesUsed.push(home.url);
  onProgress?.({ step: 'crawl', message: `Fetched homepage: ${home.title || home.url}` });

  const robots = await loadRobots(origin);
  const allowed = (url) => {
    if (!robots) return true;
    try {
      return robots.isAllowed(url, 'InterviewPrepKitBot') !== false;
    } catch {
      return true;
    }
  };

  const candidates = new Map();
  for (const link of home.links) {
    try {
      const u = new URL(link.url);
      if (u.origin !== origin) continue;
      if (!allowed(link.url)) continue;
      const prev = candidates.get(link.url);
      if (!prev || link.score > prev.score) candidates.set(link.url, link);
    } catch {
      /* skip */
    }
  }

  const ranked = [...candidates.values()].sort((a, b) => b.score - a.score).slice(0, config.crawl.maxPages);
  const pages = [{ url: home.url, title: home.title, text: home.text, score: 1 }];

  let hiringPage = null;
  let aboutPage = null;

  for (const link of ranked) {
    await sleep(config.crawl.delayMs);
    if (!allowed(link.url)) {
      notes.push(`Skipped (robots.txt): ${link.url}`);
      continue;
    }
    const page = await fetchPage(link.url);
    if (!page.ok) {
      notes.push(`Skipped ${link.url}: ${page.error || page.status}`);
      continue;
    }
    pages.push({ url: page.url, title: page.title, text: page.text, score: link.score });
    pagesUsed.push(page.url);
    onProgress?.({ step: 'crawl', message: `Fetched ${page.title || page.url}` });

    const lower = `${page.url} ${page.title} ${page.text.slice(0, 500)}`.toLowerCase();
    if (!hiringPage && (link.score >= 8 || /hiring|interview process|careers|how we hire|recruiting/.test(lower))) {
      hiringPage = page;
    }
    if (!aboutPage && /about|what we do|mission|product/.test(lower) && link.score >= 3) {
      aboutPage = page;
    }
  }

  if (!hiringPage) {
    const best = pages
      .slice(1)
      .filter((p) => scoreLink(p.url, p.title) >= 4)
      .sort((a, b) => scoreLink(b.url, b.title) - scoreLink(a.url, a.title))[0];
    if (best) hiringPage = best;
    else notes.push('No discoverable hiring page found');
  }

  if (!aboutPage) aboutPage = home;

  return {
    ok: true,
    code: null,
    notes,
    pages,
    pagesUsed: [...new Set(pagesUsed)],
    hiringPage,
    aboutPage,
    home,
  };
}
