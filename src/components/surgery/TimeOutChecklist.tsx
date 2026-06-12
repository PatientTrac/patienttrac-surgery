// ================================================================
// Universal Protocol Time-Out — Joint Commission / WHO Surgical
// Safety Checklist "time out" performed before incision.
// Persists a timeout_completed event on the shared case spine
// (cr.case_events) so it appears in the OR app's live event feed.
// ================================================================

import React, { useEffect, useState, useCallback } from 'react';
import { ShieldCheck, CheckSquare, Square, Users, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const CHECKS: { key: string; label: string }[] = [
  { key: 'identity',    label: 'Patient identity confirmed with two identifiers' },
  { key: 'consent',     label: 'Procedure and signed consent verified' },
  { key: 'site',        label: 'Surgical site marked and visible' },
  { key: 'position',    label: 'Correct patient position confirmed' },
  { key: 'imaging',     label: 'Relevant imaging displayed and reviewed (or N/A)' },
  { key: 'antibiotics', label: 'Antibiotic prophylaxis given within 60 min (or N/A)' },
  { key: 'critical',    label: 'Anticipated critical events reviewed — surgeon, anesthesia, nursing' },
  { key: 'team',        label: 'All team members introduced by name and role' },
];

const C = {
  gold: '#c9a96e', navy: '#060e1c', card: '#0a1628',
  text: '#e8eaf0', muted: '#8a9bc0', dim: '#3a4a6a',
  green: '#4ade80', red: '#ef4444',
};

interface Props {
  caseId: number | null;
  orgId: string;
}

export default function TimeOutChecklist({ caseId, orgId }: Props) {
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [teamNames, setTeamNames] = useState('');
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const [completedDesc, setCompletedDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!caseId) return;
    supabase
      .from('case_events')
      .select('event_timestamp, event_description')
      .eq('case_id', caseId)
      .eq('event_type', 'timeout_completed')
      .order('event_timestamp', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setCompletedAt(data[0].event_timestamp);
          setCompletedDesc(data[0].event_description);
        }
      });
  }, [caseId]);

  const allChecked = CHECKS.every(c => checks[c.key]);
  const canComplete = allChecked && teamNames.trim().length > 0 && !!caseId;

  const complete = useCallback(async () => {
    if (!canComplete || !caseId) return;
    setSaving(true);
    setErr('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const desc = `Universal Protocol time-out completed — all ${CHECKS.length} checks confirmed. Team: ${teamNames.trim()}.`;
      const { error } = await supabase.from('case_events').insert({
        case_id: caseId,
        org_id: orgId,
        event_type: 'timeout_completed',
        event_timestamp: new Date().toISOString(),
        event_description: desc,
        created_by_id: user?.id ?? null,
        created_by_name: user?.email ?? null,
      });
      if (error) throw error;
      setCompletedAt(new Date().toISOString());
      setCompletedDesc(desc);
    } catch (e: any) {
      setErr(e.message ?? 'Could not record time-out');
    }
    setSaving(false);
  }, [canComplete, caseId, orgId, teamNames]);

  if (!caseId) return null;

  if (completedAt) {
    return (
      <div style={{
        border: `1px solid rgba(74,222,128,0.35)`, background: 'rgba(74,222,128,0.07)',
        borderRadius: 10, padding: '12px 16px', marginBottom: 18,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <ShieldCheck size={22} color={C.green} style={{ flexShrink: 0 }} />
        <div>
          <div style={{ color: C.green, fontSize: 13, fontWeight: 700 }}>
            Time-out completed · {new Date(completedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{completedDesc}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      border: `1px solid rgba(239,68,68,0.35)`, background: 'rgba(239,68,68,0.05)',
      borderRadius: 10, padding: '14px 16px', marginBottom: 18,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <ShieldCheck size={20} color={C.red} />
        <span style={{ color: C.text, fontSize: 14, fontWeight: 700 }}>
          Universal Protocol Time-Out
        </span>
        <span style={{ color: C.red, fontSize: 11, fontWeight: 600, marginLeft: 'auto' }}>
          REQUIRED BEFORE INCISION
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 6 }}>
        {CHECKS.map(c => (
          <label key={c.key}
            onClick={() => setChecks(prev => ({ ...prev, [c.key]: !prev[c.key] }))}
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 2px' }}>
            {checks[c.key]
              ? <CheckSquare size={16} color={C.gold} style={{ flexShrink: 0 }} />
              : <Square size={16} color={C.dim} style={{ flexShrink: 0 }} />}
            <span style={{ color: checks[c.key] ? C.text : C.muted, fontSize: 12.5 }}>{c.label}</span>
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Users size={15} color={C.muted} />
        <input
          value={teamNames}
          onChange={e => setTeamNames(e.target.value)}
          placeholder="Team present (surgeon, anesthesia, circulator, scrub)…"
          style={{
            flex: 1, minWidth: 260, background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
            padding: '8px 12px', color: C.text, fontSize: 12.5, outline: 'none',
          }}
        />
        <button
          onClick={complete}
          disabled={!canComplete || saving}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '9px 18px', borderRadius: 8, border: 'none',
            background: canComplete ? C.gold : 'rgba(201,169,110,0.2)',
            color: canComplete ? C.navy : 'rgba(255,255,255,0.35)',
            fontSize: 13, fontWeight: 700, cursor: canComplete ? 'pointer' : 'not-allowed',
          }}>
          {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <ShieldCheck size={14} />}
          Confirm Time-Out
        </button>
      </div>
      {err && <div style={{ color: C.red, fontSize: 12, marginTop: 8 }}>{err}</div>}
    </div>
  );
}
