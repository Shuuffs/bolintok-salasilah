create extension if not exists pgcrypto;

create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  spouse text,                 -- free text, e.g. "Baking Lapayon (1921-__)"
  parent_id uuid references people(id) on delete cascade,
  generation int not null default 0,  -- 0 = root couple
  created_at timestamptz default now()
);

create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,  -- path within the 'family-photos' bucket
  created_at timestamptz default now()
);

alter table people enable row level security;
alter table photos enable row level security;

-- Public can read the tree; only authenticated (admin) can write
create policy "public read people" on people for select using (true);
create policy "admin write people" on people for insert with check (auth.role() = 'authenticated');
create policy "admin update people" on people for update using (auth.role() = 'authenticated');
create policy "admin delete people" on people for delete using (auth.role() = 'authenticated');

-- Public can read + insert photo records; only admin can delete
create policy "public read photos" on photos for select using (true);
create policy "public insert photos" on photos for insert with check (true);
create policy "admin delete photos" on photos for delete using (auth.role() = 'authenticated');

-- Storage bucket (public read)
insert into storage.buckets (id, name, public)
values ('family-photos', 'family-photos', true)
on conflict (id) do nothing;

create policy "public read family-photos" on storage.objects
  for select using (bucket_id = 'family-photos');
create policy "public insert family-photos" on storage.objects
  for insert with check (bucket_id = 'family-photos');
create policy "admin update family-photos" on storage.objects
  for update using (bucket_id = 'family-photos' and auth.role() = 'authenticated');
create policy "admin delete family-photos" on storage.objects
  for delete using (bucket_id = 'family-photos' and auth.role() = 'authenticated');
