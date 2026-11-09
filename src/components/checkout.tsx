'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export function Checkout({invoiceId,paymentToken,orderId,paid,enabled,cancelled}:{invoiceId:string;paymentToken:string;orderId?:string;paid:boolean;enabled:boolean;cancelled:boolean}) {
 const router=useRouter(); const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [message,setMessage]=useState('');
 async function act(check=false){setBusy(true);setError('');setMessage('');try{
  const endpoint=check?'status':orderId?'capture':'orders';
  const body=check?{invoiceId,paymentToken,orderId}:{invoiceId,paymentToken,...(orderId?{orderId}:{}),confirmed:true};
  const r=await fetch(`/api/paypal/${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error);
  if(d.paid){router.replace(`/pay/${paymentToken}`);router.refresh();}
  else if(check||orderId){setMessage(`PayPal status: ${d.status}. Payment is not yet confirmed. Refresh status to check again.`);}
  else if(d.approveUrl){window.location.assign(d.approveUrl);}
  else{setMessage(`Checkout status: ${d.status}. Check payment status or contact the invoice owner.`);}
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 if(paid)return <div className="payment-success"><h2>Payment received. Thank you!</h2><p>Your payment has been verified through PayPal.</p></div>;
 return <div className="checkout">{cancelled&&<p className="notice">Checkout was cancelled. You can continue when you're ready.</p>}{error&&<p className="error" role="alert">{error}</p>}{message&&<p className="notice" role="status">{message}</p>}<button disabled={busy||!enabled} onClick={()=>act()}>{busy?'Checking with PayPal…':orderId?'Confirm and capture payment':'Continue to PayPal sandbox'} →</button><p className="help">{orderId?'By confirming, you authorize capture of the invoice total.':'Review and approve securely on PayPal, then return here to confirm.'}</p><button className="text-button" disabled={busy||!enabled} onClick={()=>act(true)}>Refresh payment status</button>{!enabled&&<p className="error">PayPal sandbox credentials have not been configured yet.</p>}</div>;
}
