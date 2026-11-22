import { ModelsList } from '@pocket3d/frontend/components/dashboard/models.list';

export default function ModelsPage() {
  return (
    <main className="flex flex-col gap-[16px]">
      <div className="flex flex-col gap-[4px]">
        <h1 className="text-[24px] font-bold">Your models</h1>
        <p className="text-[14px] text-textMuted">Everything published with your API keys. Anyone with a link can view that model.</p>
      </div>
      <ModelsList />
    </main>
  );
}
