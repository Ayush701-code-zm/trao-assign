'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';

export function SiteHeader() {
  const { user, logout, loading } = useAuth();

  return (
    <header className="border-b border-mist/80 bg-white/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href={user ? '/dashboard' : '/'} className="group flex items-baseline gap-2">
          <span className="font-display text-2xl font-semibold tracking-tight text-ink">PrepKit</span>
          <span className="hidden text-sm text-ink/50 sm:inline">interview prep that researches with you</span>
        </Link>
        <nav className="flex items-center gap-2 sm:gap-3">
          {!loading && user ? (
            <>
              <Link
                href="/dashboard"
                className="rounded-md px-3 py-2 text-sm font-medium text-ink/80 hover:bg-sand hover:text-ink"
              >
                Kits
              </Link>
              <Link
                href="/new"
                className="rounded-md bg-sea px-3 py-2 text-sm font-semibold text-white hover:bg-seaDark"
              >
                New kit
              </Link>
              <button
                type="button"
                onClick={() => logout()}
                className="rounded-md px-3 py-2 text-sm text-ink/60 hover:bg-sand hover:text-ink"
              >
                Log out
              </button>
            </>
          ) : !loading ? (
            <>
              <Link href="/login" className="rounded-md px-3 py-2 text-sm font-medium text-ink/80 hover:bg-sand">
                Log in
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-ink px-3 py-2 text-sm font-semibold text-white hover:bg-ink/90"
              >
                Sign up
              </Link>
            </>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
