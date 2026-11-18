// Vercel serverless function: GET /api/bus-arrival?BusStopCode=83139
// Proxies the LTA DataMall Bus Arrival API (v3) and adds stop details
// (name, road, coordinates) from the Bus Stops API.
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
//
// Stop lookup: LTA's Bus Stops endpoint (/ltaodataservice/BusStops,
// NOT v3) ignores $filter and returns stops in pages of 500, so an
// unknown stop is found by paging with $skip. The two default stops
// are answered from a built-in table so they never need that scan.
const KNOWN_STOPS = {
  '75259': { BusStopCode: '75259', Description: 'Tropica Condo', RoadName: 'Tampines Ave 1', Latitude: 1.34913805600656, Longitude: 103.92798027801848 },
  '75251': { BusStopCode: '75251', Description: 'Opp Tropica Condo', RoadName: 'Tampines Ave 1', Latitude: 1.3494983330038, Longitude: 103.92783361101397 },
};

async function findStop(code, key) {
  if (KNOWN_STOPS[code]) return KNOWN_STOPS[code];
  // ~5,200 stops, 500 per page: scan pages until the code is found.
  for (let skip = 0; skip <= 5000; skip += 500) {
    let r;
    try {
      r = await fetch(
        'https://datamall2.mytransport.sg/ltaodataservice/BusStops?$skip=' + skip,
        { headers: { 'AccountKey': key, 'accept': 'application/json' }, signal: AbortSignal.timeout(10000) }
      );
    } catch {
      return null;
    }
    if (!r.ok) return null;
    const page = await r.json();
    const found = (page.value || []).find((s) => s.BusStopCode === code);
    if (found) return found;
    if ((page.value || []).length < 500) break; // last page
  }
  return null;
}

export default async function handler(req, res) {
  const code = (req.query?.BusStopCode || '').trim();
  if (!/^\d{5}$/.test(code)) {
    return res.status(200).json({ error: 'A valid 5-digit Bus Stop Code is required.' });
  }
  const key = process.env.LTA_ACCOUNT_KEY;
  if (!key) {
    return res.status(200).json({ error: 'Server not configured: LTA_ACCOUNT_KEY is missing on Vercel.' });
  }
  const [arrivalResult, stop] = await Promise.all([
    (async () => {
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
        return { error: 'Could not reach the LTA API (' + (e.cause?.code || 'network error') + '). Try again.' };
      }
      if (upstream.status === 401 || upstream.status === 403) {
        return { error: 'LTA refused the request (HTTP ' + upstream.status + '). The server API key may be invalid or revoked.' };
      }
      if (!upstream.ok) {
        return { error: 'LTA API returned HTTP ' + upstream.status + '.' };
      }
      return upstream.json();
    })(),
    findStop(code, key),
  ]);
  if (arrivalResult.error) {
    return res.status(200).json(arrivalResult);
  }
  // Bus arrivals change by the minute: do not cache.
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ...arrivalResult, stop: stop || null });
}
