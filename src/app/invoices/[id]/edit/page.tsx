import { db } from '@/lib/db';
import { notFound } from 'next/navigation';
import { Shell } from '@/components/shell';
import { Editor } from '@/components/editor';
export const dynamic='force-dynamic';
export default async function Edit({params}:{params:Promise<{id:string}>}){const {id}=await params;const i=await db.invoice.findUnique({where:{id},include:{payment:true}});if(!i)notFound();return <Shell active="Invoices"><div className="page-heading"><div><h1>Edit {i.number}</h1><p>Make every detail count.</p></div></div>{i.payment?<div className="notice">Checkout has started. This invoice is locked to preserve the payment amount.</div>:<Editor id={i.id} initial={{clientName:i.clientName,clientEmail:i.clientEmail,dueDate:i.dueDate.toISOString().slice(0,10),currency:'USD',notes:i.notes,items:JSON.parse(i.items),status:i.status as 'DRAFT'|'PENDING'}}/>}</Shell>}
