
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const WLT_KEY = process.env.WLT_API_KEY;

  if (!WLT_KEY) {
    console.error('Server Error: WLT_API_KEY is missing in environment variables.');
    return res.status(500).json({ message: 'Internal Server Error: Configuration missing' });
  }

  try {
    // Proxy request to World Labs
    // Headers: Content-Type is passed implies JSON body from client
    const response = await fetch('https://api.worldlabs.ai/marble/v1/worlds:generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'WLT-Api-Key': WLT_KEY,
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('World Labs API Error:', data);
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('Proxy Request Failed:', error);
    return res.status(500).json({ message: 'Proxy request failed', error: String(error) });
  }
}
