import { crawlCompanySite } from './crawl.js';
import { extractRequirements, searchPublicInterviewDiscussion, generateCompanyBrief } from './research.js';
import { generateAllQuestions, generateQuestionsForCategory, generateFlashcards, CATEGORIES } from './generate.js';
import { findUncoveredRequirements } from './coverage.js';
import { allocateSchedule } from './schedule.js';
import { validateKit, toPublicKit } from './validate.js';

const MAX_COVERAGE_PASSES = 2;

/**
 * Full retrieval → generation → coverage loop.
 * Same path used by the HTTP API and `npm run evaluate`.
 */
export async function runPipeline({ jd, company_url, days }, { onProgress } = {}) {
  const progress = (p) => onProgress?.(p);
  const researchNotes = [];

  progress({ step: 'start', message: 'Starting kit generation', percent: 2 });

  // 1. Extract requirements from JD (no retrieval needed)
  const extracted = await extractRequirements(jd, progress);
  progress({ step: 'extract', message: `Found ${extracted.requirements.length} requirements`, percent: 12 });

  // 2. Crawl company site
  progress({ step: 'crawl', message: 'Crawling company site', percent: 18 });
  let crawl;
  try {
    crawl = await crawlCompanySite(company_url, progress);
  } catch (err) {
    crawl = {
      ok: false,
      code: 'COMPANY_UNREACHABLE',
      notes: [err.message],
      pages: [],
      pagesUsed: [],
      hiringPage: null,
      aboutPage: null,
    };
  }

  if (!crawl.ok && crawl.code === 'COMPANY_UNREACHABLE') {
    researchNotes.push(...(crawl.notes || []));
  } else if (!crawl.ok && crawl.code === 'INVALID_URL') {
    // Still produce a thin kit from JD alone — partial research is ok
    researchNotes.push(...(crawl.notes || ['Invalid company URL']));
    crawl = {
      ok: false,
      notes: crawl.notes,
      pages: [],
      pagesUsed: [],
      hiringPage: null,
      aboutPage: null,
    };
  }
  researchNotes.push(...(crawl.notes || []));

  const companyName = extracted.company || guessCompanyName(company_url);

  // 3. Public interview discussion
  progress({ step: 'public_discussion', message: 'Looking for public interview discussion', percent: 35 });
  let discussion = { findings: [], notes: [], pagesUsed: [] };
  try {
    discussion = await searchPublicInterviewDiscussion(company_url, companyName, progress);
    researchNotes.push(...discussion.notes);
  } catch (err) {
    researchNotes.push(`Public discussion search failed: ${err.message}`);
  }

  // 4. Company brief from retrieved pages
  progress({ step: 'company_brief', message: 'Building company brief', percent: 45 });
  let companyBrief;
  try {
    companyBrief = await generateCompanyBrief(
      { companyName, companyUrl: company_url, crawl, discussion },
      progress
    );
  } catch (err) {
    companyBrief = {
      summary: `Limited research available. ${researchNotes.join(' ') || err.message}`,
      what_they_do: 'Could not retrieve reliable company information.',
      hiring_notes: researchNotes.join(' '),
      sources: crawl.pagesUsed || [],
    };
  }

  if (researchNotes.length && !companyBrief.summary.includes('Limited')) {
    // keep honest notes in hiring_notes field (extension; summary stays clean)
    companyBrief.hiring_notes = [companyBrief.hiring_notes, ...researchNotes].filter(Boolean).join(' ');
  }

  const role = {
    title: extracted.title,
    seniority: extracted.seniority,
    responsibilities: extracted.responsibilities,
    requirements: extracted.requirements,
  };

  const discussionNotes = discussion.findings
    .map((f) => `${f.title}: ${f.excerpt.slice(0, 400)}`)
    .join('\n')
    .slice(0, 3000);

  // 5. Generate questions per category (separate calls)
  progress({ step: 'questions', message: 'Generating question bank by category', percent: 55 });
  let questions = [];
  try {
    questions = await generateAllQuestions(
      {
        requirements: role.requirements,
        role,
        companyBrief,
        hiringNotes: companyBrief.hiring_notes || crawl.hiringPage?.text?.slice(0, 2000),
        discussionNotes,
      },
      progress
    );
  } catch (err) {
    researchNotes.push(`Question generation issue: ${err.message}`);
    questions = fallbackQuestions(role.requirements);
  }

  // 6. Coverage loop (deterministic check → generate gaps → check again)
  let passes = 1;
  let uncovered = findUncoveredRequirements(role.requirements, questions, { mustOnly: true });

  while (uncovered.length > 0 && passes < MAX_COVERAGE_PASSES) {
    passes += 1;
    progress({
      step: 'coverage',
      message: `Coverage pass ${passes}: filling ${uncovered.length} gaps`,
      percent: 70 + passes * 5,
    });

    const byKind = groupUncoveredByCategory(role.requirements, uncovered);
    for (const [category, ids] of Object.entries(byKind)) {
      if (!ids.length) continue;
      try {
        const extra = await generateQuestionsForCategory(
          {
            category,
            requirements: role.requirements,
            role,
            companyBrief,
            hiringNotes: companyBrief.hiring_notes,
            discussionNotes,
            existingQuestions: questions,
            gapRequirementIds: ids,
          },
          progress
        );
        questions.push(...extra);
      } catch (err) {
        researchNotes.push(`Gap fill failed for ${category}: ${err.message}`);
      }
    }
    uncovered = findUncoveredRequirements(role.requirements, questions, { mustOnly: true });
  }

  // Last-resort: if still uncovered, add deterministic stub questions so must-haves are covered
  if (uncovered.length > 0) {
    for (const rid of uncovered) {
      const req = role.requirements.find((r) => r.id === rid);
      if (!req) continue;
      questions.push({
        id: `q${questions.length + 1}`,
        requirement_ids: [rid],
        category: req.kind === 'behavioural' ? 'behavioural' : 'technical',
        prompt: `Walk through how you meet this requirement: ${req.text}`,
        answer_outline: `Prepare a concrete example demonstrating: ${req.text}`,
        difficulty: 2,
        origin: 'generated',
        edited: false,
        pinned: false,
      });
    }
    uncovered = findUncoveredRequirements(role.requirements, questions, { mustOnly: true });
  }

  // 7. Flashcards
  progress({ step: 'flashcards', message: 'Creating flashcards', percent: 85 });
  let flashcards = [];
  try {
    flashcards = await generateFlashcards({ requirements: role.requirements, questions, role }, progress);
  } catch {
    flashcards = role.requirements.slice(0, 8).map((r, i) => ({
      id: `f${i + 1}`,
      front: r.text,
      back: `Be ready to demonstrate: ${r.text}`,
      requirement_ids: [r.id],
      origin: 'generated',
      edited: false,
      pinned: false,
      practice: { confidence: null, covered: false, last_seen_at: null },
    }));
  }

  // 8. Schedule (arithmetic — not the model)
  progress({ step: 'schedule', message: 'Allocating study schedule', percent: 92 });
  const schedule = allocateSchedule({
    questions,
    requirements: role.requirements,
    daysAvailable: days,
  });

  const pagesUsed = [
    ...(crawl.pagesUsed || []),
    ...(discussion.pagesUsed || []),
    ...(companyBrief.sources || []),
  ];

  const kit = {
    source: {
      company: companyName,
      company_url,
      role: role.title,
      location: extracted.location || '',
      jd_chars: (jd || '').length,
      researched_at: new Date().toISOString(),
      pages_used: [...new Set(pagesUsed)],
    },
    company_brief: {
      summary: companyBrief.summary,
      what_they_do: companyBrief.what_they_do,
      sources: companyBrief.sources || [],
      hiring_notes: companyBrief.hiring_notes || '',
    },
    role,
    questions,
    flashcards,
    schedule,
    coverage: {
      uncovered_requirement_ids: uncovered,
      passes,
    },
    meta: {
      research_notes: researchNotes,
      thin_jd: extracted.thin,
      hiring_page_found: Boolean(crawl.hiringPage),
    },
  };

  const check = validateKit(kit);
  if (!check.ok) {
    // Attempt to coerce minutes / difficulty
    for (const q of kit.questions) {
      q.difficulty = Math.min(3, Math.max(1, Math.round(Number(q.difficulty) || 2)));
    }
    for (const d of kit.schedule.days) {
      d.minutes = Math.max(0, Math.round(Number(d.minutes) || 0));
    }
    const retry = validateKit(kit);
    if (!retry.ok) {
      const err = new Error(`Generated kit failed validation: ${retry.errors.join('; ')}`);
      err.code = 'INVALID_KIT';
      err.details = retry.errors;
      throw err;
    }
  }

  progress({ step: 'done', message: 'Kit ready', percent: 100 });
  return kit;
}

export async function regenerateSection(kit, section, { category } = {}, { onProgress } = {}) {
  const progress = (p) => onProgress?.(p);

  if (section === 'company_brief') {
    progress({ step: 'company_brief', message: 'Regenerating company brief' });
    const crawl = await crawlCompanySite(kit.source.company_url, progress);
    const discussion = await searchPublicInterviewDiscussion(
      kit.source.company_url,
      kit.source.company,
      progress
    );
    const brief = await generateCompanyBrief(
      {
        companyName: kit.source.company,
        companyUrl: kit.source.company_url,
        crawl,
        discussion,
      },
      progress
    );
    return {
      ...kit,
      company_brief: { ...kit.company_brief, ...brief },
      source: {
        ...kit.source,
        pages_used: [...new Set([...(kit.source.pages_used || []), ...(crawl.pagesUsed || [])])],
        researched_at: new Date().toISOString(),
      },
    };
  }

  if (section === 'questions') {
    const cat = category || 'technical';
    progress({ step: 'questions', message: `Regenerating ${cat} questions` });

    const preserved = (kit.questions || []).filter(
      (q) => q.category !== cat || q.pinned || q.edited || q.origin === 'user'
    );
    const fresh = await generateQuestionsForCategory(
      {
        category: cat,
        requirements: kit.role.requirements,
        role: kit.role,
        companyBrief: kit.company_brief,
        hiringNotes: kit.company_brief.hiring_notes,
        discussionNotes: '',
        existingQuestions: preserved,
      },
      progress
    );

    // Drop old generated (unedited) questions in this category
    const keptOthers = (kit.questions || []).filter(
      (q) => q.category !== cat || q.pinned || q.edited || q.origin === 'user'
    );
    const questions = [...keptOthers, ...fresh];

    let uncovered = findUncoveredRequirements(kit.role.requirements, questions, { mustOnly: true });
    const schedule = allocateSchedule({
      questions,
      requirements: kit.role.requirements,
      daysAvailable: kit.schedule.days_available,
    });

    return {
      ...kit,
      questions,
      schedule,
      coverage: {
        uncovered_requirement_ids: uncovered,
        passes: (kit.coverage?.passes || 1) + 1,
      },
    };
  }

  if (section === 'schedule') {
    progress({ step: 'schedule', message: 'Rebuilding schedule' });
    const schedule = allocateSchedule({
      questions: kit.questions,
      requirements: kit.role.requirements,
      daysAvailable: kit.schedule.days_available,
    });
    return { ...kit, schedule };
  }

  if (section === 'flashcards') {
    progress({ step: 'flashcards', message: 'Regenerating flashcards' });
    const preserved = (kit.flashcards || []).filter((f) => f.pinned || f.edited || f.origin === 'user');
    const fresh = await generateFlashcards(
      { requirements: kit.role.requirements, questions: kit.questions, role: kit.role },
      progress
    );
    const regenerated = fresh.filter((f) => !preserved.some((p) => p.front === f.front));
    // re-id
    const flashcards = [...preserved, ...regenerated].map((f, i) => ({ ...f, id: `f${i + 1}` }));
    return { ...kit, flashcards };
  }

  throw new Error(`Unknown section: ${section}`);
}

function guessCompanyName(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').split('.')[0];
  } catch {
    return '';
  }
}

function groupUncoveredByCategory(requirements, uncoveredIds) {
  const map = Object.fromEntries(CATEGORIES.map((c) => [c, []]));
  for (const id of uncoveredIds) {
    const req = requirements.find((r) => r.id === id);
    if (!req) continue;
    if (req.kind === 'behavioural') map.behavioural.push(id);
    else if (req.kind === 'domain') map.technical.push(id);
    else map.technical.push(id);
  }
  return map;
}

function fallbackQuestions(requirements) {
  return (requirements || []).slice(0, 6).map((r, i) => ({
    id: `q${i + 1}`,
    requirement_ids: [r.id],
    category: r.kind === 'behavioural' ? 'behavioural' : 'technical',
    prompt: `How do you satisfy: ${r.text}?`,
    answer_outline: `Use a specific example related to ${r.text}`,
    difficulty: 2,
    origin: 'generated',
    edited: false,
    pinned: false,
  }));
}

export { toPublicKit, MAX_COVERAGE_PASSES };
