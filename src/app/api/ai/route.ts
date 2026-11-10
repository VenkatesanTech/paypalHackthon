import { z } from 'zod';
import { db } from '@/lib/db';
import { generateAi } from '@/lib/ai';
import { AiError } from '@/lib/ai-errors';

export const runtime = 'nodejs';
export const maxDuration = 90;

export async function POST(r: Request) {
  try {
    if (r.headers.get('origin') && r.headers.get('origin') !== new URL(r.url).origin) {
      return Response.json({ error: 'Invalid origin' }, { status: 403 });
    }
    if (!process.env.GEMINI_API_KEY?.trim() || process.env.GEMINI_API_KEY.trim() === 'your_gemini_api_key_here') {
      throw new AiError('Add GEMINI_API_KEY to your server environment to enable AI. You can create invoices manually.', 503);
    }
    const raw = await r.text();
    if (raw.length > 8192) return Response.json({ error: 'Request is too large.' }, { status: 400 });
    const { prompt, mode = 'invoice' } = z.object({
      prompt: z.string().trim().min(1).max(4000),
      mode: z.enum(['invoice', 'insights']).optional(),
    }).parse(JSON.parse(raw));
    const invoices = mode === 'insights' ? await db.invoice.findMany({
      orderBy: { createdAt: 'desc' },
      select: { status: true, totalCents: true, dueDate: true },
      take: 200,
    }) : [];
    return Response.json(await generateAi(prompt, mode, invoices));
  } catch (error) {
    if (error instanceof AiError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError) return Response.json({ error: 'Check the invoice description and try again. Some details could not be extracted.' }, { status: 400 });
    if (error instanceof SyntaxError) return Response.json({ error: 'Invalid AI request. Please try again.' }, { status: 400 });
    return Response.json({ error: 'AI request failed. Please try again.' }, { status: 500 });
  }
}
