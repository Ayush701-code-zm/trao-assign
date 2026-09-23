'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="animate-rise mx-auto max-w-md pt-10">
      <h1 className="font-display text-3xl font-semibold text-ink">Welcome back</h1>
      <p className="mt-2 text-ink/60">Log in to see your kits.</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <label className="block text-sm font-medium">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-mist bg-white px-3 py-2"
            autoComplete="email"
          />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-mist bg-white px-3 py-2"
            autoComplete="current-password"
          />
        </label>
        {error ? <p className="text-sm text-alert">{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-sea py-2.5 text-sm font-semibold text-white hover:bg-seaDark disabled:opacity-60"
        >
          {busy ? 'Signing in…' : 'Log in'}
        </button>
      </form>
      <p className="mt-4 text-sm text-ink/60">
        No account?{' '}
        <Link href="/register" className="font-semibold text-sea hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
