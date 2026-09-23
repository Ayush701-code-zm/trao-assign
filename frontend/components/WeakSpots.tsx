'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Report = {
  score: number;
  low_confidence_cards: { id: string; front: string; confidence: number }[];
  uncovered_cards: { id: string; front: string }[];
  uncovered_must_requirements: { id: string; text: string }[];
  suggested_focus: string[];
};

export function WeakSpots({ kitId }: { kitId: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ report: Report }>(`/api/kits/${kitId}/weak-spots`)
      .then((d) => setReport(d.report))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, [kitId]);

  if (error) return <p className="text-alert">{error}</p>;
  if (!report) return <p className="text-ink/50">Building weak-spots report…</p>;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-mist/80 bg-white p-6 shadow-soft">
        <p className="text-sm font-medium text-ink/50">Readiness score</p>
        <p className="mt-1 font-display text-5xl font-semibold text-ink">{report.score}</p>
        <p className="mt-2 max-w-lg text-sm text-ink/60">
          Combines low-confidence flashcards, unpractised cards, and any must-have requirements still
          missing questions — so you know what to drill before the interview, not just what you have read.
        </p>
      </div>

      <section>
        <h2 className="font-display text-xl font-semibold">Suggested focus</h2>
        {report.suggested_focus.length === 0 ? (
          <p className="mt-2 text-sm text-ink/55">Looking solid — keep a light review going.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {report.suggested_focus.map((s) => (
              <li key={s} className="rounded-md bg-white/80 px-3 py-2 text-sm">
                {s}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/45">Low confidence</h3>
          <ul className="mt-2 space-y-2">
            {report.low_confidence_cards.length === 0 && (
              <li className="text-sm text-ink/50">None yet — practise a few cards first.</li>
            )}
            {report.low_confidence_cards.map((c) => (
              <li key={c.id} className="rounded-md border border-mist bg-white px-3 py-2 text-sm">
                {c.front} <span className="text-ink/40">({c.confidence}/5)</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/45">Not practised</h3>
          <ul className="mt-2 space-y-2">
            {report.uncovered_cards.slice(0, 8).map((c) => (
              <li key={c.id} className="rounded-md border border-mist bg-white px-3 py-2 text-sm">
                {c.front}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
