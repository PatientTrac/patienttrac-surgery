import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Camera, Upload, Loader2, X, Image as ImageIcon, CheckCircle2, ZoomIn } from 'lucide-react';

interface Photo {
  photo_id: string;
  photo_url: string;
  photo_type: string;
  view_label: string | null;
  captured_at: string;
  storage_path: string;
}

interface Props {
  orgId: string;
  encounterId: string | number;
  onPhotoSelected?: (photoUrl: string) => void;
  selectedPhotoUrl?: string;
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  pre_op:             { label: 'Pre-Op',       color: '#3b82f6' },
  intra_op:           { label: 'Intra-Op',     color: '#f59e0b' },
  post_op:            { label: 'Post-Op',      color: '#10b981' },
  reference:          { label: 'Reference',    color: '#8b5cf6' },
  drawing_background: { label: 'BG Layer',     color: '#c9a96e' },
};

async function compressImage(file: File, maxWidth = 1600, quality = 0.88): Promise<Blob> {
  return new Promise(resolve => {
    const img = new window.Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => resolve(blob!), 'image/jpeg', quality);
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  });
}

export default function PatientPhotoCapture({ orgId, encounterId, onPhotoSelected, selectedPhotoUrl }: Props) {
  const [photos, setPhotos]         = useState<Photo[]>([]);
  const [uploading, setUploading]   = useState(false);
  const [uploadErr, setUploadErr]   = useState('');
  const [photoType, setPhotoType]   = useState<string>('pre_op');
  const [viewLabel, setViewLabel]   = useState('');
  const [lightbox, setLightbox]     = useState<Photo | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadPhotos();
  }, [encounterId]);

  const loadPhotos = async () => {
    const { data } = await supabase.schema('cr').from('patient_photos')
      .select('photo_id,photo_url,photo_type,view_label,captured_at,storage_path')
      .eq('encounter_id', encounterId)
      .eq('is_active', true)
      .order('captured_at', { ascending: false });
    setPhotos(data ?? []);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    setUploadErr('');

    try {
      const blob     = await compressImage(file);
      const ts       = Date.now();
      const ext      = 'jpg';
      const path     = `${orgId}/patients/${encounterId}/${ts}_${photoType}.${ext}`;
      const { error: storageErr } = await supabase.storage
        .from('revela-assets')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
      if (storageErr) throw storageErr;

      const { data: urlData } = supabase.storage.from('revela-assets').getPublicUrl(path);
      const photoUrl = urlData.publicUrl;

      const { data: { user } } = await supabase.auth.getUser();
      await supabase.schema('cr').from('patient_photos').insert({
        org_id:          orgId,
        encounter_id:    encounterId,
        storage_path:    path,
        photo_url:       photoUrl,
        photo_type:      photoType,
        view_label:      viewLabel || null,
        file_size_bytes: blob.size,
        mime_type:       'image/jpeg',
        captured_by:     user?.id ?? null,
      });

      await loadPhotos();
    } catch (e: any) {
      setUploadErr(e.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const deletePhoto = async (photo: Photo) => {
    await supabase.storage.from('revela-assets').remove([photo.storage_path]);
    await supabase.schema('cr').from('patient_photos')
      .update({ is_active: false })
      .eq('photo_id', photo.photo_id);
    setPhotos(prev => prev.filter(p => p.photo_id !== photo.photo_id));
    if (lightbox?.photo_id === photo.photo_id) setLightbox(null);
  };

  const S = {
    card:   { background: '#0a1628', border: '1px solid rgba(201,169,110,0.15)', borderRadius: 12, padding: '16px 20px' } as React.CSSProperties,
    label:  { color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: 700 as const, textTransform: 'uppercase' as const, letterSpacing: '0.08em', display: 'block' as const, marginBottom: 5 },
    select: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '7px 10px', color: '#fff', fontSize: 12, outline: 'none' } as React.CSSProperties,
    input:  { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '7px 10px', color: '#fff', fontSize: 12, outline: 'none', width: '100%' } as React.CSSProperties,
  };

  return (
    <div style={S.card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Camera size={16} color="#c9a96e" />
          <span style={{ color: '#c9a96e', fontSize: 13, fontWeight: 700 }}>Patient Photos</span>
          {photos.length > 0 && (
            <span style={{ background: 'rgba(201,169,110,0.15)', color: '#c9a96e', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10 }}>{photos.length}</span>
          )}
        </div>

        {/* Upload controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select value={photoType} onChange={e => setPhotoType(e.target.value)} style={S.select}>
            {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <input
            value={viewLabel}
            onChange={e => setViewLabel(e.target.value)}
            placeholder="View label (optional)"
            style={{ ...S.input, width: 140 }}
          />
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
            onChange={handleFileChange} style={{ display: 'none' }} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, background: '#c9a96e', border: 'none', color: '#060e1c', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: uploading ? 0.6 : 1 }}
          >
            {uploading
              ? <><Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Uploading…</>
              : <><Upload size={13} /> Add Photo</>}
          </button>
        </div>
      </div>

      {uploadErr && <p style={{ color: '#f87171', fontSize: 12, marginBottom: 10 }}>{uploadErr}</p>}

      {/* Photo strip */}
      {photos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px 0', border: '2px dashed rgba(255,255,255,0.07)', borderRadius: 10, color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>
          <ImageIcon size={24} style={{ marginBottom: 6, opacity: 0.3 }} />
          <div>No photos yet. Click Add Photo or use the iPad camera.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {photos.map(photo => {
            const typeInfo = TYPE_LABELS[photo.photo_type] ?? { label: photo.photo_type, color: '#888' };
            const isSelected = selectedPhotoUrl === photo.photo_url;
            return (
              <div key={photo.photo_id} style={{ position: 'relative', flexShrink: 0 }}>
                <div
                  style={{
                    width: 100, height: 100, borderRadius: 8, overflow: 'hidden', cursor: 'pointer',
                    border: `2px solid ${isSelected ? '#c9a96e' : 'rgba(255,255,255,0.1)'}`,
                    boxShadow: isSelected ? '0 0 12px rgba(201,169,110,0.5)' : 'none',
                    transition: 'all 0.15s', position: 'relative',
                  }}
                  onClick={() => onPhotoSelected?.(photo.photo_url)}
                >
                  <img src={photo.photo_url} alt={photo.view_label ?? photo.photo_type}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  {isSelected && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(201,169,110,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <CheckCircle2 size={24} color="#c9a96e" />
                    </div>
                  )}
                  {/* Type badge */}
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '3px 5px', background: 'rgba(0,0,0,0.65)' }}>
                    <span style={{ color: typeInfo.color, fontSize: 9, fontWeight: 700 }}>{typeInfo.label}</span>
                    {photo.view_label && <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9, marginLeft: 4 }}>{photo.view_label}</span>}
                  </div>
                </div>
                {/* Toolbar */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 4 }}>
                  <button onClick={() => setLightbox(photo)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'rgba(255,255,255,0.4)' }}>
                    <ZoomIn size={12} />
                  </button>
                  <button onClick={() => deletePhoto(photo)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'rgba(239,68,68,0.5)' }}>
                    <X size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {onPhotoSelected && photos.length > 0 && (
        <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, marginTop: 10, marginBottom: 0 }}>
          Click a photo to use it as the drawing background in Surgical Drawings below
        </p>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setLightbox(null)}
        >
          <button onClick={() => setLightbox(null)} style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: 40, height: 40, cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={20} />
          </button>
          <img src={lightbox.photo_url} alt="" style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 }} onClick={e => e.stopPropagation()} />
          <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.7)', borderRadius: 8, padding: '6px 16px', color: '#fff', fontSize: 12 }}>
            {TYPE_LABELS[lightbox.photo_type]?.label ?? lightbox.photo_type}
            {lightbox.view_label ? ` — ${lightbox.view_label}` : ''}
            <span style={{ color: 'rgba(255,255,255,0.45)', marginLeft: 12 }}>{new Date(lightbox.captured_at).toLocaleDateString()}</span>
          </div>
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
