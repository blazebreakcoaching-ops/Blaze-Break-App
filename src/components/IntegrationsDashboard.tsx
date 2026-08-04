import React, { useState, useEffect, useCallback } from 'react';
import { Key, Info, RefreshCw, AlertTriangle, CheckCircle2, CalendarDays, MessageSquare } from 'lucide-react';
import { cn } from '../lib/utils';
import { NotificationSettingsView } from './NotificationSettingsView';
import { useAuth } from '../lib/auth';
import { secureApiFetch, SecureApiError } from '../lib/secure-api';
import { syncCalendarSignal } from '../lib/calendar-signals';

interface Integration {
  id: string;
  name: string;
  description: string;
  status: 'connected' | 'disconnected' | 'error' | 'loading' | 'not_configured';
  iconUrl: string;
  errorMessage?: string;
}

// Services that go through the real backend OAuth flow (server.ts /api/integrations/*).
// Google is intentionally excluded — it's handled by Firebase Auth directly.
const OAUTH_SERVICE_IDS = ['slack', 'jira', 'asana', 'calendly', 'monday'] as const;

const BASE_INTEGRATIONS: Integration[] = [
  { id: 'google', name: 'Google Workspace', description: 'Calendar events and Gmail inbox shielding.', status: 'disconnected', iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg' },
  { id: 'slack', name: 'Slack', description: 'Auto-reply and Do-Not-Disturb scheduling.', status: 'disconnected', iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/d/d5/Slack_icon_2019.svg' },
  { id: 'calendly', name: 'Calendly', description: 'Time-block buffering and capacity management.', status: 'disconnected', iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/7/70/Calendly_logo.svg' },
  { id: 'jira', name: 'Jira', description: 'Workload reality checking and sprint velocity tracking.', status: 'disconnected', iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/8/82/Jira_%28Software%29_logo.svg' },
  { id: 'asana', name: 'Asana', description: 'Task offload and task-debt tracking.', status: 'disconnected', iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/3/3b/Asana_logo.svg' },
  { id: 'monday', name: 'Monday.com', description: 'Project tracking integration for timeline realities.', status: 'disconnected', iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/c/c6/Monday_logo.svg' }
];

export const IntegrationsDashboard = () => {
  const { user, accessToken, signInWithCalendar, logOut } = useAuth();
  const [integrations, setIntegrations] = useState<Integration[]>(BASE_INTEGRATIONS);
  const [returnBanner, setReturnBanner] = useState<{ service: string; status: 'connected' | 'error'; reason?: string } | null>(null);
  const [calendarSignal, setCalendarSignal] = useState<any>(null);
  const [slackSignal, setSlackSignal] = useState<any>(null);
  const [isRefreshingCalendar, setIsRefreshingCalendar] = useState(false);

  const refreshSignalsStatus = useCallback(async () => {
    if (!user) return;
    try {
      const [calRes, slackRes] = await Promise.all([
        secureApiFetch('/api/signals/calendar'),
        secureApiFetch('/api/signals/slack'),
      ]);
      const calData = await calRes.json();
      const slackData = await slackRes.json();
      setCalendarSignal(calData?.state || null);
      setSlackSignal(slackData?.state || null);
    } catch (e) {
      // Signal fetch failing shouldn't break the page — cards just stay hidden or stale.
    }
  }, [user]);

  const handleManualCalendarRefresh = async () => {
    if (!accessToken || isRefreshingCalendar) return;
    setIsRefreshingCalendar(true);
    try {
      await syncCalendarSignal(accessToken);
      await refreshSignalsStatus();
    } finally {
      setIsRefreshingCalendar(false);
    }
  };

  const refreshOAuthStatus = useCallback(async () => {
    if (!user) return;
    try {
      const res = await secureApiFetch('/api/integrations/status');
      const data = await res.json();
      setIntegrations(prev => prev.map(inv => {
        if (!(OAUTH_SERVICE_IDS as readonly string[]).includes(inv.id)) return inv;
        const remote = data?.integrations?.[inv.id];
        if (!remote) return inv;
        return { ...inv, status: remote.connected ? 'connected' : 'disconnected', errorMessage: undefined };
      }));
    } catch (e) {
      // Status fetch failing shouldn't break the page — cards just stay at their last known state.
    }
  }, [user]);

  // Google's connection state comes from Firebase Auth's accessToken directly.
  useEffect(() => {
    setIntegrations(prev => prev.map(inv => {
      if (inv.id === 'google' && inv.status !== 'error') {
        return { ...inv, status: accessToken ? 'connected' : 'disconnected' };
      }
      return inv;
    }));
  }, [accessToken]);

  // The other five come from the backend, which only knows the truth after
  // the OAuth callback has run — fetch it on mount and whenever the user changes.
  useEffect(() => {
    refreshOAuthStatus();
    refreshSignalsStatus();
  }, [refreshOAuthStatus, refreshSignalsStatus]);

  // Handle the redirect back from a provider's consent screen: /?integration=slack&status=connected
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const service = params.get('integration');
    const status = params.get('status');
    if (service && (status === 'connected' || status === 'error')) {
      setReturnBanner({ service, status, reason: params.get('reason') || undefined });
      if (status === 'connected') refreshOAuthStatus();
      // Clean the query params out of the URL without a full navigation/reload.
      const url = new URL(window.location.href);
      url.searchParams.delete('integration');
      url.searchParams.delete('status');
      url.searchParams.delete('reason');
      window.history.replaceState({}, '', url.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleIntegration = async (id: string) => {
    if (id === 'google') {
      if (accessToken) {
        if (window.confirm("Disconnect Google Workspace and revoke token cache?")) {
          await logOut();
        }
      } else {
        setIntegrations(prev => prev.map(inv => inv.id === 'google' ? { ...inv, status: 'loading', errorMessage: undefined } : inv));
        try {
          await signInWithCalendar();
          // Access token will update the connection state natively inside the useEffect above
        } catch (e: any) {
          setIntegrations(prev => prev.map(inv => inv.id === 'google' ? { 
            ...inv, 
            status: 'error', 
            errorMessage: e.message?.includes('popup') ? 'Sign-in popup blocked or closed.' : 'Connection to Workspace failed. Please try again.' 
          } : inv));
        }
      }
      return;
    }

    if (!(OAUTH_SERVICE_IDS as readonly string[]).includes(id)) return;

    const current = integrations.find(inv => inv.id === id);
    if (current?.status === 'connected') {
      if (!window.confirm(`Disconnect ${current.name}?`)) return;
      setIntegrations(prev => prev.map(inv => inv.id === id ? { ...inv, status: 'loading', errorMessage: undefined } : inv));
      try {
        await secureApiFetch(`/api/integrations/${id}/disconnect`, { method: 'POST' });
        setIntegrations(prev => prev.map(inv => inv.id === id ? { ...inv, status: 'disconnected' } : inv));
      } catch (e: any) {
        setIntegrations(prev => prev.map(inv => inv.id === id ? { ...inv, status: 'error', errorMessage: 'Failed to disconnect. Please try again.' } : inv));
      }
      return;
    }

    setIntegrations(prev => prev.map(inv => inv.id === id ? { ...inv, status: 'loading', errorMessage: undefined } : inv));
    try {
      const res = await secureApiFetch(`/api/integrations/${id}/connect`, { method: 'POST' });
      const data = await res.json();
      if (!data?.authorizeUrl) throw new Error('No authorization URL returned.');
      // Full-page redirect: these providers don't support popup-based flows like Firebase does for Google.
      window.location.href = data.authorizeUrl;
    } catch (e: any) {
      const isNotConfigured = e instanceof SecureApiError && e.status === 503;
      setIntegrations(prev => prev.map(inv => inv.id === id ? {
        ...inv,
        status: isNotConfigured ? 'not_configured' : 'error',
        errorMessage: isNotConfigured
          ? 'This integration has not been set up yet (missing developer credentials on the server).'
          : 'Could not start the connection. Please try again.',
      } : inv));
    }
  };

  return (
    <div className="space-y-12 pb-24 relative">
      <div className="max-w-3xl space-y-2">
        <h3 className="text-3xl font-light text-text-main tracking-tight mt-6">Settings & Integrations</h3>
        <p className="text-lg text-text-muted leading-relaxed">
          Connect your operational tools. Nova uses these connections to enforce boundaries, calculate your workload debt, and trigger preventative actions on your client-side profile.
        </p>
      </div>

      {returnBanner && (
        <div className={cn(
          "max-w-3xl p-4 rounded-xl text-sm font-medium flex items-start gap-3 border",
          returnBanner.status === 'connected'
            ? "bg-success/10 text-success border-success/20"
            : "bg-destructive dark:bg-destructive/20 text-destructive border-destructive dark:border-destructive/30"
        )}>
          {returnBanner.status === 'connected' ? <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" /> : <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />}
          <span>
            {returnBanner.status === 'connected'
              ? `${returnBanner.service.charAt(0).toUpperCase() + returnBanner.service.slice(1)} connected successfully.`
              : `Couldn't connect ${returnBanner.service.charAt(0).toUpperCase() + returnBanner.service.slice(1)}${returnBanner.reason ? ` (${returnBanner.reason.replace(/_/g, ' ')})` : ''}. Please try again.`}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {integrations.map(integration => (
          <div 
            key={integration.id} 
            className={cn(
              "card bg-card border p-6 space-y-6 relative overflow-hidden group transition-all duration-300",
              integration.status === 'error' ? "border-destructive dark:border-destructive/50" : "border-border hover:border-primary/50"
            )}
          >
            <div className="flex items-start justify-between">
              <div className="w-12 h-12 rounded-2xl bg-white dark:bg-surface border border-border shadow-sm flex items-center justify-center p-2 shrink-0">
                <img src={integration.iconUrl} alt={integration.name} className="w-full h-full object-contain" />
              </div>
              <div className={cn(
                "px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest flex items-center gap-1.5",
                integration.status === 'connected' ? "bg-success/10 text-success" : 
                integration.status === 'error' ? "bg-destructive/10 text-destructive" :
                integration.status === 'loading' ? "bg-primary/10 text-primary" :
                "bg-border dark:bg-surface text-text-muted"
              )}>
                {integration.status === 'loading' && <RefreshCw className="w-3 h-3 animate-spin" />}
                {integration.status === 'error' && <AlertTriangle className="w-3 h-3" />}
                {integration.status === 'not_configured' ? 'Not Configured' : integration.status}
              </div>
            </div>

            <div>
              <h4 className="font-bold text-text-main">{integration.name}</h4>
              <p className="text-xs text-text-muted mt-1 leading-relaxed">{integration.description}</p>
            </div>
            
            {(integration.status === 'error' || integration.status === 'not_configured') && integration.errorMessage && (
              <div className="p-3 bg-destructive dark:bg-destructive/20 text-destructive outline-destructive rounded-lg text-xs font-medium border border-destructive dark:border-destructive/30 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{integration.errorMessage}</span>
              </div>
            )}

            <button 
              onClick={() => toggleIntegration(integration.id)}
              disabled={integration.status === 'loading' || integration.status === 'not_configured'}
              className={cn(
                "w-full py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex justify-center items-center gap-2",
                integration.status === 'connected' 
                  ? "bg-surface dark:bg-surface text-text-muted hover:bg-destructive hover:text-destructive cursor-pointer"
                  : integration.status === 'loading'
                  ? "bg-surface dark:bg-surface text-text-muted cursor-not-allowed opacity-70"
                  : integration.status === 'error'
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive cursor-pointer"
                  : integration.status === 'not_configured'
                  ? "bg-surface dark:bg-surface text-text-muted cursor-not-allowed opacity-50"
                  : "bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground cursor-pointer"
              )}
            >
              {integration.status === 'connected' ? 'Disconnect' : 
               integration.status === 'loading' ? 'Connecting...' : 
               integration.status === 'error' ? (
                 <><RefreshCw className="w-3.5 h-3.5" /> Retry Connection</>
               ) : integration.status === 'not_configured' ? 'Not Yet Available' : 'Connect Account'}
            </button>
          </div>
        ))}
      </div>

      {(calendarSignal || slackSignal || accessToken || integrations.find(i => i.id === 'slack')?.status === 'connected') && (
        <div className="max-w-4xl space-y-4">
          <h4 className="text-xl font-light text-text-main tracking-tight">Live Signals</h4>
          <p className="text-sm text-text-muted leading-relaxed max-w-2xl">
            Real behavioral data pulled from your connected accounts, feeding directly into your Recovery Score. Nothing here is simulated.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card bg-card border border-border p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <CalendarDays className="w-5 h-5" />
                  </div>
                  <h5 className="font-bold text-text-main">Calendar Load</h5>
                </div>
                {accessToken && (
                  <button
                    onClick={handleManualCalendarRefresh}
                    disabled={isRefreshingCalendar}
                    className="text-text-muted hover:text-primary transition-colors disabled:opacity-50"
                    aria-label="Refresh calendar signal"
                  >
                    <RefreshCw className={cn("w-4 h-4", isRefreshingCalendar && "animate-spin")} />
                  </button>
                )}
              </div>
              {!accessToken ? (
                <p className="text-xs text-text-muted leading-relaxed">Connect Google Workspace above to see your real meeting load.</p>
              ) : calendarSignal ? (
                <div className="space-y-1.5 text-sm">
                  <p className="text-text-main"><span className="font-black">{calendarSignal.totalMeetingHours}h</span> <span className="text-text-muted">in meetings over the last {calendarSignal.windowDays} days</span></p>
                  <p className="text-text-muted text-xs">{calendarSignal.meetingCount} meetings &middot; {calendarSignal.backToBackCount} back-to-back &middot; {calendarSignal.eveningMeetingCount + calendarSignal.weekendMeetingCount} evening/weekend</p>
                </div>
              ) : (
                <p className="text-xs text-text-muted leading-relaxed">No calendar data yet — refresh to pull your last 7 days.</p>
              )}
            </div>

            <div className="card bg-card border border-border p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <h5 className="font-bold text-text-main">Message Load</h5>
              </div>
              {integrations.find(i => i.id === 'slack')?.status !== 'connected' ? (
                <p className="text-xs text-text-muted leading-relaxed">Connect Slack above to see your real message load.</p>
              ) : slackSignal?.lastCompleted ? (
                <div className="space-y-1.5 text-sm">
                  <p className="text-text-main"><span className="font-black">{slackSignal.lastCompleted.totalMessages7d}</span> <span className="text-text-muted">messages sent over the last 7 days</span></p>
                  <p className="text-text-muted text-xs">{slackSignal.lastCompleted.afterHoursMessages7d} after-hours &middot; {slackSignal.lastCompleted.weekendMessages7d} on weekends</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-text-muted leading-relaxed">
                    Scanning conversation history ({slackSignal?.scanProgress || '0/0'})&hellip; {slackSignal?.inProgress?.totalMessages ?? 0} messages found so far.
                  </p>
                  <div className="w-full h-1.5 rounded-full bg-border dark:bg-surface overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-500"
                      style={{
                        width: (() => {
                          const [done, total] = (slackSignal?.scanProgress || '0/0').split('/').map(Number);
                          return total > 0 ? `${Math.min(100, Math.round((done / total) * 100))}%` : '0%';
                        })(),
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Visual Dynamic Preference Notification Controls */}
      <div className="card max-w-4xl p-8 space-y-8 bg-white dark:bg-card border border-border shadow-md">
        <NotificationSettingsView />
      </div>

      <div className="card p-8 bg-card border-border text-text-main space-y-6">
        <div className="flex items-center gap-3 text-primary group/tooltip relative">
          <Key className="w-6 h-6" />
          <h4 className="font-bold uppercase tracking-widest flex items-center gap-2">
            API Configuration
            <Info className="w-4 h-4 text-text-muted cursor-help hover:text-primary transition-colors" />
          </h4>
          <div className="absolute -left-4 bottom-full mb-2 w-80 p-4 bg-card text-text-muted text-xs rounded-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all shadow-lg border border-border pointer-events-none z-20 font-medium leading-relaxed">
             API keys and secrets are managed via the platform Settings menu. Add your specific service keys (e.g., Google Calendar, GitHub) to your environment variables and securely store them in the platform. You must restart the workspace after defining new variables.
             <div className="absolute top-full text-text-main border-4 border-transparent left-8 border-t-card"></div>
          </div>
        </div>
        <p className="text-sm text-text-muted max-w-2xl leading-relaxed">
          The underlying API keys for cloud services (Twilio, Firebase, etc.) are managed via the platform secrets store. User-specific OAuth connections (Slack, Calendly, Jira, Asana, Monday.com) are initiated above and require the corresponding Client ID/Secret to be configured on the server first.
        </p>
      </div>
    </div>
  );
};
