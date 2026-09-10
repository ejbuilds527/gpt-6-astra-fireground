import { redirect } from 'next/navigation';
import { currentIdentity } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export default async function AppPage() {
  const identity = await currentIdentity();
  redirect(identity ? '/app/' + identity.role : '/signin');
}
