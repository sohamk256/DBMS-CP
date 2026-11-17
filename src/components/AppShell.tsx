import { useState } from 'react';
import { LogOut, Menu, UserCircle2, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { AuthSession } from '../types/db';

export interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
}

interface AppShellProps {
  session: AuthSession;
  navItems: NavItem[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  onLogout: () => void;
  onOpenProfile?: () => void;
  primaryAction?: ReactNode;
  children: ReactNode;
}

export function AppShell({
  session,
  navItems,
  activeTab,
  onTabChange,
  onLogout,
  onOpenProfile,
  primaryAction,
  children,
}: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const portalLabel =
    session.role === 'user'
      ? session.subRole === 'donor'
        ? 'Donor Portal'
        : 'Recipient Portal'
      : session.role === 'hospital'
      ? 'Hospital Portal'
      : 'Administrator Console';

  const activeNav = navItems.find((n) => n.id === activeTab);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Left Sidebar (256px) */}
      <aside className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col border-r border-slate-200 bg-white">
        <div className="h-16 flex items-center px-6 border-b border-slate-200">
          <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
            OrganLink DBMS
          </span>
        </div>

        <button
          type="button"
          onClick={onOpenProfile}
          className="w-full text-left px-4 py-4 border-b border-slate-100 hover:bg-slate-50 transition-colors"
        >
          <p className="text-[11px] font-semibold text-teal-700">{portalLabel}</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-900 truncate">{session.displayName}</p>
          {session.linkedEntityId ? (
            <p className="mt-0.5 font-mono text-[11px] text-slate-500">ID #{session.linkedEntityId}</p>
          ) : (
            <p className="mt-0.5 font-mono text-[11px] text-slate-500">{session.identifier}</p>
          )}
        </button>

        <nav className="flex-1 px-3 py-4 space-y-1" aria-label="Portal Navigation">
          {navItems.map((item) => {
            const isActive = item.id === activeTab;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-teal-50 text-teal-900 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className={isActive ? 'text-teal-700' : 'text-slate-400'}>{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-200">
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors whitespace-nowrap"
          >
            <LogOut className="w-4 h-4 text-slate-400 shrink-0" />
            <span>Switch Role / Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-10 w-64 max-w-[80vw] bg-white border-r border-slate-200 flex flex-col">
            <div className="h-14 flex items-center justify-between px-4 border-b border-slate-200">
              <span className="text-sm font-bold text-slate-900">OrganLink DBMS</span>
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="text-[11px] font-semibold text-teal-700">{portalLabel}</p>
              <p className="text-sm font-semibold text-slate-900 truncate">{session.displayName}</p>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {navItems.map((item) => {
                const isActive = item.id === activeTab;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onTabChange(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-xs font-medium ${
                      isActive ? 'bg-teal-50 text-teal-900 font-semibold' : 'text-slate-600'
                    }`}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-3 border-t border-slate-200">
              <button
                type="button"
                onClick={onLogout}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                <LogOut className="w-4 h-4" />
                <span>Switch Role / Sign Out</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 shrink-0 border-b border-slate-200 bg-white px-4 sm:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-md text-slate-600 hover:bg-slate-100"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-xs text-slate-500 min-w-0">
              <span className="hidden sm:inline whitespace-nowrap">OrganLink DBMS</span>
              <span className="hidden sm:inline" aria-hidden="true">/</span>
              <span className="hidden sm:inline whitespace-nowrap">{portalLabel}</span>
              <span className="hidden sm:inline" aria-hidden="true">/</span>
              <span className="font-semibold text-slate-900 truncate">
                {activeNav?.label ?? 'Workspace'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {primaryAction}
            {onOpenProfile && activeTab !== 'profile' && (
              <button
                type="button"
                onClick={onOpenProfile}
                aria-label="Open User Profile"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <UserCircle2 className="w-4 h-4 text-teal-700" />
                <span>Profile</span>
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-8 max-w-[1400px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
