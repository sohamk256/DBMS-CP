import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, ShieldCheck, UserCheck } from 'lucide-react';
import { api } from '../services/api';
import { StatusText } from './ui/StatusText';
import type { AuthSession, UserProfileData } from '../types/db';

interface UserProfileViewProps {
  session: AuthSession;
  onSessionUpdated?: (nextSession: AuthSession) => void;
}

export function UserProfileView({ session, onSessionUpdated }: UserProfileViewProps) {
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Editable fields
  const [displayName, setDisplayName] = useState(session.displayName);
  const [contactNumber, setContactNumber] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [consentObtained, setConsentObtained] = useState(true);

  // Password change fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getProfile({
        role: session.role,
        identifier: session.identifier,
        linkedEntityId: session.linkedEntityId,
      });
      setProfile(res.profile);
      setDisplayName(res.profile.displayName);
      setContactNumber(res.profile.contactNumber);
      setEmail(res.profile.email);
      setAddress(res.profile.address);
      setConsentObtained(res.profile.consentObtained ?? true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load profile details.');
    } finally {
      setLoading(false);
    }
  }, [session.identifier, session.linkedEntityId, session.role]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (newPassword && newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        role: session.role,
        identifier: session.identifier,
        linkedEntityId: session.linkedEntityId,
        displayName,
        contactNumber,
        email,
        address,
      };
      if (session.subRole === 'donor') {
        payload.consentObtained = consentObtained;
      }
      if (newPassword) {
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword;
      }

      const res = await api.updateProfile(payload);
      setNotice('Profile preferences and credentials updated in SQLite.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      if (onSessionUpdated && res.displayName !== session.displayName) {
        onSessionUpdated({ ...session, displayName: res.displayName });
      }
      await loadProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-32 rounded-lg border border-slate-200 bg-white animate-pulse" />
        <div className="h-72 rounded-lg border border-slate-200 bg-white animate-pulse" />
      </div>
    );
  }

  const initials = (profile?.displayName || session.displayName)
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');

  const roleTitle =
    session.role === 'admin'
      ? 'State & ZTCC Administrator'
      : session.role === 'hospital'
      ? 'Certified Clinical Center Coordinator'
      : session.subRole === 'donor'
      ? 'Registered Organ Donor'
      : 'Registered Transplant Recipient';

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800">
          {error}
        </div>
      )}
      {notice && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Identity Banner */}
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-lg tracking-tight shrink-0">
              {initials || 'OL'}
            </div>
            <div>
              <p className="text-xs font-semibold text-teal-700">{roleTitle}</p>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                {profile?.displayName || session.displayName}
              </h1>
              <p className="mt-0.5 text-xs text-slate-500">
                Account ID: <span className="font-mono text-slate-700">{profile?.identifier}</span>
                {profile?.linkedEntityId ? (
                  <>
                    {' '}
                    · Entity #<span className="font-mono text-slate-700">{profile.linkedEntityId}</span>
                  </>
                ) : null}
                {' '}
                · Member since <span className="font-mono">{profile?.registrationDate}</span>
              </p>
            </div>
          </div>

          <div className="text-right">
            <p className="text-[11px] font-medium text-slate-500">Region &amp; Jurisdiction</p>
            <p className="text-sm font-semibold text-slate-900">
              {profile?.city}, {profile?.state}
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Editable Account & Clinical Preferences */}
        <form
          onSubmit={handleSaveProfile}
          className="lg:col-span-7 rounded-lg border border-slate-200 bg-white p-6 space-y-5"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <UserCheck className="w-4 h-4 text-teal-700" />
            <h2 className="text-sm font-semibold text-slate-900">Account &amp; Contact Information</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="up-displayname" className="block text-xs font-semibold text-slate-700">
                Display Name
              </label>
              <input
                id="up-displayname"
                value={displayName}
                disabled={session.role === 'user'}
                onChange={(e) => setDisplayName(e.target.value)}
                className={`mt-1 w-full rounded-md border px-3 py-2 text-sm ${
                  session.role === 'user'
                    ? 'border-slate-200 bg-slate-50 text-slate-500'
                    : 'border-slate-300 text-slate-900 focus:border-teal-600 focus:outline-none'
                }`}
              />
            </div>

            <div>
              <label htmlFor="up-email" className="block text-xs font-semibold text-slate-700">
                Email Address
              </label>
              <input
                id="up-email"
                type="email"
                value={email}
                disabled={session.role !== 'hospital'}
                onChange={(e) => setEmail(e.target.value)}
                className={`mt-1 w-full rounded-md border px-3 py-2 text-sm ${
                  session.role !== 'hospital'
                    ? 'border-slate-200 bg-slate-50 text-slate-500'
                    : 'border-slate-300 text-slate-900 focus:border-teal-600 focus:outline-none'
                }`}
              />
            </div>

            <div>
              <label htmlFor="up-contact" className="block text-xs font-semibold text-slate-700">
                Contact Number
              </label>
              <input
                id="up-contact"
                value={contactNumber}
                disabled={session.role === 'admin'}
                onChange={(e) => setContactNumber(e.target.value)}
                className={`mt-1 w-full rounded-md border px-3 py-2 text-sm ${
                  session.role === 'admin'
                    ? 'border-slate-200 bg-slate-50 text-slate-500'
                    : 'border-slate-300 text-slate-900 focus:border-teal-600 focus:outline-none'
                }`}
              />
            </div>

            <div>
              <label htmlFor="up-address" className="block text-xs font-semibold text-slate-700">
                {session.role === 'user' ? 'Residential Address' : 'Facility Location'}
              </label>
              <input
                id="up-address"
                value={address}
                disabled={session.role !== 'user'}
                onChange={(e) => setAddress(e.target.value)}
                className={`mt-1 w-full rounded-md border px-3 py-2 text-sm ${
                  session.role !== 'user'
                    ? 'border-slate-200 bg-slate-50 text-slate-500'
                    : 'border-slate-300 text-slate-900 focus:border-teal-600 focus:outline-none'
                }`}
              />
            </div>
          </div>

          {session.subRole === 'donor' && (
            <div className="flex items-center gap-2.5 pt-1">
              <input
                id="up-consent"
                type="checkbox"
                checked={consentObtained}
                onChange={(e) => setConsentObtained(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
              />
              <label htmlFor="up-consent" className="text-xs font-medium text-slate-700">
                Active organ donation consent confirmed under NOTTO / ZTCC regulations
              </label>
            </div>
          )}

          {/* Password Security Section */}
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-slate-500" />
              <h3 className="text-xs font-semibold text-slate-800">
                Change Portal Password (Optional)
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="up-cur-pwd" className="block text-[11px] font-medium text-slate-600">
                  Current Password
                </label>
                <input
                  id="up-cur-pwd"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs focus:border-teal-600 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="up-new-pwd" className="block text-[11px] font-medium text-slate-600">
                  New Password
                </label>
                <input
                  id="up-new-pwd"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 4 chars"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs focus:border-teal-600 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="up-confirm-pwd" className="block text-[11px] font-medium text-slate-600">
                  Confirm New Password
                </label>
                <input
                  id="up-confirm-pwd"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs focus:border-teal-600 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-md bg-teal-700 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60 transition-colors"
            >
              {saving ? 'Saving Profile...' : 'Save Profile Changes'}
            </button>
          </div>
        </form>

        {/* Right Column: Registry Credential Summary + Recent Activity */}
        <div className="lg:col-span-5 space-y-6">
          <section className="rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <ShieldCheck className="w-4 h-4 text-teal-700" />
              <h2 className="text-sm font-semibold text-slate-900">Registry &amp; Clinical Credentials</h2>
            </div>

            <div className="mt-4 divide-y divide-slate-100 text-xs">
              {profile?.role === 'user' && (
                <>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-slate-500">Blood Group</span>
                    <span className="font-mono font-semibold text-slate-900">{profile.bloodGroup}</span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-slate-500">Aadhar Verification</span>
                    <span className="font-mono text-slate-800">{profile.aadharNum}</span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-slate-500">Registering Center</span>
                    <span className="font-medium text-slate-900 text-right">{profile.hospitalName}</span>
                  </div>
                  {profile.subRole === 'donor' ? (
                    <>
                      <div className="py-2.5 flex justify-between">
                        <span className="text-slate-500">Pledged Organ ({profile.donorType})</span>
                        <span className="font-semibold text-slate-900">{profile.donatingOrgan}</span>
                      </div>
                      <div className="py-2.5 flex justify-between">
                        <span className="text-slate-500">Medical Fitness</span>
                        <StatusText value={profile.medicalFitness || 'Pending'} />
                      </div>
                      <div className="py-2.5 flex justify-between">
                        <span className="text-slate-500">Legal Clearance</span>
                        <StatusText value={profile.legalApprovalStatus || 'pending'} />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="py-2.5 flex justify-between">
                        <span className="text-slate-500">Required Organ</span>
                        <span className="font-semibold text-slate-900">{profile.requiredOrgan}</span>
                      </div>
                      <div className="py-2.5 flex justify-between">
                        <span className="text-slate-500">Urgency &amp; Priority</span>
                        <span className="font-mono font-semibold text-slate-900">
                          {profile.urgencyLevel} · {Number(profile.priorityScore ?? 0).toFixed(1)}
                        </span>
                      </div>
                      <div className="py-2.5 flex justify-between">
                        <span className="text-slate-500">Attending Physician</span>
                        <span className="font-medium text-slate-900">{profile.attendingPhysician}</span>
                      </div>
                    </>
                  )}
                </>
              )}

              {profile?.role === 'hospital' && (
                <>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-slate-500">Facility Type</span>
                    <span className="font-medium text-slate-900">{profile.hospitalType}</span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-slate-500">License Number</span>
                    <span className="font-mono font-semibold text-slate-900">{profile.licenseNumber}</span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-slate-500">ZTCC Certification</span>
                    <StatusText value={profile.certified ? 'Certified' : 'Pending'} />
                  </div>
                </>
              )}

              {profile?.role === 'admin' && (
                <>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-slate-500">Authority Scope</span>
                    <span className="font-medium text-slate-900">Full State Registry &amp; DDL</span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-slate-500">SQL Console Access</span>
                    <span className="font-mono font-semibold text-teal-700">Read + Write Enabled</span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-slate-500">Database Engine</span>
                    <span className="font-mono text-slate-800">SQLite 3 WAL</span>
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-3">
              Recent Account Activity
            </h2>
            {!profile?.recentActivity || profile.recentActivity.length === 0 ? (
              <p className="mt-4 text-xs text-slate-500">No recent audit actions logged for this account.</p>
            ) : (
              <div className="mt-3 divide-y divide-slate-100 max-h-56 overflow-y-auto">
                {profile.recentActivity.slice(0, 6).map((act) => (
                  <div key={act.Log_ID} className="py-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold text-slate-800">{act.Action_Type}</span>
                      <span className="font-mono text-[11px] text-slate-400">{act.Created_At}</span>
                    </div>
                    <p className="mt-0.5 text-slate-600">{act.Summary}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
