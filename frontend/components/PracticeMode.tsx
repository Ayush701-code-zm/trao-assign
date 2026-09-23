'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';

type Card = {
  id: string;
  front: string;
  back: string;
  practice?: { confidence?: number | null; covered?: boolean };
};

export function PracticeMode({
  kitId,
  flashcards,
  onUpdated,
}: {
  kitId: string;
  flashcards: Card[];
  onUpdated: () => void;
}) {
  const [order, setOrder] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ order: string[] }>(`/api/kits/${kitId}/practice-order`)
      .then((data) => setOrder(data.order))
      .catch(() => setOrder(flashcards.map((f) => f.id)));
  }, [kitId, flashcards]);

  const byId = useMemo(() => new Map(flashcards.map((f) => [f.id, f])), [flashcards]);
  const current = byId.get(order[index]);

  const covered = flashcards.filter((f) => f.practice?.covered).length;

  async function rate(confidence: number) {
    if (!current) return;
    setBusy(true);
    try {
      const res = await api<{ next_order: string[] }>(`/api/kits/${kitId}/practice`, {
        method: 'POST',
        json: { flashcard_id: current.id, confidence },
      });
      setOrder(res.next_order);
      setRevealed(false);
      setIndex((i) => Math.min(i + 1, Math.max(0, res.next_order.length - 1)));
      onUpdated();
    } finally {
      setBusy(false);
    }
  }

  if (!flashcards.length) {
    return (
      <div className="rounded-xl border border-dashed border-mist bg-white/60 p-10 text-center text-ink/60">
        No flashcards yet. Add some in the builder.
      </div>
    );
  }

  if (!current) {
    return <p className="text-ink/60">Loading practice deck…</p>;
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div className="flex items-center justify-between text-sm text-ink/60">
        <span>
          Card {Math.min(index + 1, order.length)} of {order.length}
        </span>
        <span>
          Covered {covered}/{flashcards.length}
        </span>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => setRevealed(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setRevealed(true);
          }
        }}
        className="min-h-[220px] cursor-pointer rounded-2xl border border-mist/80 bg-white p-8 text-center shadow-soft transition hover:border-sea/30"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-sea">Front</p>
        <p className="mt-4 font-display text-2xl font-semibold leading-snug text-ink">{current.front}</p>
        {revealed ? (
          <div className="mt-8 border-t border-mist pt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Answer</p>
            <p className="mt-2 text-left text-base leading-relaxed text-ink/80">{current.back || '—'}</p>
          </div>
        ) : (
          <p className="mt-10 text-sm text-ink/40">Click or press Enter to reveal</p>
        )}
      </div>

      {revealed ? (
        <div className="space-y-2">
          <p className="text-center text-sm text-ink/60">How confident did you feel?</p>
          <div className="flex flex-wrap justify-center gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                disabled={busy}
                onClick={() => rate(n)}
                className="h-11 w-11 rounded-md border border-mist bg-white text-sm font-semibold hover:border-sea hover:bg-sea/5 disabled:opacity-50"
                aria-label={`Confidence ${n}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex justify-between">
        <button
          type="button"
          className="rounded-md px-3 py-2 text-sm text-ink/60 hover:bg-sand"
          onClick={() => {
            setIndex((i) => Math.max(0, i - 1));
            setRevealed(false);
          }}
        >
          Previous
        </button>
        <button
          type="button"
          className="rounded-md px-3 py-2 text-sm text-ink/60 hover:bg-sand"
          onClick={() => {
            setIndex((i) => Math.min(order.length - 1, i + 1));
            setRevealed(false);
          }}
        >
          Skip
        </button>
      </div>
    </div>
  );
}
