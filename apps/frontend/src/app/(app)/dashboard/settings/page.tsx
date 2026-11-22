import { redirect } from 'next/navigation';
import { DeleteAccountForm, PasswordForm, ProfileForm } from '@pocket3d/frontend/components/dashboard/settings.forms';
import { getSelf } from '@pocket3d/frontend/lib/session';

export default async function SettingsPage() {
  const self = await getSelf();
  if (!self) {
    redirect('/auth/logout');
  }
  return (
    <main className="flex flex-col gap-[16px]">
      <h1 className="text-[28px] font-semibold tracking-heading">Settings</h1>
      <ProfileForm email={self.email} name={self.name} />
      <PasswordForm />
      <DeleteAccountForm />
    </main>
  );
}
