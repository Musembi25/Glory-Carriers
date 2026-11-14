# The City on A Hill

The City on A Hill is a mobile-first community management app for the **City on a Hill** cell group, built with React and Supabase. Members sign in to connect, plan gatherings, share prayer, study Scripture, and serve together.

## Easiest path

If you want the smoothest setup right now:

1. Create a fresh Supabase project. Do not run [`supabase/fresh-start.sql`](supabase/fresh-start.sql) against an existing project unless you intend to erase its application data.
2. In Supabase Auth settings, turn off `Confirm email` while testing.
3. Run [`supabase/schema.sql`](supabase/schema.sql).
4. Add your `.env` values.
5. Start the app and create the first account.

With that flow, the first signed-up account becomes the admin and you do not need inbox confirmation to get started.

## What is included

- Email/password authentication with Supabase Auth
- Empty-state-first event dashboard with no seeded demo data
- Automatic first-user admin role, with member role management afterward
- Admin member management with promotion to admin, access pause/restore, and user deletion
- Personal settings page with name editing, password updates, and theme controls
- Realtime direct messaging page for member-to-member and member-to-admin conversations with reply links
- In-app popup alerts plus browser notifications when permission is granted
- Realtime syncing for events, ideas, votes, tasks, RSVPs, and user roles
- Responsive horizontal desktop navigation and a slide-out mobile menu
- Light and dark themes using the shared Royal Purple design system
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

5. Run the SQL in [`supabase/schema.sql`](supabase/schema.sql).
   This now creates the app tables, messaging permissions, and realtime setup.

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
- Users can update their display name, change their password, and switch theme from the app.
- Members and admins can send direct messages to active members.
- Admins can promote any member to `admin` from the Members page and can delete users through the built-in `admin_delete_user` SQL function.
- Messages now support reply links, so rerunning the schema is required for existing Supabase projects.
- The app shows in-app realtime alerts for new events, planning ideas, tasks, and messages, and can also use browser notifications when supported and enabled.
- Add your local and production app URLs to Supabase Auth `Site URL` and `Redirect URLs` so reset links can return to The City on A Hill.
- Supabase's default email sender is heavily throttled during testing. To avoid signup/reset email throttling, disable `Confirm email` while testing or configure a custom SMTP provider.
- After this update, rerun [`supabase/schema.sql`](supabase/schema.sql) so the new messaging permissions are applied.
- If admin access is missing, rerun [`supabase/schema.sql`](supabase/schema.sql) once, then sign out and sign back in. The app now recreates the signed-in profile if needed and auto-claims admin when no active admin exists.
- Rerunning [`supabase/schema.sql`](supabase/schema.sql) now also backfills missing `public.profiles` rows from `auth.users`, so admins can see all created accounts in Members.
- For an immediate manual fix, run [`supabase/repair-admin.sql`](supabase/repair-admin.sql) or update the matching row in `public.profiles` to `role = 'admin'`.

### Single cell group migration

For the existing project, run [`supabase/single-cell-group-migration.sql`](supabase/single-cell-group-migration.sql) once in the Supabase SQL Editor. It renames the existing primary group to **City on a Hill**, moves linked records from the two private management groups to the primary group, and retains protected before-state snapshots and the archived group rows. Member accounts and the historical transfer audit log are preserved. The migration also fixes the canonical group identity and disables client group creation and member transfers.

### Fun Zone migration

After the existing `gc-pulse-activities-migration.sql`, `gc-pulse-arena-controls-migration.sql`, `management-cell-groups-migration.sql`, and `single-cell-group-migration.sql` migrations are in place, run [`supabase/fun-zone-migration.sql`](supabase/fun-zone-migration.sql) in the same Supabase project's SQL Editor. It extends existing Arena activities in place, keeps old activity and response history, and adds secure multi-question attempts, scoring, achievements, group results, and Realtime publication. It does not create sample members or activities and disables direct client deletion of activity history. The migration ends by requesting a PostgREST schema refresh. For projects that already applied the management migration before the activity-scope fix, run [`supabase/fun-zone-activity-scope-fix.sql`](supabase/fun-zone-activity-scope-fix.sql) after Fun Zone.

### Personal Bible Study migration

After the existing Bible Study and single-cell-group migrations are applied, run [`supabase/bible-study-personal-migration.sql`](supabase/bible-study-personal-migration.sql) in the same Supabase project's SQL Editor. It adds private, per-member reading plans and notes with row-level security and Realtime. The existing shared group plan, completions, takeaways, and historical records remain in place and separate.

### Bible Streak migration

Apply [`supabase/bible-streak-notification-type-migration.sql`](supabase/bible-streak-notification-type-migration.sql) by itself and commit it first. Then run [`supabase/bible-streak-system-migration.sql`](supabase/bible-streak-system-migration.sql). Both the existing Bible Study schema and the personal Bible Study migration must be in place first. The enum change must commit separately before PostgreSQL can use its new value in the reminder function.

The streak migration derives personal history from genuine `completed_at` timestamps on `personal_bible_study_readings`; it does not create historical completions. Completion timestamps are converted to the Super Admin configured timezone (initially `Africa/Nairobi`) before daily streaks are counted. Each qualifying personal calendar day counts once, regardless of chapter count. The initial rule is at least one chapter per day. Super Admin can change the policy to all assigned chapters (days without an assignment still require one selected personal chapter). Direct client writes cannot mark a chapter complete or alter completed history; the completion RPC validates the book/chapter, stamps completion in the database, awards any eligible milestone once, and returns the refreshed summary.

Streak Freeze is disabled by default. If enabled, the configured number of freezes is available per member per calendar month. A freeze can protect only yesterday when the preceding day qualified, and automatic use can be enabled by Super Admin. Personal milestones and freeze usage are private to the member. Group consistency is separate: each scheduled shared reading day counts only when the configured percentage of active members completes every chapter assigned for that day; unscheduled days are skipped.

The migration adds RLS protected settings, private reminder preferences, immutable freeze-usage and achievement records, server-side RPCs, Realtime publication, and 15-minute `pg_cron` jobs for reminders and automatic freeze use. It preserves all existing reading, note, and shared group records. In-app reminders are stored through the existing notifications table. To send push reminders, deploy `supabase/functions/send-push-notification` with the existing VAPID settings and configure the project's notifications-insert webhook to call `/functions/v1/send-push-notification`; provide `x-webhook-secret` when `PUSH_WEBHOOK_SECRET` is set. Members must choose “In-app and push” and have Bible Study push notifications enabled. Without that webhook/device setup, in-app delivery still works.

### Bible Streak Partners migration

After the existing management cell-group, Bible Study, personal Bible Study, and Bible Streak migrations are applied, run [`supabase/bible-partner-experience-migration.sql`](supabase/bible-partner-experience-migration.sql) in the same Supabase project's SQL Editor. It migrates existing two-person partnerships, adds invitations for multi-member reading circles, secure aggregate partner reading summaries, shared activity and reactions, encouragement messages, and persistent reading challenges. A member's personal reading summary is available to accepted members only; private notes and reflections are never exposed. The migration also adds partner completion notifications and Realtime publication.

### Member record migrations

For an existing project with cell-group management and birthday management already installed, run these two SQL files in the Supabase SQL Editor, in order:

1. Run [`supabase/member-record-status-enum-migration.sql`](supabase/member-record-status-enum-migration.sql) by itself and commit it. PostgreSQL must commit new enum values before another migration uses them.
2. Run [`supabase/pre-membership-records-migration.sql`](supabase/pre-membership-records-migration.sql). It adds independent person records, secure account linking, and the updated birthday reminder query.

The second migration is additive and preserves existing member rows and linked accounts. It expects `cell-group-management-migration.sql`, `management-cell-groups-migration.sql`, `birthday-notification-type-migration.sql`, and `member-birthday-management-migration.sql` to already be applied.

To remove legacy avatar data and enable optional profile photos on an existing project, first remove the legacy `avatars` and `member-record-photos` objects using the Supabase Storage API (the linked-project commands are documented at the top of [`supabase/remove-avatar-feature-migration.sql`](supabase/remove-avatar-feature-migration.sql)), then run that SQL file once. It removes old avatar fields and buckets and creates the `profile-photos` bucket used for member-selected photos.

Both migrations request a PostgREST schema-cache refresh when they run. If the migrations were already applied before the refresh request was added, run `NOTIFY pgrst, 'reload schema';` in the same project's Supabase SQL Editor, then reload the app. Make sure the SQL Editor project is the same Supabase project configured by this app.

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

The City on A Hill can be installed on **iPhone/iPad**, **Android**, and **desktop** (Windows, macOS, Linux) like a native app. Typography stays the same across platforms (Inter/Manrope from Google Fonts); the app does not switch to different system fonts when installed.

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

- [`src/App.jsx`](src/App.jsx)
- [`src/components/AppShell.jsx`](src/components/AppShell.jsx)
- [`src/context/AuthContext.jsx`](src/context/AuthContext.jsx)
- [`src/lib/supabase.js`](src/lib/supabase.js)
- [`src/styles.css`](src/styles.css)
- [`supabase/fresh-start.sql`](supabase/fresh-start.sql)
- [`supabase/schema.sql`](supabase/schema.sql)
- [`supabase/repair-admin.sql`](supabase/repair-admin.sql)
- [`supabase/functions/admin-delete-user/index.ts`](supabase/functions/admin-delete-user/index.ts)
