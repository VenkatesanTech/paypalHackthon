import { Shell } from '@/components/shell';
import { Editor } from '@/components/editor';
export default function NewInvoice(){return <Shell active="Invoices"><div className="page-heading"><div><div className="eyebrow">LET’S MAKE IT OFFICIAL</div><h1>Create an invoice</h1><p>Start with a few words, or fill in the details yourself.</p></div></div><Editor/></Shell>}
