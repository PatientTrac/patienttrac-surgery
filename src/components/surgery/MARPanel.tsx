// ================================================================
// Medication Administration Record (MAR) — reads/writes the shared
// case spine table cr.case_medications. The same entries appear in
// the OR app's live case detail in real time.
// ================================================================

import React, { useCallback, useEffect, useState } from 'react';
import { Pill, Plus, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const C = {
  gold: '#c9a96e', navy: '#060e1c', card: '#0a1628',
  text: '#e8eaf0', muted: '#8a9bc0', dim: '#3a4a6a', red: '#ef4444',
};

const ROUTES = ['IV', 'IM', 'PO', 'SC', 'SL', 'PR', 'Topical', 'Inhaled', 'Intrathecal'];
const UNITS = ['mg', 'mcg', 'g', 'mL', 'units', 'mEq'];

interface MarRow {
  administration_id: number;
  medication_name: string;
  dose: number;
  dose_unit: string;
  route: string;
  administered_at: string;
  administered_by_name: string | null;
  indication: string | null;
}

interface Props {
  caseId: number | null;
  orgId: string;
}

export default function MARPanel({ caseId, orgId }: Props) {
  const [rows, setRows] = useState<MarRow[]>([]);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ medication_name: '', dose: '', dose_unit: 'mg', route: 'IV', indication: '' });

  const load = useCallback(async () => {
    if (!caseId) return;
    const { data } = await supabase
      .from('case_medications')
      .select('administration_id, medication_name, dose, dose_unit, route, administered_at, administered_by_name, indication')
      .eq('case_id', caseId)
      .order('administered_at', { ascending: false });
    setRows((data as MarRow[]) ?? []);
  }, [caseId]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async () => {
    if (!caseId || !form.medication_name.trim() || !form.dose) return;
    setSaving(true);
    setErr('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('case_medications').insert({
        case_id: caseId,
        org_id: orgId,
        medication_name: form.medication_name.trim(),
        dose: Number(form.dose),
        dose_unit: form.dose_unit,
        route: form.route,
        administered_at: new Date().toISOString(),
        administered_by_id: user?.id ?? null,
        administered_by_name: user?.email ?? null,
        indication: form.indication.trim() || null,
      });
      if (error) throw error;
      setForm({ medication_name: '', dose: '', dose_unit: 'mg', route: 'IV', indication: '' });
      setAdding(false);
      await load();
    } catch (e: any) {
      setErr(e.message ?? 'Could not record administration');
    }
    setSaving(false);
  }, [caseId, orgId, form, load]);

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
        <Pill size={17} color={C.gold} />
        <span style={{ color: C.text, fontSize: 14, fontWeight: 700 }}>Medication Administration Record</span>
        <span style={{ color: C.dim, fontSize: 11 }}>{rows.length} entr{rows.length === 1 ? 'y' : 'ies'}</span>
        <button onClick={() => setAdding(a => !a)}
          style={{
            marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 7, border: '1px solid rgba(201,169,110,0.3)',
            background: 'rgba(201,169,110,0.1)', color: C.gold, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>
          <Plus size={13} /> {adding ? 'Cancel' : 'Record dose'}
        </button>
      </div>

      {adding && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
          <input style={{ ...inp, flex: 2, minWidth: 160 }} placeholder="Medication"
            value={form.medication_name} onChange={e => setForm(f => ({ ...f, medication_name: e.target.value }))} />
          <input style={{ ...inp, width: 80 }} placeholder="Dose" type="number" min="0"
            value={form.dose} onChange={e => setForm(f => ({ ...f, dose: e.target.value }))} />
          <select style={{ ...inp, width: 80 }} value={form.dose_unit}
            onChange={e => setForm(f => ({ ...f, dose_unit: e.target.value }))}>
            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <select style={{ ...inp, width: 100 }} value={form.route}
            onChange={e => setForm(f => ({ ...f, route: e.target.value }))}>
            {ROUTES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <input style={{ ...inp, flex: 2, minWidth: 140 }} placeholder="Indication (optional)"
            value={form.indication} onChange={e => setForm(f => ({ ...f, indication: e.target.value }))} />
          <button onClick={save} disabled={saving || !form.medication_name.trim() || !form.dose}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px',
              borderRadius: 7, border: 'none', background: C.gold, color: C.navy,
              fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1,
            }}>
            {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Pill size={13} />}
            Sign
          </button>
        </div>
      )}
      {err && <div style={{ color: C.red, fontSize: 12, marginBottom: 8 }}>{err}</div>}

      {rows.length === 0 ? (
        <div style={{ color: C.dim, fontSize: 12, padding: '10px 0' }}>
          No medications recorded for this case.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ color: C.dim, textAlign: 'left', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              <th style={{ padding: '4px 6px' }}>Time</th>
              <th style={{ padding: '4px 6px' }}>Medication</th>
              <th style={{ padding: '4px 6px' }}>Dose</th>
              <th style={{ padding: '4px 6px' }}>Route</th>
              <th style={{ padding: '4px 6px' }}>Indication</th>
              <th style={{ padding: '4px 6px' }}>By</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.administration_id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)', color: C.text }}>
                <td style={{ padding: '6px', whiteSpace: 'nowrap', color: C.muted, fontFamily: 'DM Mono,monospace' }}>
                  {new Date(r.administered_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </td>
                <td style={{ padding: '6px', fontWeight: 600 }}>{r.medication_name}</td>
                <td style={{ padding: '6px', whiteSpace: 'nowrap' }}>{r.dose} {r.dose_unit}</td>
                <td style={{ padding: '6px' }}>{r.route}</td>
                <td style={{ padding: '6px', color: C.muted }}>{r.indication ?? '—'}</td>
                <td style={{ padding: '6px', color: C.muted, fontSize: 11.5 }}>{r.administered_by_name ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
