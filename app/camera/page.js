'use client';
import { useRef, useState } from 'react';
import { Camera as CameraIcon, Check, X } from 'lucide-react';
import { supabase, BUCKET } from '@/lib/supabase';

export default function Camera() {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const pick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setMsg(''); setError('');
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const reset = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null); setPreview('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const upload = async () => {
    setBusy(true); setError('');
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
    if (upErr) { setError(upErr.message); setBusy(false); return; }
    const { error: dbErr } = await supabase.from('photos').insert({ storage_path: path });
    if (dbErr) { setError(dbErr.message); setBusy(false); return; }
    setBusy(false);
    reset();
    setMsg('Uploaded! Thank you. Take another?');
  };

  return (
    <div className="page center">
      <h1>Take a photo</h1>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={pick} hidden />
      {!file ? (
        <>
          <button className="btn" style={{ fontSize: 20, padding: '24px 36px' }} onClick={() => inputRef.current.click()}>
            <CameraIcon size={26} aria-hidden="true" /> Open camera
          </button>
          {msg && <p role="status">{msg}</p>}
        </>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Preview of your photo" className="preview" />
          <div className="row">
            <button className="btn secondary" disabled={busy} onClick={reset}><X size={20} aria-hidden="true" /> Retake</button>
            <button className="btn" disabled={busy} onClick={upload}><Check size={20} aria-hidden="true" /> {busy ? 'Uploading…' : 'Upload'}</button>
          </div>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
