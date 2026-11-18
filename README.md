# SGBusArrival

Real-time Singapore bus arrival times, powered by the LTA DataMall Bus Arrival API.

Live site: https://sgbusarrival.vercel.app/

## Usage

- **Open the site** — your two default stops load automatically:
  - **75259 — Tropica Condo**, Tampines Ave 1
  - **75251 — Opp Tropica Condo**, Tampines Ave 1
- **Look up another stop** — type any 5-digit bus stop code in the search box and tap **Check**. The stop name, road and a **View on Map** link are shown above its buses.
- **Refresh** — tap the **Refresh** button to re-fetch the times for whatever is currently shown (both defaults, or the stop you searched for). The "Updated" time at the bottom shows when the times were last pulled.
- **Demo Mode** — in **API Settings**, ticking "Use Demo Data" shows sample times instead of live data. Live data is the default and needs no API key in the browser.

Each bus card shows the service number, the operator, and the next three buses with their arrival time in minutes (`Arr` = arriving now).

## Legend

### Arrival-time colours — how full the bus is

| Colour | LTA code | Meaning |
| ------ | -------- | ------- |
| 🟢 Green | SEA | Seats Available — there are free seats |
| 🟡 Yellow | SDA | Standing Available — no seats left, but standing room |
| 🔴 Red | LSD | Limited Standing — nearly full, very little standing room |

### Icons on the arrival time

| Icon | Meaning |
| ---- | ------- |
| ♿ | Wheelchair-accessible bus (WAB) |
| ▦ | Double-decker bus (DD) |

### Left border colour — operator

| Colour | Operator |
| ------ | -------- |
| Purple | SBS Transit (SBST) |
| Red | SMRT |
| Green | Tower Transit (TTS) |
| Yellow | Go-Ahead (GAS) |

## How it works (technical)

The page does **not** call LTA directly from the browser — that can never work in a normal browser:

1. LTA's responses carry no `Access-Control-Allow-Origin` header, so the browser refuses to let the page read them (CORS).
2. The `AccountKey` header is a custom header, so the browser first sends a preflight `OPTIONS` request — and LTA/Akamai answers that with **403 Access Denied**, so the real request never happens.

Instead, the browser calls a same-origin serverless function, which calls LTA server-to-server (no CORS, no preflight):

```
Browser  →  /api/bus-arrival?BusStopCode=75259   (same origin, Vercel)
              →  LTA DataMall v3 BusArrival      (server-side, with AccountKey)
              →  LTA DataMall BusStops           (server-side, for stop name / road / coordinates)
Browser  ←  { Services: [...], stop: { Description, RoadName, Latitude, Longitude } }
```

- `api/bus-arrival.js` — Vercel serverless proxy. Validates the 5-digit stop code, reads the key from `process.env.LTA_ACCOUNT_KEY`, and returns the arrivals plus stop details. Arrival data is never cached (`Cache-Control: no-store`).
- `index.html` — the whole front end (single page). It loads the two default stops on open, and looks up any other stop on demand.
- Stop details come from LTA's Bus Stops endpoint (`/ltaodataservice/BusStops`, unversioned — the v3 path does not exist for it). That endpoint ignores `$filter` and returns stops in pages of 500, so an unknown stop is found by paging with `$skip`; the two default stops are answered instantly from a built-in table in the proxy.
- The LTA AccountKey is **never** in the browser code or the repo. It lives in Vercel as the `LTA_ACCOUNT_KEY` environment variable (Production, stored as a Secret). A key that was previously hard-coded in `index.html` is public on GitHub and should be rotated in the LTA DataMall portal.

## Deploy your own copy

1. Fork this repo.
2. Import it into [Vercel](https://vercel.com/new) (no build step needed).
3. Get an API key from the [LTA DataMall portal](https://datamall2.mytransport.sg/).
4. In Vercel: project **Settings → Environment Variables** → add `LTA_ACCOUNT_KEY` with your key, target **Production**, then **Deployments → ⋯ → Redeploy** (environment variables only take effect on a new deployment).

Data © LTA DataMall.
