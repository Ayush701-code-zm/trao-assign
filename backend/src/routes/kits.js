import { Router } from 'express';
import { Kit, fingerprint } from '../models/Kit.js';
import { requireAuth } from '../middleware/auth.js';
import { runPipeline, regenerateSection } from '../pipeline/index.js';
import { allocateSchedule } from '../pipeline/schedule.js';
import { findUncoveredRequirements } from '../pipeline/coverage.js';
import { validateKit } from '../pipeline/validate.js';

const router = Router();
router.use(requireAuth);

const running = new Set();

function parseDays(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(60, n);
}

async function startGeneration(kitDoc) {
  const id = String(kitDoc._id);
  if (running.has(id)) return;
  running.add(id);

  try {
    kitDoc.status = 'running';
    kitDoc.progress = { step: 'start', message: 'Starting…', percent: 1 };
    kitDoc.error = undefined;
    await kitDoc.save();

    const data = await runPipeline(
      {
        jd: kitDoc.input.jd,
        company_url: kitDoc.input.company_url,
        days: kitDoc.input.days,
      },
      {
        onProgress: async (p) => {
          await Kit.updateOne(
            { _id: kitDoc._id },
            { $set: { progress: { step: p.step, message: p.message, percent: p.percent || 0 } } }
          );
        },
      }
    );

    const check = validateKit(data);
    if (!check.ok) {
      throw Object.assign(new Error(check.errors.join('; ')), { code: 'INVALID_KIT' });
    }

    kitDoc.data = data;
    kitDoc.title = `${data.role?.title || 'Role'} @ ${data.source?.company || 'Company'}`;
    kitDoc.status = 'ready';
    kitDoc.progress = { step: 'done', message: 'Ready', percent: 100 };
    await kitDoc.save();
  } catch (err) {
    kitDoc.status = 'failed';
    kitDoc.error = {
      code: err.code || 'GENERATION_FAILED',
      message: err.message || 'Generation failed',
    };
    kitDoc.progress = { step: 'failed', message: kitDoc.error.message, percent: 100 };
    await kitDoc.save();
  } finally {
    running.delete(id);
  }
}

router.get('/', async (req, res) => {
  const kits = await Kit.find({ userId: req.userId })
    .select('title status progress error input.company_url input.days createdAt updatedAt data.source data.role.title')
    .sort({ updatedAt: -1 })
    .lean();
  res.json({
    kits: kits.map((k) => ({
      id: k._id,
      title: k.title,
      status: k.status,
      progress: k.progress,
      error: k.error,
      company_url: k.input?.company_url,
      days: k.input?.days,
      role: k.data?.role?.title || k.data?.source?.role,
      company: k.data?.source?.company,
      createdAt: k.createdAt,
      updatedAt: k.updatedAt,
    })),
  });
});

router.post('/', async (req, res) => {
  try {
    const jd = String(req.body.jd || '').trim();
    const company_url = String(req.body.company_url || '').trim();
    const days = parseDays(req.body.days);

    if (!jd || !company_url) {
      return res.status(400).json({
        error: { code: 'VALIDATION', message: 'jd and company_url are required' },
      });
    }

    const fp = fingerprint(jd, company_url);
    const duplicate = await Kit.findOne({
      userId: req.userId,
      'input.fingerprint': fp,
      status: { $in: ['queued', 'running', 'ready'] },
    }).sort({ createdAt: -1 });

    if (duplicate && req.body.force !== true) {
      return res.status(200).json({
        kit: serialize(duplicate),
        duplicate: true,
        message: 'An existing kit for this description and company was reused. Pass force:true to create another.',
      });
    }

    const kit = await Kit.create({
      userId: req.userId,
      status: 'queued',
      title: 'Generating…',
      input: { jd, company_url, days, fingerprint: fp },
      progress: { step: 'queued', message: 'Queued', percent: 0 },
    });

    setImmediate(() => startGeneration(kit));
    res.status(201).json({ kit: serialize(kit) });
  } catch (err) {
    res.status(500).json({ error: { code: 'SERVER', message: err.message } });
  }
});

router.post('/batch', async (req, res) => {
  try {
    let cases = req.body.cases;
    if (typeof req.body.raw === 'string') {
      cases = JSON.parse(req.body.raw);
    }
    if (!Array.isArray(cases) || cases.length === 0) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'cases array required' } });
    }

    const created = [];
    for (const c of cases.slice(0, 20)) {
      const jd = String(c.jd || '').trim();
      const company_url = String(c.company_url || '').trim();
      const days = parseDays(c.days);
      if (!jd || !company_url) continue;

      const kit = await Kit.create({
        userId: req.userId,
        status: 'queued',
        title: c.id || 'Batch kit',
        input: { jd, company_url, days, fingerprint: fingerprint(jd, company_url) },
        progress: { step: 'queued', message: 'Queued', percent: 0 },
      });
      created.push(kit);
      setImmediate(() => startGeneration(kit));
    }

    res.status(201).json({ kits: created.map(serialize) });
  } catch (err) {
    res.status(500).json({ error: { code: 'SERVER', message: err.message } });
  }
});

router.get('/:id', async (req, res) => {
  const kit = await Kit.findOne({ _id: req.params.id, userId: req.userId });
  if (!kit) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Kit not found' } });
  res.json({ kit: serialize(kit) });
});

router.delete('/:id', async (req, res) => {
  const result = await Kit.deleteOne({ _id: req.params.id, userId: req.userId });
  if (!result.deletedCount) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Kit not found' } });
  }
  res.json({ ok: true });
});

router.patch('/:id', async (req, res) => {
  const kit = await Kit.findOne({ _id: req.params.id, userId: req.userId });
  if (!kit) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Kit not found' } });
  if (kit.status !== 'ready' || !kit.data) {
    return res.status(409).json({ error: { code: 'NOT_READY', message: 'Kit is not ready to edit' } });
  }

  const data = structuredClone(kit.data);

  if (req.body.company_brief) {
    data.company_brief = { ...data.company_brief, ...req.body.company_brief };
  }
  if (req.body.role) {
    data.role = { ...data.role, ...req.body.role };
  }
  if (Array.isArray(req.body.questions)) {
    data.questions = req.body.questions.map(markEditedIfNeeded(data.questions));
  }
  if (Array.isArray(req.body.flashcards)) {
    data.flashcards = req.body.flashcards.map(markEditedIfNeeded(data.flashcards, 'front'));
  }
  if (req.body.schedule) {
    data.schedule = req.body.schedule;
  }

  data.coverage = {
    uncovered_requirement_ids: findUncoveredRequirements(data.role.requirements, data.questions, {
      mustOnly: true,
    }),
    passes: data.coverage?.passes || 1,
  };

  const check = validateKit(data);
  if (!check.ok) {
    return res.status(400).json({ error: { code: 'INVALID_KIT', message: check.errors.join('; ') } });
  }

  kit.data = data;
  kit.markModified('data');
  await kit.save();
  res.json({ kit: serialize(kit) });
});

router.post('/:id/regenerate', async (req, res) => {
  const kit = await Kit.findOne({ _id: req.params.id, userId: req.userId });
  if (!kit) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Kit not found' } });
  if (!kit.data) {
    return res.status(409).json({ error: { code: 'NOT_READY', message: 'Nothing to regenerate yet' } });
  }

  const section = String(req.body.section || '');
  const category = req.body.category ? String(req.body.category) : undefined;

  try {
    kit.status = 'running';
    kit.progress = { step: 'regenerate', message: `Regenerating ${section}`, percent: 10 };
    await kit.save();

    const next = await regenerateSection(kit.data, section, { category }, {
      onProgress: async (p) => {
        await Kit.updateOne(
          { _id: kit._id },
          { $set: { progress: { step: p.step, message: p.message, percent: p.percent || 50 } } }
        );
      },
    });

    const check = validateKit(next);
    if (!check.ok) {
      throw Object.assign(new Error(check.errors.join('; ')), { code: 'INVALID_KIT' });
    }

    kit.data = next;
    kit.status = 'ready';
    kit.progress = { step: 'done', message: 'Ready', percent: 100 };
    kit.markModified('data');
    await kit.save();
    res.json({ kit: serialize(kit) });
  } catch (err) {
    kit.status = 'ready';
    kit.progress = { step: 'done', message: 'Ready (regeneration failed)', percent: 100 };
    await kit.save();
    res.status(500).json({ error: { code: err.code || 'REGENERATE_FAILED', message: err.message } });
  }
});

router.post('/:id/practice', async (req, res) => {
  const kit = await Kit.findOne({ _id: req.params.id, userId: req.userId });
  if (!kit?.data) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Kit not found' } });

  const { flashcard_id, confidence } = req.body;
  const card = (kit.data.flashcards || []).find((f) => f.id === flashcard_id);
  if (!card) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Flashcard not found' } });

  const conf = Math.min(5, Math.max(1, Number.parseInt(confidence, 10) || 3));
  card.practice = {
    confidence: conf,
    covered: true,
    last_seen_at: new Date().toISOString(),
  };
  kit.markModified('data');
  await kit.save();
  res.json({ kit: serialize(kit), next_order: practiceOrder(kit.data.flashcards) });
});

router.get('/:id/practice-order', async (req, res) => {
  const kit = await Kit.findOne({ _id: req.params.id, userId: req.userId });
  if (!kit?.data) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Kit not found' } });
  res.json({ order: practiceOrder(kit.data.flashcards), weak_spots: weakSpotsReport(kit.data) });
});

router.get('/:id/weak-spots', async (req, res) => {
  const kit = await Kit.findOne({ _id: req.params.id, userId: req.userId });
  if (!kit?.data) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Kit not found' } });
  res.json({ report: weakSpotsReport(kit.data) });
});

router.post('/:id/reschedule', async (req, res) => {
  const kit = await Kit.findOne({ _id: req.params.id, userId: req.userId });
  if (!kit?.data) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Kit not found' } });
  const days = parseDays(req.body.days ?? kit.data.schedule.days_available);
  kit.data.schedule = allocateSchedule({
    questions: kit.data.questions,
    requirements: kit.data.role.requirements,
    daysAvailable: days,
  });
  kit.input.days = days;
  kit.markModified('data');
  await kit.save();
  res.json({ kit: serialize(kit) });
});

function serialize(kit) {
  const obj = kit.toObject ? kit.toObject() : kit;
  return {
    id: obj._id,
    title: obj.title,
    status: obj.status,
    progress: obj.progress,
    error: obj.error || null,
    input: {
      company_url: obj.input?.company_url,
      days: obj.input?.days,
      jd_chars: obj.input?.jd?.length || 0,
    },
    data: obj.data,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

function markEditedIfNeeded(previous = [], key = 'prompt') {
  const prevMap = new Map(previous.map((p) => [p.id, p]));
  return (item) => {
    const old = prevMap.get(item.id);
    const edited =
      item.edited ||
      item.origin === 'user' ||
      (old && old[key] !== item[key]) ||
      (old && old.answer_outline !== item.answer_outline) ||
      (old && old.back !== item.back);
    return {
      ...item,
      origin: item.origin === 'user' || !old ? item.origin || (old ? old.origin : 'user') : old.origin || 'generated',
      edited: Boolean(edited || item.pinned),
      pinned: Boolean(item.pinned),
    };
  };
}

/** Confidence-weighted order: uncovered first, then lowest confidence. */
export function practiceOrder(flashcards = []) {
  return [...flashcards]
    .map((f, index) => ({
      id: f.id,
      covered: Boolean(f.practice?.covered),
      confidence: f.practice?.confidence ?? 0,
      index,
    }))
    .sort((a, b) => {
      if (a.covered !== b.covered) return a.covered ? 1 : -1;
      if (a.confidence !== b.confidence) return a.confidence - b.confidence;
      return a.index - b.index;
    })
    .map((x) => x.id);
}

/** Creative feature: weak-spots report */
export function weakSpotsReport(data) {
  const cards = data.flashcards || [];
  const low = cards.filter((c) => c.practice?.covered && (c.practice.confidence || 5) <= 2);
  const uncovered = cards.filter((c) => !c.practice?.covered);
  const reqCoverage = findUncoveredRequirements(data.role?.requirements || [], data.questions || [], {
    mustOnly: true,
  });

  const reqText = (id) => data.role?.requirements?.find((r) => r.id === id)?.text || id;

  return {
    low_confidence_cards: low.map((c) => ({
      id: c.id,
      front: c.front,
      confidence: c.practice.confidence,
      requirement_ids: c.requirement_ids,
    })),
    uncovered_cards: uncovered.map((c) => ({ id: c.id, front: c.front })),
    uncovered_must_requirements: reqCoverage.map((id) => ({ id, text: reqText(id) })),
    suggested_focus: [
      ...low.slice(0, 3).map((c) => `Revisit: ${c.front}`),
      ...reqCoverage.slice(0, 3).map((id) => `Drill requirement: ${reqText(id)}`),
    ],
    score: Math.max(
      0,
      100 -
        low.length * 8 -
        Math.round((uncovered.length / Math.max(cards.length, 1)) * 40) -
        reqCoverage.length * 10
    ),
  };
}

export default router;
