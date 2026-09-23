'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';

export default function NewKitPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [jd, setJd] = useState('');
  const [companyUrl, setCompanyUrl] = useState('');
  const [days, setDays] = useState(5);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [batchInfo, setBatchInfo] = useState('');

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api<{ kit: { id: string }; duplicate?: boolean }>('/api/kits', {
        method: 'POST',
        json: { jd, company_url: companyUrl, days },
      });
      router.push(`/kits/${data.kit.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create kit');
      setBusy(false);
    }
  }

  async function onBatchFile(file: File | null) {
    if (!file) return;
    setBatchInfo('');
    setError('');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const cases = Array.isArray(parsed) ? parsed : parsed.cases;
      if (!Array.isArray(cases)) throw new Error('File must be a JSON array of { jd, company_url, days }');
      setBusy(true);
      const data = await api<{ kits: { id: string }[] }>('/api/kits/batch', {
        method: 'POST',
        json: { cases },
      });
      setBatchInfo(`Started ${data.kits.length} kits`);
      if (data.kits[0]) router.push(`/kits/${data.kits[0].id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Batch upload failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user) return <p className="pt-10 text-ink/60">Loading…</p>;

  return (
    <div className="animate-rise mx-auto max-w-2xl space-y-8 pt-4">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">New preparation kit</h1>
        <p className="mt-2 text-ink/60">
          Paste the posting as text. We crawl the company site and look for how they hire.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5 rounded-xl border border-mist/80 bg-white/80 p-5 shadow-soft sm:p-6">
        <label className="block text-sm font-medium">
          Job description
          <textarea
            required
            rows={12}
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            placeholder="Paste the full job description here…"
            className="mt-1 w-full rounded-md border border-mist bg-white px-3 py-2 font-sans text-sm leading-relaxed"
          />
        </label>
        <label className="block text-sm font-medium">
          Company website
          <input
            type="url"
            required
            value={companyUrl}
            onChange={(e) => setCompanyUrl(e.target.value)}
            placeholder="https://company.example"
            className="mt-1 w-full rounded-md border border-mist bg-white px-3 py-2"
          />
        </label>
        <label className="block text-sm font-medium">
          Days until interview
          <input
            type="number"
            min={1}
            max={60}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="mt-1 w-32 rounded-md border border-mist bg-white px-3 py-2"
          />
        </label>
        {error ? <p className="text-sm text-alert">{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-sea px-5 py-2.5 text-sm font-semibold text-white hover:bg-seaDark disabled:opacity-60"
        >
          {busy ? 'Starting…' : 'Generate kit'}
        </button>
      </form>

      <div className="rounded-xl border border-dashed border-mist bg-white/50 p-5">
        <h2 className="font-display text-lg font-semibold">Batch upload</h2>
        <p className="mt-1 text-sm text-ink/60">
          Upload a JSON file of description-and-company pairs to prepare for several roles at once.
        </p>
        <input
          type="file"
          accept="application/json,.json"
          className="mt-4 block w-full text-sm"
          onChange={(e) => onBatchFile(e.target.files?.[0] || null)}
        />
        {batchInfo ? <p className="mt-2 text-sm text-seaDark">{batchInfo}</p> : null}
      </div>
    </div>
  );
}
