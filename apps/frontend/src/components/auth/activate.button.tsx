'use client';

import { useRouter } from 'next/navigation';
import { FC, useState } from 'react';
import { apiFetch } from '@pocket3d/frontend/lib/api';
import { Button } from '@pocket3d/frontend/components/ui/button';
import { Notice } from '@pocket3d/frontend/components/ui/notice';

// A button, not an automatic request: the link is single-use, and mail
// scanners that open links shouldn't be the ones spending it
export const ActivateButton: FC<{ token: string }> = ({ token }) => {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const activate = async () => {
    setError('');
    setLoading(true);
    try {
      await apiFetch('/auth/activate', { method: 'POST', body: { token } });
      router.push('/dashboard/keys');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-[14px]">
      <Notice>{error}</Notice>
      <Button onClick={activate} loading={loading}>
        Activate my account
      </Button>
    </div>
  );
};
