/**
 * Kundli PDF API Proxy — Vercel Serverless Function
 *
 * Use this endpoint when Shopify storefront → AstrologyAPI direct browser
 * calls fail because of CORS, or when you want to keep AstrologyAPI
 * credentials private. The Shopify Liquid section should point its
 * "AstrologyAPI Endpoint URL" setting to this deployed endpoint.
 */

const DEFAULT_ASTROLOGY_PDF_ENDPOINT = 'https://pdf.astrologyapi.com/v1/basic_horoscope_pdf';
const RATE_LIMIT = Number(process.env.KUNDLI_RATE_LIMIT || 10);
const RATE_WINDOW = 60 * 1000;
const rateLimitMap = new Map();

const ALLOWED_ORIGINS = [
  process.env.SHOPIFY_STORE_URL,
  process.env.SHOPIFY_CUSTOM_DOMAIN,
  process.env.ADDITIONAL_ALLOWED_ORIGIN,
  'http://localhost:3000',
  'http://localhost:9292'
].filter(Boolean);

function getAllowedOrigin(origin) {
  if (!origin) return ALLOWED_ORIGINS[0] || '*';
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  return ALLOWED_ORIGINS[0] || 'null';
}

function setCorsHeaders(req, res) {
  res.setHeader('Access-Control-Allow-Origin', getAllowedOrigin(req.headers.origin || ''));
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
}

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

function parseBody(req) {
  if (!req.body) return {};
  return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function validateRequestBody(body) {
  const errors = [];
  const currentYear = new Date().getFullYear();

  if (!body.name || typeof body.name !== 'string') errors.push('name');
  if (!body.gender || typeof body.gender !== 'string') errors.push('gender');
  if (!Number.isInteger(Number(body.day)) || Number(body.day) < 1 || Number(body.day) > 31) errors.push('day');
  if (!Number.isInteger(Number(body.month)) || Number(body.month) < 1 || Number(body.month) > 12) errors.push('month');
  if (!Number.isInteger(Number(body.year)) || Number(body.year) < 1900 || Number(body.year) > currentYear) errors.push('year');
  if (!Number.isInteger(Number(body.hour)) || Number(body.hour) < 0 || Number(body.hour) > 23) errors.push('hour');
  if (!Number.isInteger(Number(body.min)) || Number(body.min) < 0 || Number(body.min) > 59) errors.push('min');
  if (!isFiniteNumber(body.lat) || Number(body.lat) < -90 || Number(body.lat) > 90) errors.push('lat');
  if (!isFiniteNumber(body.lon) || Number(body.lon) < -180 || Number(body.lon) > 180) errors.push('lon');
  if (!isFiniteNumber(body.tzone) || Number(body.tzone) < -14 || Number(body.tzone) > 14) errors.push('tzone');
  if (!body.place || typeof body.place !== 'string') errors.push('place');

  return errors;
}

function buildAstrologyHeaders() {
  const apiKey = process.env.ASTROLOGY_API_KEY;
  const userId = process.env.ASTROLOGY_USER_ID;
  const authMode = process.env.ASTROLOGY_AUTH_MODE || 'api_key';

  if (!apiKey) {
    throw new Error('Missing ASTROLOGY_API_KEY environment variable');
  }

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  if (authMode === 'basic') {
    if (!userId) {
      throw new Error('Missing ASTROLOGY_USER_ID environment variable for basic auth');
    }
    headers.Authorization = 'Basic ' + Buffer.from(`${userId}:${apiKey}`).toString('base64');
    return headers;
  }

  headers['x-astrologyapi-key'] = apiKey;
  return headers;
}

function sanitizeAstrologyPayload(body) {
  return {
    name: String(body.name).trim(),
    day: Number(body.day),
    month: Number(body.month),
    year: Number(body.year),
    hour: Number(body.hour),
    min: Number(body.min),
    lat: Number(body.lat),
    lon: Number(body.lon),
    tzone: Number(body.tzone),
    gender: String(body.gender),
    language: body.language || 'en',
    place: String(body.place),
    chart_style: body.chart_style || 'NORTH_INDIAN',
    footer_link: body.footer_link || '',
    logo_url: body.logo_url || '',
    company_name: body.company_name || '',
    company_info: body.company_info || '',
    domain_url: body.domain_url || '',
    company_email: body.company_email || '',
    company_landline: body.company_landline || '',
    company_mobile: body.company_mobile || ''
  };
}

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientIp =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Too many API requests. Please try again later.' });
  }

  let body;
  try {
    body = parseBody(req);
  } catch (error) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const validationErrors = validateRequestBody(body);
  if (validationErrors.length) {
    return res.status(400).json({ error: `Invalid fields: ${validationErrors.join(', ')}` });
  }

  let headers;
  try {
    headers = buildAstrologyHeaders();
  } catch (error) {
    console.error('Kundli proxy configuration error:', error.message);
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const endpoint = process.env.ASTROLOGY_PDF_ENDPOINT || DEFAULT_ASTROLOGY_PDF_ENDPOINT;
  const requestData = sanitizeAstrologyPayload(body);

  console.log('Kundli proxy request:', {
    endpoint,
    method: 'POST',
    astrologyApiKeyConfigured: !!process.env.ASTROLOGY_API_KEY,
    astrologyUserIdConfigured: !!process.env.ASTROLOGY_USER_ID,
    authMode: process.env.ASTROLOGY_AUTH_MODE || 'api_key'
  });

  try {
    const apiResponse = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestData)
    });

    const responseText = await apiResponse.text();
    let result;
    try {
      result = responseText ? JSON.parse(responseText) : {};
    } catch (error) {
      result = { raw: responseText };
    }

    console.log('Kundli proxy response status:', apiResponse.status);

    if (!apiResponse.ok) {
      console.error('AstrologyAPI error response:', apiResponse.status, result);
      return res.status(apiResponse.status).json({
        error: result?.message || result?.error || 'AstrologyAPI request failed',
        status: apiResponse.status,
        details: result
      });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('Kundli proxy network error:', error);
    return res.status(502).json({ error: 'Unable to reach AstrologyAPI. Please try again later.' });
  }
};
