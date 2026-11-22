'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FC, FormEvent, useState } from 'react';
import { apiFetch, ApiError, safeNext } from '@pocket3d/frontend/lib/api';
import { Button } from '@pocket3d/frontend/components/ui/button';
import { Field } from '@pocket3d/frontend/components/ui/field';
import { Notice } from '@pocket3d/frontend/components/ui/notice';

export const LoginForm: FC<{ next?: string; emailEnabled: boolean }> = ({ next, emailEnabled }) => {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notActivated, setNotActivated] = useState(false);
  const [resent, setResent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setNotActivated(false);
    setLoading(true);
    try {
      await apiFetch('/auth/login', { method: 'POST', body: { email, password } });
      // refresh: server components re-render with the new session cookie
      router.push(safeNext(next));
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setNotActivated(err instanceof ApiError && err.status === 403);
      setLoading(false);
    }
  };

  const resend = async () => {
    await apiFetch('/auth/resend-activation', { method: 'POST', body: { email } }).catch(() => {});
    setResent(true);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-[14px]" noValidate>
      <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <Field
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Notice>{error}</Notice>
      {notActivated && emailEnabled && (
        <Button variant="secondary" onClick={resend} disabled={resent}>
          {resent ? 'Sent: check your inbox' : 'Send the activation email again'}
        </Button>
      )}
      <Button type="submit" loading={loading}>
        Log in
      </Button>
      {emailEnabled && (
        <Link href="/auth/forgot" className="text-[14px] text-textMuted hover:text-textColor">
          Forgot your password?
        </Link>
      )}
    </form>
  );
};
