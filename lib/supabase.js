import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export const BUCKET = 'family-photos';
export const photoUrl = (path) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
