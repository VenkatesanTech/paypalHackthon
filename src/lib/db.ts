import { PrismaClient } from '@prisma/client';
const globalDb = globalThis as unknown as { db?: PrismaClient };
// Preserve transaction consistency when hosted PostgreSQL handles concurrent requests.
export const db = globalDb.db ?? new PrismaClient({ transactionOptions: { isolationLevel: 'Serializable' } });
if (process.env.NODE_ENV !== 'production') globalDb.db = db;
