import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  FlaskConical,
  GitMerge,
  HeartPulse,
  MapPin,
  Plus,
  Search,
  UserCircle2,
  Users,
  UserPlus,
} from 'lucide-react';
import { api, type DashboardSummaryResponse } from '../../services/api';
import { AppShell, type NavItem } from '../AppShell';
import { RegionalHospitalMap } from '../charts/RegionalHospitalMap';
import { ResourceAvailabilityCard } from '../ResourceAvailabilityCard';
import { UserProfileView } from '../UserProfileView';
import { DataTable } from '../ui/DataTable';
import { Modal } from '../ui/Modal';
import { StatusText } from '../ui/StatusText';
import { getPreservationStatus } from '../../utils/organMatching';
import type {
  AllocationRecord,
  AuthSession,
  BloodGroup,
  DonorRecord,
  HospitalRecord,
  MatchCandidate,
  MedicalTestRecord,
  OrganRecord,
  OrganType,
  RecipientRecord,
  UrgencyLevel,
} from '../../types/db';

interface HospitalDashboardProps {
  session: AuthSession;
  onLogout: () => void;
  onSessionUpdated?: (session: AuthSession) => void;
  onActiveTabChange?: (tab: string) => void;
}

const BLOOD_GROUPS: BloodGroup[] = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];
const ORGAN_TYPES: OrganType[] = ['Kidney', 'Liver', 'Heart', 'Lung', 'Pancreas', 'Cornea', 'Small Intestine'];
const URGENCY_LEVELS: UrgencyLevel[] = ['Routine', 'Urgent', 'Critical', 'Emergency'];

export function HospitalDashboard({
  session,
  onLogout,
  onSessionUpdated,
  onActiveTabChange,
}: HospitalDashboardProps) {
  const hospitalId = session.linkedEntityId ?? 324270101;

  const [activeTab, setActiveTabState] = useState('overview');
  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    onActiveTabChange?.(tab);
  };
  const [scopeAll, setScopeAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);
  const [hospitals, setHospitals] = useState<HospitalRecord[]>([]);
  const [donors, setDonors] = useState<DonorRecord[]>([]);
  const [recipients, setRecipients] = useState<RecipientRecord[]>([]);
  const [organs, setOrgans] = useState<OrganRecord[]>([]);
  const [networkOrgans, setNetworkOrgans] = useState<OrganRecord[]>([]);
  const [networkRecipients, setNetworkRecipients] = useState<RecipientRecord[]>([]);
  const [tests, setTests] = useState<MedicalTestRecord[]>([]);
  const [allocations, setAllocations] = useState<AllocationRecord[]>([]);

  // Filters
  const [donorSearch, setDonorSearch] = useState('');
  const [donorStatusFilter, setDonorStatusFilter] = useState('All');
  const [recSearch, setRecSearch] = useState('');
  const [recOrganFilter, setRecOrganFilter] = useState('All');
  const [recStatusFilter, setRecStatusFilter] = useState('All');
  const [organStatusFilter, setOrganStatusFilter] = useState('All');

  // Matching Engine state
  const [selectedOrganId, setSelectedOrganId] = useState<number | null>(null);
  const [matchCandidates, setMatchCandidates] = useState<MatchCandidate[]>([]);
  const [matchLoading, setMatchLoading] = useState(false);
  const [transportMode, setTransportMode] = useState<'Green Corridor' | 'Road' | 'Air'>('Green Corridor');
  const [leadSurgeonInput, setLeadSurgeonInput] = useState('Dr. Ashok Deshpande');

  // Modals
  const [donorModalOpen, setDonorModalOpen] = useState(false);
  const [editDonor, setEditDonor] = useState<DonorRecord | null>(null);
  const [recModalOpen, setRecModalOpen] = useState(false);
  const [editRecipient, setEditRecipient] = useState<RecipientRecord | null>(null);
  const [organModalOpen, setOrganModalOpen] = useState(false);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [editAllocation, setEditAllocation] = useState<AllocationRecord | null>(null);

  // Forms
  const [newDonor, setNewDonor] = useState({
    Full_Name: '',
    DOB: '1988-04-12',
    Gender: 'Male',
    Blood_Group: 'O+',
    Contact_Number: '',
    Email: '',
    Address: '',
    Aadhar_Num: '',
    Donor_Type: 'Living',
    Donating_Organ: 'Kidney',
    Brain_Death_Conf: false,
  });

  const [newRec, setNewRec] = useState({
    Full_Name: '',
    DOB: '1986-09-20',
    Gender: 'Female',
    Blood_Group: 'O+',
    Contact_Number: '',
    Email: '',
    Address: '',
    Aadhar_Num: '',
    RequiredOrgan: 'Kidney',
    UrgencyLevel: 'Urgent',
    Attending_Physician: 'Dr. Suresh Joshi',
    Disease: 'End-Stage Renal Disease (ESRD)',
    Previous_Transplant_History: false,
  });

  const [newOrgan, setNewOrgan] = useState({
    DonorID: 0,
    OrganType: 'Kidney',
    MaxPreservationHours: 24,
  });

  const [newTest, setNewTest] = useState({
    Person_ID: 0,
    OrganID: '',
    TestType: 'HLA Typing',
    TestResult: 'Normal',
    ResultDetails: '',
    LabName: 'Transplant Immunology & Pathology Lab',
  });

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hFilter = scopeAll ? undefined : hospitalId;
      const [sumRes, hospRes, donRes, recRes, orgRes, testRes, allocRes, netOrgRes, netRecRes] =
        await Promise.all([
          api.getSummary(hFilter),
          api.getHospitals(),
          api.getDonors({ hospitalId: hFilter }),
          api.getRecipients({ hospitalId: hFilter }),
          api.getOrgans({ hospitalId: hFilter }),
          api.getMedicalTests({ hospitalId: hFilter }),
          api.getAllocations({ hospitalId: hFilter }),
          scopeAll ? Promise.resolve(null) : api.getOrgans({}),
          scopeAll ? Promise.resolve(null) : api.getRecipients({}),
        ]);
      setSummary(sumRes);
      setHospitals(hospRes.hospitals);
      setDonors(donRes.donors);
      setRecipients(recRes.recipients);
      setOrgans(orgRes.organs);
      setNetworkOrgans(netOrgRes ? netOrgRes.organs : orgRes.organs);
      setNetworkRecipients(netRecRes ? netRecRes.recipients : recRes.recipients);
      setTests(testRes.tests);
      setAllocations(allocRes.allocations);

      if (donRes.donors.length > 0 && newOrgan.DonorID === 0) {
        setNewOrgan((prev) => ({ ...prev, DonorID: donRes.donors[0].Donor_ID }));
      }
      if (recRes.recipients.length > 0 && newTest.Person_ID === 0) {
        setNewTest((prev) => ({ ...prev, Person_ID: recRes.recipients[0].Recipient_ID }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load clinical data.');
    } finally {
      setLoading(false);
    }
  }, [hospitalId, scopeAll]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const runMatchingForOrgan = async (organId: number) => {
    setSelectedOrganId(organId);
    setActiveTab('allocations');
    setMatchLoading(true);
    setError(null);
    try {
      const res = await api.getMatchCandidates(organId);
      setMatchCandidates(res.candidates);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to compute compatibility matches.');
    } finally {
      setMatchLoading(false);
    }
  };

  const handleProposeAllocation = async (candidate: MatchCandidate) => {
    if (!selectedOrganId) return;
    setError(null);
    setNotice(null);
    try {
      await api.createAllocation({
        OrganID: selectedOrganId,
        RecipientID: candidate.recipient.Recipient_ID,
        TransplantHospitalID: candidate.recipient.RegisteringHospitalID || hospitalId,
        TransportMode: transportMode,
        GreenCorridorUsed: transportMode === 'Green Corridor',
        LeadSurgeon: leadSurgeonInput,
      });
      setNotice(
        `Proposed allocation to ${candidate.recipient.Full_Name} (${candidate.compatibilityScore.toFixed(1)}% match). Recipient & organ statuses updated.`,
      );
      setSelectedOrganId(null);
      setMatchCandidates([]);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to propose allocation.');
    }
  };

  const handleCreateDonor = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.createDonor({ ...newDonor, Registering_Hospital_ID: hospitalId });
      setDonorModalOpen(false);
      setNotice(`Registered donor ${newDonor.Full_Name}.`);
      setNewDonor({
        Full_Name: '',
        DOB: '1988-04-12',
        Gender: 'Male',
        Blood_Group: 'O+',
        Contact_Number: '',
        Email: '',
        Address: '',
        Aadhar_Num: '',
        Donor_Type: 'Living',
        Donating_Organ: 'Kidney',
        Brain_Death_Conf: false,
      });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not register donor.');
    }
  };

  const handleUpdateDonor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDonor) return;
    setError(null);
    try {
      await api.updateDonor(editDonor.Donor_ID, {
        Medical_Fitness_Status: editDonor.Medical_Fitness_Status,
        Donor_Status: editDonor.Donor_Status,
        Brain_Death_Conf: Boolean(editDonor.Brain_Death_Conf),
        actorRole: 'hospital',
        actorName: session.displayName,
      });
      setNotice(`Updated donor ${editDonor.Full_Name}.`);
      setEditDonor(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update donor.');
    }
  };

  const handleCreateRecipient = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.createRecipient({ ...newRec, RegisteringHospitalID: hospitalId });
      setRecModalOpen(false);
      setNotice(`Added recipient ${newRec.Full_Name} to waitlist.`);
      setNewRec({
        Full_Name: '',
        DOB: '1986-09-20',
        Gender: 'Female',
        Blood_Group: 'O+',
        Contact_Number: '',
        Email: '',
        Address: '',
        Aadhar_Num: '',
        RequiredOrgan: 'Kidney',
        UrgencyLevel: 'Urgent',
        Attending_Physician: 'Dr. Suresh Joshi',
        Disease: 'End-Stage Renal Disease (ESRD)',
        Previous_Transplant_History: false,
      });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not register recipient.');
    }
  };

  const handleUpdateRecipient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editRecipient) return;
    setError(null);
    try {
      await api.updateRecipient(editRecipient.Recipient_ID, {
        UrgencyLevel: editRecipient.UrgencyLevel,
        RecipientStatus: editRecipient.RecipientStatus,
        Attending_Physician: editRecipient.Attending_Physician,
        actorRole: 'hospital',
        actorName: session.displayName,
      });
      setNotice(`Updated recipient ${editRecipient.Full_Name} (status audit trigger logged if status changed).`);
      setEditRecipient(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update recipient.');
    }
  };

  const handleCreateOrgan = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.createOrgan({ ...newOrgan, RetrievalHospitalID: hospitalId });
      setOrganModalOpen(false);
      setNotice(`Logged retrieved ${newOrgan.OrganType} into preservation inventory.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log organ retrieval.');
    }
  };

  const handleCreateTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.createMedicalTest({
        ...newTest,
        OrganID: newTest.OrganID ? Number(newTest.OrganID) : null,
        ConductedByHospitalID: hospitalId,
      });
      setTestModalOpen(false);
      setNotice(`Recorded ${newTest.TestType} lab result.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record medical test.');
    }
  };

  const handleUpdateAllocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editAllocation) return;
    setError(null);
    try {
      await api.updateAllocation(editAllocation.AllocationID, {
        AllocationStatus: editAllocation.AllocationStatus,
        TransportMode: editAllocation.TransportMode,
        LeadSurgeon: editAllocation.LeadSurgeon,
        TransplantOutcome: editAllocation.TransplantOutcome,
        RecoveryStatus: editAllocation.RecoveryStatus,
        actorRole: 'hospital',
        actorName: session.displayName,
      });
      setNotice(`Updated allocation #${editAllocation.AllocationID}.`);
      setEditAllocation(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update allocation.');
    }
  };

  const filteredDonors = donors.filter((d) => {
    const matchSearch =
      !donorSearch ||
      d.Full_Name.toLowerCase().includes(donorSearch.toLowerCase()) ||
      String(d.Donor_ID).includes(donorSearch);
    const matchStatus = donorStatusFilter === 'All' || d.Donor_Status === donorStatusFilter;
    return matchSearch && matchStatus;
  });

  const filteredRecipients = recipients.filter((r) => {
    const matchSearch =
      !recSearch ||
      r.Full_Name.toLowerCase().includes(recSearch.toLowerCase()) ||
      String(r.Recipient_ID).includes(recSearch) ||
      r.Disease.toLowerCase().includes(recSearch.toLowerCase());
    const matchOrgan = recOrganFilter === 'All' || r.RequiredOrgan === recOrganFilter;
    const matchStatus = recStatusFilter === 'All' || r.RecipientStatus === recStatusFilter;
    return matchSearch && matchOrgan && matchStatus;
  });

  const filteredOrgans = organs.filter(
    (o) => organStatusFilter === 'All' || o.OrganStatus === organStatusFilter,
  );

  const availableNetworkOrgans = organs.filter((o) => o.OrganStatus === 'Available');

  const navItems: NavItem[] = [
    { id: 'overview', label: 'Clinical Overview', icon: <Activity className="w-4 h-4" /> },
    { id: 'donors', label: 'Donor Registry', icon: <UserPlus className="w-4 h-4" /> },
    { id: 'recipients', label: 'Recipient Waitlist', icon: <Users className="w-4 h-4" /> },
    { id: 'organs', label: 'Organ Inventory', icon: <HeartPulse className="w-4 h-4" /> },
    { id: 'tests', label: 'Lab & Crossmatch', icon: <FlaskConical className="w-4 h-4" /> },
    { id: 'allocations', label: 'Matching & Allocation', icon: <GitMerge className="w-4 h-4" /> },
    { id: 'map', label: 'Regional Map', icon: <MapPin className="w-4 h-4" /> },
    { id: 'profile', label: 'My Profile', icon: <UserCircle2 className="w-4 h-4" /> },
  ];

  const currentHospital = hospitals.find((h) => h.Hospital_ID === hospitalId);

  return (
    <AppShell
      session={session}
      navItems={navItems}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onLogout={onLogout}
      onOpenProfile={() => setActiveTab('profile')}
      primaryAction={
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-md border border-slate-200 bg-slate-100 p-0.5">
            <button
              type="button"
              onClick={() => setScopeAll(false)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                !scopeAll ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              My Hospital
            </button>
            <button
              type="button"
              onClick={() => setScopeAll(true)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                scopeAll ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              Full Network
            </button>
          </div>
          <button
            type="button"
            onClick={() => setOrganModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-teal-700 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Log Retrieval</span>
          </button>
        </div>
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

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <section className="rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900">
                  {currentHospital?.Hospital_Name || session.displayName}
                </h1>
                <p className="mt-0.5 text-xs text-slate-500">
                  {currentHospital
                    ? `${currentHospital.City}, ${currentHospital.State} · License ${currentHospital.License_Number} · ${
                        currentHospital.Transplant_Center_Certified ? 'Certified Transplant Center' : 'Retrieval Partner'
                      }`
                    : `Hospital ID #${hospitalId}`}
                </p>
              </div>
              <span className="text-xs font-medium text-slate-600">
                Viewing: <strong className="text-slate-900">{scopeAll ? 'All Maharashtra Hospitals' : 'Hospital-Scoped Records'}</strong>
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-6">
              <div>
                <p className="text-xs text-slate-500">Registered Donors</p>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900">
                  {summary?.kpis.totalDonors ?? donors.length}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Waiting Recipients</p>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900">
                  {summary?.kpis.waitingRecipients ?? recipients.filter((r) => r.RecipientStatus === 'Waiting').length}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Available Organs</p>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-teal-700">
                  {summary?.kpis.availableOrgans ?? availableNetworkOrgans.length}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Completed Transplants</p>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900">
                  {summary?.kpis.completedTransplants ?? 0}
                </p>
              </div>
            </div>
          </section>

          <ResourceAvailabilityCard
            hospitalId={hospitalId}
            hospitalName={currentHospital?.Hospital_Name || session.displayName}
            scopeAll={scopeAll}
            organs={organs}
            onNavigateTab={setActiveTab}
            onResourceUpdated={(msg) => setNotice(msg)}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="rounded-lg border border-slate-200 bg-white p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-900">Available Organs Ready for Matching</h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('organs')}
                  className="text-xs font-medium text-teal-700 hover:underline"
                >
                  View All
                </button>
              </div>
              {availableNetworkOrgans.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">
                  No available organs in current scope. Switch to Full Network or log a new retrieval.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {availableNetworkOrgans.slice(0, 5).map((o) => (
                    <div key={o.OrganID} className="py-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-slate-900">
                          <span className="font-mono">{o.OrganCode}</span> · {o.OrganType} ({o.BloodGroup})
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          Donor: {o.DonorName} · Max Cold Ischemia: {o.MaxPreservationHours}h
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void runMatchingForOrgan(o.OrganID)}
                        className="px-2.5 py-1.5 rounded-md border border-teal-600 text-xs font-semibold text-teal-700 hover:bg-teal-50 whitespace-nowrap shrink-0"
                      >
                        Find Match
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-900">High-Priority Waitlist Queue</h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('recipients')}
                  className="text-xs font-medium text-teal-700 hover:underline"
                >
                  Manage Waitlist
                </button>
              </div>
              <div className="divide-y divide-slate-100">
                {recipients
                  .filter((r) => r.RecipientStatus === 'Waiting')
                  .slice(0, 5)
                  .map((r) => (
                    <div key={r.Recipient_ID} className="py-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-slate-900">
                          {r.Full_Name} · {r.RequiredOrgan} ({r.Blood_Group})
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {r.Disease} · Priority <span className="font-mono">{Number(r.PriorityScore).toFixed(1)}</span>
                        </p>
                      </div>
                      <StatusText value={r.UrgencyLevel} />
                    </div>
                  ))}
              </div>
            </section>
          </div>
        </div>
      )}

      {activeTab === 'donors' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  aria-label="Search donors"
                  value={donorSearch}
                  onChange={(e) => setDonorSearch(e.target.value)}
                  placeholder="Search donor name or ID..."
                  className="pl-8 pr-3 py-1.5 rounded-md border border-slate-300 text-xs focus:border-teal-600 focus:outline-none"
                />
              </div>
              <select
                aria-label="Filter donor status"
                value={donorStatusFilter}
                onChange={(e) => setDonorStatusFilter(e.target.value)}
                className="px-3 py-1.5 rounded-md border border-slate-300 text-xs focus:border-teal-600 focus:outline-none"
              >
                <option value="All">All Statuses</option>
                {['Registered', 'Evaluated', 'Approved', 'Retrieved', 'Rejected'].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setDonorModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-teal-700 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Register Donor</span>
            </button>
          </div>

          <DataTable
            loading={loading}
            rows={filteredDonors}
            rowKey={(d) => d.Donor_ID}
            columns={[
              { key: 'id', header: 'Donor ID', render: (d) => <span className="font-mono text-slate-600">{d.Donor_ID}</span> },
              {
                key: 'name',
                header: 'Donor Name',
                render: (d) => (
                  <div>
                    <p className="font-semibold text-slate-900">{d.Full_Name}</p>
                    <p className="text-[11px] text-slate-500">{d.Hospital_Name}</p>
                  </div>
                ),
              },
              { key: 'blood', header: 'Blood', render: (d) => <span className="font-mono font-semibold">{d.Blood_Group}</span> },
              { key: 'type', header: 'Type & Organ', render: (d) => `${d.Donor_Type} · ${d.Donating_Organ}` },
              { key: 'fitness', header: 'Fitness', render: (d) => <StatusText value={d.Medical_Fitness_Status} /> },
              { key: 'legal', header: 'Legal Approval', render: (d) => <StatusText value={d.Legal_Approval_Status} /> },
              { key: 'status', header: 'Status', render: (d) => <StatusText value={d.Donor_Status} /> },
              {
                key: 'actions',
                header: 'Actions',
                align: 'right',
                render: (d) => (
                  <button
                    type="button"
                    onClick={() => setEditDonor(d)}
                    className="px-2.5 py-1 rounded border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Evaluate
                  </button>
                ),
              },
            ]}
          />
        </div>
      )}

      {activeTab === 'recipients' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  aria-label="Search recipients"
                  value={recSearch}
                  onChange={(e) => setRecSearch(e.target.value)}
                  placeholder="Search patient, ID, disease..."
                  className="pl-8 pr-3 py-1.5 rounded-md border border-slate-300 text-xs focus:border-teal-600 focus:outline-none"
                />
              </div>
              <select
                aria-label="Filter required organ"
                value={recOrganFilter}
                onChange={(e) => setRecOrganFilter(e.target.value)}
                className="px-3 py-1.5 rounded-md border border-slate-300 text-xs focus:border-teal-600 focus:outline-none"
              >
                <option value="All">All Organs</option>
                {ORGAN_TYPES.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filter recipient status"
                value={recStatusFilter}
                onChange={(e) => setRecStatusFilter(e.target.value)}
                className="px-3 py-1.5 rounded-md border border-slate-300 text-xs focus:border-teal-600 focus:outline-none"
              >
                <option value="All">All Statuses</option>
                {['Waiting', 'Allocated', 'Transplanted', 'Removed'].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setRecModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-teal-700 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Recipient</span>
            </button>
          </div>

          <DataTable
            loading={loading}
            rows={filteredRecipients}
            rowKey={(r) => r.Recipient_ID}
            columns={[
              { key: 'id', header: 'Recipient ID', render: (r) => <span className="font-mono text-slate-600">{r.Recipient_ID}</span> },
              {
                key: 'name',
                header: 'Patient & Diagnosis',
                render: (r) => (
                  <div>
                    <p className="font-semibold text-slate-900">{r.Full_Name}</p>
                    <p className="text-[11px] text-slate-500 truncate max-w-[240px]">{r.Disease}</p>
                  </div>
                ),
              },
              { key: 'organ', header: 'Required Organ', render: (r) => `${r.RequiredOrgan} (${r.Blood_Group})` },
              { key: 'urgency', header: 'Urgency', render: (r) => <StatusText value={r.UrgencyLevel} /> },
              {
                key: 'score',
                header: 'Priority',
                align: 'right',
                render: (r) => <span className="font-mono font-semibold text-slate-900">{Number(r.PriorityScore).toFixed(1)}</span>,
              },
              { key: 'status', header: 'Status', render: (r) => <StatusText value={r.RecipientStatus} /> },
              {
                key: 'actions',
                header: 'Actions',
                align: 'right',
                render: (r) => (
                  <button
                    type="button"
                    onClick={() => setEditRecipient(r)}
                    className="px-2.5 py-1 rounded border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Update Status
                  </button>
                ),
              },
            ]}
          />
        </div>
      )}

      {activeTab === 'organs' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2">
              {['All', 'Available', 'Allocated', 'Transplanted', 'Expired', 'Rejected'].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setOrganStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    organStatusFilter === st
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setOrganModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-teal-700 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Log Organ Retrieval</span>
            </button>
          </div>

          <DataTable
            loading={loading}
            rows={filteredOrgans}
            rowKey={(o) => o.OrganID}
            columns={[
              { key: 'code', header: 'Organ Code', render: (o) => <span className="font-mono font-semibold text-slate-900">{o.OrganCode}</span> },
              { key: 'type', header: 'Organ & Blood', render: (o) => `${o.OrganType} (${o.BloodGroup})` },
              { key: 'donor', header: 'Donor', render: (o) => o.DonorName || `#${o.DonorID}` },
              { key: 'hosp', header: 'Retrieval Hospital', render: (o) => o.RetrievalHospitalName || '-' },
              {
                key: 'pres',
                header: 'Max Preservation',
                align: 'right',
                render: (o) => <span className="font-mono">{o.MaxPreservationHours} hrs</span>,
              },
              { key: 'status', header: 'Organ Status', render: (o) => <StatusText value={o.OrganStatus} /> },
              {
                key: 'action',
                header: 'Matching',
                align: 'right',
                render: (o) =>
                  o.OrganStatus === 'Available' ? (
                    <button
                      type="button"
                      onClick={() => void runMatchingForOrgan(o.OrganID)}
                      className="px-2.5 py-1 rounded border border-teal-600 text-xs font-semibold text-teal-700 hover:bg-teal-50 whitespace-nowrap"
                    >
                      Run Match
                    </button>
                  ) : (
                    <span className="text-[11px] text-slate-400">
                      {o.RejectionReason || getPreservationStatus(o).windowState}
                    </span>
                  ),
              },
            ]}
          />
        </div>
      )}

      {activeTab === 'tests' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Medical, HLA &amp; Crossmatch Lab Diagnostics</h2>
              <p className="text-xs text-slate-500">Log blood group confirmation, viral screening, HLA typing, and viability tests.</p>
            </div>
            <button
              type="button"
              onClick={() => setTestModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-teal-700 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Record Lab Test</span>
            </button>
          </div>

          <DataTable
            loading={loading}
            rows={tests}
            rowKey={(t) => t.TestID}
            columns={[
              { key: 'id', header: 'Test ID', render: (t) => <span className="font-mono text-slate-600">{t.TestID}</span> },
              {
                key: 'person',
                header: 'Patient / Donor',
                render: (t) => (
                  <div>
                    <p className="font-semibold text-slate-900">{t.PersonName}</p>
                    <p className="text-[11px] text-slate-500">
                      {t.PersonType} · ID #{t.Person_ID}
                    </p>
                  </div>
                ),
              },
              { key: 'type', header: 'Test Type', render: (t) => t.TestType },
              { key: 'result', header: 'Result', render: (t) => <StatusText value={t.TestResult} /> },
              { key: 'details', header: 'Details', render: (t) => <span className="text-slate-600">{t.ResultDetails || '-'}</span> },
              { key: 'date', header: 'Date', align: 'right', render: (t) => <span className="font-mono">{t.TestDate.slice(0, 10)}</span> },
            ]}
          />
        </div>
      )}

      {activeTab === 'allocations' && (
        <div className="space-y-6">
          {/* Smart Compatibility Matching Workbench */}
          <section className="rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Compatibility Matching Engine</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Select an available organ to score and rank compatible waiting recipients by ABO/Rh match, urgency, and proximity.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Select available organ to match"
                  value={selectedOrganId ?? ''}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (val) void runMatchingForOrgan(val);
                    else {
                      setSelectedOrganId(null);
                      setMatchCandidates([]);
                    }
                  }}
                  className="px-3 py-1.5 rounded-md border border-slate-300 text-xs focus:border-teal-600 focus:outline-none"
                >
                  <option value="">Select an available organ...</option>
                  {availableNetworkOrgans.map((o) => (
                    <option key={o.OrganID} value={o.OrganID}>
                      {o.OrganCode} · {o.OrganType} ({o.BloodGroup}) — {o.RetrievalHospitalName}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Transport Mode"
                  value={transportMode}
                  onChange={(e) => setTransportMode(e.target.value as 'Green Corridor' | 'Road' | 'Air')}
                  className="px-3 py-1.5 rounded-md border border-slate-300 text-xs focus:border-teal-600 focus:outline-none"
                >
                  <option value="Green Corridor">Green Corridor</option>
                  <option value="Road">Road</option>
                  <option value="Air">Air</option>
                </select>
                <input
                  type="text"
                  aria-label="Lead Surgeon"
                  value={leadSurgeonInput}
                  onChange={(e) => setLeadSurgeonInput(e.target.value)}
                  placeholder="Lead Surgeon"
                  className="px-3 py-1.5 rounded-md border border-slate-300 text-xs focus:border-teal-600 focus:outline-none"
                />
              </div>
            </div>

            {selectedOrganId && (
              <div className="mt-4">
                {matchLoading ? (
                  <p className="text-xs text-slate-500 py-4">Computing compatibility matrix...</p>
                ) : matchCandidates.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4">
                    No compatible waiting recipients found for this organ type and blood group.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {matchCandidates.map((cand, idx) => (
                      <div key={cand.recipient.Recipient_ID} className="py-3 flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <p className="text-xs font-semibold text-slate-900">
                            <span className="font-mono text-teal-700 mr-2">#{idx + 1}</span>
                            {cand.recipient.Full_Name} · {cand.recipient.Blood_Group} ({cand.bloodMatchType})
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {cand.recipient.Hospital_Name} · {cand.reasons.join(' · ')}
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="font-mono text-sm font-bold text-teal-700 tabular-nums">
                              {cand.compatibilityScore.toFixed(1)}%
                            </p>
                            <StatusText value={cand.recipient.UrgencyLevel} />
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleProposeAllocation(cand)}
                            className="px-3 py-1.5 rounded-md bg-teal-700 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
                          >
                            Propose Allocation
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Allocation & Surgery Pipeline Table */}
          <DataTable
            loading={loading}
            rows={allocations}
            rowKey={(a) => a.AllocationID}
            columns={[
              { key: 'id', header: 'Allocation ID', render: (a) => <span className="font-mono text-slate-600">{a.AllocationID}</span> },
              {
                key: 'organ',
                header: 'Organ',
                render: (a) => (
                  <div>
                    <p className="font-mono font-semibold text-slate-900">{a.OrganCode}</p>
                    <p className="text-[11px] text-slate-500">
                      {a.OrganType} ({a.OrganBloodGroup})
                    </p>
                  </div>
                ),
              },
              {
                key: 'rec',
                header: 'Recipient & Hospital',
                render: (a) => (
                  <div>
                    <p className="font-semibold text-slate-900">{a.RecipientName || `Recipient #${a.RecipientID}`}</p>
                    <p className="text-[11px] text-slate-500">{a.TransplantHospitalName}</p>
                  </div>
                ),
              },
              {
                key: 'score',
                header: 'Match Score',
                align: 'right',
                render: (a) => <span className="font-mono font-semibold">{a.CompatibilityScore ?? '-'}%</span>,
              },
              {
                key: 'transport',
                header: 'Transport',
                render: (a) => (
                  <span>
                    {a.TransportMode || 'Pending'}
                    {a.GreenCorridorUsed ? ' (Green Corridor)' : ''}
                  </span>
                ),
              },
              { key: 'status', header: 'Status', render: (a) => <StatusText value={a.AllocationStatus} /> },
              { key: 'outcome', header: 'Outcome', render: (a) => <StatusText value={a.TransplantOutcome || 'Not Performed'} /> },
              {
                key: 'action',
                header: 'Manage',
                align: 'right',
                render: (a) => (
                  <button
                    type="button"
                    onClick={() => setEditAllocation(a)}
                    className="px-2.5 py-1 rounded border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Update
                  </button>
                ),
              },
            ]}
          />
        </div>
      )}

      {activeTab === 'map' && (
        <RegionalHospitalMap
          hospitals={hospitals}
          organs={networkOrgans}
          recipients={networkRecipients}
          activeHospitalId={hospitalId}
          loading={loading}
        />
      )}

      {activeTab === 'profile' && (
        <UserProfileView session={session} onSessionUpdated={onSessionUpdated} />
      )}

      {/* MODALS */}
      <Modal open={donorModalOpen} onClose={() => setDonorModalOpen(false)} title="Register New Donor">
        <form onSubmit={handleCreateDonor} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Full Name</label>
            <input required value={newDonor.Full_Name} onChange={(e) => setNewDonor({ ...newDonor, Full_Name: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Email</label>
            <input type="email" required value={newDonor.Email} onChange={(e) => setNewDonor({ ...newDonor, Email: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Date of Birth</label>
            <input type="date" required value={newDonor.DOB} onChange={(e) => setNewDonor({ ...newDonor, DOB: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Blood Group</label>
            <select value={newDonor.Blood_Group} onChange={(e) => setNewDonor({ ...newDonor, Blood_Group: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              {BLOOD_GROUPS.map((bg) => <option key={bg} value={bg}>{bg}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Contact Number</label>
            <input required value={newDonor.Contact_Number} onChange={(e) => setNewDonor({ ...newDonor, Contact_Number: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Aadhar Number</label>
            <input required value={newDonor.Aadhar_Num} onChange={(e) => setNewDonor({ ...newDonor, Aadhar_Num: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Donor Type</label>
            <select value={newDonor.Donor_Type} onChange={(e) => setNewDonor({ ...newDonor, Donor_Type: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="Living">Living</option>
              <option value="Deceased">Deceased</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Donating Organ</label>
            <select value={newDonor.Donating_Organ} onChange={(e) => setNewDonor({ ...newDonor, Donating_Organ: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              {['Kidney', 'Liver', 'Heart', 'Lungs', 'Pancreas', 'Multiple'].map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700">Address</label>
            <input required value={newDonor.Address} onChange={(e) => setNewDonor({ ...newDonor, Address: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setDonorModalOpen(false)} className="px-4 py-2 rounded-md border border-slate-200 text-xs font-medium text-slate-700">Cancel</button>
            <button type="submit" className="px-4 py-2 rounded-md bg-teal-700 text-xs font-semibold text-white hover:bg-teal-800">Register Donor</button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(editDonor)} onClose={() => setEditDonor(null)} title={`Evaluate Donor #${editDonor?.Donor_ID ?? ''}`}>
        {editDonor && (
          <form onSubmit={handleUpdateDonor} className="space-y-4">
            <p className="text-xs text-slate-600">{editDonor.Full_Name} · {editDonor.Blood_Group} · {editDonor.Donating_Organ}</p>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Medical Fitness Status</label>
              <select
                value={editDonor.Medical_Fitness_Status}
                onChange={(e) => setEditDonor({ ...editDonor, Medical_Fitness_Status: e.target.value as DonorRecord['Medical_Fitness_Status'] })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="Pending">Pending</option>
                <option value="Fit">Fit</option>
                <option value="Unfit">Unfit</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Donor Status</label>
              <select
                value={editDonor.Donor_Status}
                onChange={(e) => setEditDonor({ ...editDonor, Donor_Status: e.target.value as DonorRecord['Donor_Status'] })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {['Registered', 'Evaluated', 'Approved', 'Retrieved', 'Rejected', 'Deceased'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="bd-conf"
                type="checkbox"
                checked={Boolean(editDonor.Brain_Death_Conf)}
                onChange={(e) => setEditDonor({ ...editDonor, Brain_Death_Conf: e.target.checked ? 1 : 0 })}
              />
              <label htmlFor="bd-conf" className="text-xs font-medium text-slate-700">Brain Death Certified (Deceased Donor Protocol)</label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditDonor(null)} className="px-4 py-2 rounded-md border border-slate-200 text-xs font-medium">Cancel</button>
              <button type="submit" className="px-4 py-2 rounded-md bg-teal-700 text-xs font-semibold text-white">Save Evaluation</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={recModalOpen} onClose={() => setRecModalOpen(false)} title="Register New Recipient">
        <form onSubmit={handleCreateRecipient} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Full Name</label>
            <input required value={newRec.Full_Name} onChange={(e) => setNewRec({ ...newRec, Full_Name: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Email</label>
            <input type="email" required value={newRec.Email} onChange={(e) => setNewRec({ ...newRec, Email: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Date of Birth</label>
            <input type="date" required value={newRec.DOB} onChange={(e) => setNewRec({ ...newRec, DOB: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Blood Group</label>
            <select value={newRec.Blood_Group} onChange={(e) => setNewRec({ ...newRec, Blood_Group: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              {BLOOD_GROUPS.map((bg) => <option key={bg} value={bg}>{bg}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Contact Number</label>
            <input required value={newRec.Contact_Number} onChange={(e) => setNewRec({ ...newRec, Contact_Number: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Aadhar Number</label>
            <input required value={newRec.Aadhar_Num} onChange={(e) => setNewRec({ ...newRec, Aadhar_Num: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Required Organ</label>
            <select value={newRec.RequiredOrgan} onChange={(e) => setNewRec({ ...newRec, RequiredOrgan: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              {ORGAN_TYPES.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Urgency Level</label>
            <select value={newRec.UrgencyLevel} onChange={(e) => setNewRec({ ...newRec, UrgencyLevel: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              {URGENCY_LEVELS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Primary Disease</label>
            <input required value={newRec.Disease} onChange={(e) => setNewRec({ ...newRec, Disease: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Attending Physician</label>
            <input required value={newRec.Attending_Physician} onChange={(e) => setNewRec({ ...newRec, Attending_Physician: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700">Address</label>
            <input required value={newRec.Address} onChange={(e) => setNewRec({ ...newRec, Address: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setRecModalOpen(false)} className="px-4 py-2 rounded-md border border-slate-200 text-xs font-medium">Cancel</button>
            <button type="submit" className="px-4 py-2 rounded-md bg-teal-700 text-xs font-semibold text-white">Register Recipient</button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(editRecipient)} onClose={() => setEditRecipient(null)} title={`Update Recipient #${editRecipient?.Recipient_ID ?? ''}`}>
        {editRecipient && (
          <form onSubmit={handleUpdateRecipient} className="space-y-4">
            <p className="text-xs text-slate-600">{editRecipient.Full_Name} · Needs {editRecipient.RequiredOrgan} ({editRecipient.Blood_Group})</p>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Urgency Level (auto-recalculates Priority Score)</label>
              <select
                value={editRecipient.UrgencyLevel}
                onChange={(e) => setEditRecipient({ ...editRecipient, UrgencyLevel: e.target.value as UrgencyLevel })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {URGENCY_LEVELS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Recipient Status (Fires SQLite Audit Trigger)</label>
              <select
                value={editRecipient.RecipientStatus}
                onChange={(e) => setEditRecipient({ ...editRecipient, RecipientStatus: e.target.value as RecipientRecord['RecipientStatus'] })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {['Waiting', 'Allocated', 'Transplanted', 'Removed', 'Deceased'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Attending Physician</label>
              <input
                value={editRecipient.Attending_Physician}
                onChange={(e) => setEditRecipient({ ...editRecipient, Attending_Physician: e.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditRecipient(null)} className="px-4 py-2 rounded-md border border-slate-200 text-xs font-medium">Cancel</button>
              <button type="submit" className="px-4 py-2 rounded-md bg-teal-700 text-xs font-semibold text-white">Save Changes</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={organModalOpen} onClose={() => setOrganModalOpen(false)} title="Log Organ Retrieval">
        <form onSubmit={handleCreateOrgan} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Source Donor</label>
            <select
              value={newOrgan.DonorID}
              onChange={(e) => setNewOrgan({ ...newOrgan, DonorID: Number(e.target.value) })}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {donors.map((d) => (
                <option key={d.Donor_ID} value={d.Donor_ID}>
                  #{d.Donor_ID} · {d.Full_Name} ({d.Blood_Group} · {d.Donor_Type})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Retrieved Organ Type</label>
            <select
              value={newOrgan.OrganType}
              onChange={(e) => setNewOrgan({ ...newOrgan, OrganType: e.target.value })}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {ORGAN_TYPES.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Max Cold Ischemia Preservation Hours</label>
            <input
              type="number"
              min={2}
              max={168}
              value={newOrgan.MaxPreservationHours}
              onChange={(e) => setNewOrgan({ ...newOrgan, MaxPreservationHours: Number(e.target.value) })}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setOrganModalOpen(false)} className="px-4 py-2 rounded-md border border-slate-200 text-xs font-medium">Cancel</button>
            <button type="submit" className="px-4 py-2 rounded-md bg-teal-700 text-xs font-semibold text-white">Log Organ</button>
          </div>
        </form>
      </Modal>

      <Modal open={testModalOpen} onClose={() => setTestModalOpen(false)} title="Record Diagnostic Lab Test">
        <form onSubmit={handleCreateTest} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Person (Donor or Recipient)</label>
            <select
              value={newTest.Person_ID}
              onChange={(e) => setNewTest({ ...newTest, Person_ID: Number(e.target.value) })}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {recipients.map((r) => (
                <option key={`r-${r.Recipient_ID}`} value={r.Recipient_ID}>
                  Recipient #{r.Recipient_ID} · {r.Full_Name}
                </option>
              ))}
              {donors.map((d) => (
                <option key={`d-${d.Donor_ID}`} value={d.Donor_ID}>
                  Donor #{d.Donor_ID} · {d.Full_Name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Test Type</label>
              <select
                value={newTest.TestType}
                onChange={(e) => setNewTest({ ...newTest, TestType: e.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {['HLA Typing', 'Crossmatch', 'Blood Group Confirmation', 'Viral Screening', 'Organ Viability Test', 'Kidney Function Test', 'Liver Function Test', 'Cardiac Assessment'].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Test Result</label>
              <select
                value={newTest.TestResult}
                onChange={(e) => setNewTest({ ...newTest, TestResult: e.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {['Normal', 'Negative', 'Pending', 'Abnormal', 'Positive'].map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Result Details</label>
            <input
              required
              value={newTest.ResultDetails}
              onChange={(e) => setNewTest({ ...newTest, ResultDetails: e.target.value })}
              placeholder="e.g. CDC crossmatch negative, surgical clearance granted"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Laboratory Name</label>
            <input
              value={newTest.LabName}
              onChange={(e) => setNewTest({ ...newTest, LabName: e.target.value })}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setTestModalOpen(false)} className="px-4 py-2 rounded-md border border-slate-200 text-xs font-medium">Cancel</button>
            <button type="submit" className="px-4 py-2 rounded-md bg-teal-700 text-xs font-semibold text-white">Save Lab Record</button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(editAllocation)} onClose={() => setEditAllocation(null)} title={`Update Allocation #${editAllocation?.AllocationID ?? ''}`}>
        {editAllocation && (
          <form onSubmit={handleUpdateAllocation} className="space-y-4">
            <p className="text-xs text-slate-600">
              {editAllocation.OrganCode} ({editAllocation.OrganType}) → {editAllocation.RecipientName || `Recipient #${editAllocation.RecipientID}`}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Allocation Status</label>
                <select
                  value={editAllocation.AllocationStatus}
                  onChange={(e) => setEditAllocation({ ...editAllocation, AllocationStatus: e.target.value as AllocationRecord['AllocationStatus'] })}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  {['Proposed', 'Confirmed', 'Completed', 'Rejected', 'Cancelled'].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Transport Mode</label>
                <select
                  value={editAllocation.TransportMode || 'Road'}
                  onChange={(e) => setEditAllocation({ ...editAllocation, TransportMode: e.target.value as AllocationRecord['TransportMode'] })}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="Green Corridor">Green Corridor</option>
                  <option value="Road">Road</option>
                  <option value="Air">Air</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Lead Surgeon</label>
              <input
                value={editAllocation.LeadSurgeon || ''}
                onChange={(e) => setEditAllocation({ ...editAllocation, LeadSurgeon: e.target.value })}
                placeholder="Dr. Ashok Deshpande"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Transplant Outcome</label>
                <select
                  value={editAllocation.TransplantOutcome || 'Not Performed'}
                  onChange={(e) => setEditAllocation({ ...editAllocation, TransplantOutcome: e.target.value as AllocationRecord['TransplantOutcome'] })}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  {['Not Performed', 'Successful', 'Complication', 'Failed'].map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Recovery Status</label>
                <input
                  value={editAllocation.RecoveryStatus || ''}
                  onChange={(e) => setEditAllocation({ ...editAllocation, RecoveryStatus: e.target.value })}
                  placeholder="Stable / Recovering"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditAllocation(null)} className="px-4 py-2 rounded-md border border-slate-200 text-xs font-medium">Cancel</button>
              <button type="submit" className="px-4 py-2 rounded-md bg-teal-700 text-xs font-semibold text-white">Save Allocation Update</button>
            </div>
          </form>
        )}
      </Modal>
    </AppShell>
  );
}
