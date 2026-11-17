import { useEffect, useState } from 'react';
import { ArrowRight, Building2, Database, HeartHandshake, ShieldCheck } from 'lucide-react';
import { api, type DashboardSummaryResponse, type HealthResponse } from '../services/api';
import type { UserRole } from '../types/db';

interface HomeLandingProps {
  onNavigateLogin: (options?: { role?: UserRole; mode?: 'login' | 'register' }) => void;
}

export function HomeLanding({ onNavigateLogin }: HomeLandingProps) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [corridorImgFailed, setCorridorImgFailed] = useState(false);
  const [labImgFailed, setLabImgFailed] = useState(false);

  useEffect(() => {
    Promise.all([api.getHealth(), api.getSummary()])
      .then(([h, s]) => {
        setHealth(h);
        setSummary(s);
      })
      .catch(() => {
        // Non-blocking preload with graceful fallback counts
      });
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto max-w-[1360px] h-16 px-6 sm:px-10 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            OrganLink DBMS
          </a>

          <nav
            aria-label="Primary Navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600"
          >
            <a href="#overview" className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0">
              Overview
            </a>
            <a href="#portals" className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0">
              Role Portals
            </a>
            <a href="#architecture" className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0">
              Architecture
            </a>
            <a href="#network" className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0">
              Regional Network
            </a>
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => onNavigateLogin({ role: 'user', mode: 'login' })}
              className="inline-flex items-center gap-2 rounded-md bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0"
            >
              <span>Sign In</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero Section (2-Column Balanced Split + Full-Width KPI Strip Below) */}
        <section id="overview" className="mx-auto max-w-[1360px] px-6 sm:px-10 pt-10 pb-14">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center py-4">
              <p className="text-xs font-semibold tracking-wide text-teal-700">
                Maharashtra Zonal Organ Donation &amp; Transplant Registry
              </p>
              <h1
                className="mt-3 font-bold tracking-tight text-slate-900 text-balance"
                style={{ fontSize: 'clamp(2.25rem, 3.8vw, 3.5rem)', lineHeight: 1.08 }}
              >
                Precision Database Management for Life-Saving Transplant Coordination
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600">
                OrganLink connects donors, waitlist recipients, certified retrieval hospitals, and state
                authorization authorities on a relational SQLite engine with automated audit triggers,
                cold-ischemia preservation tracking, and ABO/Rh compatibility scoring.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => onNavigateLogin({ role: 'user', mode: 'login' })}
                  className="inline-flex items-center gap-2 rounded-md bg-teal-700 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800 transition-colors whitespace-nowrap"
                >
                  <span>Sign In to Portal</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateLogin({ role: 'user', mode: 'register' })}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap"
                >
                  <span>Register Donor or Recipient</span>
                </button>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="relative h-72 sm:h-96 lg:h-full min-h-[360px] overflow-hidden rounded-xl border border-slate-200 bg-slate-900">
                {!heroImgFailed ? (
                  <img
                    src="/src/assets/images/hero_transplant_network_1794875989243.jpg"
                    alt="Modern clinical transplant coordination atrium"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgFailed(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-slate-900 via-teal-950 to-slate-900" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/20 to-transparent" />
                <div className="absolute bottom-0 inset-x-0 p-6 text-white">
                  <p className="text-xs font-medium text-teal-200">
                    Zonal Transplant Coordination Center · Relational Registry
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    Synchronizing {health ? health.counts.hospitals : 24} hospital centers across 7 Maharashtra cities
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 4-Column Live KPI Strip Below Hero Split */}
          <div className="mt-10 grid grid-cols-2 lg:grid-cols-4 gap-4 rounded-xl border border-slate-200 bg-white p-6">
            <div className="lg:border-r lg:border-slate-100 lg:pr-4">
              <p className="text-xs text-slate-500">Certified &amp; Partner Hospitals</p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900">
                {summary ? `${summary.kpis.certifiedHospitals} / ${summary.kpis.totalHospitals}` : '24'}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">ZTCC &amp; retrieval centers</p>
            </div>
            <div className="lg:border-r lg:border-slate-100 lg:pr-4">
              <p className="text-xs text-slate-500">Registered Organ Donors</p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900">
                {health ? health.counts.donors : 30}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">Living &amp; deceased pledges</p>
            </div>
            <div className="lg:border-r lg:border-slate-100 lg:pr-4">
              <p className="text-xs text-slate-500">Waitlist Recipients</p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900">
                {health ? health.counts.recipients : 32}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {summary ? `${summary.kpis.waitingRecipients} active waiting` : 'Priority-scored queue'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Surgical Allocations</p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-teal-700">
                {health ? health.counts.allocations : 24}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {summary ? `${summary.kpis.greenCorridors} Green Corridors logged` : 'Full outcome audit'}
              </p>
            </div>
          </div>
        </section>

        {/* Section 1: Three Role-Based Portals */}
        <section id="portals" className="border-t border-slate-200 bg-white py-16">
          <div className="mx-auto max-w-[1360px] px-6 sm:px-10">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold text-teal-700">01. Multi-Role Interfaces</p>
              <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance">
                Three Purpose-Built Dashboards Connected to One Relational Core
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Enter directly into the portal matching your clinical or administrative responsibility. Every mutation updates the live SQLite registry immediately.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Featured Hospital Portal (Wider Bento Span) */}
              <article className="lg:col-span-6 rounded-xl border border-slate-200 bg-slate-50 p-7 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-teal-700">Hospital Clinical Portal</span>
                    <Building2 className="w-5 h-5 text-slate-400" />
                  </div>
                  <h3 className="mt-3 text-xl font-bold text-slate-900">
                    Donor Evaluation, Organ Retrieval &amp; Compatibility Matching
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    Manage hospital-scoped or network-wide donor registries, update waitlist urgency
                    levels, log cold-ischemia preservation windows, record HLA/crossmatch lab tests,
                    and execute atomic transplant allocations ranked by ABO/Rh score and hospital proximity.
                  </p>
                  <p className="mt-4 font-mono text-xs text-slate-500">
                    Demo ID: 324270101 · Sassoon General Hospital · Pass: hosp123
                  </p>
                </div>
                <div className="mt-6 pt-5 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => onNavigateLogin({ role: 'hospital', mode: 'login' })}
                    className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors"
                  >
                    <span>Sign In as Hospital</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </article>

              {/* User Portal */}
              <article className="lg:col-span-3 rounded-xl border border-slate-200 bg-white p-7 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-teal-700">User Interface</span>
                    <HeartHandshake className="w-5 h-5 text-slate-400" />
                  </div>
                  <h3 className="mt-3 text-lg font-bold text-slate-900">
                    Donor &amp; Recipient Portal
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">
                    Track live waitlist queue position, inspect compatible organs on the network,
                    review pathology and crossmatch results, and manage contact &amp; donor consent settings.
                  </p>
                  <p className="mt-4 font-mono text-[11px] text-slate-500">
                    meera.nair@email.com · Pass: user123
                  </p>
                </div>
                <div className="mt-6 pt-5 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => onNavigateLogin({ role: 'user', mode: 'login' })}
                    className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50 transition-colors"
                  >
                    <span>Sign In as User</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </article>

              {/* Admin & DBMS Portal */}
              <article className="lg:col-span-3 rounded-xl border border-slate-200 bg-white p-7 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-teal-700">Administrator Console</span>
                    <ShieldCheck className="w-5 h-5 text-slate-400" />
                  </div>
                  <h3 className="mt-3 text-lg font-bold text-slate-900">
                    ZTCC Oversight &amp; SQL DBMS
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">
                    Explore D3 regional donation trends, certify hospital licenses, authorize donor legal
                    clearances, inspect the ER schema &amp; triggers, and run live SQL queries.
                  </p>
                  <p className="mt-4 font-mono text-[11px] text-slate-500">
                    admin@organlink.gov.in · Pass: admin123
                  </p>
                </div>
                <div className="mt-6 pt-5 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => onNavigateLogin({ role: 'admin', mode: 'login' })}
                    className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50 transition-colors"
                  >
                    <span>Sign In as Admin</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* Section 2: Clinical & Relational Architecture Proof */}
        <section id="architecture" className="mx-auto max-w-[1360px] px-6 sm:px-10 py-16">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold text-teal-700">02. Clinical Logistics &amp; Relational Integrity</p>
            <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance">
              Engineered Around Real SQL Constraints, Triggers &amp; Viability Windows
            </h2>
          </div>

          <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-8">
            <article className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="aspect-[4/3] w-full bg-slate-900 overflow-hidden">
                {!corridorImgFailed ? (
                  <img
                    src="/src/assets/images/feature_green_corridor_1794875991576.jpg"
                    alt="Emergency Green Corridor transport arriving at hospital bay"
                    referrerPolicy="no-referrer"
                    onError={() => setCorridorImgFailed(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-slate-800 to-teal-900" />
                )}
              </div>
              <div className="p-6">
                <p className="text-xs text-slate-500">
                  Cold-Ischemia Tracking · Green Corridor Dispatch · Atomic Transactions
                </p>
                <h3 className="mt-2 text-lg font-bold text-slate-900">
                  Time-Critical Organ Preservation &amp; Allocation Locking
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Every retrieved organ carries a retrieval timestamp and maximum preservation horizon.
                  When a hospital proposes an allocation, a SQLite transaction atomically inserts the
                  allocation record, transitions the organ to Allocated, and triggers waitlist auditing.
                </p>
              </div>
            </article>

            <article className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="aspect-[4/3] w-full bg-slate-900 overflow-hidden">
                {!labImgFailed ? (
                  <img
                    src="/src/assets/images/feature_clinical_lab_1794875991092.jpg"
                    alt="Clinical immunology and HLA tissue typing laboratory"
                    referrerPolicy="no-referrer"
                    onError={() => setLabImgFailed(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-slate-800 to-slate-900" />
                )}
              </div>
              <div className="p-6">
                <p className="text-xs text-slate-500">
                  6 Core Tables · 3 SQL Views · Automated Triggers · Gemini AI Assistant
                </p>
                <h3 className="mt-2 text-lg font-bold text-slate-900">
                  HLA Diagnostics, Audit Triggers &amp; Interactive SQL Console
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Foreign-key constraints bind hospitals, donors, organs, recipients, medical tests,
                  and allocations together. Database triggers record every recipient status change into
                  the audit ledger, while an embedded Gemini AI assistant answers workflow and schema queries.
                </p>
              </div>
            </article>
          </div>
        </section>

        {/* Section 3: Regional Network Snapshot */}
        <section id="network" className="border-t border-slate-200 bg-white py-16">
          <div className="mx-auto max-w-[1360px] px-6 sm:px-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-teal-700">03. Regional Footprint</p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                  Active Maharashtra Regional Hubs
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigateLogin({ role: 'admin', mode: 'login' })}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:underline"
              >
                <Database className="w-3.5 h-3.5" />
                <span>Inspect D3 Regional Analytics in Admin Console</span>
              </button>
            </div>

            <div className="mt-8 overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="px-5 py-3 font-semibold">City / Region</th>
                    <th className="px-5 py-3 text-right font-semibold">Hospitals</th>
                    <th className="px-5 py-3 text-right font-semibold">Registered Donors</th>
                    <th className="px-5 py-3 text-right font-semibold">Recipients</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {(summary?.cityDistribution ?? []).map((row) => (
                    <tr key={row.city} className="h-11 hover:bg-slate-50">
                      <td className="px-5 font-semibold text-slate-900">{row.city}</td>
                      <td className="px-5 text-right font-mono tabular-nums text-slate-700">{row.hospitals}</td>
                      <td className="px-5 text-right font-mono tabular-nums text-slate-700">{row.donors}</td>
                      <td className="px-5 text-right font-mono tabular-nums text-teal-700 font-semibold">{row.recipients}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 bg-slate-50 py-10">
        <div className="mx-auto max-w-[1360px] px-6 sm:px-10 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <div>
            <span className="font-semibold text-slate-800">OrganLink DBMS</span>
            <span className="mx-2" aria-hidden="true">·</span>
            <span>Relational Organ Donation &amp; Transplant Registry</span>
          </div>
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => onNavigateLogin({ role: 'user', mode: 'login' })}
              className="hover:text-slate-900 hover:underline"
            >
              User Sign In
            </button>
            <button
              type="button"
              onClick={() => onNavigateLogin({ role: 'hospital', mode: 'login' })}
              className="hover:text-slate-900 hover:underline"
            >
              Hospital Sign In
            </button>
            <button
              type="button"
              onClick={() => onNavigateLogin({ role: 'admin', mode: 'login' })}
              className="hover:text-slate-900 hover:underline"
            >
              Admin Sign In
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
