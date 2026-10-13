# Quest Log

A gamified to-do app (PWA). XP, levels, daily streaks, a daily **boss** quest (×3 XP for the thing you've been dodging), a focus timer that only pays out if you finish, and badges.

- Works on phone and desktop, installable to the iPhone Home Screen
- Offline-first: everything saves on the device first and syncs when you're online
- Real accounts (Supabase): your account and a guest account, each with fully separate data
- Login is remembered on the device

## Setup (about 15 minutes, once)

### 1. Create the Supabase project
1. Go to https://supabase.com, sign up (free), click **New project**.
2. Pick a name, a database password (save it somewhere), and a region close to you (e.g. Frankfurt or Paris-area EU).

### 2. Create the database tables
1. In the project: **SQL Editor → New query**.
2. Open `supabase-setup.sql` from this folder, paste everything, click **Run**.
3. You should see "Success. No rows returned".

### 3. Create the two accounts
Supabase dashboard → **Authentication → Users → Add user → Create new user**.
- Account 1: your email + a strong password. Tick **Auto Confirm User**.
- Account 2 (guest): any email, e.g. `guest@example.com`, + a password. Tick **Auto Confirm User**.

Each account only sees its own quests (enforced by row-level security in the database).

### 4. Lock the door
**Authentication → Sign In / Providers** (or "Settings") → turn **off** "Allow new users to sign up".
Now only the two accounts you created can ever log in.

### 5. Paste your project keys into the app
Dashboard → **Project Settings → API** (or "API Keys").
Copy the **Project URL** and the **anon / publishable** key into `config.js`:

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://xxxxxxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJ..."   // or sb_publishable_...
};
```
Never paste a `service_role` / secret key. The anon/publishable key is meant to be public.

### 6. Deploy on GitHub Pages
1. Create a new GitHub repository (public or private; GitHub Pages on private repos needs a paid plan, so public is simplest).
2. Upload every file in this folder (keep the `icons/` and `vendor/` folders) to the repo root.
3. Repo **Settings → Pages → Build and deployment**: Source = "Deploy from a branch", Branch = `main`, folder = `/ (root)`. Save.
4. After a minute your app is live at `https://<your-username>.github.io/<repo-name>/`.

(Netlify Drop works too: drag this folder onto https://app.netlify.com/drop.)

### 7. Install it on your iPhone
1. Open the URL in **Safari**.
2. **Share → Add to Home Screen**.
3. Open the app **from the new Home Screen icon** and log in there once. (iOS gives the installed app its own storage, separate from Safari tabs, so log in inside the installed app.)
4. Leave it open for a few seconds while online so it can cache itself. After that it opens and works with no connection.

On desktop Chrome/Edge: use the install icon in the address bar.

## How the game works
- **Quest sizes:** Quick = 10 XP, Solid = 25 XP, Heavy = 60 XP.
- **Boss:** pick one quest per day as the boss. Beating it that day pays ×3 XP. The app suggests your oldest quest. If you don't beat it today, the boss status resets tomorrow.
- **Focus timer:** 1 XP per minute, paid only when the full session finishes. Giving up pays nothing.
- **Streak:** any day with at least one finished quest or focus session counts.
- **Daily goal:** 3 quests.
- **Levels:** level N needs 50·N·(N−1) total XP. Titles climb from Couch Goblin to Mythic Operator.

## Offline and sync, how it behaves
- Every change is saved on the device immediately, then pushed to Supabase when online.
- Phone and PC pull each other's changes on open, when you come back to the app, and every minute.
- If the same quest is edited on two devices while offline, the last device to sync wins. Fine for one person, not built for heavy collaboration.
- Logging out keeps your data in the cloud; logging back in restores it.

## Updating the app later
Edit the files, push to GitHub, and **bump `VERSION` in `sw.js`** (e.g. `quest-v2`) so devices drop their old cache. Installed apps pick up the new version on the second open.

## Try it locally first
Leave `config.js` empty to run in local-only mode (no login, no sync):
```
python3 -m http.server 8000
```
Then open http://localhost:8000.

## Free-tier notes
Supabase pauses free projects after about a week of no activity. If that happens, click **Restore** in the dashboard. Using the app daily prevents it.
