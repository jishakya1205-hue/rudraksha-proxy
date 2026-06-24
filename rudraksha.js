/**
 * ═══════════════════════════════════════════════════════════
 *  RUDRAKSHA API PROXY — Vercel Serverless Function
 *  File: api/rudraksha.js
 * 
 *  Yeh function:
 *  ✅ API Key ko browser se hide karta hai
 *  ✅ CORS handle karta hai (sirf aapki Shopify domain se)
 *  ✅ Rate limiting karta hai (abuse rokne ke liye)
 *  ✅ Input validate karta hai
 *  ✅ Errors gracefully handle karta hai
 * ═══════════════════════════════════════════════════════════
 */

// ── In-memory rate limiting (per IP, per minute) ──
const rateLimitMap = new Map();
const RATE_LIMIT   = 5;   // max 5 requests per IP per minute
const RATE_WINDOW  = 60 * 1000; // 1 minute in ms

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, start: now };

  if (now - entry.start > RATE_WINDOW) {
    // Window expired — reset
    rateLimitMap.set(ip, { count: 1, start: now });
    return true;
  }

  if (entry.count >= RATE_LIMIT) return false; // blocked

  entry.count++;
  rateLimitMap.set(ip, entry);
  return true;
}

// ── Allowed origins (apni Shopify store URL yahan likhein) ──
const ALLOWED_ORIGINS = [
  process.env.https://gemsdeva-2.myshopify.com,      // e.g. https://yourstore.myshopify.com
  process.env.https://gemsdeva-2.myshopify.com,  // e.g. https://www.yourstore.com
  'http://localhost:3000',            // local dev ke liye
].filter(Boolean);

module.exports = async function handler(req, res) {

  // ── CORS Headers ──
  const origin = req.headers.origin || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : (ALLOWED_ORIGINS[0] || '*');

  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  // ── Preflight ──
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // ── Only POST allowed ──
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Rate Limiting ──
  const clientIP =
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  if (!checkRateLimit(clientIP)) {
    return res.status(429).json({
      error: 'Bahut zyada requests. Kripya 1 minute baad dobara try karein.',
      retryAfter: 60
    });
  }

  // ── Parse Body ──
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  // ── Input Validation ──
  const { day, month, year, hour, min, lat, lon, tzone, language } = body || {};

  const errors = [];
  if (!day   || day < 1   || day > 31)           errors.push('day (1-31)');
  if (!month || month < 1 || month > 12)          errors.push('month (1-12)');
  if (!year  || year < 1900 || year > new Date().getFullYear()) errors.push('year');
  if (hour === undefined || hour < 0 || hour > 23) errors.push('hour (0-23)');
  if (min  === undefined || min  < 0 || min  > 59) errors.push('min (0-59)');
  if (!lat || isNaN(lat) || lat < -90  || lat > 90)   errors.push('lat');
  if (!lon || isNaN(lon) || lon < -180 || lon > 180)  errors.push('lon');

  if (errors.length) {
    return res.status(400).json({
      error: `Invalid fields: ${errors.join(', ')}`
    });
  }

  // ── Build AstrologyAPI Auth ──
  const userId = process.env.ASTROLOGY_USER_ID;
  const apiKey = process.env.ASTROLOGY_API_KEY;

  if (!userId || !apiKey) {
    console.error('Missing ASTROLOGY_USER_ID or ASTROLOGY_API_KEY env vars');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const authHeader = 'Basic ' + Buffer.from(`${userId}:${apiKey}`).toString('base64');

  // ── Call AstrologyAPI ──
  try {
    const apiRes = await fetch('https://json.astrologyapi.com/v1/rudraksha_suggestion', {
      method:  'POST',
      headers: {
        'Authorization':   authHeader,
        'Content-Type':    'application/json',
        'Accept-Language': language || 'hi',
      },
      body: JSON.stringify({ day, month, year, hour, min, lat, lon, tzone: tzone || 5.5 }),
    });

    const data = await apiRes.json();

    if (!apiRes.ok) {
      console.error('AstrologyAPI error:', apiRes.status, data);
      return res.status(apiRes.status).json({
        error: data?.message || 'Astrology service se response nahin mila'
      });
    }

    // ── Cache response for 1 hour (same birth details = same result) ──
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');

    return res.status(200).json(data);

  } catch (err) {
    console.error('Fetch error:', err);
    return res.status(502).json({
      error: 'Astrology service se connect nahin ho paya. Dobara koshish karein.'
    });
  }
};
