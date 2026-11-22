'use client';

import { useRouter } from 'next/navigation';
import { FC, FormEvent, useState } from 'react';
import { apiFetch } from '@pocket3d/frontend/lib/api';
import { Button } from '@pocket3d/frontend/components/ui/button';
import { Field } from '@pocket3d/frontend/components/ui/field';
import { Notice } from '@pocket3d/frontend/components/ui/notice';
import { Card } from '@pocket3d/frontend/components/ui/card';

const useSubmit = () => {
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<string | void>) => {
    setError('');
    setDone('');
    setBusy(true);
    try {
      const message = await action();
      if (message) setDone(message);
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  };
  return { error, done, busy, run };
};

export const ProfileForm: FC<{ email: string; name: string | null }> = ({ email, name: initialName }) => {
  const [name, setName] = useState(initialName || '');
  const { error, done, busy, run } = useSubmit();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      await apiFetch('/user/self', { method: 'PUT', body: { name } });
      return 'Saved';
    });
  };

  return (
    <Card title="Profile">
      <form onSubmit={submit} className="flex flex-col gap-[12px]">
        <Field label="Email" value={email} disabled readOnly />
        <Field label="Name" autoComplete="name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        <Notice>{error}</Notice>
        {!!done && <Notice tone="info">{done}</Notice>}
        <div>
          <Button type="submit" loading={busy}>
            Save
          </Button>
        </div>
      </form>
    </Card>
  );
};

export const PasswordForm: FC = () => {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNext] = useState('');
  const { error, done, busy, run } = useSubmit();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      await apiFetch('/user/self/password', { method: 'PUT', body: { currentPassword, newPassword } });
      setCurrent('');
      setNext('');
      return 'Password changed. Other devices were signed out.';
    });
  };

  return (
    <Card title="Password">
      <form onSubmit={submit} className="flex flex-col gap-[12px]">
        <Field label="Current password" type="password" autoComplete="current-password" required value={currentPassword} onChange={(e) => setCurrent(e.target.value)} />
        <Field
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          hint="At least 8 characters."
          value={newPassword}
          onChange={(e) => setNext(e.target.value)}
        />
        <Notice>{error}</Notice>
        {!!done && <Notice tone="info">{done}</Notice>}
        <div>
          <Button type="submit" loading={busy}>
            Change password
          </Button>
        </div>
      </form>
    </Card>
  );
};

export const DeleteAccountForm: FC = () => {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState(false);
  const { error, busy, run } = useSubmit();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      await apiFetch('/user/self', { method: 'DELETE', body: { password } });
      router.push('/');
      router.refresh();
    });
  };

  return (
    <Card
      title="Delete account"
      description="Deletes every model (their links stop working), revokes every API key and signs you out everywhere. This can't be undone."
      className="border-danger/40"
    >
      {confirm ? (
        <form onSubmit={submit} className="flex flex-col gap-[12px]">
          <Field label="Your password, to confirm" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <Notice>{error}</Notice>
          <div className="flex gap-[8px]">
            <Button type="submit" variant="danger" loading={busy} disabled={!password}>
              Delete my account
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div>
          <Button variant="danger" onClick={() => setConfirm(true)}>
            Delete my account…
          </Button>
        </div>
      )}
    </Card>
  );
};
