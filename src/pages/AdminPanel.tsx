import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Building2, Scale, Users, ShieldAlert, ChevronLeft, Settings, FileText, PenLine } from 'lucide-react';
import FacilitySettings from '../components/admin/FacilitySettings';
import ConsentTemplates from '../components/admin/ConsentTemplates';
import ConsentSender from '../components/admin/ConsentSender';
import ProvidersTab from '../components/admin/ProvidersTab';
import ProposalBuilder from '../components/admin/ProposalBuilder';

type Tab = 'facility' | 'consents' | 'send_consent' | 'providers' | 'proposals';

interface OrgInfo {
  org_id: string;
  org_name: string;
  plan: string;
}

const TABS: { id: Tab; label: string; icon: React.ReactNode; description: string }[] = [
  { id: 'facility',     label: 'Facility & Branding', icon: <Building2 size={18} />, description: 'Logo, address, contact info' },
  { id: 'consents',     label: 'Consent Templates',   icon: <Scale size={18} />,    description: 'Informed consent library' },
  { id: 'send_consent', label: 'Send Consent',        icon: <PenLine size={18} />,  description: 'E-sign forms · email + iPad' },
  { id: 'providers',    label: 'Providers',            icon: <Users size={18} />,    description: 'Provider roster & credentials' },
  { id: 'proposals',    label: 'Proposal Builder',     icon: <FileText size={18} />, description: 'AI proposals + branded PDFs' },
];

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('facility');
  const [orgInfo, setOrgInfo] = useState<OrgInfo | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setUnauthorized(true); setAuthChecking(false); return; }

      // Look up org membership
      const { data: member } = await supabase
        .schema('saas' as any)
        .from('org_members')
        .select('org_id, role')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

      if (!member) { setUnauthorized(true); setAuthChecking(false); return; }

      setOrgId(member.org_id);

      // Load org name for the header
      const { data: org } = await supabase
        .schema('saas' as any)
        .from('organizations')
        .select('org_id, org_name, plan')
        .eq('org_id', member.org_id)
        .single();

      setOrgInfo(org);
      setAuthChecking(false);
    }
    checkAuth();
  }, []);

  if (authChecking) {
    return (
      <div style={{ minHeight: '100vh', background: '#060e1c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid #c9a96e', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div style={{ minHeight: '100vh', background: '#060e1c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: 400, padding: 32 }}>
          <ShieldAlert size={48} color="#e74c3c" style={{ marginBottom: 16 }} />
          <h2 style={{ color: '#fff', fontFamily: 'var(--font-rajdhani, sans-serif)', fontSize: 24, marginBottom: 8 }}>Access Restricted</h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginBottom: 24 }}>You must be signed in as a member of this organization to access the admin panel.</p>
          <a href="/dashboard" style={{ color: '#c9a96e', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <ChevronLeft size={16} /> Return to Dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#060e1c', fontFamily: 'var(--font-sans, system-ui, sans-serif)' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} * { box-sizing: border-box; }`}</style>

      {/* Top bar */}
      <div style={{ background: '#060e1c', borderBottom: '1px solid rgba(201,169,110,0.15)', padding: '0 32px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <a href="/dashboard" style={{ color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, textDecoration: 'none' }}>
              <ChevronLeft size={16} /> Back to Clinical
            </a>
            <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Settings size={18} color="#c9a96e" />
              <span style={{ color: '#c9a96e', fontFamily: 'var(--font-rajdhani, sans-serif)', fontWeight: 700, fontSize: 20, letterSpacing: '0.04em' }}>PatientTrac Surgery Admin</span>
            </div>
          </div>
          {orgInfo && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: 600 }}>{orgInfo.org_name}</div>
              <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{orgInfo.plan} plan</div>
            </div>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px' }}>
        <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start' }}>

          {/* Sidebar nav */}
          <div style={{ width: 220, flexShrink: 0, position: 'sticky', top: 24 }}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  width: '100%', textAlign: 'left', padding: '12px 16px', borderRadius: 10, marginBottom: 4,
                  background: activeTab === tab.id ? 'rgba(201,169,110,0.12)' : 'transparent',
                  border: activeTab === tab.id ? '1px solid rgba(201,169,110,0.35)' : '1px solid transparent',
                  color: activeTab === tab.id ? '#c9a96e' : 'rgba(255,255,255,0.55)',
                  cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12,
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ marginTop: 1, flexShrink: 0 }}>{tab.icon}</span>
                <span>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{tab.label}</div>
                  <div style={{ fontSize: 11, opacity: 0.7, lineHeight: 1.3 }}>{tab.description}</div>
                </span>
              </button>
            ))}
          </div>

          {/* Content area — proposals tab gets minimal chrome since it has its own layout */}
          <div style={{ flex: 1, minWidth: 0, background: '#0a1628', borderRadius: 14, border: '1px solid rgba(201,169,110,0.12)', padding: activeTab === 'proposals' ? '28px 28px' : '28px 32px' }}>
            {/* Section header */}
            <div style={{ marginBottom: 28, paddingBottom: 20, borderBottom: '1px solid rgba(201,169,110,0.1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <span style={{ color: '#c9a96e' }}>{TABS.find(t => t.id === activeTab)?.icon}</span>
                <h2 style={{ color: '#fff', fontFamily: 'var(--font-rajdhani, sans-serif)', fontSize: 22, fontWeight: 700, margin: 0 }}>
                  {TABS.find(t => t.id === activeTab)?.label}
                </h2>
              </div>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, margin: 0 }}>
                {TABS.find(t => t.id === activeTab)?.description}
              </p>
            </div>

            {orgId && (
              <>
                {activeTab === 'facility'     && <FacilitySettings orgId={orgId} />}
                {activeTab === 'consents'     && <ConsentTemplates orgId={orgId} />}
                {activeTab === 'send_consent' && <ConsentSender orgId={orgId} />}
                {activeTab === 'providers'    && <ProvidersTab orgId={orgId} />}
                {activeTab === 'proposals'    && <ProposalBuilder orgId={orgId} />}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
