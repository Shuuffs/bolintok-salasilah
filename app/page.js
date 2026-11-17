'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import TreeView from '@/components/TreeView';

export default function Home() {
  const [people, setPeople] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      // PostgREST caps rows per request (1000 default); 451 fits, but page to be safe.
      const all = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from('people').select('*').order('created_at').range(from, from + 999);
        if (error) { setError(error.message); return; }
        all.push(...data);
        if (data.length < 1000) break;
      }
      setPeople(all);
    })();
  }, []);

  if (error) return <p className="page error">Could not load tree: {error}</p>;
  if (!people) return <p className="page muted">Loading family tree…</p>;
  return <TreeView people={people} />;
}
