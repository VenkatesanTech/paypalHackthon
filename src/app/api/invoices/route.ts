import { db } from '@/lib/db';
import { invoiceSchema,total } from '@/lib/invoices';
export async function GET(){return Response.json(await db.invoice.findMany({orderBy:{createdAt:'desc'},include:{payment:true}}));}
export async function POST(r:Request){try{if(r.headers.get('origin')&&r.headers.get('origin')!==new URL(r.url).origin)return Response.json({error:'Invalid origin'},{status:403});const v=invoiceSchema.parse(await r.json());const invoice=await db.invoice.create({data:{...v,number:`INV-${Date.now().toString().slice(-8)}`,dueDate:new Date(v.dueDate+'T23:59:59Z'),items:JSON.stringify(v.items),totalCents:total(v.items)}});return Response.json(invoice,{status:201});}catch(e){return Response.json({error:e instanceof Error?e.message:'Unable to save invoice'},{status:400});}}
