module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { business_desc, phone } = req.body || {};
  if (!business_desc || !phone) {
    return res.status(400).json({ error: 'Моля попълнете всички полета.' });
  }

  // Normalize Bulgarian phone numbers to E.164 format
  // Handles: +359XXXXXXXXX, 00359XXXXXXXXX, 359XXXXXXXXX, 08XXXXXXXX, etc.
  function normalizePhone(raw) {
    const c = raw.replace(/[\s\-\.\(\)]/g, '');
    if (c.startsWith('+359')) return c;
    if (c.startsWith('00359')) return '+' + c.slice(2);
    if (/^359\d{9}$/.test(c)) return '+' + c;
    if (c.startsWith('0')) return '+359' + c.slice(1);
    if (c.startsWith('+')) return c; // other country code, keep as-is
    return '+359' + c;
  }

  const toPhone = normalizePhone(phone);

  const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  const TWILIO_SID = process.env.TWILIO_SID;
  const TWILIO_TOKEN = process.env.TWILIO_TOKEN;
  const TWILIO_FROM = process.env.TWILIO_FROM;

  const results = await Promise.allSettled([

    // 1. Telegram notification to owner
    (async () => {
      if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return;
      const text =
        `🚀 *Ново запитване от site130\\!*\n\n` +
        `📱 Телефон: \`${phone}\`\n` +
        `🔢 Нормализиран: \`${toPhone}\`\n\n` +
        `📝 *Описание:*\n${business_desc}`;

      const r = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text,
            parse_mode: 'MarkdownV2'
          })
        }
      );
      if (!r.ok) {
        const body = await r.text();
        throw new Error(`Telegram ${r.status}: ${body}`);
      }
    })(),

    // 2. Twilio SMS confirmation to customer
    (async () => {
      if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) return;
      const smsText =
        'Здравейте! Получихме вашата заявка към site130. ' +
        'Нашият екип ще я разгледа и скоро ще се свърже с вас. Благодарим!';

      const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');
      const r = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            From: TWILIO_FROM,
            To: toPhone,
            Body: smsText
          }).toString()
        }
      );
      if (!r.ok) {
        const body = await r.text();
        throw new Error(`Twilio ${r.status}: ${body}`);
      }
    })(),

    // 3. Convex — persistent database storage
    (async () => {
      const convexUrl = 'https://agile-bandicoot-94.eu-west-1.convex.site/submit-form';
      const secret = process.env.SITE130_SECRET || '';
      const ip =
        (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
        req.socket?.remoteAddress || '';
      const r = await fetch(convexUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-site130-secret': secret,
        },
        body: JSON.stringify({ phone, business_desc, ip }),
      });
      const data = await r.json();
      console.log('[convex] response:', JSON.stringify(data));
      if (!data.success) throw new Error(`Convex error: ${JSON.stringify(data)}`);
    })(),

    // 4. Web3Forms — email notification to owner
    (async () => {
      const r = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_key: '99d13498-1cc8-431a-a17b-55cc1473b142',
          subject: '🚀 Ново запитване от site130',
          name: 'Клиент от site130',
          email: 'noreply@site130.bg',
          phone,
          message: `Телефон: ${phone}\n\nОписание:\n${business_desc}`,
          botcheck: ''
        })
      });
      const data = await r.json();
      console.log('[web3forms] response:', JSON.stringify(data));
      if (!data.success) {
        throw new Error(`Web3Forms error: ${data.message}`);
      }
    })()
  ]);

  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`[submit] task ${i} failed:`, r.reason?.message || r.reason);
    }
  });

  // Always return success to user — partial failures are logged server-side
  return res.status(200).json({ success: true });
};
