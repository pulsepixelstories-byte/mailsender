# Business Mail Sender — send Gmail to many people from a Google Sheet, safely

> You do NOT need to be a programmer. Follow the steps exactly.
> You only ever edit ONE file: `.env`. Never edit code files.

## What it does
1. You connect ONE Gmail (official Google login, no passwords stored).
2. You pick a Google Sheet → tab → email column. Other columns become `{{placeholders}}`.
3. You write subject + message, preview with a real row, send a test to yourself.
4. The app sends slowly (random delays or batches) so Google doesn't flag you.
5. You watch live progress, then get a report (view, CSV, print/PDF, Drive copy).

## Install (once)
1. Install **Node.js 20 or newer** from https://nodejs.org (LTS button). Check:
   ```
   node --version
   ```
2. Open Terminal, go to the app folder:
   ```
   cd /Applications/XAMPP/xamppfiles/htdocs/es
   ```
3. Install + create database:
   ```
   npm run setup
   ```
   You should see `Setup done. Database ready at data/app.db`.

## Fill in `.env` (Google Cloud steps, 5 min)
1. Go to https://console.cloud.google.com, sign in with the Gmail you will SEND FROM.
2. Create project `Business Mail Sender`.
3. **APIs & Services → Library** → Enable: `Gmail API`, `Google Sheets API`, `Google Drive API`.
4. **OAuth consent screen** → External → app name `Business Mail Sender` → save through steps.
   Under **Test users** add your own Gmail (required while in Testing mode).
   Under **Scopes** add: `gmail.send`, `spreadsheets`, `drive.metadata.readonly`, `drive.file`, `userinfo.email`, `openid`.
5. **Credentials → Create Credentials → OAuth client ID** → Web application `Business Mail Sender Web`.
   Under **Authorized redirect URIs** add each address where the app runs, e.g.:
   ```
   http://localhost:3001/auth/google/callback
   http://localhost/mail-sender/auth/google/callback
   https://YOUR-LIVE-DOMAIN/auth/google/callback
   ```
6. Open `.env` in TextEdit (the ONLY file you edit) and paste:
   ```
   GOOGLE_CLIENT_ID=paste-here
   GOOGLE_CLIENT_SECRET=paste-here
   ```
   Set `GOOGLE_REDIRECT_URI` to the address of THIS machine's app
   (e.g. `http://localhost:3001/auth/google/callback` on your laptop).
   `SESSION_SECRET` and `ENCRYPTION_KEY` (32 chars) are already filled.

## Run the app
```
cd /Applications/XAMPP/xamppfiles/htdocs/es
nohup node src/server.js > /tmp/business-mail-sender.log 2>&1 &
```
Open: **http://localhost:3001** (direct) or **http://localhost/mail-sender/** (via XAMPP Apache — start Apache in XAMPP Manager first).
Health: `http://localhost:3001/health` → `{"status":"ok"}`.
Stop later: `pkill -f "node src/server.js"`.

## Accounts & roles (login first, then the app)
- First visit shows **Create admin account** (name + email + password). That person is the **admin**.
- After that, everyone logs in with email + password. No login = only the login page opens; everything else bounces back to it.
- **User** role: can use the whole app (sheets, campaigns, sending, reports, settings, own password change). No Users menu.
- **Admin** role: everything above, plus the **Users** page (add users as admin/user, remove users — never yourself, never the last admin) and Gmail connect/disconnect.
- Connecting the Gmail sender is separate: admin opens Home → Connect Gmail → Allow (Google login). App users then send through it.

## Use each screen (click path)
- **Login** (`/`): first time = create admin; then email + password → mail client buttons appear.
- **Users** (`users.html`, admin only): list, add (pick role), remove.
- **Dashboard** (`dashboard.html`): today's sent vs daily cap + recent campaigns.
- **New campaign** (`wizard.html`): 1 paste sheet link → Find tabs → pick tab → Preview 10 rows. 2 pick Email column. 3 write name/subject/body, click placeholder buttons, Live preview, footer stays. 4 sending settings (buffered 30–90s default; batch 10/batch, 10–25s inside, 15min rest; cap 400; optional window; dry run). 5 Create draft → Send test to myself → open Live page.
- **Live** (`live.html?id=`): Start (confirm dialog shows ETA) → bar, counts, current email, next-send countdown, log every 3s. Pause/Resume/Cancel anytime.
- **Reports** (`reports.html`, `report.html?id=`): summary + table, Download CSV, Print/PDF, Save to Drive (Business Mail Sender Reports folder), Email me summary, Retry failed only.
- **Settings** (`settings.html`): daily cap, sender name, default footer.

## Deploy to Hostinger (Node.js Web App — Business plan or higher)
> Do NOT use the static "Git deployment to public_html" — that only serves
> plain files and can never run this app. Use hPanel's **Web Apps** instead.
> Needs **Business Web Hosting** (or any Cloud plan). Single/Premium plans
> don't have Web Apps — upgrade first.
1. Push this folder to GitHub (Private repo is fine). `.env` and `data/`
   are gitignored and never upload — Hostinger gets secrets separately below.
2. hPanel → **Web Apps** → Add web app → connect your GitHub repo/branch.
   Framework: Express (auto-detected) or Other. Node version: **22**.
   Entry file: `src/server.js`. Build runs `npm install` automatically.
3. In the app's **Environment variables** tab, add (copy values from your local `.env`):
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `GOOGLE_REDIRECT_URI=https://YOUR-DOMAIN/auth/google/callback`
   (e.g. `https://seagreen-herring-428871.hostingersite.com/auth/google/callback`),
   `SESSION_SECRET`, `ENCRYPTION_KEY` (exact 32 chars), `NODE_ENV=production`.
   (Leave PORT unset — Hostinger provides its own.)
4. Deploy. Open your domain → Sign in with Google → use the app.
5. Also add that same `/auth/google/callback` address in Google Console →
   Credentials → Authorized redirect URIs (keep the localhost ones too).
6. Note: first deploy starts with an empty database — reconnect Google on the
   live URL. Don't redeploy mid-campaign; history lives in the live database.

## Deploy to Render (free, so the app runs on the internet 24/7)
1. Put this folder on GitHub (see step 1 above).
2. Go to https://render.com → **New → Web Service** → connect the repo.
   Render reads `render.yaml`: build `npm install`, start `npm start`, health check `/health`.
3. In Render's **Environment** tab, fill: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `ENCRYPTION_KEY` (paste your EXACT 32-char local value), keep generated `SESSION_SECRET`.
   Leave `GOOGLE_REDIRECT_URI` for now — deploy once to learn your real URL
   (e.g. `https://business-mail-sender.onrender.com`).
4. After the first deploy, set `GOOGLE_REDIRECT_URI` to
   `https://YOUR-REAL-URL.onrender.com/auth/google/callback` (Render redeploys itself),
   and add that SAME address in Google Console → Credentials → Authorized redirect URIs.
5. Open your Render URL → Sign in with Google → use the app.
6. Know the limits (free plan): the app sleeps after ~15 min idle (first page load
   takes ~1 min to wake it), and the database resets on each redeploy — reconnect
   Google and recreate drafts after deploys. Don't start a 400-email campaign and
   redeploy halfway. For always-on + permanent history, use a paid plan with a disk.

## First safe test (3 of your own addresses)
1. New Google Sheet with header row: `email | name | company`. Add 3 rows with YOUR OWN emails (Gmail + 2 aliases like `you+1@gmail.com` work).
2. Wizard: paste link → tab → Preview (should say 3 valid) → subject `Hello {{name|there}}` → body `<p>Hi {{name|there}} from {{company}}</p>` → buffered 30–90 → Create draft.
3. Click Send test to myself → check inbox arrives.
4. Live page → Review time & confirm → Start. Wait ~1–4 min. Report should show 3/3 sent.
5. Report → Download CSV + Save to Drive. Done — now try bigger lists.

## Troubleshooting (plain English)
- **"Google login not set up"**: `.env` keys empty. Paste them, restart (`pkill ...` + start again).
- **redirect_uri_mismatch**: the URI in Google Console must match letter-for-letter. Add both URIs above, wait 1 min, retry.
- **Access blocked / needs verification**: app is in Testing mode — add yourself under Test users (step 4).
- **Reconnect Google**: tokens revoked/expired. Click Sign in with Google again.
- **quota exceeded / 429**: you sent too fast. App auto-pauses — wait an hour, lower cap, resume tomorrow.
- **No valid emails**: header row must exist; check email column mapping; blanks/dupes are skipped and counted.
- **Service Unavailable on /mail-sender**: Node isn't running. Start it (Run section), leave Terminal open.
- **Port in use**: 3000 is taken by another app here — Business Mail Sender uses 3001 on purpose.
- **Hostinger shows "This Page Does Not Exist"**: you deployed as a static site. Use hPanel **Web Apps** (Business plan+) per the Hostinger section above.
