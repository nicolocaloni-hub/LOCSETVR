
import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
  api: {
    bodyParser: false, // Necessario per gestire multipart/form-data manualmente o con busboy
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

  const WLT_KEY = process.env.WLT_API_KEY;
  if (!WLT_KEY) return res.status(500).json({ message: 'Server configuration error: Missing API Key' });

  try {
    // Forward della request a World Labs
    // Nota: In produzione usiamo 'formidable' o 'busboy' per processare i file e ricomporre la form-data verso World Labs
    const response = await fetch('https://api.worldlabs.ai/marble/v1/worlds:generate', {
      method: 'POST',
      headers: {
        'WLT-Api-Key': WLT_KEY,
        // Content-Type viene passato automaticamente se usiamo una nuova FormData
      },
      body: req.body // Assumendo che il body sia passato correttamente dal client o ri-formattato
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(500).json({ message: 'Proxy error', details: error });
  }
}
