'use client';

import { useRouter } from 'next/navigation';
import { FC, FormEvent, useState } from 'react';
import { apiFetch, safeNext } from '@pocket3d/frontend/lib/api';
import { Button } from '@pocket3d/frontend/components/ui/button';
import { Field } from '@pocket3d/frontend/components/ui/field';
import { Notice } from '@pocket3d/frontend/components/ui/notice';

export const RegisterForm: FC<{ next?: string }> = ({ next }) => {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [checkEmail, setCheckEmail] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await apiFetch<{ login?: boolean; activate?: boolean }>('/auth/register', {
        method: 'POST',
        body: { name: name || undefined, email, password },
      });
      if (result.activate) {
        setCheckEmail(true);
        setLoading(false);
        return;
      }
      // back to an OAuth consent in progress, else to connecting an agent
      router.push(next ? safeNext(next) : '/dashboard/keys');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  if (checkEmail) {
    return (
      <Notice tone="info">
        Almost there: we sent a link to <strong>{email}</strong>. Open it to activate your account.
      </Notice>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-[14px]" noValidate>
      <Field label="Name (optional)" autoComplete="name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <Field
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        hint="At least 8 characters."
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Notice>{error}</Notice>
      <Button type="submit" loading={loading}>
        Create account
      </Button>
    </form>
  );
};
