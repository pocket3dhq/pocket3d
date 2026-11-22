'use client';

import { FC, useState } from 'react';
import { Button } from '@pocket3d/frontend/components/ui/button';

export const CopyButton: FC<{ value: string; label?: string }> = ({ value, label = 'Copy' }) => {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // clipboard refused (http, permissions): the text is selectable anyway
        }
      }}
    >
      {copied ? 'Copied' : label}
    </Button>
  );
};
