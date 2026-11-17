'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, LogOut, ExternalLink, ChevronLeft, ChevronRight, ArrowUp, ArrowDown } from 'lucide-react';
import { supabase, BUCKET, photoUrl } from '@/lib/supabase';

const PAGE_SIZE = 25; // rows per page — tweak here

// Known ambiguities from the source PDF - verify with family, then fix below.
const CAVEATS = [
  "Henry Labasa's grandchildren via Adeline vs Joseph may be swapped",
  'Solokoh Judith Madili: 2 extra children (Florence, Justine Godwin) with uncertain generation',
  'Joanes Suani Muyuk: 5 grandchildren assigned by birth-year guess',
  'Sylvester Saimon Simin: two numbered lists merged into one 10-child family',
  'Forlina Simin: has children listed but no spouse named',
  'Winnie Labasa: source says "see Allan\'s family" - children currently empty',
];

export default function Admin() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [people, setPeople] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: null, dir: 'asc' }); // key: 'name' | 'generation' | null (insertion order)
  const [editing, setEditing] = useState(null); // person object (id may be null for new)
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const all = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('people').select('*').order('created_at').range(from, from + 999);
      if (error) { setError(error.message); return; }
      all.push(...data);
      if (data.length < 1000) break;
    }
    setPeople(all);
    const { data: ph } = await supabase.from('photos').select('*').order('created_at', { ascending: false });
    setPhotos(ph || []);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace('/admin/login');
      else { setReady(true); load(); }
    });
  }, [router, load]);

  const nameById = useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people]);
  // Filter + sort run over the full dataset; only the slice below is paginated.
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const rows = q ? people.filter((p) => p.name.toLowerCase().includes(q) || (p.spouse || '').toLowerCase().includes(q)) : people;
    if (!sort.key) return rows;
    const m = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) =>
      sort.key === 'name' ? m * a.name.localeCompare(b.name) : m * (a.generation - b.generation)
    );
  }, [people, filter, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const shown = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const toggleSort = (key) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
    setPage(1);
  };
  const sortIcon = (key) =>
    sort.key === key ? (sort.dir === 'asc' ? <ArrowUp size={14} aria-hidden="true" /> : <ArrowDown size={14} aria-hidden="true" />) : null;
  const ariaSort = (key) => (sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none');

  const pager = (
    <div className="row between pager" role="navigation" aria-label="Pagination">
      <button className="btn secondary small" disabled={current <= 1} onClick={() => setPage(current - 1)}>
        <ChevronLeft size={18} aria-hidden="true" />Prev
      </button>
      <span className="muted">Page {current} of {totalPages} · {filtered.length} people</span>
      <button className="btn secondary small" disabled={current >= totalPages} onClick={() => setPage(current + 1)}>
        Next<ChevronRight size={18} aria-hidden="true" />
      </button>
    </div>
  );

  const save = async (e) => {
    e.preventDefault();
    const { id, name, spouse, parent_id, generation } = editing;
    const row = { name: name.trim(), spouse: spouse?.trim() || null, parent_id: parent_id || null, generation: Number(generation) || 0 };
    const q = id ? supabase.from('people').update(row).eq('id', id) : supabase.from('people').insert(row);
    const { error } = await q;
    if (error) { setError(error.message); return; }
    setError(''); setEditing(null); load();
  };

  const removePerson = async (p) => {
    if (!confirm(`Delete ${p.name} and ALL their descendants?`)) return;
    const { error } = await supabase.from('people').delete().eq('id', p.id);
    if (error) setError(error.message); else load();
  };

  const removePhoto = async (p) => {
    if (!confirm('Delete this photo?')) return;
    await supabase.storage.from(BUCKET).remove([p.storage_path]);
    const { error } = await supabase.from('photos').delete().eq('id', p.id);
    if (error) setError(error.message); else load();
  };

  const signOut = async () => { await supabase.auth.signOut(); router.replace('/admin/login'); };

  if (!ready) return <p className="page muted">Checking session…</p>;

  const actions = (p) => (
    <div className="row actions">
      <button className="btn secondary small" onClick={() => setEditing(p)}><Pencil size={16} aria-hidden="true" />Edit</button>
      <button className="btn danger small" onClick={() => removePerson(p)}><Trash2 size={16} aria-hidden="true" />Delete</button>
    </div>
  );

  return (
    <div className="page">
      <div className="row between">
        <h1>Admin</h1>
        <div className="row">
          <a className="btn secondary small" href="/"><ExternalLink size={18} aria-hidden="true" />View site</a>
          <button className="btn secondary small" onClick={signOut}><LogOut size={18} aria-hidden="true" />Sign out</button>
        </div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      <div className="notice">
        <strong>Data to double-check with family:</strong>
        <ul>{CAVEATS.map((c) => <li key={c}>{c}</li>)}</ul>
      </div>

      <h2>People ({people.length})</h2>
      <div className="row" style={{ marginBottom: 12 }}>
        <input style={{ flex: 1, minWidth: 200, width: 'auto' }} placeholder="Filter by name…" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }} />
        <button className="btn" onClick={() => setEditing({ id: null, name: '', spouse: '', parent_id: '', generation: 0 })}>
          <Plus size={20} aria-hidden="true" />Add person
        </button>
      </div>

      {editing && (
        <form className="card stack" onSubmit={save}>
          <strong>{editing.id ? 'Edit person' : 'New person'}</strong>
          <input placeholder="Name" required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          <input placeholder="Spouse (free text)" value={editing.spouse || ''} onChange={(e) => setEditing({ ...editing, spouse: e.target.value })} />
          <select aria-label="Parent" value={editing.parent_id || ''} onChange={(e) => {
            const parent = people.find((p) => p.id === e.target.value);
            setEditing({ ...editing, parent_id: e.target.value, generation: parent ? parent.generation + 1 : 0 });
          }}>
            <option value="">No parent (root)</option>
            {people.filter((p) => p.id !== editing.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input type="number" min="0" aria-label="Generation" placeholder="Generation" value={editing.generation} onChange={(e) => setEditing({ ...editing, generation: e.target.value })} />
          <div className="row">
            <button className="btn">Save</button>
            <button type="button" className="btn secondary" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      )}

      {/* Desktop table */}
      <div className="table-scroll table-only">
        <table className="admin-table">
          <thead>
            <tr>
              <th aria-sort={ariaSort('name')}><button className="th-sort" onClick={() => toggleSort('name')}>Name{sortIcon('name')}</button></th>
              <th>Spouse</th>
              <th>Parent</th>
              <th aria-sort={ariaSort('generation')}><button className="th-sort" onClick={() => toggleSort('generation')}>Gen{sortIcon('generation')}</button></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td><td>{p.spouse}</td><td className="muted">{nameById.get(p.parent_id) || '—'}</td><td>{p.generation}</td>
                <td className="actions-cell">{actions(p)}</td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={5} className="muted">No matching people.</td></tr>}
          </tbody>
        </table>
      </div>
      {/* Mobile cards */}
      <div className="cards-only">
        {shown.map((p) => (
          <div className="card" key={p.id}>
            <strong>{p.name}</strong>
            {p.spouse && <div style={{ color: 'var(--text-spouse)' }}>&amp; {p.spouse}</div>}
            <div className="muted">Gen {p.generation} · Parent: {nameById.get(p.parent_id) || '—'}</div>
            <div style={{ marginTop: 8 }}>{actions(p)}</div>
          </div>
        ))}
      </div>

      {pager}

      <h2>Photos ({photos.length})</h2>
      <div className="grid">
        {photos.map((p) => (
          <div className="mod-item" key={p.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl(p.storage_path)} alt="" loading="lazy" />
            <button className="btn danger small" onClick={() => removePhoto(p)} aria-label="Delete photo"><Trash2 size={18} aria-hidden="true" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
