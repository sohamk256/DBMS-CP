import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  ClipboardList,
  GitCompare,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { api } from '../../services/api';
import { AppShell, type NavItem } from '../AppShell';
import { EligibilityQuizView } from '../EligibilityQuizView';
import { UserProfileView } from '../UserProfileView';
import { DataTable, type ColumnDef } from '../ui/DataTable';
import { StatusText } from '../ui/StatusText';
import { getCompatibleRecipientGroups, getPreservationStatus } from '../../utils/organMatching';
import type {
  AllocationRecord,
  AuthSession,
  DonorRecord,
  MedicalTestRecord,
  OrganRecord,
  RecipientRecord,
} from '../../types/db';

interface UserDashboardProps {
  session: AuthSession;
  onLogout: () => void;
  onSessionUpdated?: (session: AuthSession) => void;
  onActiveTabChange?: (tab: string) => void;
}

export function UserDashboard({
  session,
  onLogout,
  onSessionUpdated,
  onActiveTabChange,
}: UserDashboardProps) {
  const [activeTab, setActiveTabState] = useState('overview');
  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    onActiveTabChange?.(tab);
  };
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [donor, setDonor] = useState<DonorRecord | null>(null);
  const [recipient, setRecipient] = useState<RecipientRecord | null>(null);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [queueTotal, setQueueTotal] = useState(0);
  const [organs, setOrgans] = useState<OrganRecord[]>([]);
  const [tests, setTests] = useState<MedicalTestRecord[]>([]);
  const [allocations, setAllocations] = useState<AllocationRecord[]>([]);
  const [compatibleOrgans, setCompatibleOrgans] = useState<
    {
      organ: OrganRecord;
      compatibilityScore: number;
      bloodMatchType: 'Exact' | 'Compatible';
      reasons: string[];
    }[]
  >([]);

  const isDonor = session.subRole === 'donor';

  const loadData = useCallback(async () => {
    if (!session.linkedEntityId) {
      setError('No linked donor or recipient profile found.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (isDonor) {
        const res = await api.getDonorDetail(session.linkedEntityId);
        setDonor(res.donor);
        setOrgans(res.organs);
        setTests(res.tests);
        setAllocations(res.allocations);
      } else {
        const res = await api.getRecipientDetail(session.linkedEntityId);
        setRecipient(res.recipient);
        setQueuePosition(res.queuePosition);
        setQueueTotal(res.queueTotal);
        setTests(res.tests);
        setAllocations(res.allocations);
        setCompatibleOrgans(res.compatibleOrgans);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile data.');
    } finally {
      setLoading(false);
    }
  }, [isDonor, session.linkedEntityId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const navItems: NavItem[] = [
    { id: 'overview', label: 'Clinical Overview', icon: <Activity className="w-4 h-4" /> },
    {
      id: 'matches',
      label: isDonor ? 'Organ & Impact' : 'Waitlist & Matches',
      icon: <GitCompare className="w-4 h-4" />,
    },
    { id: 'tests', label: 'Medical & Lab Tests', icon: <ClipboardList className="w-4 h-4" /> },
    { id: 'eligibility', label: 'Eligibility Quiz', icon: <ShieldCheck className="w-4 h-4" /> },
    { id: 'profile', label: 'My Profile & Consent', icon: <UserCheck className="w-4 h-4" /> },
  ];

  const testColumns: ColumnDef<MedicalTestRecord>[] = [
    {
      key: 'id',
      header: 'Test ID',
      render: (r) => <span className="font-mono text-slate-600">{r.TestID}</span>,
    },
    {
      key: 'type',
      header: 'Diagnostic Test',
      render: (r) => <span className="font-medium text-slate-900">{r.TestType}</span>,
    },
    {
      key: 'result',
      header: 'Result',
      render: (r) => <StatusText value={r.TestResult} />,
    },
    {
      key: 'details',
      header: 'Clinical Findings',
      render: (r) => <span className="text-slate-600">{r.ResultDetails || 'No remarks'}</span>,
    },
    {
      key: 'lab',
      header: 'Conducting Lab & Hospital',
      render: (r) => (
        <div>
          <p className="text-slate-900">{r.LabName || 'Diagnostic Wing'}</p>
          <p className="text-[11px] text-slate-500">{r.Hospital_Name}</p>
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      align: 'right',
      render: (r) => <span className="font-mono text-slate-500">{r.TestDate.slice(0, 10)}</span>,
    },
  ];

  return (
    <AppShell
      session={session}
      navItems={navItems}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onLogout={onLogout}
      onOpenProfile={() => setActiveTab('profile')}
      primaryAction={
        <button
          type="button"
          onClick={() => void loadData()}
          className="px-3.5 py-2 rounded-md border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
        >
          Refresh Record
        </button>
      }
    >
      {error && (
        <div role="alert" className="mb-5 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="h-28 rounded-lg border border-slate-200 bg-white animate-pulse" />
          <div className="h-64 rounded-lg border border-slate-200 bg-white animate-pulse" />
        </div>
      ) : activeTab === 'overview' ? (
        <div className="space-y-6">
          {/* Primary Clinical Summary Banner */}
          <section className="rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  {isDonor ? 'Registered Organ Donor' : 'Registered Transplant Recipient'} · ID #
                  <span className="font-mono">{session.linkedEntityId}</span>
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                  {isDonor ? donor?.Full_Name : recipient?.Full_Name}
                </h1>
                <p className="mt-1 text-xs text-slate-600">
                  {isDonor
                    ? `${donor?.Hospital_Name} (${donor?.Hospital_City}) · Registered ${donor?.Registration_Date}`
                    : `${recipient?.Hospital_Name} (${recipient?.Hospital_City}) · Attending: ${recipient?.Attending_Physician}`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-medium text-slate-500">Current Registry Status</p>
                <div className="mt-1">
                  <StatusText value={(isDonor ? donor?.Donor_Status : recipient?.RecipientStatus) || 'Unknown'} />
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-6">
              <div>
                <p className="text-xs text-slate-500">Blood Group</p>
                <p className="mt-1 font-mono text-xl font-semibold text-slate-900">
                  {isDonor ? donor?.Blood_Group : recipient?.Blood_Group}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">{isDonor ? 'Pledged Organ' : 'Required Organ'}</p>
                <p className="mt-1 text-xl font-semibold text-slate-900">
                  {isDonor ? donor?.Donating_Organ : recipient?.RequiredOrgan}
                </p>
              </div>
              {isDonor ? (
                <>
                  <div>
                    <p className="text-xs text-slate-500">Medical Fitness</p>
                    <div className="mt-1.5">
                      <StatusText value={donor?.Medical_Fitness_Status || 'Pending'} />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Legal Authorization</p>
                    <div className="mt-1.5">
                      <StatusText value={donor?.Legal_Approval_Status || 'pending'} />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-xs text-slate-500">Waitlist Queue Rank</p>
                    <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-900">
                      {queuePosition ? `#${queuePosition} / ${queueTotal}` : 'Resolved'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Priority &amp; Urgency</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="font-mono text-lg font-semibold tabular-nums text-slate-900">
                        {Number(recipient?.PriorityScore ?? 0).toFixed(1)}
                      </span>
                      <span className="text-slate-300">·</span>
                      <StatusText value={recipient?.UrgencyLevel || 'Routine'} />
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Journey & Active Allocations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="rounded-lg border border-slate-200 bg-white p-6">
              <h2 className="text-sm font-semibold text-slate-900">
                {isDonor ? 'Donation & Authorization Milestones' : 'Clinical & Waitlist Milestones'}
              </h2>
              <div className="mt-4 divide-y divide-slate-100">
                {isDonor ? (
                  <>
                    <div className="py-3 flex items-center justify-between text-xs">
                      <span className="text-slate-600">Consent Obtained</span>
                      <StatusText value={donor?.Consent_Obtained ? 'Approved' : 'Pending'} />
                    </div>
                    <div className="py-3 flex items-center justify-between text-xs">
                      <span className="text-slate-600">Medical Fitness Clearance</span>
                      <StatusText value={donor?.Medical_Fitness_Status || 'Pending'} />
                    </div>
                    <div className="py-3 flex items-center justify-between text-xs">
                      <span className="text-slate-600">
                        Legal Committee ({donor?.Legal_Authority || 'Pending Review'})
                      </span>
                      <StatusText value={donor?.Legal_Approval_Status || 'pending'} />
                    </div>
                    <div className="py-3 flex items-center justify-between text-xs">
                      <span className="text-slate-600">Organs Retrieved &amp; Cataloged</span>
                      <span className="font-mono font-semibold text-slate-900">{organs.length}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="py-3 flex items-center justify-between text-xs">
                      <span className="text-slate-600">Primary Clinical Indication</span>
                      <span className="font-medium text-slate-900">{recipient?.Disease}</span>
                    </div>
                    <div className="py-3 flex items-center justify-between text-xs">
                      <span className="text-slate-600">Previous Transplant History</span>
                      <span className="font-medium text-slate-900">
                        {recipient?.Previous_Transplant_History ? 'Yes' : 'First-time Candidate'}
                      </span>
                    </div>
                    <div className="py-3 flex items-center justify-between text-xs">
                      <span className="text-slate-600">Diagnostic Lab Tests Completed</span>
                      <span className="font-mono font-semibold text-slate-900">{tests.length}</span>
                    </div>
                    <div className="py-3 flex items-center justify-between text-xs">
                      <span className="text-slate-600">Compatible Organs Available Now</span>
                      <span className="font-mono font-semibold text-teal-700">{compatibleOrgans.length}</span>
                    </div>
                  </>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-6">
              <h2 className="text-sm font-semibold text-slate-900">
                Allocation &amp; Transplant History
              </h2>
              {allocations.length === 0 ? (
                <div className="mt-6 py-8 text-center">
                  <p className="text-xs font-medium text-slate-700">No allocations linked yet</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {isDonor
                      ? 'Once organs are retrieved and matched by a certified hospital, allocation progress appears here.'
                      : 'When a compatible organ is matched to your waitlist profile, transport and surgery updates appear here.'}
                  </p>
                </div>
              ) : (
                <div className="mt-4 divide-y divide-slate-100">
                  {allocations.map((al) => (
                    <div key={al.AllocationID} className="py-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-semibold text-slate-900">
                          {al.OrganCode} · {al.OrganType}
                        </span>
                        <StatusText value={al.AllocationStatus} />
                      </div>
                      <p className="text-xs text-slate-600">
                        Hospital: {al.TransplantHospitalName} · Score:{' '}
                        <span className="font-mono font-medium">{al.CompatibilityScore ?? '-'}%</span>
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Transport: {al.TransportMode || 'Scheduled'}
                        {al.LeadSurgeon ? ` · Surgeon: ${al.LeadSurgeon}` : ''}
                        {al.TransplantOutcome ? ` · Outcome: ${al.TransplantOutcome}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      ) : activeTab === 'matches' ? (
        <div className="space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="text-base font-semibold text-slate-900">
              {isDonor ? 'Pledged & Retrieved Organ Inventory' : 'Live Compatible Organs on Network'}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {isDonor
                ? `Blood group ${donor?.Blood_Group} can donate compatibly to: ${
                    donor ? getCompatibleRecipientGroups(donor.Blood_Group).join(', ') : ''
                  }.`
                : `Filtered live for your required ${recipient?.RequiredOrgan} and compatible ABO/Rh blood group (${recipient?.Blood_Group}).`}
            </p>
          </div>

          {isDonor ? (
            <DataTable
              columns={[
                { key: 'code', header: 'Organ Code', render: (o) => <span className="font-mono font-semibold">{o.OrganCode}</span> },
                { key: 'type', header: 'Organ Type', render: (o) => o.OrganType },
                { key: 'blood', header: 'Blood Group', render: (o) => <span className="font-mono">{o.BloodGroup}</span> },
                { key: 'hosp', header: 'Retrieval Hospital', render: (o) => o.RetrievalHospitalName || '-' },
                {
                  key: 'pres',
                  header: 'Preservation Window',
                  render: (o) => {
                    const p = getPreservationStatus(o);
                    return <StatusText value={p.windowState} />;
                  },
                },
                { key: 'status', header: 'Organ Status', render: (o) => <StatusText value={o.OrganStatus} /> },
              ]}
              rows={organs}
              rowKey={(o) => o.OrganID}
              emptyTitle="No organs retrieved yet"
              emptyDescription="Your donor pledge is registered. Organs appear here once clinical retrieval is logged."
            />
          ) : (
            <DataTable
              columns={[
                { key: 'code', header: 'Organ Code', render: (c) => <span className="font-mono font-semibold">{c.organ.OrganCode}</span> },
                { key: 'blood', header: 'Donor Blood', render: (c) => <span className="font-mono">{c.organ.BloodGroup} ({c.bloodMatchType})</span> },
                { key: 'hosp', header: 'Retrieval Hospital', render: (c) => `${c.organ.RetrievalHospitalName} (${c.organ.RetrievalHospitalCity})` },
                {
                  key: 'score',
                  header: 'Estimated Score',
                  align: 'right',
                  render: (c) => <span className="font-mono font-semibold text-teal-700">{c.compatibilityScore.toFixed(1)}%</span>,
                },
                {
                  key: 'reasons',
                  header: 'Compatibility Factors',
                  render: (c) => <span className="text-slate-600">{c.reasons.slice(0, 2).join(' · ')}</span>,
                },
              ]}
              rows={compatibleOrgans}
              rowKey={(c) => c.organ.OrganID}
              emptyTitle="No matching organs currently available"
              emptyDescription="Your profile remains prioritized in the waitlist. Hospitals receive automatic match alerts upon new retrievals."
            />
          )}
        </div>
      ) : activeTab === 'tests' ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white px-6 py-4">
            <h2 className="text-base font-semibold text-slate-900">Medical &amp; Laboratory Diagnostics</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Verified pathology, HLA typing, viral screening, and organ viability assessments recorded against ID #{session.linkedEntityId}.
            </p>
          </div>
          <DataTable
            columns={testColumns}
            rows={tests}
            rowKey={(t) => t.TestID}
            emptyTitle="No medical tests logged"
            emptyDescription="Diagnostic tests conducted by your hospital will appear here."
          />
        </div>
      ) : activeTab === 'eligibility' ? (
        <EligibilityQuizView
          session={session}
          donor={donor}
          recipient={recipient}
        />
      ) : (
        <UserProfileView
          session={session}
          onSessionUpdated={(next) => {
            onSessionUpdated?.(next);
            void loadData();
          }}
        />
      )}
    </AppShell>
  );
}
