import { z } from 'zod';

const requirementSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  kind: z.enum(['technical', 'behavioural', 'domain']),
  priority: z.enum(['must', 'nice']),
});

const questionSchema = z.object({
  id: z.string().min(1),
  requirement_ids: z.array(z.string()),
  category: z.enum(['technical', 'behavioural', 'system-design', 'company-fit']),
  prompt: z.string().min(1),
  answer_outline: z.string(),
  difficulty: z.number().int().min(1).max(3),
});

const flashcardSchema = z.object({
  id: z.string().min(1),
  front: z.string().min(1),
  back: z.string(),
  requirement_ids: z.array(z.string()),
});

const daySchema = z.object({
  day: z.number().int().positive(),
  focus: z.string(),
  question_ids: z.array(z.string()),
  minutes: z.number().int().nonnegative(),
});

export const kitSchema = z.object({
  source: z.object({
    company: z.string(),
    company_url: z.string(),
    role: z.string(),
    location: z.string(),
    jd_chars: z.number().int().nonnegative(),
    researched_at: z.string(),
    pages_used: z.array(z.string()),
  }),
  company_brief: z.object({
    summary: z.string(),
    what_they_do: z.string(),
    sources: z.array(z.string()),
  }),
  role: z.object({
    title: z.string(),
    seniority: z.string(),
    responsibilities: z.array(z.string()),
    requirements: z.array(requirementSchema),
  }),
  questions: z.array(questionSchema),
  flashcards: z.array(flashcardSchema),
  schedule: z.object({
    days_available: z.number().int().positive(),
    days: z.array(daySchema),
  }),
  coverage: z.object({
    uncovered_requirement_ids: z.array(z.string()),
    passes: z.number().int().positive(),
  }),
});

export function validateKit(kit) {
  const parsed = kitSchema.safeParse(stripExtensions(kit));
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
  }

  const qIds = new Set(kit.questions.map((q) => q.id));
  const reqIds = new Set(kit.role.requirements.map((r) => r.id));

  const errors = [];
  for (const q of kit.questions) {
    for (const rid of q.requirement_ids) {
      if (!reqIds.has(rid)) errors.push(`question ${q.id} references missing requirement ${rid}`);
    }
  }
  for (const day of kit.schedule.days) {
    if (!Number.isInteger(day.minutes)) errors.push(`day ${day.day} minutes must be integer`);
    for (const qid of day.question_ids) {
      if (!qIds.has(qid)) errors.push(`schedule day ${day.day} references missing question ${qid}`);
    }
  }
  if (kit.schedule.days.length !== kit.schedule.days_available) {
    errors.push('schedule days length must equal days_available');
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], kit: parsed.data };
}

function stripExtensions(kit) {
  return {
    ...kit,
    company_brief: {
      summary: kit.company_brief?.summary ?? '',
      what_they_do: kit.company_brief?.what_they_do ?? '',
      sources: kit.company_brief?.sources ?? [],
    },
    questions: (kit.questions || []).map(({ id, requirement_ids, category, prompt, answer_outline, difficulty }) => ({
      id,
      requirement_ids,
      category,
      prompt,
      answer_outline,
      difficulty,
    })),
    flashcards: (kit.flashcards || []).map(({ id, front, back, requirement_ids }) => ({
      id,
      front,
      back,
      requirement_ids,
    })),
  };
}

/** Public kit shape for Appendix A / batch output (no internal flags). */
export function toPublicKit(kit) {
  return {
    source: kit.source,
    company_brief: {
      summary: kit.company_brief.summary,
      what_they_do: kit.company_brief.what_they_do,
      sources: kit.company_brief.sources || [],
    },
    role: kit.role,
    questions: (kit.questions || []).map(({ id, requirement_ids, category, prompt, answer_outline, difficulty }) => ({
      id,
      requirement_ids,
      category,
      prompt,
      answer_outline,
      difficulty,
    })),
    flashcards: (kit.flashcards || []).map(({ id, front, back, requirement_ids }) => ({
      id,
      front,
      back,
      requirement_ids,
    })),
    schedule: kit.schedule,
    coverage: kit.coverage,
  };
}
