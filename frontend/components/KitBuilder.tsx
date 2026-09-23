'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { KitPayload } from '@/app/kits/[id]/page';

type Question = {
  id: string;
  requirement_ids: string[];
  category: string;
  prompt: string;
  answer_outline: string;
  difficulty: number;
  origin?: string;
  edited?: boolean;
  pinned?: boolean;
};

type Flashcard = {
  id: string;
  front: string;
  back: string;
  requirement_ids: string[];
  origin?: string;
  edited?: boolean;
  pinned?: boolean;
};

const CATEGORIES = ['technical', 'behavioural', 'system-design', 'company-fit'];

export function KitBuilder({
  kit,
  onUpdated,
}: {
  kit: KitPayload;
  onUpdated: (kit: KitPayload) => void;
}) {
  const data = kit.data;
  const [brief, setBrief] = useState(data.company_brief);
  const [questions, setQuestions] = useState<Question[]>(data.questions || []);
  const [flashcards, setFlashcards] = useState<Flashcard[]>(data.flashcards || []);
  const [schedule, setSchedule] = useState(data.schedule);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [regenBusy, setRegenBusy] = useState('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipFirst = useRef(true);

  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void persist({ company_brief: brief, questions, flashcards, schedule });
    }, 700);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [brief, questions, flashcards, schedule]);

  async function persist(patch: Record<string, unknown>) {
    setSaving(true);
    setMessage('');
    try {
      const res = await api<{ kit: KitPayload }>(`/api/kits/${kit.id}`, {
        method: 'PATCH',
        json: patch,
      });
      onUpdated(res.kit);
      setMessage('Saved');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function regenerate(section: string, category?: string) {
    setRegenBusy(category || section);
    setMessage('');
    try {
      const res = await api<{ kit: KitPayload }>(`/api/kits/${kit.id}/regenerate`, {
        method: 'POST',
        json: { section, category },
      });
      onUpdated(res.kit);
      setBrief(res.kit.data.company_brief);
      setQuestions(res.kit.data.questions || []);
      setFlashcards(res.kit.data.flashcards || []);
      setSchedule(res.kit.data.schedule);
      setMessage(`Regenerated ${category || section} — pinned/edited items kept`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Regeneration failed');
    } finally {
      setRegenBusy('');
    }
  }

  function moveQuestion(id: string, dir: -1 | 1) {
    setQuestions((prev) => {
      const idx = prev.findIndex((q) => q.id === id);
      if (idx < 0) return prev;
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }

  function updateQuestion(id: string, patch: Partial<Question>) {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, ...patch, edited: true } : q))
    );
  }

  function addQuestion() {
    const id = `q${Date.now()}`;
    setQuestions((prev) => [
      ...prev,
      {
        id,
        requirement_ids: data.role?.requirements?.[0] ? [data.role.requirements[0].id] : [],
        category: 'technical',
        prompt: 'New question',
        answer_outline: '',
        difficulty: 2,
        origin: 'user',
        edited: true,
        pinned: true,
      },
    ]);
  }

  function addFlashcard() {
    setFlashcards((prev) => [
      ...prev,
      {
        id: `f${Date.now()}`,
        front: 'New prompt',
        back: '',
        requirement_ids: [],
        origin: 'user',
        edited: true,
        pinned: true,
      },
    ]);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3 text-sm text-ink/55">
        <span>{saving ? 'Saving…' : message || 'Edits save automatically'}</span>
        <span className="text-ink/30">·</span>
        <span>
          Coverage pass {data.coverage?.passes ?? 1}
          {(data.coverage?.uncovered_requirement_ids || []).length
            ? ` · ${data.coverage.uncovered_requirement_ids.length} uncovered must-haves`
            : ' · all must-haves covered'}
        </span>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-2xl font-semibold">Company brief</h2>
          <button
            type="button"
            disabled={!!regenBusy}
            onClick={() => regenerate('company_brief')}
            className="rounded-md border border-mist bg-white px-3 py-1.5 text-sm font-medium hover:border-sea/40 disabled:opacity-50"
          >
            {regenBusy === 'company_brief' ? 'Regenerating…' : 'Regenerate'}
          </button>
        </div>
        <label className="block text-sm font-medium text-ink/70">
          Summary
          <textarea
            rows={3}
            value={brief.summary || ''}
            onChange={(e) => setBrief({ ...brief, summary: e.target.value })}
            className="mt-1 w-full rounded-md border border-mist bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm font-medium text-ink/70">
          What they do
          <textarea
            rows={3}
            value={brief.what_they_do || ''}
            onChange={(e) => setBrief({ ...brief, what_they_do: e.target.value })}
            className="mt-1 w-full rounded-md border border-mist bg-white px-3 py-2 text-sm"
          />
        </label>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-2xl font-semibold">Role</h2>
        <p className="text-sm text-ink/60">
          {data.role?.title} {data.role?.seniority ? `· ${data.role.seniority}` : ''}
        </p>
        <ul className="space-y-2">
          {(data.role?.requirements || []).map((r: any) => (
            <li key={r.id} className="flex flex-wrap items-baseline gap-2 rounded-md bg-white/70 px-3 py-2 text-sm">
              <span className="font-mono text-xs text-ink/40">{r.id}</span>
              <span className="font-medium">{r.text}</span>
              <span className="rounded bg-sand px-1.5 py-0.5 text-xs uppercase text-ink/60">{r.priority}</span>
              <span className="text-xs text-ink/45">{r.kind}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-2xl font-semibold">Questions</h2>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                disabled={!!regenBusy}
                onClick={() => regenerate('questions', cat)}
                className="rounded-md border border-mist bg-white px-2.5 py-1 text-xs font-medium hover:border-sea/40 disabled:opacity-50"
              >
                {regenBusy === cat ? '…' : `Regen ${cat}`}
              </button>
            ))}
            <button
              type="button"
              onClick={addQuestion}
              className="rounded-md bg-ink px-2.5 py-1 text-xs font-semibold text-white"
            >
              Add question
            </button>
          </div>
        </div>

        <ul className="space-y-3">
          {questions.map((q, index) => (
            <li key={q.id} className="rounded-xl border border-mist/80 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink/50">
                <span className="font-mono">{q.id}</span>
                <select
                  value={q.category}
                  onChange={(e) => updateQuestion(q.id, { category: e.target.value, edited: true })}
                  className="rounded border border-mist bg-paper px-2 py-1"
                  aria-label="Category"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1">
                  Diff
                  <input
                    type="number"
                    min={1}
                    max={3}
                    value={q.difficulty}
                    onChange={(e) =>
                      updateQuestion(q.id, { difficulty: Number(e.target.value), edited: true })
                    }
                    className="w-12 rounded border border-mist px-1 py-0.5"
                  />
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={Boolean(q.pinned)}
                    onChange={(e) => updateQuestion(q.id, { pinned: e.target.checked })}
                  />
                  Pin
                </label>
                {(q.edited || q.origin === 'user') && (
                  <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">edited</span>
                )}
                <div className="ml-auto flex gap-1">
                  <button type="button" className="px-2 py-1 hover:bg-sand" onClick={() => moveQuestion(q.id, -1)} aria-label="Move up">
                    ↑
                  </button>
                  <button type="button" className="px-2 py-1 hover:bg-sand" onClick={() => moveQuestion(q.id, 1)} aria-label="Move down">
                    ↓
                  </button>
                  <button
                    type="button"
                    className="px-2 py-1 text-alert hover:bg-red-50"
                    onClick={() => setQuestions((prev) => prev.filter((x) => x.id !== q.id))}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <textarea
                rows={2}
                value={q.prompt}
                onChange={(e) => updateQuestion(q.id, { prompt: e.target.value })}
                className="mt-2 w-full rounded-md border border-mist px-3 py-2 text-sm font-medium"
                aria-label={`Question ${index + 1} prompt`}
              />
              <textarea
                rows={2}
                value={q.answer_outline}
                onChange={(e) => updateQuestion(q.id, { answer_outline: e.target.value })}
                className="mt-2 w-full rounded-md border border-mist px-3 py-2 text-sm text-ink/80"
                placeholder="Answer outline"
                aria-label={`Question ${index + 1} outline`}
              />
              <p className="mt-1 text-xs text-ink/40">Covers: {(q.requirement_ids || []).join(', ') || '—'}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-2xl font-semibold">Flashcards</h2>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!!regenBusy}
              onClick={() => regenerate('flashcards')}
              className="rounded-md border border-mist bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              {regenBusy === 'flashcards' ? 'Regenerating…' : 'Regenerate'}
            </button>
            <button type="button" onClick={addFlashcard} className="rounded-md bg-ink px-3 py-1.5 text-sm font-semibold text-white">
              Add card
            </button>
          </div>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {flashcards.map((f) => (
            <li key={f.id} className="rounded-xl border border-mist/80 bg-white p-4">
              <div className="mb-2 flex items-center justify-between text-xs text-ink/45">
                <span className="font-mono">{f.id}</span>
                <button
                  type="button"
                  className="text-alert"
                  onClick={() => setFlashcards((prev) => prev.filter((x) => x.id !== f.id))}
                >
                  Delete
                </button>
              </div>
              <input
                value={f.front}
                onChange={(e) =>
                  setFlashcards((prev) =>
                    prev.map((x) => (x.id === f.id ? { ...x, front: e.target.value, edited: true } : x))
                  )
                }
                className="w-full rounded-md border border-mist px-2 py-1.5 text-sm font-medium"
                aria-label="Flashcard front"
              />
              <textarea
                rows={2}
                value={f.back}
                onChange={(e) =>
                  setFlashcards((prev) =>
                    prev.map((x) => (x.id === f.id ? { ...x, back: e.target.value, edited: true } : x))
                  )
                }
                className="mt-2 w-full rounded-md border border-mist px-2 py-1.5 text-sm"
                aria-label="Flashcard back"
              />
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-2xl font-semibold">Schedule · {schedule.days_available} days</h2>
          <button
            type="button"
            disabled={!!regenBusy}
            onClick={() => regenerate('schedule')}
            className="rounded-md border border-mist bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            {regenBusy === 'schedule' ? 'Rebuilding…' : 'Rebuild schedule'}
          </button>
        </div>
        <ol className="grid gap-3 sm:grid-cols-2">
          {(schedule.days || []).map((d: any) => (
            <li key={d.day} className="rounded-xl border border-mist/80 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-sea">Day {d.day}</p>
              <input
                value={d.focus}
                onChange={(e) =>
                  setSchedule((prev: any) => ({
                    ...prev,
                    days: prev.days.map((x: any) =>
                      x.day === d.day ? { ...x, focus: e.target.value } : x
                    ),
                  }))
                }
                className="mt-1 w-full rounded-md border border-mist px-2 py-1.5 text-sm font-medium"
              />
              <p className="mt-2 text-xs text-ink/50">
                {d.minutes} min · {(d.question_ids || []).join(', ') || 'no questions'}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
