
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { id } = req.query;
  const WLT_KEY = process.env.WLT_API_KEY;

  if (!WLT_KEY) {
    console.error('Server Error: WLT_API_KEY is missing.');
    return res.status(500).json({ message: 'Internal Server Error: Configuration missing' });
  }

  if (!id) {
    return res.status(400).json({ message: 'Missing operation ID' });
  }

  try {
    const response = await fetch(`https://api.worldlabs.ai/marble/v1/operations/${id}`, {
      headers: {
        'WLT-Api-Key': WLT_KEY,
      },
    });

    const data = await response.json();

    if (!response.ok) {
       console.error('World Labs Polling Error:', data);
       return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('Proxy Polling Failed:', error);
    return res.status(500).json({ message: 'Proxy polling failed', error: String(error) });
  }
}
