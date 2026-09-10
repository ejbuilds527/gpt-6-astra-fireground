import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { readSnapshot } from '@/lib/data';
import { editableSettings } from '@/lib/incident';
import { Settings } from '@/components/Settings';
export const dynamic='force-dynamic';
export default async function SettingsPage(){
 try{await requireRole('command');}catch{redirect('/signin');}
 try{return <Settings initial={editableSettings(await readSnapshot())}/>;}
 catch{return <main className="fg-console"><h1>Settings unavailable</h1><p>Stored inputs could not be read. Nothing has been changed.</p><a href="/settings">Retry</a></main>;}
}
