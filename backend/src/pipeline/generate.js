import { chatJson, CONTENT_GUARD } from '../services/llm.js';

const CATEGORIES = ['technical', 'behavioural', 'system-design', 'company-fit'];

function nextId(prefix, existing) {
  let n = 1;
  const ids = new Set(existing);
  while (ids.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

export async function generateQuestionsForCategory({
  category,
  requirements,
  role,
  companyBrief,
  hiringNotes,
  discussionNotes,
  existingQuestions = [],
  gapRequirementIds = null,
}, onProgress) {
  onProgress?.({
    step: 'questions',
    message: gapRequirementIds
      ? `Filling gaps for ${category}`
      : `Generating ${category} questions`,
  });

  const relevant = requirements.filter((r) => {
    if (gapRequirementIds) return gapRequirementIds.includes(r.id);
    if (category === 'technical') return r.kind === 'technical' || r.kind === 'domain';
    if (category === 'behavioural') return r.kind === 'behavioural';
    if (category === 'system-design') return r.kind === 'technical' || r.kind === 'domain';
    if (category === 'company-fit') return true;
    return true;
  });

  if (relevant.length === 0 && category !== 'company-fit') {
    return [];
  }

  const data = await chatJson(
    [
      {
        role: 'system',
        content:
          CONTENT_GUARD +
          `\nYou generate interview questions for the category "${category}" only. ` +
          'Tie each question to one or more requirement ids. ' +
          'Use hiring-process notes when present (e.g. take-home, system design rounds). ' +
          'Do not invent requirements. JSON only.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          category,
          role_title: role.title,
          seniority: role.seniority,
          responsibilities: role.responsibilities,
          requirements: relevant,
          company_summary: companyBrief.summary,
          hiring_notes: hiringNotes || companyBrief.hiring_notes || '',
          public_interview_notes: discussionNotes || '',
          avoid_prompts: existingQuestions.map((q) => q.prompt),
          gap_only: Boolean(gapRequirementIds),
          schema: {
            questions: [
              {
                requirement_ids: ['r1'],
                prompt: '',
                answer_outline: '',
                difficulty: 2,
              },
            ],
          },
          rules: [
            'difficulty 1-3 integer',
            'answer_outline is bullet-style coaching notes, not a full script',
            '2-5 questions unless requirements are very few',
            'Every question must reference at least one provided requirement id when requirements exist',
          ],
        }),
      },
    ],
    { temperature: 0.35 }
  );

  const reqIds = new Set(requirements.map((r) => r.id));
  const out = [];
  const list = Array.isArray(data.questions) ? data.questions : [];

  for (const q of list) {
    if (!q?.prompt) continue;
    const linked = (Array.isArray(q.requirement_ids) ? q.requirement_ids : [])
      .map(String)
      .filter((id) => reqIds.has(id));
    if (requirements.length > 0 && linked.length === 0 && category !== 'company-fit') continue;

    const id = nextId('q', [...existingQuestions, ...out].map((x) => x.id));
    const difficulty = Math.min(3, Math.max(1, Number.parseInt(q.difficulty, 10) || 2));
    out.push({
      id,
      requirement_ids: linked.length ? linked : relevant.slice(0, 1).map((r) => r.id).filter(Boolean),
      category,
      prompt: String(q.prompt).trim(),
      answer_outline: String(q.answer_outline || '').trim(),
      difficulty,
      origin: 'generated',
      edited: false,
      pinned: false,
    });
  }

  return out;
}

export async function generateAllQuestions(ctx, onProgress) {
  const questions = [];
  for (const category of CATEGORIES) {
    const batch = await generateQuestionsForCategory(
      {
        category,
        requirements: ctx.requirements,
        role: ctx.role,
        companyBrief: ctx.companyBrief,
        hiringNotes: ctx.hiringNotes,
        discussionNotes: ctx.discussionNotes,
        existingQuestions: questions,
      },
      onProgress
    );
    questions.push(...batch);
  }
  return questions;
}

export async function generateFlashcards({ requirements, questions, role }, onProgress) {
  onProgress?.({ step: 'flashcards', message: 'Creating flashcards' });

  const data = await chatJson(
    [
      {
        role: 'system',
        content:
          CONTENT_GUARD +
          '\nCreate concise study flashcards linked to requirement ids. JSON only.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          role: role.title,
          requirements,
          sample_questions: questions.slice(0, 12).map((q) => ({
            prompt: q.prompt,
            requirement_ids: q.requirement_ids,
          })),
          schema: {
            flashcards: [{ front: '', back: '', requirement_ids: ['r1'] }],
          },
          rules: ['6-14 cards', 'front is a cue/question, back is a short answer', 'link to real requirement ids'],
        }),
      },
    ],
    { temperature: 0.3 }
  );

  const reqIds = new Set(requirements.map((r) => r.id));
  const cards = [];
  for (const f of Array.isArray(data.flashcards) ? data.flashcards : []) {
    if (!f?.front) continue;
    const linked = (Array.isArray(f.requirement_ids) ? f.requirement_ids : [])
      .map(String)
      .filter((id) => reqIds.has(id));
    cards.push({
      id: `f${cards.length + 1}`,
      front: String(f.front).trim(),
      back: String(f.back || '').trim(),
      requirement_ids: linked,
      origin: 'generated',
      edited: false,
      pinned: false,
      practice: { confidence: null, covered: false, last_seen_at: null },
    });
  }
  return cards;
}

export { CATEGORIES };
