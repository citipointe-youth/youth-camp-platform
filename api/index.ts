import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.json({ ok: true, path: req.url, ts: new Date().toISOString() });
}
