'use client';
import { useEffect, useState } from 'react';
import { supabase, photoUrl } from '@/lib/supabase';

export default function Gallery() {
  const [photos, setPhotos] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);

  useEffect(() => {
    supabase.from('photos').select('*').order('created_at', { ascending: false }).then(({ data, error }) => {
      if (error) setError(error.message); else setPhotos(data);
    });
  }, []);

  return (
    <div className="page">
      <h1>Gallery</h1>
      {error && <p className="error">{error}</p>}
      {!photos && !error && <p className="muted">Loading…</p>}
      {photos?.length === 0 && <p className="muted">No photos yet. Be the first!</p>}
      <div className="grid">
        {photos?.map((p) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={p.id} src={photoUrl(p.storage_path)} alt="" loading="lazy" onClick={() => setOpen(p)} />
        ))}
      </div>
      {open && (
        <div className="lightbox" onClick={() => setOpen(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl(open.storage_path)} alt="" />
        </div>
      )}
    </div>
  );
}
