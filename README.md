# Gau Vigyan Pariksha 2026 — static site + Apps Script API

This project is now split into two parts:

- **`apps-script/Code.gs`** — a small Apps Script JSON API. It still runs on
  Google's servers because that's the only way to read/write your Google
  Sheet for free, but it no longer serves any HTML — it only answers
  `fetch()` calls with JSON.
- **`site/`** — a plain static website (`index.html` = registration,
  `pay.html` = school bulk payment). No Google Form, no Apps Script
  templating — just HTML/CSS/JS you can host anywhere, including GitHub
  Pages. It talks to the API via `site/js/api.js`; the shared offline
  district/block fallback lives in `site/js/locations.js`.

The superseded Apps-Script-only frontend has been removed; `apps-script/`
and `site/` are the only current application sources.

## 1. Deploy the Apps Script API

1. Go to [script.google.com](https://script.google.com) and create a new
   project (or open one bound to your Google Sheet).
2. Delete the default `Code.gs` content and paste in the contents of
   `apps-script/Code.gs` from this repo.
3. Check `SHEET_ID` near the top of the file — it should be the ID from
   your Google Sheet's URL (already filled in with the sheet this project
   was built for). If the script is bound directly to the sheet, this is
   ignored automatically.
4. Set `UPI_VPA` / `UPI_NAME` if you want the payment page to show a UPI QR
   code.
5. **Deploy → New deployment → type: Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Click Deploy, authorize the requested permissions, and copy the **Web
   app URL** (it ends in `/exec`).

## 2. Point the static site at the API

Open `site/js/api.js` and set `API_URL` to the deployment you want this site
to use. The repository currently contains a deployed URL; replace it if you
create or move to a different Apps Script project:

```js
var API_URL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';
```

with the `/exec` URL you copied. Save the file.

## 3. Host the static site on GitHub Pages

1. Push this repository to GitHub (or push just the `site/` folder as its
   own repo).
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a
   branch**.
4. Pick your branch and set the folder to **`/site`** (or `/root` if you
   pushed only the contents of `site/`), then Save.
5. GitHub gives you a URL like `https://<user>.github.io/<repo>/` — open it
   and confirm the registration form loads and the district dropdown
   populates.

`index.html` and `pay.html` link to each other with relative paths
(`pay.html` / `index.html`), so both work correctly under any subpath
GitHub Pages assigns.

## 4. Test end-to-end

- Open the site, select a district/block, submit a test registration, and
  confirm a new row appears in your Google Sheet's registration tab.
- Open `pay.html`, select the same district/block/school, click **See
  amount**, and confirm it shows the right student count and fee.
- Submit a test payment report (a fake UTR is fine while testing) and
  confirm a row appears in the **Payments** sheet.

## Notes on how the API call works

`site/js/api.js` calls the Apps Script Web App with `fetch()`:

- Reads (`getDistricts`, `getSchoolBill`) use a plain `GET`
  with `?action=...` query params.
- Writes (`submitRegistration`, `reportSchoolPayment`) use `POST` with a
  JSON body, sent with `Content-Type: text/plain` on purpose — Apps Script
  Web Apps don't answer CORS preflight (`OPTIONS`) requests, so the request
  has to stay a "simple request" to avoid the browser sending one.

If you ever see `Missing action` or `Unexpected response from server`,
double check `API_URL` in `site/js/api.js` matches the *current* deployed
`/exec` URL — redeploying the Apps Script project (not just saving) issues
a new URL only if you create a **new deployment**; updating an existing
deployment keeps the same URL.
