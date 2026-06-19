import type { VercelRequest, VercelResponse } from '@vercel/node';

type AppFn = (req: unknown, res: unknown) => void;

let appPromise: Promise<AppFn> | undefined;

function getApp(): Promise<AppFn> {
  if (!appPromise) {
    appPromise = import('../src/app')
      .then((m) => m.createAppInstance() as Promise<AppFn>)
      .catch((err: unknown) => {
        console.error('[api] App initialization failed:', err);
        appPromise = undefined;
        throw err;
      });
  }
  return appPromise;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    const app = await getApp();
    app(req, res);
  } catch (err) {
    console.error('[api] Handler error:', err);
    if (!res.headersSent) {
      res.status(500).json({
        error: String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    }
  }
}
