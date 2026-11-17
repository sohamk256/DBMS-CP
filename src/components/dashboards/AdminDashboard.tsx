import { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Building2,
  CheckCircle2,
  Database,
  Download,
  History,
  Play,
  Plus,
  RefreshCw,
  Scale,
  Terminal,
  UserCircle2,
} from 'lucide-react';
import { api, type DashboardSummaryResponse } from '../../services/api';
import { AppShell, type NavItem } from '../AppShell';
import { RegionalDonationD3Chart } from '../charts/RegionalDonationD3Chart';
import { UserProfileView } from '../UserProfileView';
import { DataTable } from '../ui/DataTable';
import { Modal } from '../ui/Modal';
import { StatusText } from '../ui/StatusText';
import type {
  AllocationRecord,
  AuthSession,
  DonorRecord,
  HospitalRecord,
  RecipientAuditRecord,
  RegionalTrendsResponse,
  SchemaTableInfo,
  SystemActivityRecord,
} from '../../types/db';

interface AdminDashboardProps {
  session: AuthSession;
  onLogout: () => void;
  onSessionUpdated?: (session: AuthSession) => void;
  onActiveTabChange?: (tab: string) => void;
}

const PRESET_QUERIES: { label: string; sql: string }[] = [
  {
    label: 'Multi-Table Allocation Pipeline',
    sql: `SELECT a.AllocationID, o.OrganCode, o.OrganType, o.BloodGroup,
       d.Full_Name AS DonorName, r.Full_Name AS RecipientName,
       th.Hospital_Name AS TransplantHospital, a.CompatibilityScore,
       a.TransportMode, a.AllocationStatus, a.TransplantOutcome
FROM allocation a
JOIN organ o ON a.OrganID = o.OrganID
JOIN donor d ON o.DonorID = d.Donor_ID
JOIN hospital th ON a.TransplantHospitalID = th.Hospital_ID
LEFT JOIN recipient r ON a.RecipientID = r.Recipient_ID
ORDER BY a.AllocationDate DESC;`,
  },
  {
    label: 'Top Urgent Waitlist Queue',
    sql: `SELECT r.Recipient_ID, r.Full_Name, r.Blood_Group, r.RequiredOrgan,
       r.UrgencyLevel, r.PriorityScore, h.Hospital_Name, h.City
FROM recipient r
JOIN hospital h ON r.RegisteringHospitalID = h.Hospital_ID
WHERE r.RecipientStatus = 'Waiting'
ORDER BY r.PriorityScore DESC, r.RegistrationDate ASC
LIMIT 15;`,
  },
  {
    label: 'Hospital Retrieval & Transplant Yield',
    sql: `SELECT h.Hospital_ID, h.Hospital_Name, h.City, h.Transplant_Center_Certified,
       COUNT(DISTINCT d.Donor_ID) AS RegisteredDonors,
       COUNT(DISTINCT o.OrganID) AS OrgansRetrieved,
       COUNT(DISTINCT a.AllocationID) AS AllocationsHandled
FROM hospital h
LEFT JOIN donor d ON h.Hospital_ID = d.Registering_Hospital_ID
LEFT JOIN organ o ON h.Hospital_ID = o.RetrievalHospitalID
LEFT JOIN allocation a ON h.Hospital_ID = a.TransplantHospitalID
GROUP BY h.Hospital_ID
ORDER BY OrgansRetrieved DESC, RegisteredDonors DESC;`,
  },
  {
    label: 'Trigger Audit History',
    sql: `SELECT rsa.Audit_ID, rsa.Recipient_ID, r.Full_Name,
       rsa.Previous_Status, rsa.New_Status, rsa.Modified_Timestamp, rsa.Action_Source
FROM recipient_status_audit rsa
LEFT JOIN recipient r ON rsa.Recipient_ID = r.Recipient_ID
ORDER BY rsa.Audit_ID DESC;`,
  },
  {
    label: 'Available Organs & Donors',
    sql: `SELECT o.OrganCode, o.OrganType, o.BloodGroup, o.MaxPreservationHours,
       o.ExpiryTime, d.Full_Name AS Donor, h.Hospital_Name, h.City
FROM organ o
JOIN donor d ON o.DonorID = d.Donor_ID
JOIN hospital h ON o.RetrievalHospitalID = h.Hospital_ID
WHERE o.OrganStatus = 'Available'
ORDER BY o.MaxPreservationHours ASC;`,
  },
];

export function AdminDashboard({
  session,
  onLogout,
  onSessionUpdated,
  onActiveTabChange,
}: AdminDashboardProps) {
  const [activeTab, setActiveTabState] = useState('analytics');
  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    onActiveTabChange?.(tab);
  };
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);
  const [regionalTrends, setRegionalTrends] = useState<RegionalTrendsResponse | null>(null);
  const [hospitals, setHospitals] = useState<HospitalRecord[]>([]);
  const [donors, setDonors] = useState<DonorRecord[]>([]);
  const [allocations, setAllocations] = useState<AllocationRecord[]>([]);
  const [schemaTables, setSchemaTables] = useState<SchemaTableInfo[]>([]);
  const [triggers, setTriggers] = useState<{ name: string; tbl_name: string; sql: string }[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('allocation');
  const [recipientAudit, setRecipientAudit] = useState<RecipientAuditRecord[]>([]);
  const [systemLogs, setSystemLogs] = useState<SystemActivityRecord[]>([]);

  // Hospital filter & add modal
  const [cityFilter, setCityFilter] = useState('All');
  const [hospModalOpen, setHospModalOpen] = useState(false);
  const [newHospital, setNewHospital] = useState({
    Hospital_Name: '',
    Hospital_Type: 'Private',
    City: 'Pune',
    State: 'Maharashtra',
    Contact_Number: '',
    Email: '',
    License_Number: '',
    Transplant_Center_Certified: true,
  });

  // SQL Console state
  const [sqlText, setSqlText] = useState(PRESET_QUERIES[0].sql);
  const [allowMutations, setAllowMutations] = useState(false);
  const [sqlRunning, setSqlRunning] = useState(false);
  const [sqlResult, setSqlResult] = useState<{
    kind: 'read' | 'write';
    columns?: string[];
    rows?: Record<string, unknown>[];
    totalRows?: number;
    changes?: number;
    durationMs: number;
  } | null>(null);
  const [sqlError, setSqlError] = useState<string | null>(null);

  // Integrity check result
  const [integrityStatus, setIntegrityStatus] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sumRes, trendsRes, hospRes, donRes, allocRes, schemaRes, auditRes] = await Promise.all([
        api.getSummary(),
        api.getRegionalTrends(),
        api.getHospitals(),
        api.getDonors(),
        api.getAllocations(),
        api.getSchema(),
        api.getAuditLogs(),
      ]);
      setSummary(sumRes);
      setRegionalTrends(trendsRes);
      setHospitals(hospRes.hospitals);
      setDonors(donRes.donors);
      setAllocations(allocRes.allocations);
      setSchemaTables(schemaRes.tables);
      setTriggers(schemaRes.triggers);
      setRecipientAudit(auditRes.recipientAudit);
      setSystemLogs(auditRes.systemLogs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load administrator data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleToggleCertification = async (hosp: HospitalRecord) => {
    setError(null);
    try {
      const next = hosp.Transplant_Center_Certified === 1 ? 0 : 1;
      await api.updateHospital(hosp.Hospital_ID, { Transplant_Center_Certified: next });
      setNotice(
        `${hosp.Hospital_Name} certification ${next === 1 ? 'approved' : 'revoked'}.`,
      );
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update certification.');
    }
  };

  const handleCreateHospital = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.createHospital(newHospital);
      setHospModalOpen(false);
      setNotice(`Registered hospital ${newHospital.Hospital_Name}.`);
      setNewHospital({
        Hospital_Name: '',
        Hospital_Type: 'Private',
        City: 'Pune',
        State: 'Maharashtra',
        Contact_Number: '',
        Email: '',
        License_Number: '',
        Transplant_Center_Certified: true,
      });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register hospital.');
    }
  };

  const handleLegalDecision = async (donor: DonorRecord, decision: 'Approved' | 'Rejected') => {
    setError(null);
    try {
      await api.updateDonor(donor.Donor_ID, {
        Legal_Approval_Status: decision,
        Legal_Authority:
          donor.Donor_Type === 'Deceased'
            ? 'Zonal Transplant Coordination Center'
            : 'State Authorization Committee',
        Donor_Status: decision === 'Approved' ? 'Approved' : 'Rejected',
        actorRole: 'admin',
        actorName: session.displayName,
      });
      setNotice(`Legal authorization ${decision.toLowerCase()} for donor ${donor.Full_Name}.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update legal approval.');
    }
  };

  const handleAllocationDecision = async (alloc: AllocationRecord, nextStatus: 'Confirmed' | 'Rejected') => {
    setError(null);
    try {
      await api.updateAllocation(alloc.AllocationID, {
        AllocationStatus: nextStatus,
        actorRole: 'admin',
        actorName: session.displayName,
      });
      setNotice(`Allocation #${alloc.AllocationID} marked ${nextStatus}.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update allocation.');
    }
  };

  const handleRunSql = async () => {
    setSqlRunning(true);
    setSqlError(null);
    try {
      const res = await api.runSqlQuery(sqlText, allowMutations);
      setSqlResult(res);
      if (res.kind === 'write') {
        await loadAll();
      }
    } catch (err) {
      setSqlError(err instanceof Error ? err.message : 'SQL execution failed.');
    } finally {
      setSqlRunning(false);
    }
  };

  const handleExportCsv = () => {
    if (!sqlResult?.columns || !sqlResult?.rows) return;
    const cols = sqlResult.columns;
    const lines = [
      cols.join(','),
      ...sqlResult.rows.map((row) =>
        cols
          .map((c) => {
            const val = row[c] ?? '';
            return `"${String(val).replace(/"/g, '""')}"`;
          })
          .join(','),
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'organlink_query_result.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleIntegrityCheck = async () => {
    setError(null);
    try {
      const res = await api.runIntegrityCheck();
      const okMsg = res.integrity?.[0]?.integrity_check ?? 'ok';
      setIntegrityStatus(
        `SQLite Integrity: ${okMsg.toUpperCase()} · Foreign Key Violations: ${res.fkViolations.length}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Integrity check failed.');
    }
  };

  const handleResetDb = async () => {
    setError(null);
    try {
      const res = await api.resetDatabase();
      setConfirmReset(false);
      setNotice(res.message);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset database.');
    }
  };

  const cities = ['All', ...Array.from(new Set(hospitals.map((h) => h.City)))];
  const filteredHospitals = hospitals.filter((h) => cityFilter === 'All' || h.City === cityFilter);
  const pendingLegalDonors = donors.filter((d) => d.Legal_Approval_Status === 'pending');
  const proposedAllocations = allocations.filter((a) => a.AllocationStatus === 'Proposed');
  const activeSchemaTable = schemaTables.find((t) => t.name === selectedTable) ?? schemaTables[0];

  const navItems: NavItem[] = [
    { id: 'analytics', label: 'Network Analytics', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'hospitals', label: 'Hospital Licensing', icon: <Building2 className="w-4 h-4" /> },
    { id: 'oversight', label: 'Legal & Oversight', icon: <Scale className="w-4 h-4" /> },
    { id: 'schema', label: 'ER Schema & Triggers', icon: <Database className="w-4 h-4" /> },
    { id: 'sql', label: 'SQL Query Console', icon: <Terminal className="w-4 h-4" /> },
    { id: 'audit', label: 'Trigger Audit Logs', icon: <History className="w-4 h-4" /> },
    { id: 'profile', label: 'My Profile', icon: <UserCircle2 className="w-4 h-4" /> },
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
        activeTab !== 'sql' ? (
          <button
            type="button"
            onClick={() => {
              setActiveTab('sql');
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-teal-700 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap shrink-0"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>SQL Workbench</span>
          </button>
        ) : undefined
      }
    >
      {error && (
        <div role="alert" className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800">
          {notice}
        </div>
      )}

      {activeTab === 'analytics' && (
        <div className="space-y-6">
          {/* Network KPI Strip */}
          <section className="rounded-lg border border-slate-200 bg-white p-6">
            <h1 className="text-lg font-bold tracking-tight text-slate-900">
              Zonal Transplant &amp; Relational Registry Overview
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              Aggregated live state across 24 Maharashtra clinical centers, donor clearances, organ inventory, and surgical outcomes.
            </p>
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6 border-t border-slate-100 pt-5">
              <div>
                <p className="text-xs text-slate-500">Certified Hospitals</p>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900">
                  {summary?.kpis.certifiedHospitals ?? 0}/{summary?.kpis.totalHospitals ?? 0}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Total Donors</p>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900">
                  {summary?.kpis.totalDonors ?? 0}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Pending Legal</p>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-amber-700">
                  {summary?.kpis.pendingLegalDonors ?? 0}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Waiting Recipients</p>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900">
                  {summary?.kpis.waitingRecipients ?? 0}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Available Organs</p>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-teal-700">
                  {summary?.kpis.availableOrgans ?? 0}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Green Corridors</p>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900">
                  {summary?.kpis.greenCorridors ?? 0}
                </p>
              </div>
            </div>
          </section>

          <RegionalDonationD3Chart data={regionalTrends} loading={loading} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Organ Supply vs Waitlist Demand */}
            <section className="rounded-lg border border-slate-200 bg-white p-6">
              <h2 className="text-sm font-semibold text-slate-900">Organ Supply vs. Waitlist Demand</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Available organs currently preserved vs. waiting patients by organ category.
              </p>
              <div className="mt-5 space-y-3.5">
                {(summary?.organDemandSupply ?? []).map((item) => {
                  const maxVal = Math.max(12, item.waitingRecipients, item.availableOrgans);
                  const waitPct = Math.round((item.waitingRecipients / maxVal) * 100);
                  const availPct = Math.round((item.availableOrgans / maxVal) * 100);
                  return (
                    <div key={item.organType} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-800">{item.organType}</span>
                        <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                          {item.availableOrgans} available · {item.waitingRecipients} waiting
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div className="h-2 w-full rounded bg-slate-100 overflow-hidden">
                          <div className="h-full bg-teal-600 rounded" style={{ width: `${availPct}%` }} />
                        </div>
                        <div className="h-2 w-full rounded bg-slate-100 overflow-hidden">
                          <div className="h-full bg-slate-700 rounded" style={{ width: `${waitPct}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex items-center gap-6 text-[11px] text-slate-500 border-t border-slate-100 pt-3">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-teal-600 inline-block" /> Available Organs
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-slate-700 inline-block" /> Waiting Recipients
                </span>
              </div>
            </section>

            {/* Blood Group Supply/Demand Matrix */}
            <section className="rounded-lg border border-slate-200 bg-white p-6">
              <h2 className="text-sm font-semibold text-slate-900">Blood Group Distribution Matrix</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                ABO/Rh inventory balance across donors, waiting recipients, and available organs.
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 text-left font-semibold">Blood Group</th>
                      <th className="py-2 text-right font-semibold">Donors</th>
                      <th className="py-2 text-right font-semibold">Waiting</th>
                      <th className="py-2 text-right font-semibold">Available Organs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(summary?.bloodGroupMatrix ?? []).map((row) => (
                      <tr key={row.bloodGroup} className="h-9">
                        <td className="font-mono font-semibold text-slate-900">{row.bloodGroup}</td>
                        <td className="text-right font-mono tabular-nums text-slate-700">{row.donors}</td>
                        <td className="text-right font-mono tabular-nums text-slate-700">{row.waitingRecipients}</td>
                        <td className="text-right font-mono tabular-nums font-semibold text-teal-700">
                          {row.availableOrgans}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      )}

      {activeTab === 'hospitals' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <label htmlFor="city-filter" className="text-xs font-semibold text-slate-700">
                Filter City:
              </label>
              <select
                id="city-filter"
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                className="px-3 py-1.5 rounded-md border border-slate-300 text-xs focus:border-teal-600 focus:outline-none"
              >
                {cities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setHospModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-teal-700 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Register Hospital</span>
            </button>
          </div>

          <DataTable
            loading={loading}
            rows={filteredHospitals}
            rowKey={(h) => h.Hospital_ID}
            columns={[
              { key: 'id', header: 'Hospital ID', render: (h) => <span className="font-mono text-slate-600">{h.Hospital_ID}</span> },
              {
                key: 'name',
                header: 'Hospital Name',
                render: (h) => (
                  <div>
                    <p className="font-semibold text-slate-900">{h.Hospital_Name}</p>
                    <p className="text-[11px] text-slate-500">
                      {h.City}, {h.State} · {h.Hospital_Type}
                    </p>
                  </div>
                ),
              },
              { key: 'license', header: 'License Number', render: (h) => <span className="font-mono">{h.License_Number}</span> },
              { key: 'contact', header: 'Contact', render: (h) => <span className="font-mono">{h.Contact_Number}</span> },
              {
                key: 'cert',
                header: 'Certification',
                render: (h) => (
                  <StatusText value={h.Transplant_Center_Certified ? 'Certified' : 'Pending'} />
                ),
              },
              {
                key: 'action',
                header: 'Licensing',
                align: 'right',
                render: (h) => (
                  <button
                    type="button"
                    onClick={() => void handleToggleCertification(h)}
                    className="px-2.5 py-1 rounded border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                  >
                    {h.Transplant_Center_Certified ? 'Revoke' : 'Certify Center'}
                  </button>
                ),
              },
            ]}
          />
        </div>
      )}

      {activeTab === 'oversight' && (
        <div className="space-y-6">
          <section className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-white px-6 py-4">
              <h2 className="text-sm font-semibold text-slate-900">
                Pending Donor Legal Authorizations ({pendingLegalDonors.length})
              </h2>
              <p className="text-xs text-slate-500">
                State Authorization Committee (Living) and ZTCC (Deceased) legal clearance queue.
              </p>
            </div>
            <DataTable
              rows={pendingLegalDonors}
              rowKey={(d) => d.Donor_ID}
              emptyTitle="All donor legal clearances reviewed"
              emptyDescription="No pending donor approvals remain in the queue."
              columns={[
                { key: 'id', header: 'Donor ID', render: (d) => <span className="font-mono">{d.Donor_ID}</span> },
                { key: 'name', header: 'Donor', render: (d) => `${d.Full_Name} (${d.Blood_Group})` },
                { key: 'type', header: 'Type & Organ', render: (d) => `${d.Donor_Type} · ${d.Donating_Organ}` },
                { key: 'hosp', header: 'Registering Hospital', render: (d) => d.Hospital_Name || '-' },
                { key: 'fit', header: 'Medical Fitness', render: (d) => <StatusText value={d.Medical_Fitness_Status} /> },
                {
                  key: 'actions',
                  header: 'Committee Action',
                  align: 'right',
                  render: (d) => (
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleLegalDecision(d, 'Approved')}
                        className="px-2.5 py-1 rounded bg-teal-700 text-xs font-semibold text-white hover:bg-teal-800"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleLegalDecision(d, 'Rejected')}
                        className="px-2.5 py-1 rounded border border-rose-200 text-xs font-medium text-rose-700 hover:bg-rose-50"
                      >
                        Reject
                      </button>
                    </div>
                  ),
                },
              ]}
            />
          </section>

          <section className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-white px-6 py-4">
              <h2 className="text-sm font-semibold text-slate-900">
                Proposed Cross-Hospital Allocations ({proposedAllocations.length})
              </h2>
              <p className="text-xs text-slate-500">
                Review and authorize proposed organ allocations before transport dispatch.
              </p>
            </div>
            <DataTable
              rows={proposedAllocations}
              rowKey={(a) => a.AllocationID}
              emptyTitle="No proposed allocations awaiting oversight"
              emptyDescription="Proposed hospital matches will appear here for ZTCC authorization."
              columns={[
                { key: 'id', header: 'Allocation ID', render: (a) => <span className="font-mono">{a.AllocationID}</span> },
                { key: 'organ', header: 'Organ', render: (a) => `${a.OrganCode} · ${a.OrganType} (${a.OrganBloodGroup})` },
                { key: 'rec', header: 'Recipient', render: (a) => a.RecipientName || `#${a.RecipientID}` },
                { key: 'hosp', header: 'Transplant Center', render: (a) => a.TransplantHospitalName || '-' },
                { key: 'score', header: 'Score', align: 'right', render: (a) => <span className="font-mono font-semibold">{a.CompatibilityScore ?? '-'}%</span> },
                {
                  key: 'actions',
                  header: 'Authorization',
                  align: 'right',
                  render: (a) => (
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleAllocationDecision(a, 'Confirmed')}
                        className="px-2.5 py-1 rounded bg-teal-700 text-xs font-semibold text-white hover:bg-teal-800"
                      >
                        Confirm Dispatch
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleAllocationDecision(a, 'Rejected')}
                        className="px-2.5 py-1 rounded border border-rose-200 text-xs font-medium text-rose-700 hover:bg-rose-50"
                      >
                        Reject
                      </button>
                    </div>
                  ),
                },
              ]}
            />
          </section>
        </div>
      )}

      {activeTab === 'schema' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-900">Tables &amp; Views</h2>
              <p className="mt-0.5 text-xs text-slate-500">Inspect relational DDL, primary keys, and foreign key constraints.</p>
              <div className="mt-3 divide-y divide-slate-100">
                {schemaTables.map((t) => (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => setSelectedTable(t.name)}
                    className={`w-full py-2.5 px-2.5 flex items-center justify-between text-left rounded text-xs transition-colors ${
                      selectedTable === t.name
                        ? 'bg-teal-50 text-teal-900 font-semibold'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="font-mono">
                      {t.name}
                      {t.type === 'view' ? ' (view)' : ''}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500 tabular-nums">{t.rowCount} rows</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-900">Active SQLite Triggers</h2>
              <div className="mt-3 space-y-3">
                {triggers.map((trg) => (
                  <div key={trg.name} className="border-t border-slate-100 pt-2.5 first:border-0 first:pt-0">
                    <p className="font-mono text-xs font-semibold text-teal-800">{trg.name}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">Target table: {trg.tbl_name}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-8 space-y-4">
            {activeSchemaTable && (
              <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="font-mono text-base font-bold text-slate-900">{activeSchemaTable.name}</h2>
                    <p className="text-xs text-slate-500">
                      {activeSchemaTable.type === 'view' ? 'Relational SQL View' : 'InnoDB-compatible Relational Table'} ·{' '}
                      <span className="font-mono">{activeSchemaTable.rowCount}</span> records
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSqlText(`SELECT * FROM ${activeSchemaTable.name} LIMIT 25;`);
                      setActiveTab('sql');
                    }}
                    className="px-3 py-1.5 rounded-md border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Query in Console
                  </button>
                </div>

                <div>
                  <h3 className="text-xs font-semibold text-slate-700 mb-2">Column Definitions</h3>
                  <div className="overflow-x-auto border border-slate-200 rounded-md">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                          <th className="px-3 py-2 text-left font-semibold">Column</th>
                          <th className="px-3 py-2 text-left font-semibold">Type</th>
                          <th className="px-3 py-2 text-left font-semibold">Constraints</th>
                          <th className="px-3 py-2 text-left font-semibold">Default</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {activeSchemaTable.columns.map((col) => (
                          <tr key={col.cid} className="h-9">
                            <td className="px-3 font-mono font-medium text-slate-900">{col.name}</td>
                            <td className="px-3 font-mono text-slate-600">{col.type || 'ANY'}</td>
                            <td className="px-3 text-slate-600">
                              {[col.pk ? 'PRIMARY KEY' : null, col.notnull ? 'NOT NULL' : null]
                                .filter(Boolean)
                                .join(' · ') || 'NULLABLE'}
                            </td>
                            <td className="px-3 font-mono text-slate-500">{col.dflt_value ?? '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {activeSchemaTable.foreignKeys.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-slate-700 mb-2">Foreign Key Relationships</h3>
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
                      {activeSchemaTable.foreignKeys.map((fk, idx) => (
                        <div key={idx} className="px-3 py-2 flex items-center justify-between text-xs">
                          <span className="font-mono text-slate-900">
                            {activeSchemaTable.name}.{fk.from} → {fk.table}.{fk.to}
                          </span>
                          <span className="font-mono text-[11px] text-slate-500">
                            ON DELETE {fk.on_delete} · ON UPDATE {fk.on_update}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'sql' && (
        <div className="space-y-5">
          <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Live SQL Query Console</h2>
                <p className="text-xs text-slate-500">
                  Execute real SQL queries directly against the SQLite registry database.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {PRESET_QUERIES.map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => setSqlText(q.sql)}
                    className="px-2.5 py-1 rounded border border-slate-200 text-[11px] font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              aria-label="SQL Query Editor"
              rows={7}
              value={sqlText}
              onChange={(e) => setSqlText(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-slate-950 p-4 font-mono text-xs text-slate-100 focus:border-teal-500 focus:outline-none"
            />

            <div className="flex flex-wrap items-center justify-between gap-4">
              <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={allowMutations}
                  onChange={(e) => setAllowMutations(e.target.checked)}
                />
                <span>Allow INSERT / UPDATE / DELETE statements (Write Mode)</span>
              </label>

              <div className="flex items-center gap-2">
                {sqlResult?.kind === 'read' && sqlResult.rows && sqlResult.rows.length > 0 && (
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export CSV</span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={sqlRunning}
                  onClick={() => void handleRunSql()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-teal-700 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>{sqlRunning ? 'Executing...' : 'Run Query'}</span>
                </button>
              </div>
            </div>

            {sqlError && (
              <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 font-mono text-xs text-rose-800">
                {sqlError}
              </div>
            )}
          </div>

          {sqlResult && (
            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-600">
                <span>
                  {sqlResult.kind === 'read'
                    ? `${sqlResult.totalRows ?? 0} rows returned`
                    : `${sqlResult.changes ?? 0} rows affected`}
                </span>
                <span className="font-mono tabular-nums">{sqlResult.durationMs} ms</span>
              </div>

              {sqlResult.kind === 'read' && sqlResult.columns && sqlResult.rows && (
                <div className="overflow-x-auto max-h-[420px]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                      <tr>
                        {sqlResult.columns.map((col) => (
                          <th key={col} className="px-3 py-2 font-mono font-semibold text-slate-700 whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sqlResult.rows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          {sqlResult.columns!.map((col) => (
                            <td key={col} className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap">
                              {row[col] === null || row[col] === undefined ? 'NULL' : String(row[col])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="space-y-6">
          {/* Integrity & Maintenance Controls */}
          <section className="rounded-lg border border-slate-200 bg-white p-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Database Integrity &amp; Snapshot Maintenance</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Verify B-Tree &amp; Foreign Key constraints or restore the database to the original 6 SQL dump files.
              </p>
              {integrityStatus && (
                <p className="mt-2 inline-flex items-center gap-1.5 font-mono text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{integrityStatus}</span>
                </p>
              )}
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => void handleIntegrityCheck()}
                className="px-3.5 py-2 rounded-md border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                Run PRAGMA Integrity Check
              </button>
              {!confirmReset ? (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-rose-200 text-xs font-semibold text-rose-700 hover:bg-rose-50 whitespace-nowrap"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reset to SQL Dumps</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleResetDb()}
                    className="px-3 py-2 rounded-md bg-rose-700 text-xs font-semibold text-white hover:bg-rose-800"
                  >
                    Confirm Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="px-3 py-2 rounded-md border border-slate-200 text-xs font-medium text-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-white px-6 py-4">
              <h3 className="text-sm font-semibold text-slate-900">
                Recipient Status Trigger Audit (recipient_status_audit)
              </h3>
              <p className="text-xs text-slate-500">
                Automatically populated by SQLite trigger <span className="font-mono">trg_AuditRecipientStatusChange</span> on status transitions.
              </p>
            </div>
            <DataTable
              rows={recipientAudit}
              rowKey={(a) => a.Audit_ID}
              columns={[
                { key: 'id', header: 'Audit ID', render: (a) => <span className="font-mono">{a.Audit_ID}</span> },
                {
                  key: 'rec',
                  header: 'Recipient',
                  render: (a) => `${a.Recipient_Name || 'Recipient'} (#${a.Recipient_ID})`,
                },
                { key: 'prev', header: 'Previous Status', render: (a) => <StatusText value={a.Previous_Status} /> },
                { key: 'next', header: 'New Status', render: (a) => <StatusText value={a.New_Status} /> },
                { key: 'src', header: 'Trigger Source', render: (a) => <span className="font-mono text-slate-600">{a.Action_Source}</span> },
                { key: 'ts', header: 'Timestamp', align: 'right', render: (a) => <span className="font-mono">{a.Modified_Timestamp}</span> },
              ]}
            />
          </section>

          <section className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-white px-6 py-4">
              <h3 className="text-sm font-semibold text-slate-900">System Activity Log</h3>
            </div>
            <DataTable
              rows={systemLogs}
              rowKey={(l) => l.Log_ID}
              columns={[
                { key: 'actor', header: 'Actor', render: (l) => `${l.Actor_Name} (${l.Actor_Role})` },
                { key: 'action', header: 'Operation', render: (l) => <span className="font-mono font-semibold">{l.Action_Type}</span> },
                { key: 'table', header: 'Target', render: (l) => <span className="font-mono">{l.Target_Table} #{l.Target_ID}</span> },
                { key: 'summary', header: 'Summary', render: (l) => l.Summary },
                { key: 'time', header: 'Timestamp', align: 'right', render: (l) => <span className="font-mono">{l.Created_At}</span> },
              ]}
            />
          </section>
        </div>
      )}

      {activeTab === 'profile' && (
        <UserProfileView session={session} onSessionUpdated={onSessionUpdated} />
      )}

      {/* Register Hospital Modal */}
      <Modal open={hospModalOpen} onClose={() => setHospModalOpen(false)} title="Register New Hospital">
        <form onSubmit={handleCreateHospital} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700">Hospital Name</label>
            <input required value={newHospital.Hospital_Name} onChange={(e) => setNewHospital({ ...newHospital, Hospital_Name: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Hospital Type</label>
            <select value={newHospital.Hospital_Type} onChange={(e) => setNewHospital({ ...newHospital, Hospital_Type: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="Private">Private</option>
              <option value="Government">Government</option>
              <option value="Trust">Trust</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">City</label>
            <input required value={newHospital.City} onChange={(e) => setNewHospital({ ...newHospital, City: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">License Number</label>
            <input required value={newHospital.License_Number} onChange={(e) => setNewHospital({ ...newHospital, License_Number: e.target.value })} placeholder="LIC-MH-PUN-099" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Contact Number</label>
            <input required value={newHospital.Contact_Number} onChange={(e) => setNewHospital({ ...newHospital, Contact_Number: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div className="sm:col-span-2 flex items-center gap-2">
            <input
              id="hosp-cert"
              type="checkbox"
              checked={newHospital.Transplant_Center_Certified}
              onChange={(e) => setNewHospital({ ...newHospital, Transplant_Center_Certified: e.target.checked })}
            />
            <label htmlFor="hosp-cert" className="text-xs font-medium text-slate-700">Certify as Approved Transplant Center</label>
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setHospModalOpen(false)} className="px-4 py-2 rounded-md border border-slate-200 text-xs font-medium">Cancel</button>
            <button type="submit" className="px-4 py-2 rounded-md bg-teal-700 text-xs font-semibold text-white">Add Hospital</button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
