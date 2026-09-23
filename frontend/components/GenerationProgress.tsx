'use client';

export function GenerationProgress({
  progress,
}: {
  progress?: { step?: string; message?: string; percent?: number };
}) {
  const percent = Math.max(5, Math.min(100, progress?.percent || 5));
  const steps = [
    'extract',
    'crawl',
    'public_discussion',
    'company_brief',
    'questions',
    'coverage',
    'flashcards',
    'schedule',
    'done',
  ];
  const current = progress?.step || 'queued';

  return (
    <div className="rounded-xl border border-mist/80 bg-white/90 p-5 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-display text-lg font-semibold text-ink">Researching and generating</p>
          <p className="mt-1 text-sm text-ink/60">{progress?.message || 'Queued…'}</p>
        </div>
        <p className="text-sm font-semibold text-sea">{percent}%</p>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-sand">
        <div className="h-full rounded-full bg-sea transition-all duration-500" style={{ width: `${percent}%` }} />
      </div>
      <ol className="mt-5 grid gap-2 sm:grid-cols-3">
        {steps.map((s) => {
          const active = s === current;
          const done = steps.indexOf(s) < steps.indexOf(current) || current === 'done';
          return (
            <li
              key={s}
              className={`rounded-md px-3 py-2 text-xs font-medium ${
                active ? 'bg-sea/10 text-seaDark' : done ? 'bg-sand text-ink/50' : 'bg-white text-ink/35'
              }`}
            >
              {s.replace(/_/g, ' ')}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
