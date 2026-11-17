import { useEffect, useState } from 'react';
import { Building2, HeartHandshake, ShieldCheck, ArrowRight, UserPlus, ArrowLeft } from 'lucide-react';
import { api, type AuthDirectoryResponse, type HealthResponse } from '../services/api';
import type { AuthSession, BloodGroup, OrganType, UrgencyLevel, UserRole } from '../types/db';

interface LoginGatewayProps {
  onAuthenticated: (session: AuthSession) => void;
  initialRole?: UserRole;
  initialMode?: 'login' | 'register';
  onBackHome?: () => void;
}

const BLOOD_GROUPS: BloodGroup[] = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];
const ORGAN_TYPES: OrganType[] = ['Kidney', 'Liver', 'Heart', 'Lung', 'Pancreas', 'Cornea', 'Small Intestine'];
const URGENCY_LEVELS: UrgencyLevel[] = ['Routine', 'Urgent', 'Critical', 'Emergency'];

function getDefaultCredentials(targetRole: UserRole): { identifier: string; password: string } {
  if (targetRole === 'hospital') return { identifier: '324270101', password: 'hosp123' };
  if (targetRole === 'admin') return { identifier: 'admin@organlink.gov.in', password: 'admin123' };
  return { identifier: 'meera.nair@email.com', password: 'user123' };
}

export function LoginGateway({
  onAuthenticated,
  initialRole = 'user',
  initialMode = 'login',
  onBackHome,
}: LoginGatewayProps) {
  const initialCreds = getDefaultCredentials(initialRole);
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [role, setRole] = useState<UserRole>(initialRole);
  const [identifier, setIdentifier] = useState(initialCreds.identifier);
  const [password, setPassword] = useState(initialCreds.password);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [directory, setDirectory] = useState<AuthDirectoryResponse | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  // Registration form states
  const [regType, setRegType] = useState<'donor' | 'recipient' | 'hospital'>('recipient');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [regPassword, setRegPassword] = useState('user123');
  const [dob, setDob] = useState('1990-05-15');
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other'>('Female');
  const [bloodGroup, setBloodGroup] = useState<BloodGroup>('O+');
  const [contactNumber, setContactNumber] = useState('');
  const [address, setAddress] = useState('');
  const [aadharNum, setAadharNum] = useState('');
  const [donorType, setDonorType] = useState<'Living' | 'Deceased'>('Living');
  const [donatingOrgan, setDonatingOrgan] = useState('Kidney');
  const [requiredOrgan, setRequiredOrgan] = useState<OrganType>('Kidney');
  const [urgencyLevel, setUrgencyLevel] = useState<UrgencyLevel>('Urgent');
  const [disease, setDisease] = useState('');
  const [attendingPhysician, setAttendingPhysician] = useState('Dr. Suresh Joshi');
  const [hospitalId, setHospitalId] = useState<number>(324270101);

  // Hospital registration fields
  const [hospitalName, setHospitalName] = useState('');
  const [hospitalType, setHospitalType] = useState<'Government' | 'Private' | 'Trust'>('Private');
  const [city, setCity] = useState('Pune');
  const [licenseNumber, setLicenseNumber] = useState('');

  useEffect(() => {
    Promise.all([api.getHealth(), api.getAuthDirectory()])
      .then(([h, d]) => {
        setHealth(h);
        setDirectory(d);
      })
      .catch(() => {
        // Non-blocking preload
      });
  }, []);

  const handleRoleSwitch = (nextRole: UserRole) => {
    setRole(nextRole);
    setError(null);
    if (nextRole === 'user') {
      setIdentifier('meera.nair@email.com');
      setPassword('user123');
    } else if (nextRole === 'hospital') {
      setIdentifier('324270101');
      setPassword('hosp123');
    } else {
      setIdentifier('admin@organlink.gov.in');
      setPassword('admin123');
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.login({ role, identifier, password });
      onAuthenticated(res.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFill = (targetRole: UserRole, idValue: string, pwd: string) => {
    setMode('login');
    setRole(targetRole);
    setIdentifier(idValue);
    setPassword(pwd);
    setError(null);
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const payload =
        regType === 'hospital'
          ? {
              regType,
              hospitalName,
              hospitalType,
              city,
              state: 'Maharashtra',
              contactNumber,
              email,
              licenseNumber,
              password: regPassword,
            }
          : {
              regType,
              fullName,
              email,
              password: regPassword,
              dob,
              gender,
              bloodGroup,
              contactNumber,
              address,
              aadharNum,
              hospitalId,
              donorType,
              donatingOrgan,
              requiredOrgan,
              urgencyLevel,
              disease,
              attendingPhysician,
            };

      const res = await api.register(payload);
      onAuthenticated(res.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 grid lg:grid-cols-12 items-stretch">
      {/* Left Institutional Visual Column */}
      <aside className="relative hidden lg:flex lg:col-span-5 flex-col justify-between overflow-hidden bg-slate-900 text-white">
        {!imgFailed ? (
          <img
            src="/src/assets/images/login_medical_center_1794873241696.jpg"
            alt="Modern clinical transplant coordination atrium"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-teal-950 to-slate-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/85 via-slate-950/55 to-slate-950/90" />

        <div className="relative z-10 p-10">
          <p className="text-xs font-semibold tracking-wide text-teal-200">
            Maharashtra Zonal Transplant Registry
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white text-balance">
            OrganLink DBMS
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-100">
            Relational clinical database system coordinating living and deceased organ donations,
            HLA diagnostics, cold-ischemia tracking, and real-time waitlist allocation across
            certified hospitals.
          </p>
        </div>

        <div className="relative z-10 p-10">
          <div className="border-t border-white/20 pt-6">
            <p className="text-xs font-medium text-slate-300">Live SQLite Registry Snapshot</p>
            <div className="mt-4 grid grid-cols-3 gap-6">
              <div>
                <p className="font-mono text-2xl font-semibold tabular-nums text-white">
                  {health ? health.counts.hospitals : '24'}
                </p>
                <p className="mt-0.5 text-xs text-slate-300">Hospitals</p>
              </div>
              <div>
                <p className="font-mono text-2xl font-semibold tabular-nums text-white">
                  {health ? health.counts.donors : '30'}
                </p>
                <p className="mt-0.5 text-xs text-slate-300">Donors</p>
              </div>
              <div>
                <p className="font-mono text-2xl font-semibold tabular-nums text-white">
                  {health ? health.counts.recipients : '32'}
                </p>
                <p className="mt-0.5 text-xs text-slate-300">Recipients</p>
              </div>
              <div>
                <p className="font-mono text-2xl font-semibold tabular-nums text-white">
                  {health ? health.counts.organs : '30'}
                </p>
                <p className="mt-0.5 text-xs text-slate-300">Organs Logged</p>
              </div>
              <div>
                <p className="font-mono text-2xl font-semibold tabular-nums text-white">
                  {health ? health.counts.medicalTests : '33'}
                </p>
                <p className="mt-0.5 text-xs text-slate-300">Lab Tests</p>
              </div>
              <div>
                <p className="font-mono text-2xl font-semibold tabular-nums text-white">
                  {health ? health.counts.allocations : '24'}
                </p>
                <p className="mt-0.5 text-xs text-slate-300">Allocations</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Right Portal Access & Registration Column */}
      <main className="lg:col-span-7 flex flex-col justify-center px-6 py-10 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-xl">
          {onBackHome && (
            <div className="mb-4">
              <button
                type="button"
                onClick={onBackHome}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-teal-700 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Home Overview</span>
              </button>
            </div>
          )}
          <div className="border-b border-slate-200 pb-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                {mode === 'login' ? 'Portal Sign In' : 'Registry Enrollment'}
              </h2>
              <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-1 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    mode === 'login'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError(null);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    mode === 'register'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Register New
                </button>
              </div>
            </div>
            <p className="mt-1.5 text-sm text-slate-500">
              {mode === 'login'
                ? 'Select an interface role to enter the database management system.'
                : 'Create a live donor pledge, recipient waitlist profile, or hospital facility.'}
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mt-5 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800"
            >
              {error}
            </div>
          )}

          {mode === 'login' ? (
            <div className="mt-6 space-y-6">
              {/* Role Selection Grid */}
              <div>
                <span className="block text-xs font-semibold text-slate-700 mb-2">
                  Select Portal Role
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => handleRoleSwitch('user')}
                    className={`flex items-start gap-3 rounded-lg border p-3.5 text-left transition-colors ${
                      role === 'user'
                        ? 'border-teal-600 bg-teal-50/60 text-slate-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <HeartHandshake
                      className={`w-4 h-4 mt-0.5 shrink-0 ${
                        role === 'user' ? 'text-teal-700' : 'text-slate-400'
                      }`}
                    />
                    <div>
                      <p className="text-xs font-semibold">User Interface</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">Donor or Recipient</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRoleSwitch('hospital')}
                    className={`flex items-start gap-3 rounded-lg border p-3.5 text-left transition-colors ${
                      role === 'hospital'
                        ? 'border-teal-600 bg-teal-50/60 text-slate-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Building2
                      className={`w-4 h-4 mt-0.5 shrink-0 ${
                        role === 'hospital' ? 'text-teal-700' : 'text-slate-400'
                      }`}
                    />
                    <div>
                      <p className="text-xs font-semibold">Hospital Interface</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">Clinical &amp; Retrieval</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRoleSwitch('admin')}
                    className={`flex items-start gap-3 rounded-lg border p-3.5 text-left transition-colors ${
                      role === 'admin'
                        ? 'border-teal-600 bg-teal-50/60 text-slate-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <ShieldCheck
                      className={`w-4 h-4 mt-0.5 shrink-0 ${
                        role === 'admin' ? 'text-teal-700' : 'text-slate-400'
                      }`}
                    />
                    <div>
                      <p className="text-xs font-semibold">Administrator</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">ZTCC &amp; SQL DBMS</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Credentials Form */}
              <form onSubmit={handleLoginSubmit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
                <div>
                  <label htmlFor="login-identifier" className="block text-xs font-semibold text-slate-700">
                    {role === 'user'
                      ? 'Email or Donor / Recipient ID'
                      : role === 'hospital'
                      ? 'Hospital ID or License Number'
                      : 'Administrator Email or Authority ID'}
                  </label>
                  <input
                    id="login-identifier"
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={
                      role === 'user'
                        ? 'e.g. meera.nair@email.com or 126270001'
                        : role === 'hospital'
                        ? 'e.g. 324270101 or LIC-MH-PUN-001'
                        : 'admin@organlink.gov.in'
                    }
                    className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="login-password" className="block text-xs font-semibold text-slate-700">
                    Password
                  </label>
                  <input
                    id="login-password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60 transition-colors whitespace-nowrap"
                >
                  <span>{loading ? 'Authenticating...' : `Enter ${role === 'user' ? 'User' : role === 'hospital' ? 'Hospital' : 'Administrator'} Portal`}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              {/* Verified Quick-Fill Directory */}
              <div className="rounded-lg border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <p className="text-xs font-semibold text-slate-800">
                    Verified Registry Credentials (Click to Prefill)
                  </p>
                  <span className="font-mono text-[11px] text-slate-500">
                    {role === 'user' ? 'Pass: user123' : role === 'hospital' ? 'Pass: hosp123' : 'Pass: admin123'}
                  </span>
                </div>

                {role === 'user' && directory && (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {directory.recipients.slice(0, 2).map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => handleQuickFill('user', r.identifier, 'user123')}
                        className="rounded-md border border-slate-200 px-3 py-2 text-left hover:border-teal-600 hover:bg-teal-50/40 transition-colors"
                      >
                        <p className="text-xs font-semibold text-slate-900 truncate">{r.name}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500 truncate">
                          Recipient · {r.detail} · {r.bloodGroup} · {r.urgency}
                        </p>
                      </button>
                    ))}
                    {directory.donors.slice(0, 2).map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => handleQuickFill('user', d.identifier, 'user123')}
                        className="rounded-md border border-slate-200 px-3 py-2 text-left hover:border-teal-600 hover:bg-teal-50/40 transition-colors"
                      >
                        <p className="text-xs font-semibold text-slate-900 truncate">{d.name}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500 truncate">
                          Donor · {d.detail} · {d.bloodGroup} · {d.status}
                        </p>
                      </button>
                    ))}
                  </div>
                )}

                {role === 'hospital' && directory && (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {directory.hospitals.slice(0, 4).map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => handleQuickFill('hospital', String(h.id), 'hosp123')}
                        className="rounded-md border border-slate-200 px-3 py-2 text-left hover:border-teal-600 hover:bg-teal-50/40 transition-colors"
                      >
                        <p className="text-xs font-semibold text-slate-900 truncate">{h.name}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-slate-500 truncate">
                          {h.id} · {h.city} · {h.certified ? 'Certified' : 'Standard'}
                        </p>
                      </button>
                    ))}
                  </div>
                )}

                {role === 'admin' && (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleQuickFill('admin', 'admin@organlink.gov.in', 'admin123')}
                      className="rounded-md border border-slate-200 px-3 py-2 text-left hover:border-teal-600 hover:bg-teal-50/40 transition-colors"
                    >
                      <p className="text-xs font-semibold text-slate-900">Zonal Transplant Authority</p>
                      <p className="mt-0.5 font-mono text-[11px] text-slate-500">admin@organlink.gov.in</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickFill('admin', 'SYS-ADMIN-01', 'admin123')}
                      className="rounded-md border border-slate-200 px-3 py-2 text-left hover:border-teal-600 hover:bg-teal-50/40 transition-colors"
                    >
                      <p className="text-xs font-semibold text-slate-900">State Authorization Admin</p>
                      <p className="mt-0.5 font-mono text-[11px] text-slate-500">SYS-ADMIN-01</p>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* New Registry Enrollment Form */
            <form onSubmit={handleRegisterSubmit} className="mt-6 space-y-4 rounded-lg border border-slate-200 bg-white p-6">
              <div>
                <span className="block text-xs font-semibold text-slate-700 mb-2">Registration Type</span>
                <div className="grid grid-cols-3 gap-2">
                  {(['recipient', 'donor', 'hospital'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setRegType(t)}
                      className={`px-3 py-2 rounded-md border text-xs font-semibold capitalize transition-colors ${
                        regType === t
                          ? 'border-teal-600 bg-teal-50 text-teal-900'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {regType === 'hospital' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label htmlFor="reg-hosp-name" className="block text-xs font-semibold text-slate-700">
                      Hospital Name
                    </label>
                    <input
                      id="reg-hosp-name"
                      required
                      value={hospitalName}
                      onChange={(e) => setHospitalName(e.target.value)}
                      placeholder="e.g. Noble Care Transplant Institute"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-hosp-type" className="block text-xs font-semibold text-slate-700">
                      Facility Type
                    </label>
                    <select
                      id="reg-hosp-type"
                      value={hospitalType}
                      onChange={(e) => setHospitalType(e.target.value as 'Government' | 'Private' | 'Trust')}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                    >
                      <option value="Private">Private</option>
                      <option value="Government">Government</option>
                      <option value="Trust">Trust</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="reg-hosp-city" className="block text-xs font-semibold text-slate-700">
                      City
                    </label>
                    <input
                      id="reg-hosp-city"
                      required
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-hosp-license" className="block text-xs font-semibold text-slate-700">
                      License Number
                    </label>
                    <input
                      id="reg-hosp-license"
                      required
                      value={licenseNumber}
                      onChange={(e) => setLicenseNumber(e.target.value)}
                      placeholder="LIC-MH-PUN-099"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-hosp-contact" className="block text-xs font-semibold text-slate-700">
                      Contact Number
                    </label>
                    <input
                      id="reg-hosp-contact"
                      required
                      value={contactNumber}
                      onChange={(e) => setContactNumber(e.target.value)}
                      placeholder="020-26001122"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-hosp-email" className="block text-xs font-semibold text-slate-700">
                      Official Email
                    </label>
                    <input
                      id="reg-hosp-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@hospital.org"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-hosp-pwd" className="block text-xs font-semibold text-slate-700">
                      Portal Password
                    </label>
                    <input
                      id="reg-hosp-pwd"
                      type="password"
                      required
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label htmlFor="reg-fullname" className="block text-xs font-semibold text-slate-700">
                      Full Name
                    </label>
                    <input
                      id="reg-fullname"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Aarav Kulkarni"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-email" className="block text-xs font-semibold text-slate-700">
                      Email Address
                    </label>
                    <input
                      id="reg-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="aarav.k@email.com"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-dob" className="block text-xs font-semibold text-slate-700">
                      Date of Birth
                    </label>
                    <input
                      id="reg-dob"
                      type="date"
                      required
                      value={dob}
                      onChange={(e) => setDob(e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor="reg-gender" className="block text-xs font-semibold text-slate-700">
                        Gender
                      </label>
                      <select
                        id="reg-gender"
                        value={gender}
                        onChange={(e) => setGender(e.target.value as 'Male' | 'Female' | 'Other')}
                        className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm focus:border-teal-600 focus:outline-none"
                      >
                        <option value="Female">Female</option>
                        <option value="Male">Male</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="reg-blood" className="block text-xs font-semibold text-slate-700">
                        Blood Group
                      </label>
                      <select
                        id="reg-blood"
                        value={bloodGroup}
                        onChange={(e) => setBloodGroup(e.target.value as BloodGroup)}
                        className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm focus:border-teal-600 focus:outline-none"
                      >
                        {BLOOD_GROUPS.map((bg) => (
                          <option key={bg} value={bg}>
                            {bg}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="reg-contact" className="block text-xs font-semibold text-slate-700">
                      Contact Number
                    </label>
                    <input
                      id="reg-contact"
                      required
                      value={contactNumber}
                      onChange={(e) => setContactNumber(e.target.value)}
                      placeholder="+91-9823009999"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-aadhar" className="block text-xs font-semibold text-slate-700">
                      Aadhar Number
                    </label>
                    <input
                      id="reg-aadhar"
                      required
                      value={aadharNum}
                      onChange={(e) => setAadharNum(e.target.value)}
                      placeholder="4455 6677 8899"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="reg-address" className="block text-xs font-semibold text-slate-700">
                      Residential Address
                    </label>
                    <input
                      id="reg-address"
                      required
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Flat 204, Baner Road, Pune, Maharashtra"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-hospital" className="block text-xs font-semibold text-slate-700">
                      Registering Hospital
                    </label>
                    <select
                      id="reg-hospital"
                      value={hospitalId}
                      onChange={(e) => setHospitalId(Number(e.target.value))}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                    >
                      {(directory?.hospitals ?? []).map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name} ({h.city})
                        </option>
                      ))}
                    </select>
                  </div>

                  {regType === 'donor' ? (
                    <>
                      <div>
                        <label htmlFor="reg-donating-organ" className="block text-xs font-semibold text-slate-700">
                          Donating Organ
                        </label>
                        <select
                          id="reg-donating-organ"
                          value={donatingOrgan}
                          onChange={(e) => setDonatingOrgan(e.target.value)}
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                        >
                          {['Kidney', 'Liver', 'Heart', 'Lungs', 'Pancreas', 'Multiple'].map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="reg-donor-type" className="block text-xs font-semibold text-slate-700">
                          Donor Type
                        </label>
                        <select
                          id="reg-donor-type"
                          value={donorType}
                          onChange={(e) => setDonorType(e.target.value as 'Living' | 'Deceased')}
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                        >
                          <option value="Living">Living</option>
                          <option value="Deceased">Deceased</option>
                        </select>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <label htmlFor="reg-req-organ" className="block text-xs font-semibold text-slate-700">
                          Required Organ
                        </label>
                        <select
                          id="reg-req-organ"
                          value={requiredOrgan}
                          onChange={(e) => setRequiredOrgan(e.target.value as OrganType)}
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                        >
                          {ORGAN_TYPES.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="reg-urgency" className="block text-xs font-semibold text-slate-700">
                          Urgency Level
                        </label>
                        <select
                          id="reg-urgency"
                          value={urgencyLevel}
                          onChange={(e) => setUrgencyLevel(e.target.value as UrgencyLevel)}
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                        >
                          {URGENCY_LEVELS.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="reg-disease" className="block text-xs font-semibold text-slate-700">
                          Primary Diagnosis
                        </label>
                        <input
                          id="reg-disease"
                          value={disease}
                          onChange={(e) => setDisease(e.target.value)}
                          placeholder="e.g. End-Stage Renal Disease"
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label htmlFor="reg-physician" className="block text-xs font-semibold text-slate-700">
                          Attending Physician
                        </label>
                        <input
                          id="reg-physician"
                          value={attendingPhysician}
                          onChange={(e) => setAttendingPhysician(e.target.value)}
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                        />
                      </div>
                    </>
                  )}
                  <div className="sm:col-span-2">
                    <label htmlFor="reg-password" className="block text-xs font-semibold text-slate-700">
                      Portal Password
                    </label>
                    <input
                      id="reg-password"
                      type="password"
                      required
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60 transition-colors whitespace-nowrap"
              >
                <UserPlus className="w-4 h-4" />
                <span>{loading ? 'Submitting to SQLite Registry...' : 'Register & Enter Portal'}</span>
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
