import { chatJson, CONTENT_GUARD } from '../services/llm.js';
import { fetchPage } from './crawl.js';
import { config } from '../config.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function companyNameFromUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host.split('.')[0];
  } catch {
    return 'company';
  }
}

export async function searchPublicInterviewDiscussion(companyUrl, companyName, onProgress) {
  const name = companyName || companyNameFromUrl(companyUrl);
  const queries = [
    `${name} interview process`,
    `${name} interview experience glassdoor`,
    `${name} how we hire`,
  ];

  const findings = [];
  const notes = [];
  const pagesUsed = [];

  for (const q of queries) {
    onProgress?.({ step: 'public_discussion', message: `Searching: ${q}` });
    await sleep(config.crawl.delayMs);

    // DuckDuckGo HTML endpoint — no API key required
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
    const page = await fetchPage(searchUrl, { allowPrivate: true });
    if (!page.ok) {
      notes.push(`Search failed for "${q}": ${page.error}`);
      continue;
    }

    const links = (page.links || [])
      .filter((l) => {
        const u = l.url.toLowerCase();
        return (
          u.includes('glassdoor') ||
          u.includes('levels.fyi') ||
          u.includes('teamblind') ||
          u.includes('reddit.com') ||
          u.includes('interviewing.io') ||
          u.includes('blind') ||
          (u.includes(name.toLowerCase()) && (u.includes('interview') || l.text.toLowerCase().includes('interview')))
        );
      })
      .slice(0, 3);

    for (const link of links) {
      await sleep(config.crawl.delayMs);
      const detail = await fetchPage(link.url);
      if (!detail.ok) {
        notes.push(`Skipped discussion source ${link.url}: ${detail.error}`);
        continue;
      }
      pagesUsed.push(detail.url);
      findings.push({
        url: detail.url,
        title: detail.title,
        excerpt: detail.text.slice(0, 2500),
      });
      if (findings.length >= 4) break;
    }
    if (findings.length >= 4) break;
  }

  if (findings.length === 0) {
    notes.push('No public interview discussion found');
  }

  return { findings, notes, pagesUsed: [...new Set(pagesUsed)] };
}

export async function extractRequirements(jd, onProgress) {
  onProgress?.({ step: 'extract', message: 'Extracting requirements from job description' });

  const stub = !jd || jd.trim().length < 80;

  const data = await chatJson(
    [
      {
        role: 'system',
        content:
          CONTENT_GUARD +
          '\nYou extract structured role data from a job description. ' +
          'Only extract what is explicitly present. Do not invent requirements. ' +
          'If the description is thin, return few requirements and say so in notes. ' +
          'Respond with JSON only matching the schema.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          schema: {
            role: '',
            title: '',
            seniority: '',
            location: '',
            company: '',
            responsibilities: [''],
            requirements: [
              { id: 'r1', text: '', kind: 'technical|behavioural|domain', priority: 'must|nice' },
            ],
            notes: '',
            thin: false,
          },
          rules: [
            'priority must = required/must-have language; nice = preferred/bonus/nice-to-have',
            'kind: technical skills, behavioural soft skills, or domain knowledge',
            'ids r1, r2, ... sequential',
            'If almost nothing can be extracted, set thin:true and keep requirements short',
          ],
          job_description: jd,
        }),
      },
    ],
    { temperature: 0.1 }
  );

  const requirements = Array.isArray(data.requirements)
    ? data.requirements
        .filter((r) => r && r.text)
        .map((r, i) => ({
          id: r.id || `r${i + 1}`,
          text: String(r.text).trim(),
          kind: ['technical', 'behavioural', 'domain'].includes(r.kind) ? r.kind : 'technical',
          priority: r.priority === 'nice' ? 'nice' : 'must',
        }))
    : [];

  // Ensure unique ids
  const seen = new Set();
  for (let i = 0; i < requirements.length; i++) {
    let id = requirements[i].id || `r${i + 1}`;
    if (seen.has(id)) id = `r${i + 1}`;
    seen.add(id);
    requirements[i].id = id;
  }

  return {
    title: data.title || data.role || 'Unknown role',
    seniority: data.seniority || '',
    location: data.location || '',
    company: data.company || '',
    responsibilities: Array.isArray(data.responsibilities)
      ? data.responsibilities.map(String).filter(Boolean).slice(0, 12)
      : [],
    requirements,
    notes: data.notes || (stub ? 'Job description is very short; kit will be thin.' : ''),
    thin: Boolean(data.thin || stub || requirements.length === 0),
  };
}

export async function generateCompanyBrief({ companyName, companyUrl, crawl, discussion }, onProgress) {
  onProgress?.({ step: 'company_brief', message: 'Writing company brief from retrieved pages' });

  const pageSnippets = (crawl.pages || [])
    .slice(0, 6)
    .map((p) => ({ url: p.url, title: p.title, text: (p.text || '').slice(0, 3000) }));

  const hiringSnippet = crawl.hiringPage
    ? { url: crawl.hiringPage.url, text: (crawl.hiringPage.text || '').slice(0, 4000) }
    : null;

  const data = await chatJson(
    [
      {
        role: 'system',
        content:
          CONTENT_GUARD +
          '\nWrite an honest company brief using ONLY the provided page excerpts. ' +
          'If information is missing, say so plainly. Do not invent products, culture, or hiring processes. ' +
          'JSON only.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          company_name: companyName,
          company_url: companyUrl,
          pages: pageSnippets,
          hiring_page: hiringSnippet,
          public_discussion: (discussion.findings || []).map((f) => ({
            url: f.url,
            excerpt: f.excerpt.slice(0, 1500),
          })),
          crawl_notes: crawl.notes || [],
          schema: {
            summary: '',
            what_they_do: '',
            hiring_notes: '',
            sources: ['https://...'],
          },
        }),
      },
    ],
    { temperature: 0.2 }
  );

  const sources = [
    ...(Array.isArray(data.sources) ? data.sources : []),
    ...(crawl.pagesUsed || []),
  ].filter(Boolean);

  return {
    summary: String(data.summary || 'Limited information available from public pages.').trim(),
    what_they_do: String(data.what_they_do || 'Could not determine what the company does from available sources.').trim(),
    hiring_notes: String(data.hiring_notes || crawl.notes?.join(' ') || '').trim(),
    sources: [...new Set(sources)].slice(0, 12),
  };
}
