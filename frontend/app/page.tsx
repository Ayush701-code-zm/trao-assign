'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard');
  }, [user, loading, router]);

  return (
    <div className="animate-rise grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-end lg:gap-16 lg:min-h-[70vh]">
      <div className="pt-8 sm:pt-16">
        <p className="font-display text-5xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-6xl lg:text-7xl">
          PrepKit
        </p>
        <h1 className="mt-5 max-w-xl text-xl leading-snug text-ink/75 sm:text-2xl">
          Paste a job description. We research the company, draft your questions, and build a day-by-day plan.
        </h1>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/register"
            className="rounded-md bg-sea px-5 py-3 text-sm font-semibold text-white shadow-soft hover:bg-seaDark"
          >
            Start preparing
          </Link>
          <Link
            href="/login"
            className="rounded-md border border-ink/15 bg-white/80 px-5 py-3 text-sm font-semibold text-ink hover:border-ink/30"
          >
            Log in
          </Link>
        </div>
      </div>
      <div
        className="relative min-h-[280px] overflow-hidden rounded-2xl border border-white/60 bg-ink shadow-soft sm:min-h-[360px]"
        aria-hidden
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,#0d7377_0%,transparent_45%),linear-gradient(160deg,#0f1c2e,#16324f_60%,#0d7377)]" />
        <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:28px_28px]" />
        <div className="relative flex h-full flex-col justify-end p-6 text-white sm:p-8">
          <p className="font-display text-2xl font-medium leading-snug">Company brief · question bank · flashcards · schedule</p>
          <p className="mt-2 max-w-sm text-sm text-white/70">Built from the posting and what the company actually publishes — not a single catch-all prompt.</p>
        </div>
      </div>
    </div>
  );
}
