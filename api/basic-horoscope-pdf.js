/**
 * Basic Horoscope PDF API proxy for Vercel.
 *
 * Keeps AstrologyAPI credentials off Shopify/browser code while forwarding
 * validated horoscope PDF requests to https://pdf.astrologyapi.com.
 */
const rateLimitMap = new Map();
const RATE_LIMIT = 5;
const RATE_WINDOW = 60 * 1000;

const COMPANY_DETAILS = {
  footer_link: 'https://www.thegemsdeva.com',
  logo_url: 'https://www.thegemsdeva.com/cdn/shop/files/ChatGPT_Image_Jun_4_2026_01_08_19_PM.png?v=1780558765&width=330',
  company_name: 'thegemsdeva',
  company_info: 'The Gems Deva is an online platform offering certified gemstones, Rudraksha, astrology products, and personalized Vedic astrology guidance. We help customers choose authentic spiritual products based on their birth details and astrological analysis.',
  domain_url: 'https://www.thegemsdeva.com',
  company_email: 'support@thegemsdeva.com',
  company_landline: '+91 70489 92031',
  company_mobile: '+91 70489 92031',
};

const SUPPORTED_LANGUAGES = new Set(['en', 'hi', 'bn', 'mr', 'ta', 'te', 'kn', 'ml']);
const SUPPORTED_CHART_STYLES = new Set(['NORTH_INDIAN', 'SOUTH_INDIAN', 'EAST_INDIAN']);

const ALLOWED_ORIGINS = [
  process.env.SHOPIFY_STORE_URL,
  process.env.SHOPIFY_CUSTOM_DOMAIN,
  'https://www.thegemsdeva.com',
  'https://thegemsdeva.com',
  'http://localhost:3000',
].filter(Boolean);

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, start: now };

  if (now - entry.start > RATE_WINDOW) {
    rateLimitMap.set(ip, { count: 1, start: now });
    return true;
  }

  if (entry.count >= RATE_LIMIT) return false;

  entry.count += 1;
  rateLimitMap.set(ip, entry);
  return true;
}

function numberInRange(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max;
}

function requiredString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function buildFormData(payload) {
  const formData = new URLSearchParams();

  Object.entries({ ...payload, ...COMPANY_DETAILS }).forEach(([key, value]) => {
    formData.set(key, String(value));
  });

  return formData.toString();
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : (ALLOWED_ORIGINS[0] || 'https://www.thegemsdeva.com');

  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientIP =
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  if (!checkRateLimit(clientIP)) {
    return res.status(429).json({
      error: 'Too many requests. Please try again after 1 minute.',
      retryAfter: 60,
    });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const {
    name,
    gender,
    day,
    month,
    year,
    hour,
    min,
    lat,
    lon,
    language = 'en',
    tzone,
    place,
    chart_style = 'NORTH_INDIAN',
  } = body || {};

  const errors = [];
  if (!requiredString(name)) errors.push('name');
  if (!['male', 'female'].includes(String(gender || '').toLowerCase())) errors.push('gender');
  if (!numberInRange(day, 1, 31)) errors.push('day (1-31)');
  if (!numberInRange(month, 1, 12)) errors.push('month (1-12)');
  if (!numberInRange(year, 1900, new Date().getFullYear())) errors.push('year');
  if (!numberInRange(hour, 0, 23)) errors.push('hour (0-23)');
  if (!numberInRange(min, 0, 59)) errors.push('min (0-59)');
  if (!numberInRange(lat, -90, 90)) errors.push('lat');
  if (!numberInRange(lon, -180, 180)) errors.push('lon');
  if (!numberInRange(tzone, -12, 14)) errors.push('tzone (-12 to 14)');
  if (!requiredString(place)) errors.push('place');
  if (!SUPPORTED_LANGUAGES.has(language)) errors.push('language');
  if (!SUPPORTED_CHART_STYLES.has(chart_style)) errors.push('chart_style');

  if (errors.length) {
    return res.status(400).json({ error: `Invalid fields: ${errors.join(', ')}` });
  }

  const userId = process.env.ASTROLOGY_USER_ID;
  const apiKey = process.env.ASTROLOGY_API_KEY;

  if (!userId || !apiKey) {
    console.error('Missing ASTROLOGY_USER_ID or ASTROLOGY_API_KEY env vars');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const authHeader = `Basic ${Buffer.from(`${userId}:${apiKey}`).toString('base64')}`;
  const payload = {
    name: name.trim(),
    gender: String(gender).toLowerCase(),
    day,
    month,
    year,
    hour,
    min,
    lat,
    lon,
    language,
    tzone,
    place: place.trim(),
    chart_style,
  };

  try {
    const apiRes = await fetch('https://pdf.astrologyapi.com/v1/basic_horoscope_pdf', {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: buildFormData(payload),
    });

    const data = await apiRes.json();

    if (!apiRes.ok || data?.status === false) {
      console.error('AstrologyAPI PDF error:', apiRes.status, data);
      return res.status(apiRes.status || 502).json({
        error: data?.message || 'Unable to generate horoscope PDF right now.',
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('PDF fetch error:', err);
    return res.status(502).json({
      error: 'Could not connect to the horoscope PDF service. Please try again.',
    });
  }
};
