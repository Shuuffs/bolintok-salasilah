# Bolintok Salasilah — Family Day Web App

Brief for Claude Code to scaffold and build this project locally. Everything below reflects
decisions already made — follow it directly rather than re-deciding architecture.

## What this is

A mobile-first website for a family-day event for the Bolintok family (Brunei). Two surfaces:

1. **Public pages** (no login) — guests browse on their own phones:
   - Interactive family tree (pan/zoom/search/expand-collapse), ~451 people across 7 generations
   - Camera → photo upload (native phone camera, preview with confirm/retake, uploads straight to storage)
   - Photo gallery (grid of everyone's uploaded photos)
2. **Admin pages** (login-protected, just for me) — works on mobile and desktop:
   - CRUD on people (fix names/dates, reassign a parent, add someone missing)
   - Gallery moderation (view all uploads, delete bad ones)

## Tech stack (decided, don't change)

- **Next.js** (App Router), plain JS (no TypeScript needed, keep it simple)
- **Supabase**: Postgres database, Auth (email/password, single admin user), Storage (photo bucket) —
  project already created:
  - URL: `https://zdkienobuxeouhnfuwsl.supabase.co`
  - anon/public key: `sb_publishable_urSvKHb63gz3lr6-K_2iew_N0KmXJL0`
  - (service role key: get fresh from Supabase dashboard → Project Settings → API when needed for
    server-side/seed scripts — never commit it, env var only, never in a client component)
- **Hosting**: Vercel (static + the few server bits Supabase needs all deploy together)
- **GitHub repo** (already created, empty): `https://github.com/Shuuffs/bolintok-salasilah.git`
- No separate backend framework, no Google Drive — Supabase Storage handles photo uploads directly
  from the browser via a restricted RLS policy (insert-only for anon, no auth needed for guests)

## Database schema

```sql
create extension if not exists pgcrypto;

create table people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  spouse text,                 -- free text, e.g. "Baking Lapayon (1921-__)" — matches source doc style
  parent_id uuid references people(id) on delete cascade,
  generation int not null default 0,  -- 0 = root couple, increments per generation
  created_at timestamptz default now()
);

create table photos (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,  -- path within the 'family-photos' bucket
  created_at timestamptz default now()
);

alter table people enable row level security;
alter table photos enable row level security;

-- Public can read the tree
create policy "public read people" on people for select using (true);
-- Only authenticated (admin) can write
create policy "admin write people" on people for insert with check (auth.role() = 'authenticated');
create policy "admin update people" on people for update using (auth.role() = 'authenticated');
create policy "admin delete people" on people for delete using (auth.role() = 'authenticated');

-- Public can read + insert photo records (no tagging/auth needed to upload)
create policy "public read photos" on photos for select using (true);
create policy "public insert photos" on photos for insert with check (true);
-- Only admin can delete (moderation)
create policy "admin delete photos" on photos for delete using (auth.role() = 'authenticated');
```

Storage: create a bucket named `family-photos` (public read). Bucket policies:
- `select`: public (true) — so the gallery can display images
- `insert`: public (true) — so guests can upload without signing in
- `update`/`delete`: authenticated only

## Seed data

The family tree has already been fully transcribed from the source PDF (a genealogy document,
"Salasilah Keluarga Bolintok") into a nested JSON file — **`tree.json`**, attached alongside this
brief. Write a one-off Node or Python seed script that:
1. Reads `tree.json` (shape: `{name, spouse, kids: [...]}`, recursively nested)
2. Walks it depth-first, assigning each person a UUID, a `parent_id` (null for the root), and a
   `generation` number (root = 0, increments per level)
3. Inserts into the `people` table via the Supabase **service role key** (bypasses RLS for the
   one-time seed) — do this as a local script, not a page in the deployed app
4. Run once against the live database, then the script isn't needed again (editing happens through
   the admin CRUD pages afterward)

**Known data-quality caveats to flag in the admin UI or a comment** — these came from genuinely
ambiguous merged table cells in the source PDF, best-guessed during transcription, worth fixing via
the admin panel once confirmed with family:
- Henry Labasa's grandchildren via his children Adeline vs Joseph may be swapped
- Solokoh Judith Madili: 2 extra children (Florence, Justine Godwin) added with uncertain generation
- Joanes Suani Muyuk: 5 grandchildren assigned by birth-year guess, not explicit in source
- Sylvester Saimon Simin: two separate numbered lists merged into one 10-child family
- Forlina Simin: has children listed but no spouse named in source
- Winnie Labasa: source says "see Allan's family" for her children — unresolved, currently empty

## Pages to build

- `app/page.js` — home = the tree view. Mobile-first: big tap targets, simplified pan/zoom
  (reuse the D3 collapsible-tree approach: click a node to expand/collapse, search box to jump to
  a name and highlight the path back to root), reading people from Supabase instead of a static file.
- `app/camera/page.js` — opens native camera via `<input type="file" accept="image/*" capture="environment">`,
  shows a preview with ✓ (upload) / ✗ (retake) buttons, uploads directly to the `family-photos`
  Storage bucket via `supabase-js`, no name/tagging field (fastest flow, per earlier decision).
- `app/gallery/page.js` — grid of all photos in the bucket, newest first, tap to view full-size.
- `app/admin/login/page.js` — Supabase Auth email/password sign-in form.
- `app/admin/page.js` — protected (redirect to login if no session): table of people with
  inline edit / delete / add-new, and a gallery moderation grid with delete buttons. Responsive
  for both mobile and desktop (not just a developer-facing table).
- Simple bottom/top nav between Tree / Camera / Gallery on public pages.

## Visual style

Dark theme, mobile-first (this was explicitly requested — most guests will be on phones).
Reference the color/contrast choices already tuned: link lines `#6b7390`, spouse text `#c9cfe0`
(brighter than body-muted grey so it's readable against the dark background), generation-colored
node dots. Keep tap targets large, avoid dense desktop-style toolbars on the public pages.

## Deploy

1. `npm install`, test locally with `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
2. Push to `https://github.com/Shuuffs/bolintok-salasilah.git`
3. Import the repo in Vercel, set the same env vars there, deploy
4. Create the one admin user manually in Supabase dashboard (Auth → Users → Add user) — don't
   build public self-signup, this is a single-admin app
5. Make a QR code (user will do this themselves in Canva) pointing at the deployed Vercel URL
