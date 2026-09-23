'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { KitBuilder } from '@/components/KitBuilder';
import { PracticeMode } from '@/components/PracticeMode';
import { WeakSpots } from '@/components/WeakSpots';
import { GenerationProgress } from '@/components/GenerationProgress';

export type KitPayload = {
  id: string;
  title: string;
  status: string;
  progress?: { step?: string; message?: string; percent?: number };
  error?: { code?: string; message?: string } | null;
  input?: { days?: number; company_url?: string };
  data?: any;
  updatedAt?: string;
};

export default function KitPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [kit, setKit] = useState<KitPayload | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'builder' | 'practice' | 'weak'>('builder');

  const load = useCallback(async () => {
    try {
      const data = await api<{ kit: KitPayload }>(`/api/kits/${id}`);
      setKit(data.kit);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load kit');
    }
  }, [id]);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || !id) return;
    load();
  }, [user, id, load]);

  useEffect(() => {
    if (!kit || (kit.status !== 'running' && kit.status !== 'queued')) return;
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [kit?.status, load]);

  const ready = kit?.status === 'ready' && kit.data;

  const tabs = useMemo(
    () => [
      { id: 'builder' as const, label: 'Builder' },
      { id: 'practice' as const, label: 'Practice' },
      { id: 'weak' as const, label: 'Weak spots' },
    ],
    []
  );

  if (loading || !user) return <p className="pt-10 text-ink/60">Loading…</p>;
  if (error && !kit) return <p className="pt-10 text-alert">{error}</p>;
  if (!kit) return <p className="pt-10 text-ink/60">Loading kit…</p>;

  return (
    <div className="animate-rise space-y-6 pt-2">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-ink/50">
            <button type="button" onClick={() => router.push('/dashboard')} className="hover:text-sea">
              ← Kits
            </button>
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink">{kit.title}</h1>
          {kit.input?.company_url ? (
            <a
              href={kit.input.company_url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-sm text-sea hover:underline"
            >
              {kit.input.company_url}
            </a>
          ) : null}
        </div>
        {ready ? (
          <div className="flex rounded-md border border-mist bg-white p-1 text-sm">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`rounded px-3 py-1.5 font-medium ${
                  tab === t.id ? 'bg-ink text-white' : 'text-ink/70 hover:bg-sand'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {(kit.status === 'queued' || kit.status === 'running') && (
        <GenerationProgress progress={kit.progress} />
      )}

      {kit.status === 'failed' && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5">
          <p className="font-semibold text-alert">Generation failed</p>
          <p className="mt-1 text-sm text-alert/90">{kit.error?.message || 'Unknown error'}</p>
          <p className="mt-2 text-xs text-ink/50">Code: {kit.error?.code || 'GENERATION_FAILED'}</p>
        </div>
      )}

      {ready && tab === 'builder' && (
        <KitBuilder kit={kit} onUpdated={setKit} />
      )}
      {ready && tab === 'practice' && (
        <PracticeMode kitId={kit.id} flashcards={kit.data.flashcards || []} onUpdated={load} />
      )}
      {ready && tab === 'weak' && <WeakSpots kitId={kit.id} />}
    </div>
  );
}
