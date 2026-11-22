'use client';

import { useRouter } from 'next/navigation';
import { FC, FormEvent, useState } from 'react';
import { apiFetch } from '@pocket3d/frontend/lib/api';
import { Button } from '@pocket3d/frontend/components/ui/button';
import { Field } from '@pocket3d/frontend/components/ui/field';
import { Notice } from '@pocket3d/frontend/components/ui/notice';

export const ResetForm: FC<{ token: string }> = ({ token }) => {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiFetch('/auth/reset', { method: 'POST', body: { token, password } });
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-[14px]" noValidate>
      <Field
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        hint="At least 8 characters. Every other device gets signed out."
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Notice>{error}</Notice>
      <Button type="submit" loading={loading}>
        Save and log in
      </Button>
    </form>
  );
};
