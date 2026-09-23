import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { allocateSchedule } from '../src/pipeline/schedule.js';
import { findUncoveredRequirements, coverageReport } from '../src/pipeline/coverage.js';
import { validateKit, toPublicKit } from '../src/pipeline/validate.js';

describe('schedule allocation', () => {
  const requirements = [
    { id: 'r1', text: 'React', kind: 'technical', priority: 'must' },
    { id: 'r2', text: 'Mentoring', kind: 'behavioural', priority: 'must' },
    { id: 'r3', text: 'Go', kind: 'technical', priority: 'nice' },
  ];
  const questions = [
    { id: 'q1', requirement_ids: ['r1'], category: 'technical', prompt: 'React?', answer_outline: '', difficulty: 3 },
    { id: 'q2', requirement_ids: ['r2'], category: 'behavioural', prompt: 'Mentor?', answer_outline: '', difficulty: 2 },
    { id: 'q3', requirement_ids: ['r3'], category: 'technical', prompt: 'Go?', answer_outline: '', difficulty: 1 },
    { id: 'q4', requirement_ids: ['r1'], category: 'system-design', prompt: 'Design?', answer_outline: '', difficulty: 3 },
  ];

  it('emits exactly the requested number of days', () => {
    const s = allocateSchedule({ questions, requirements, daysAvailable: 5 });
    assert.equal(s.days_available, 5);
    assert.equal(s.days.length, 5);
    s.days.forEach((d, i) => assert.equal(d.day, i + 1));
  });

  it('uses integer minutes', () => {
    const s = allocateSchedule({ questions, requirements, daysAvailable: 3 });
    for (const d of s.days) {
      assert.equal(Number.isInteger(d.minutes), true);
    }
  });

  it('schedules every must-have via at least one question', () => {
    const s = allocateSchedule({ questions, requirements, daysAvailable: 2 });
    const scheduled = new Set(s.days.flatMap((d) => d.question_ids));
    for (const req of requirements.filter((r) => r.priority === 'must')) {
      const q = questions.find((x) => x.requirement_ids.includes(req.id));
      assert.ok(q && scheduled.has(q.id), `must-have ${req.id} missing from schedule`);
    }
  });

  it('clamps 1-day and 60-day requests', () => {
    assert.equal(allocateSchedule({ questions, requirements, daysAvailable: 1 }).days.length, 1);
    assert.equal(allocateSchedule({ questions, requirements, daysAvailable: 60 }).days.length, 60);
    assert.equal(allocateSchedule({ questions, requirements, daysAvailable: 99 }).days.length, 60);
  });

  it('front-loads harder material', () => {
    const s = allocateSchedule({ questions, requirements, daysAvailable: 4 });
    const day1 = s.days[0].question_ids;
    assert.ok(day1.includes('q1') || day1.includes('q4'));
  });
});

describe('coverage checking', () => {
  const requirements = [
    { id: 'r1', text: 'A', kind: 'technical', priority: 'must' },
    { id: 'r2', text: 'B', kind: 'behavioural', priority: 'must' },
    { id: 'r3', text: 'C', kind: 'technical', priority: 'nice' },
  ];

  it('finds uncovered must-haves', () => {
    const uncovered = findUncoveredRequirements(
      requirements,
      [{ id: 'q1', requirement_ids: ['r1'] }],
      { mustOnly: true }
    );
    assert.deepEqual(uncovered, ['r2']);
  });

  it('ignores nice-to-haves when mustOnly', () => {
    const uncovered = findUncoveredRequirements(
      requirements,
      [
        { id: 'q1', requirement_ids: ['r1'] },
        { id: 'q2', requirement_ids: ['r2'] },
      ],
      { mustOnly: true }
    );
    assert.deepEqual(uncovered, []);
  });

  it('reports coverage counts', () => {
    const report = coverageReport(requirements, [{ id: 'q1', requirement_ids: ['r1'] }]);
    assert.equal(report.must_count, 2);
    assert.equal(report.covered_count, 1);
  });
});

describe('kit structure validation', () => {
  function sampleKit(overrides = {}) {
    return {
      source: {
        company: 'Acme',
        company_url: 'https://acme.example',
        role: 'Engineer',
        location: 'Remote',
        jd_chars: 120,
        researched_at: '2026-09-01T09:12:44Z',
        pages_used: ['https://acme.example'],
      },
      company_brief: {
        summary: 'Acme builds tools',
        what_they_do: 'Software',
        sources: ['https://acme.example'],
      },
      role: {
        title: 'Engineer',
        seniority: 'Senior',
        responsibilities: ['Build'],
        requirements: [{ id: 'r1', text: 'React', kind: 'technical', priority: 'must' }],
      },
      questions: [
        {
          id: 'q1',
          requirement_ids: ['r1'],
          category: 'technical',
          prompt: 'Explain React',
          answer_outline: 'hooks, components',
          difficulty: 2,
        },
      ],
      flashcards: [{ id: 'f1', front: 'What is a hook?', back: '…', requirement_ids: ['r1'] }],
      schedule: {
        days_available: 2,
        days: [
          { day: 1, focus: 'Core', question_ids: ['q1'], minutes: 45 },
          { day: 2, focus: 'Review', question_ids: ['q1'], minutes: 30 },
        ],
      },
      coverage: { uncovered_requirement_ids: [], passes: 2 },
      ...overrides,
    };
  }

  it('accepts a valid kit', () => {
    const result = validateKit(sampleKit());
    assert.equal(result.ok, true);
  });

  it('rejects non-integer minutes', () => {
    const kit = sampleKit();
    kit.schedule.days[0].minutes = 30.5;
    assert.equal(validateKit(kit).ok, false);
  });

  it('rejects schedule pointing at missing questions', () => {
    const kit = sampleKit();
    kit.schedule.days[0].question_ids = ['q999'];
    assert.equal(validateKit(kit).ok, false);
  });

  it('toPublicKit strips internal fields', () => {
    const kit = sampleKit();
    kit.questions[0].pinned = true;
    kit.company_brief.hiring_notes = 'secret';
    const pub = toPublicKit(kit);
    assert.equal(pub.questions[0].pinned, undefined);
    assert.equal(pub.company_brief.hiring_notes, undefined);
  });
});
