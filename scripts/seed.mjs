// One-off seed: npm run seed
// Requires SUPABASE_SERVICE_ROLE_KEY in .env.local (never commit it).
//
// Known data-quality caveats from the source PDF (fix via /admin once confirmed with family):
//  - Henry Labasa's grandchildren via Adeline vs Joseph may be swapped
//  - Solokoh Judith Madili: 2 extra children (Florence, Justine Godwin), uncertain generation
//  - Joanes Suani Muyuk: 5 grandchildren assigned by birth-year guess
//  - Sylvester Saimon Simin: two numbered lists merged into one 10-child family
//  - Forlina Simin: has children but no spouse named
//  - Winnie Labasa: source says "see Allan's family" - children unresolved, currently empty
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const tree = JSON.parse(readFileSync(new URL('../tree.json', import.meta.url), 'utf8'));
const rows = [];
(function walk(node, parentId, generation) {
  const id = randomUUID();
  rows.push({ id, name: node.name, spouse: node.spouse ?? null, parent_id: parentId, generation });
  for (const kid of node.kids ?? []) walk(kid, id, generation + 1);
})(tree, null, 0);

const { count, error: countErr } = await supabase.from('people').select('*', { count: 'exact', head: true });
if (countErr) { console.error(countErr); process.exit(1); }
if (count > 0) {
  console.error(`people table already has ${count} rows; refusing to seed twice.`);
  process.exit(1);
}

// Depth-first order means parents are always inserted before children (FK-safe).
for (let i = 0; i < rows.length; i += 100) {
  const { error } = await supabase.from('people').insert(rows.slice(i, i + 100));
  if (error) { console.error(error); process.exit(1); }
}
console.log(`Inserted ${rows.length} people.`);
