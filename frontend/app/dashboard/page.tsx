'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';

type KitListItem = {
  id: string;
  title: string;
  status: string;
  progress?: { message?: string; percent?: number };
  error?: { message?: string } | null;
  company?: string;
  role?: string;
  days?: number;
  updatedAt?: string;
};

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [kits, setKits] = useState<KitListItem[]>([]);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      try {
        const data = await api<{ kits: KitListItem[] }>('/api/kits');
        if (!cancelled) {
          setKits(data.kits);
          setReady(true);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      }
    }
    load();
    const t = setInterval(load, 4000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [user]);

  if (loading || !user) {
    return <p className="pt-10 text-ink/60">Loading…</p>;
  }

  return (
    <div className="animate-rise space-y-8 pt-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink">Your kits</h1>
          <p className="mt-1 text-ink/60">Prepare for more than one role at once.</p>
        </div>
        <Link
          href="/new"
          className="rounded-md bg-sea px-4 py-2.5 text-sm font-semibold text-white hover:bg-seaDark"
        >
          Create kit
        </Link>
      </div>

      {error ? <p className="text-sm text-alert">{error}</p> : null}

      {!ready ? (
        <p className="text-ink/50">Loading kits…</p>
      ) : kits.length === 0 ? (
        <div className="rounded-xl border border-dashed border-mist bg-white/60 px-6 py-14 text-center">
          <p className="font-display text-xl text-ink">No kits yet</p>
          <p className="mt-2 text-sm text-ink/60">Paste a job description and a company URL to get started.</p>
          <Link href="/new" className="mt-5 inline-block text-sm font-semibold text-sea hover:underline">
            Create your first kit
          </Link>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {kits.map((kit) => (
            <li key={kit.id}>
              <Link
                href={`/kits/${kit.id}`}
                className="block rounded-xl border border-mist/80 bg-white/80 p-5 shadow-soft transition hover:border-sea/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">{kit.title}</p>
                    <p className="mt-1 text-sm text-ink/55">
                      {kit.role || 'Role'} · {kit.days || '?'} days
                    </p>
                  </div>
                  <StatusPill status={kit.status} />
                </div>
                {(kit.status === 'running' || kit.status === 'queued') && (
                  <div className="mt-4">
                    <div className="h-1.5 overflow-hidden rounded-full bg-sand">
                      <div
                        className="progress-shimmer h-full rounded-full bg-sea"
                        style={{ width: `${Math.max(8, kit.progress?.percent || 5)}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-ink/50">{kit.progress?.message || 'Working…'}</p>
                  </div>
                )}
                {kit.status === 'failed' && (
                  <p className="mt-3 text-sm text-alert">{kit.error?.message || 'Generation failed'}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ready: 'bg-sea/10 text-seaDark',
    running: 'bg-amber-100 text-amber-900',
    queued: 'bg-sand text-ink/70',
    failed: 'bg-red-50 text-alert',
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${styles[status] || 'bg-sand'}`}>
      {status}
    </span>
  );
}
