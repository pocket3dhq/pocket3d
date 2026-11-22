import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="fixed inset-0 flex flex-col items-center justify-center gap-[16px] px-[16px] text-center">
      <h1 className="text-[20px] font-semibold">This model isn&apos;t here</h1>
      <p className="max-w-[360px] text-[14px] text-textMuted">
        The link may be mistyped, or the model was removed.
      </p>
      <Link href="/" className="text-[14px] text-accent hover:underline">
        pocket3d
      </Link>
    </main>
  );
}
