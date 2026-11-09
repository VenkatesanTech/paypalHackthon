'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <div className="empty"><h1>Something needs a second look.</h1><p>Check the database setup and try again.</p><button onClick={reset}>Try again</button></div>}
