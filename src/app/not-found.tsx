import Link from 'next/link';
export default function NotFound(){return <div className="empty"><h1>We couldn’t find that invoice.</h1><p>Check your link or return to your workspace.</p><Link className="button" href="/">Back to dashboard</Link></div>}
