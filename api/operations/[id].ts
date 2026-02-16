
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { id } = req.query;
  const WLT_KEY = process.env.WLT_API_KEY;

  if (!WLT_KEY) return res.status(500).json({ message: 'Missing API Key' });

  try {
    const response = await fetch(`https://api.worldlabs.ai/marble/v1/operations/${id}`, {
      headers: { 'WLT-Api-Key': WLT_KEY }
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(500).json({ message: 'Proxy error' });
  }
}
