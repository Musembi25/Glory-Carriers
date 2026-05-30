# Glory Carriers

Glory Carriers is a modern, mobile-first cell group planning app built with React and Supabase. It starts with an empty database and lets your group securely sign in, create events, RSVP live, suggest ideas, assign tasks, and collaborate in real time from any device.

## Easiest path

If you want the smoothest setup right now:

1. Create a fresh Supabase project, or run [supabase/fresh-start.sql](/home/shadrack-musembi/Glory Carriers/supabase/fresh-start.sql) on the old one.
2. In Supabase Auth settings, turn off `Confirm email` while testing.
3. Run [supabase/schema.sql](/home/shadrack-musembi/Glory Carriers/supabase/schema.sql).
4. Add your `.env` values.
5. Start the app and create the first account.

With that flow, the first signed-up account becomes the admin and you do not need inbox confirmation to get started.

## What is included

- Email/password authentication with Supabase Auth
- Empty-state-first event dashboard with no seeded demo data
- Automatic first-user admin role, with member role management afterward
- Admin member management with promotion to admin, access pause/restore, and user deletion
- Personal settings page with name editing, password updates, theme controls, and profile pictures
- Realtime messaging page for member-to-member, member-to-admin, shared broadcasts, and reply-linked conversations
- In-app popup alerts plus browser notifications when permission is granted
- Realtime syncing for events, ideas, votes, tasks, RSVPs, and user roles
- Responsive layout with desktop sidebar and mobile bottom navigation
- Light and dark themes using a shared blue/orange design system
- Supabase SQL schema with RLS policies and realtime publication setup
- Built-in SQL function for admin user deletion

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a Supabase project and open the SQL Editor.

3. Optional reset for an old project:

   ```sql
   -- run supabase/fresh-start.sql
   ```

4. In Supabase Dashboard, open `Authentication` and disable `Confirm email` for testing.

5. Run the SQL in [supabase/schema.sql](/home/shadrack-musembi/Glory Carriers/supabase/schema.sql).
   This now creates the app tables, the avatar storage bucket, messaging permissions, and realtime setup.

6. Copy `.env.example` to `.env` and set:

   ```bash
   VITE_SUPABASE_URL=your-project-url
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

7. In Supabase Auth URL settings, add your local app URL to `Site URL` and `Redirect URLs`.
   Example: `http://localhost:5173`

8. (Optional) Deploy `supabase/functions/admin-delete-user` only if you prefer
   Edge Function based deletion. The app now deletes users through SQL by default.

9. Start the app:

   ```bash
   npm run dev
   ```

## Supabase notes

- The very first signed-up account becomes `admin`.
- All later accounts become regular `user` accounts until an admin promotes them.
- The schema enables row-level security policies for all tables.
- Realtime is enabled for every collaborative table used by the app.
- The database begins empty by design.
- Password recovery is enabled in the UI and uses Supabase reset emails when email delivery is configured.
- Users can update their display name, change their password, switch theme, and upload a profile photo from the app.
- The schema creates a public `avatars` storage bucket for profile pictures.
- Members and admins can message active members directly or send broadcasts to everyone.
- Admins can promote any member to `admin` from the Members page and can delete users through the built-in `admin_delete_user` SQL function.
- Messages now support reply links, so rerunning the schema is required for existing Supabase projects.
- The app shows in-app realtime alerts for new events, planning ideas, tasks, and messages, and can also use browser notifications when supported and enabled.
- Add your local and production app URLs to Supabase Auth `Site URL` and `Redirect URLs` so reset links can return to Glory Carriers.
- Supabase's default email sender is heavily throttled during testing. To avoid signup/reset email throttling, disable `Confirm email` while testing or configure a custom SMTP provider.
- After this update, rerun [supabase/schema.sql](/home/shadrack-musembi/Glory Carriers/supabase/schema.sql) so the new messaging permissions are applied.
- If admin access is missing, rerun [supabase/schema.sql](/home/shadrack-musembi/Glory Carriers/supabase/schema.sql) once, then sign out and sign back in. The app now recreates the signed-in profile if needed and auto-claims admin when no active admin exists.
- Rerunning [supabase/schema.sql](/home/shadrack-musembi/Glory Carriers/supabase/schema.sql) now also backfills missing `public.profiles` rows from `auth.users`, so admins can see all created accounts in Members.
- For an immediate manual fix, run [supabase/repair-admin.sql](/home/shadrack-musembi/Glory Carriers/supabase/repair-admin.sql) or update the matching row in `public.profiles` to `role = 'admin'`.

## Live site (GitHub Pages)

**Pushing to GitHub does not change a live website by itself.** You need hosting that rebuilds from `main`.

This repo includes a GitHub Actions workflow (`.github/workflows/deploy-pages.yml`) that publishes the app after each push to `main`.

1. On GitHub: open **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
2. In **Settings → Secrets and variables → Actions**, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Push to `main` (or run the workflow manually under **Actions**).

Your site will be at: **https://musembi25.github.io/Glory-Carriers/**

If you still see the old app: hard-refresh the browser (`Ctrl+Shift+R`) or clear the installed PWA and open the link again.

**Local changes:** run `npm run dev` and refresh. If `git commit` says *nothing to commit*, everything is already saved—there is nothing new to push.

## Install as an app (PWA)

Glory Carriers can be installed on **iPhone/iPad**, **Android**, and **desktop** (Windows, macOS, Linux) like a native app. Typography stays the same across platforms (Inter/Manrope from Google Fonts); the app does not switch to different system fonts when installed.

**Requirements:** deploy over **HTTPS** (or use `localhost` while developing). Run `npm run build` then `npm run preview` to test install locally.

| Platform | How to install |
| -------- | -------------- |
| **iPhone / iPad** | Safari → **Share** → **Add to Home Screen** |
| **Android** | Chrome menu → **Install app** / **Add to Home screen** |
| **Windows / Mac (Chrome, Edge, Brave)** | Use **Install app** in the in-app banner, or the install icon in the address bar |
| **Mac (Safari)** | **File → Add to Dock** |

Regenerate home-screen icons after changing `logo.png`:

```bash
npm run generate:icons
```

## Project structure

- [src/App.jsx](/home/shadrack-musembi/Glory Carriers/src/App.jsx)
- [src/components/AppShell.jsx](/home/shadrack-musembi/Glory Carriers/src/components/AppShell.jsx)
- [src/context/AuthContext.jsx](/home/shadrack-musembi/Glory Carriers/src/context/AuthContext.jsx)
- [src/lib/supabase.js](/home/shadrack-musembi/Glory Carriers/src/lib/supabase.js)
- [src/styles.css](/home/shadrack-musembi/Glory Carriers/src/styles.css)
- [supabase/fresh-start.sql](/home/shadrack-musembi/Glory Carriers/supabase/fresh-start.sql)
- [supabase/schema.sql](/home/shadrack-musembi/Glory Carriers/supabase/schema.sql)
- [supabase/repair-admin.sql](/home/shadrack-musembi/Glory Carriers/supabase/repair-admin.sql)
- [supabase/functions/admin-delete-user/index.ts](/home/shadrack-musembi/Glory Carriers/supabase/functions/admin-delete-user/index.ts)
