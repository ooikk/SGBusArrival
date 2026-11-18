// Vercel serverless function: GET /api/bus-arrival?BusStopCode=83139
// Proxies the LTA DataMall Bus Arrival API (v3).
//
// Why a proxy is needed: the page used to call LTA directly from the
// browser, and that can never work in a normal browser:
//   1. LTA's responses carry no Access-Control-Allow-Origin header,
//      so the browser refuses to let the page read the response (CORS).
//   2. The AccountKey header is a custom header, so the browser first
//      sends a preflight OPTIONS request — and LTA/Akamai answers that
//      with 403 Access Denied, so the real GET never happens.
// A server-to-server fetch has no CORS and no preflight, so the same
// call from here returns 200 with live data (verified 18 Nov 2026).
//
// The LTA key lives in the Vercel env var LTA_ACCOUNT_KEY (Vercel
// dashboard > Project > Settings > Environment Variables). It is
// NEVER in this repo or in the page — the key that used to be
// hard-coded in index.html is public on GitHub and must be rotated
// in the LTA DataMall portal.
export default async function handler(req, res) {
  const code = (req.query?.BusStopCode || '').trim();
  if (!/^\d{5}$/.test(code)) {
    return res.status(200).json({ error: 'A valid 5-digit Bus Stop Code is required.' });
  }
  const key = process.env.LTA_ACCOUNT_KEY;
  if (!key) {
    return res.status(200).json({ error: 'Server not configured: LTA_ACCOUNT_KEY is missing on Vercel.' });
  }
  let upstream;
  try {
    upstream = await fetch(
      'https://datamall2.mytransport.sg/ltaodataservice/v3/BusArrival?BusStopCode=' + code,
      {
        headers: {
          'AccountKey': key,
          'accept': 'application/json',
          'User-Agent': 'SGBusArrival/1.0',
        },
        signal: AbortSignal.timeout(15000),
      }
    );
  } catch (e) {
    return res.status(200).json({ error: 'Could not reach the LTA API (' + (e.cause?.code || 'network error') + '). Try again.' });
  }
  if (upstream.status === 401 || upstream.status === 403) {
    return res.status(200).json({ error: 'LTA refused the request (HTTP ' + upstream.status + '). The server API key may be invalid or revoked.' });
  }
  if (!upstream.ok) {
    return res.status(200).json({ error: 'LTA API returned HTTP ' + upstream.status + '.' });
  }
  const data = await upstream.json();
  // Bus arrivals change by the minute: do not cache.
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(data);
}
