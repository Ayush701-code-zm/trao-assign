'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await register(email, password, name);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="animate-rise mx-auto max-w-md pt-10">
      <h1 className="font-display text-3xl font-semibold text-ink">Create an account</h1>
      <p className="mt-2 text-ink/60">Your kits stay private to you.</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <label className="block text-sm font-medium">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-md border border-mist bg-white px-3 py-2"
            autoComplete="name"
          />
        </label>
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
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-mist bg-white px-3 py-2"
            autoComplete="new-password"
          />
        </label>
        {error ? <p className="text-sm text-alert">{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-sea py-2.5 text-sm font-semibold text-white hover:bg-seaDark disabled:opacity-60"
        >
          {busy ? 'Creating…' : 'Sign up'}
        </button>
      </form>
      <p className="mt-4 text-sm text-ink/60">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-sea hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
