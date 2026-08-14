# Shopify Kundli PDF Proxy Setup

This repository contains a Shopify Liquid Kundli generator section plus a Vercel serverless proxy for AstrologyAPI PDF generation.

Use the proxy when the browser shows a CORS/network error for direct requests from Shopify to `https://pdf.astrologyapi.com` or when you do not want to expose AstrologyAPI credentials in storefront source code.

## 1. Deploy the proxy to Vercel

1. Push this repository to GitHub/GitLab/Bitbucket.
2. Import the repository in Vercel.
3. Add the environment variables from `.env.example` in Vercel Project Settings → Environment Variables.
4. Deploy the project.

The proxy endpoint will be:

```text
https://YOUR-VERCEL-PROJECT.vercel.app/api/kundli-pdf
```

## 2. Required environment variables

```text
SHOPIFY_STORE_URL=https://yourstore.myshopify.com
SHOPIFY_CUSTOM_DOMAIN=https://www.yourdomain.com
ASTROLOGY_USER_ID=YOUR_ASTROLOGY_USER_ID
ASTROLOGY_API_KEY=YOUR_ASTROLOGY_API_KEY
ASTROLOGY_AUTH_MODE=api_key
ASTROLOGY_PDF_ENDPOINT=https://pdf.astrologyapi.com/v1/basic_horoscope_pdf
KUNDLI_RATE_LIMIT=10
```

Use `ASTROLOGY_AUTH_MODE=api_key` when your AstrologyAPI PDF endpoint expects `x-astrologyapi-key`.
Use `ASTROLOGY_AUTH_MODE=basic` only if your AstrologyAPI account/endpoint requires Basic authentication with `ASTROLOGY_USER_ID:ASTROLOGY_API_KEY`.

## 3. Configure the Shopify section

1. Add `sections/kundli-generator.liquid` to your Shopify Online Store 2.0 theme.
2. In the Shopify Theme Editor, add the **Kundli Generator** section.
3. Set **AstrologyAPI Endpoint URL** to your deployed proxy URL:

```text
https://YOUR-VERCEL-PROJECT.vercel.app/api/kundli-pdf
```

4. Keep the frontend placeholder API key values unchanged when using the proxy. The proxy stores the real key in Vercel environment variables.

## 4. Verify in browser DevTools

Open Chrome DevTools → Network → Fetch/XHR and generate a Kundli.

You should see the request go to:

```text
https://YOUR-VERCEL-PROJECT.vercel.app/api/kundli-pdf
```

If the proxy receives an AstrologyAPI HTTP error, it returns the same status code to Shopify so the section can show the correct message for `400`, `401`, `403`, `404`, `429`, or `500+`.

## 5. Shopify App Proxy option

If you prefer a Shopify App Proxy URL, deploy equivalent server-side logic in a Shopify app and configure the app proxy path, for example:

```text
https://yourstore.myshopify.com/apps/kundli-pdf
```

Then set the section **AstrologyAPI Endpoint URL** to that app proxy URL. The server-side handler should forward the validated request body to AstrologyAPI and keep `ASTROLOGY_API_KEY` private on the server.
