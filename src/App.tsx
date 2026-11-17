import { useEffect, useState } from 'react';
import { HomeLanding } from './components/HomeLanding';
import { LoginGateway } from './components/LoginGateway';
import { UserDashboard } from './components/dashboards/UserDashboard';
import { HospitalDashboard } from './components/dashboards/HospitalDashboard';
import { AdminDashboard } from './components/dashboards/AdminDashboard';
import { GeminiChatbot } from './components/GeminiChatbot';
import { api } from './services/api';
import type { AuthSession, UserRole } from './types/db';

const SESSION_KEY = 'organlink_session_v1';

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      return saved ? (JSON.parse(saved) as AuthSession) : null;
    } catch {
      return null;
    }
  });

  const [unauthView, setUnauthView] = useState<'home' | 'login'>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('view') === 'login' ? 'login' : 'home';
  });
  const [loginPreset, setLoginPreset] = useState<{
    role?: UserRole;
    mode?: 'login' | 'register';
  }>({});
  const [activeTab, setActiveTab] = useState<string>('overview');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const autostart = params.get('autostart');
    if (!autostart) return;

    const targetRole: UserRole =
      autostart === 'hospital' || autostart === 'admin' || autostart === 'user'
        ? autostart
        : 'admin';

    if (session?.role === targetRole) return;

    const defaults: Record<UserRole, { identifier: string; password: string }> = {
      user: { identifier: 'meera.nair@email.com', password: 'user123' },
      hospital: { identifier: '324270101', password: 'hosp123' },
      admin: { identifier: 'admin@organlink.gov.in', password: 'admin123' },
    };

    api
      .login({ role: targetRole, ...defaults[targetRole] })
      .then((res) => {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(res.session));
        setSession(res.session);
        setActiveTab(targetRole === 'admin' ? 'analytics' : 'overview');
      })
      .catch(() => {
        // Ignore autostart failure and show home/login gateway
      });
  }, [session]);

  const handleAuthenticated = (nextSession: AuthSession) => {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
    } catch {
      // Ignore storage quota errors
    }
    setSession(nextSession);
    setActiveTab(nextSession.role === 'admin' ? 'analytics' : 'overview');
  };

  const handleSessionUpdated = (nextSession: AuthSession) => {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
    } catch {
      // Ignore storage quota errors
    }
    setSession(nextSession);
  };

  const handleLogout = () => {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // Ignore storage errors
    }
    setSession(null);
    setUnauthView('home');
    setActiveTab('overview');
  };

  const handleNavigateLogin = (options?: { role?: UserRole; mode?: 'login' | 'register' }) => {
    setLoginPreset(options ?? {});
    setUnauthView('login');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      {!session ? (
        unauthView === 'home' ? (
          <HomeLanding onNavigateLogin={handleNavigateLogin} />
        ) : (
          <LoginGateway
            key={`${loginPreset.role ?? 'user'}-${loginPreset.mode ?? 'login'}`}
            initialRole={loginPreset.role ?? 'user'}
            initialMode={loginPreset.mode ?? 'login'}
            onBackHome={() => setUnauthView('home')}
            onAuthenticated={handleAuthenticated}
          />
        )
      ) : session.role === 'user' ? (
        <UserDashboard
          session={session}
          onLogout={handleLogout}
          onSessionUpdated={handleSessionUpdated}
          onActiveTabChange={setActiveTab}
        />
      ) : session.role === 'hospital' ? (
        <HospitalDashboard
          session={session}
          onLogout={handleLogout}
          onSessionUpdated={handleSessionUpdated}
          onActiveTabChange={setActiveTab}
        />
      ) : (
        <AdminDashboard
          session={session}
          onLogout={handleLogout}
          onSessionUpdated={handleSessionUpdated}
          onActiveTabChange={setActiveTab}
        />
      )}

      <GeminiChatbot
        screen={session ? 'dashboard' : unauthView}
        session={session}
        activeTab={session ? activeTab : null}
      />
    </>
  );
}
