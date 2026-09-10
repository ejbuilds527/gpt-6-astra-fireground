import { notFound, redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { isRole } from '@/lib/roles';
import { incidentRef, incidentView, initialIncident } from '@/lib/incident';
import { Incident } from '@/components/Incident';
export const dynamic='force-dynamic';
export default async function RolePage({params}:{params:Promise<{role:string}>}){
 const {role}=await params;if(!isRole(role))notFound();
 let identity;try{identity=await requireRole(role);}catch{redirect('/signin');}
 let initial=null;
 try{const doc=await incidentRef().get();initial=await incidentView(role,{...initialIncident,...doc.data()},identity);}catch{}
 return <Incident role={role} identity={identity} initial={initial}/>;
}
