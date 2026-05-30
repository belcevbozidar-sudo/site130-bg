module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const PIXEL_ID = process.env.META_PIXEL_ID;
  const ACCESS_TOKEN = process.env.META_CAPI_TOKEN;

  if (!PIXEL_ID || !ACCESS_TOKEN) {
    console.error('[conversions] Missing META_PIXEL_ID or META_CAPI_TOKEN env vars');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const { event_id, event_source_url, client_user_agent } = req.body || {};

  if (!event_id) {
    return res.status(400).json({ error: 'event_id is required' });
  }

  // Get real client IP — Vercel sets x-forwarded-for
  const clientIp =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    '0.0.0.0';

  // Build the CAPI payload
  const payload = {
    data: [
      {
        event_name: 'Lead',
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        event_source_url: event_source_url || '',
        event_id: event_id,          // shared with browser pixel → deduplication
        user_data: {
          client_ip_address: clientIp,
          client_user_agent: client_user_agent || req.headers['user-agent'] || '',
        },
      },
    ],
    access_token: ACCESS_TOKEN,
  };

  try {
    const graphRes = await fetch(
      `https://graph.facebook.com/v20.0/${PIXEL_ID}/events`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );

    const data = await graphRes.json();

    if (!graphRes.ok) {
      console.error('[conversions] Meta CAPI error:', JSON.stringify(data));
      return res.status(502).json({ error: 'Meta API error', details: data });
    }

    console.log('[conversions] Lead sent OK — events_received:', data.events_received);
    return res.status(200).json({ success: true, events_received: data.events_received });

  } catch (err) {
    console.error('[conversions] Network error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
