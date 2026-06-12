// ================================================================
// Implant / UDI Registry — records implanted devices against the
// patient chart (cr.patient_implantable_devices) per FDA UDI rule
// and accreditation implant-log requirements. Resolves the real
// patient_id from the case spine.
// ================================================================

import React, { useCallback, useEffect, useState } from 'react';
import { Cpu, Plus, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const C = {
  gold: '#c9a96e', navy: '#060e1c', card: '#0a1628',
  text: '#e8eaf0', muted: '#8a9bc0', dim: '#3a4a6a', red: '#ef4444',
};

interface ImplantRow {
  device_id: number;
  device_name: string;
  udi: string | null;
  manufacturer: string | null;
  model_number: string | null;
  lot_number: string | null;
  serial_number: string | null;
  expiration_date: string | null;
  body_site: string | null;
  implant_date: string | null;
}

interface Props {
  caseId: number | null;
  orgId: string;
}

const blank = {
  device_name: '', udi: '', manufacturer: '', model_number: '',
  lot_number: '', serial_number: '', expiration_date: '', body_site: '',
};

export default function ImplantPanel({ caseId, orgId }: Props) {
  const [patientId, setPatientId] = useState<number | null>(null);
  const [rows, setRows] = useState<ImplantRow[]>([]);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ ...blank });

  // Resolve the real patient_id from the case spine
  useEffect(() => {
    if (!caseId) return;
    supabase.from('or_cases').select('patient_id').eq('case_id', caseId).single()
      .then(({ data }) => setPatientId(data?.patient_id ?? null));
  }, [caseId]);

  const load = useCallback(async () => {
    if (!patientId) return;
    const { data } = await (supabase as any)
      .schema('cr')
      .from('patient_implantable_devices')
      .select('device_id, device_name, udi, manufacturer, model_number, lot_number, serial_number, expiration_date, body_site, implant_date')
      .eq('patient_id', patientId)
      .eq('is_active', true)
      .order('implant_date', { ascending: false });
    setRows((data as ImplantRow[]) ?? []);
  }, [patientId]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async () => {
    if (!patientId || !form.device_name.trim()) return;
    setSaving(true);
    setErr('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await (supabase as any)
        .schema('cr')
        .from('patient_implantable_devices')
        .insert({
          patient_id: patientId,
          org_id: orgId,
          device_name: form.device_name.trim(),
          udi: form.udi.trim() || null,
          manufacturer: form.manufacturer.trim() || null,
          model_number: form.model_number.trim() || null,
          lot_number: form.lot_number.trim() || null,
          serial_number: form.serial_number.trim() || null,
          expiration_date: form.expiration_date || null,
          body_site: form.body_site.trim() || null,
          implant_date: new Date().toISOString().slice(0, 10),
          is_active: true,
          recorded_by: user?.id ?? null,
        });
      if (error) throw error;
      setForm({ ...blank });
      setAdding(false);
      await load();
    } catch (e: any) {
      setErr(e.message ?? 'Could not record implant');
    }
    setSaving(false);
  }, [patientId, orgId, form, load]);

  if (!caseId) return null;

  const inp: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 7, padding: '7px 10px', color: C.text, fontSize: 12.5, outline: 'none',
  };

  return (
    <div style={{
      border: '1px solid rgba(201,169,110,0.2)', background: C.card,
      borderRadius: 10, padding: '14px 16px', marginTop: 18,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <Cpu size={17} color={C.gold} />
        <span style={{ color: C.text, fontSize: 14, fontWeight: 700 }}>Implant / UDI Registry</span>
        <span style={{ color: C.dim, fontSize: 11 }}>{rows.length} device{rows.length === 1 ? '' : 's'}</span>
        <button onClick={() => setAdding(a => !a)}
          style={{
            marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 7, border: '1px solid rgba(201,169,110,0.3)',
            background: 'rgba(201,169,110,0.1)', color: C.gold, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>
          <Plus size={13} /> {adding ? 'Cancel' : 'Record implant'}
        </button>
      </div>

      {adding && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, marginBottom: 12 }}>
          <input style={inp} placeholder="Device name *" value={form.device_name}
            onChange={e => setForm(f => ({ ...f, device_name: e.target.value }))} />
          <input style={inp} placeholder="UDI (scan or type)" value={form.udi}
            onChange={e => setForm(f => ({ ...f, udi: e.target.value }))} />
          <input style={inp} placeholder="Manufacturer" value={form.manufacturer}
            onChange={e => setForm(f => ({ ...f, manufacturer: e.target.value }))} />
          <input style={inp} placeholder="Model #" value={form.model_number}
            onChange={e => setForm(f => ({ ...f, model_number: e.target.value }))} />
          <input style={inp} placeholder="Lot #" value={form.lot_number}
            onChange={e => setForm(f => ({ ...f, lot_number: e.target.value }))} />
          <input style={inp} placeholder="Serial #" value={form.serial_number}
            onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))} />
          <input style={inp} type="date" title="Expiration date" value={form.expiration_date}
            onChange={e => setForm(f => ({ ...f, expiration_date: e.target.value }))} />
          <input style={inp} placeholder="Body site" value={form.body_site}
            onChange={e => setForm(f => ({ ...f, body_site: e.target.value }))} />
          <button onClick={save} disabled={saving || !form.device_name.trim()}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 7, border: 'none',
              background: C.gold, color: C.navy, fontSize: 12.5, fontWeight: 700,
              cursor: 'pointer', opacity: saving ? 0.6 : 1,
            }}>
            {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Cpu size={13} />}
            Record
          </button>
        </div>
      )}
      {err && <div style={{ color: C.red, fontSize: 12, marginBottom: 8 }}>{err}</div>}

      {rows.length === 0 ? (
        <div style={{ color: C.dim, fontSize: 12, padding: '10px 0' }}>
          No implanted devices recorded for this patient.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ color: C.dim, textAlign: 'left', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              <th style={{ padding: '4px 6px' }}>Device</th>
              <th style={{ padding: '4px 6px' }}>UDI / Lot / Serial</th>
              <th style={{ padding: '4px 6px' }}>Manufacturer</th>
              <th style={{ padding: '4px 6px' }}>Site</th>
              <th style={{ padding: '4px 6px' }}>Implanted</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.device_id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)', color: C.text }}>
                <td style={{ padding: '6px', fontWeight: 600 }}>{r.device_name}</td>
                <td style={{ padding: '6px', color: C.muted, fontFamily: 'DM Mono,monospace', fontSize: 11.5 }}>
                  {r.udi ?? '—'}{r.lot_number ? ` · L:${r.lot_number}` : ''}{r.serial_number ? ` · S:${r.serial_number}` : ''}
                </td>
                <td style={{ padding: '6px', color: C.muted }}>{r.manufacturer ?? '—'}{r.model_number ? ` (${r.model_number})` : ''}</td>
                <td style={{ padding: '6px' }}>{r.body_site ?? '—'}</td>
                <td style={{ padding: '6px', color: C.muted, whiteSpace: 'nowrap' }}>{r.implant_date ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
