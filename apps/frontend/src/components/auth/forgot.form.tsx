'use client';

import { FC, FormEvent, useState } from 'react';
import { apiFetch } from '@pocket3d/frontend/lib/api';
import { Button } from '@pocket3d/frontend/components/ui/button';
import { Field } from '@pocket3d/frontend/components/ui/field';
import { Notice } from '@pocket3d/frontend/components/ui/notice';

export const ForgotForm: FC = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiFetch('/auth/forgot', { method: 'POST', body: { email } });
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    }
    setLoading(false);
  };

  if (sent) {
    return (
      <Notice tone="info">
        If <strong>{email}</strong> has an account, a reset link is on its way. It works for 30 minutes.
      </Notice>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-[14px]" noValidate>
      <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <Notice>{error}</Notice>
      <Button type="submit" loading={loading}>
        Send the reset link
      </Button>
    </form>
  );
};
