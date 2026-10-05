import React, { useEffect, useState } from 'react';
import {
  ShieldCheck, Search, Loader2, RefreshCw,
  UserPlus, Key, Activity, Heart, ShieldAlert, Check,
  AlertCircle, UserMinus, Lock, Users, CreditCard,
  HeartPulse, Building2, Copy, Plus, MessageSquare, Star
} from 'lucide-react';
import { secureApiFetch } from '../lib/secure-api';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../lib/auth';
import { ConfirmDialog } from './ConfirmDialog';
import { formatFeedbackCategory } from '../lib/feedback-format';
import { PLATFORM_ADMIN_ROLES, PLATFORM_ADMIN_ROLE_LABELS, isPlatformAdminRole } from '../../admin-roles';

interface AdminUser {
  uid: string;
  email: string | null;
  // Firebase Auth's own record - true automatically for social sign-ins
  // (Google/Microsoft/Facebook already vouch for the address), only true
  // for an email/password account once the person has clicked the link
  // from the verification email.
  emailVerified: boolean;
  // True when this account has no linked identity provider at all (no
  // email, Google, etc.) - Blaze Break's anonymous/demo sign-in path.
  // Explains a null `email` honestly instead of just rendering blank.
  isAnonymous?: boolean;
  createdAt: string | null;
  lastSignIn: string | null;
  // 'unknown' is a real, if rare, state: a Firestore users/{uid} doc with
  // no matching live Firebase Auth account (e.g. deleted directly in the
  // Auth console).
  accessStatus: 'active' | 'disabled' | 'unknown';
  // The account's current role custom claim. Optional only because older
  // cached responses (before this was added) wouldn't have it.
  role?: string;
  // The account's real, computed entitlement (server.ts's effectivePlan) -
  // not a raw stored field, so an expired time-limited grant already
  // shows as 'free' here rather than whatever plan string was last
  // written. Optional only because older cached responses (before this
  // was added) wouldn't have it.
  plan?: 'free' | 'core' | 'performance' | 'executive' | 'legacy_premium';
  entitlementStatus?: 'active' | 'trial' | 'grace' | 'past_due' | 'cancelled' | 'expired';
  // Raw entitlement provenance - see entitlements.ts's EntitlementRecord.
  // `storedPlan` is the account's actual stored/coerced plan, which can
  // differ from the computed `plan` above once entitlementEnd has passed
  // (storedPlan stays e.g. 'performance', plan falls back to 'free') -
  // without this an expired grant and a never-granted account were
  // indistinguishable in the admin UI.
  storedPlan?: 'free' | 'core' | 'performance' | 'executive' | 'legacy_premium';
  billingSource?: 'stripe' | 'apple' | 'google' | 'organisation' | 'admin' | null;
  entitlementEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  lastVerifiedAt?: string | null;
}

interface PlatformAdmin {
  uid: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  createdAt?: any;
  // Why this account holds this role, and - for a temporary privilege
  // escalation - when it self-expires. Both required/settable on every
  // promotion and role change (see server.ts's AdminPanelRoleSchema).
  // Optional only because an admin_users doc created before this existed
  // won't have them.
  reason?: string;
  expiresAt?: string | null;
  // Read fresh from this account's real Firebase Auth custom claims on
  // every fetch, not stored on the admin_users doc - whether one of the
  // platform's own most powerful accounts has two-factor turned on.
  mfaEnabled?: boolean;
}

interface AuditLog {
  id: string;
  // Matches logAdminAction's actual stored field names (server.ts) -
  // this previously read `adminEmail`/`details`, fields that were never
  // written, so every audit entry silently showed "Admin undefined" and
  // never rendered its Details block.
  actorEmail: string;
  actorRole?: string;
  action: string;
  targetUid?: string;
  targetEmail?: string;
  metadata?: any;
  createdAt: string;
}

interface FeedbackSubmission {
  id: string;
  userId: string;
  userEmail: string;
  category: 'general' | 'bug' | 'feature_request' | 'testimonial';
  message: string;
  rating: number | null;
  publicUseConsent: boolean;
  createdAt: string;
}

interface ResetMetrics {
  totalSessions: number;
  avgStartIntensity: number;
  avgEndIntensity: number;
  avgReduction: number;
  mostUsedTool: string;
  toolUsage: Record<string, number>;
  safetyEscalations: number;
  crisisReferrals: number;
}

// Sourced from admin-roles.ts (the shared platform-staff role vocabulary -
// see that file's header for why it's the single source of truth) plus
// one option, 'user', that isn't a platform-staff role at all: it's how
// an admin demotes an account back to a plain end-user via this same
// dropdown.
const ROLE_HIERARCHY = [
  ...PLATFORM_ADMIN_ROLES.map((value) => ({ value, label: PLATFORM_ADMIN_ROLE_LABELS[value] })),
  { value: 'user', label: 'Standard User' },
];

// Mirrors entitlements.ts's PURCHASABLE_PLANS/ENTITLEMENT_STATUSES exactly -
// same static-mirror convention ROLE_HIERARCHY above already uses for the
// server's own role enums. `legacy_premium` is deliberately excluded here
// too: entitlements.ts's validateAdminGrant() rejects it outright (it's a
// read-path migration outcome, never something to grant going forward -
// an admin who wants Premium-equivalent access for someone grants
// 'performance', which legacy_premium is tier-aligned with).
const GRANTABLE_PLANS: { value: 'free' | 'core' | 'performance' | 'executive'; label: string }[] = [
  { value: 'free', label: 'Free' },
  { value: 'core', label: 'Core' },
  { value: 'performance', label: 'Performance' },
  { value: 'executive', label: 'Executive' },
];

const GRANTABLE_STATUSES: { value: 'active' | 'trial' | 'grace' | 'past_due' | 'cancelled' | 'expired'; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'trial', label: 'Trial' },
  { value: 'grace', label: 'Grace period' },
  { value: 'past_due', label: 'Past due' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'expired', label: 'Expired' },
];

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  core: 'Core',
  performance: 'Performance',
  executive: 'Executive',
  legacy_premium: 'Legacy Premium',
};

// Provenance labels for entitlements.ts's EntitlementBillingSource - the
// "why/how does this account have this plan" answer the Plans &
// Entitlements workspace surfaces. Stripe/Apple/Google are listed for
// completeness (entitlements.ts declares them) but no real payment
// provider is wired up in this codebase today - only 'admin' and
// 'organisation' are ever actually written.
// Groups server.ts's real logAdminAction action strings for the Audit
// tab's category filter - every action string that actually gets logged
// somewhere in server.ts is accounted for exactly once, so "Other"
// genuinely means "a real action outside these groups," not a catch-all
// for typos.
const AUDIT_CATEGORIES = {
  'Role & Access': ['create_admin_user', 'update_admin_role', 'remove_admin_user', 'update_user_role', 'suspend_user', 'unsuspend_user'],
  'Entitlements': ['grant_entitlement'],
  'Platform Controls': ['manage_feature_flags', 'manage_nova_settings', 'manage_knowledge_chunks', 'manage_content_library', 'manage_organisation', 'update_release_channel', 'LEGAL_DOCUMENT_PUBLISHED'],
} as const;

const BILLING_SOURCE_LABELS: Record<string, string> = {
  admin: 'Admin grant',
  organisation: 'Organisation seat',
  stripe: 'Stripe',
  apple: 'Apple',
  google: 'Google Play',
};

export const AdminDashboard = () => {
  const { appRole, user: authUser } = useAuth();

  const isAdmin = isPlatformAdminRole(appRole);

  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'entitlements' | 'admins' | 'orgs' | 'communications' | 'audit' | 'somatic' | 'feedback'>('overview');
  // Which account's Access Timeline is expanded in the Plans &
  // Entitlements tab - at most one open at a time, same pattern as other
  // single-item expand/collapse state in this file.
  const [expandedTimelineUid, setExpandedTimelineUid] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersCapped, setUsersCapped] = useState(false);
  const [admins, setAdmins] = useState<PlatformAdmin[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [feedbackSubmissions, setFeedbackSubmissions] = useState<FeedbackSubmission[]>([]);
  const [feedbackCategoryFilter, setFeedbackCategoryFilter] = useState<'all' | FeedbackSubmission['category']>('all');
  const [metrics, setMetrics] = useState<ResetMetrics | null>(null);
  // Support Circle messaging cost visibility (Master Support Circle spec):
  // guardian_alert is deliberately exempt from the per-user SMS cap
  // (sms-guardrails.ts), which previously also made it invisible to
  // /api/admin/cost-usage entirely - retiring the honest "Not yet
  // tracked" placeholder below only once this is real data, not before.
  const [supportCircleCost, setSupportCircleCost] = useState<{ periodDays: number; guardianAlertCount: number; smsUsd: number } | null>(null);
  // Fuller view of the same /api/admin/cost-usage response, for the
  // Communications tab - real per-category SMS counts and the estimated
  // cost breakdown, not just the Guardian Alert slice supportCircleCost
  // above narrows to.
  const [commsUsage, setCommsUsage] = useState<{
    periodDays: number;
    smsByCategory: { guardian_alert: number; ally_nudge: number; manual_send: number };
    smsSegmentCount: number;
    estimatedCostUsd: { smsUsd: number; novaTextUsd: number; novaVoiceUsd: number; diagnoseUsd: number; totalUsd: number };
  } | null>(null);
  const [orgs, setOrgs] = useState<{ id: string; name: string; joinCode: string; privacyThreshold: number; memberCount: number; adminCount: number; createdAt?: string | null; billingPlan?: string }[]>([]);
  // Which org's detail (billing + member list) is expanded, and the
  // fetched detail itself - fetched lazily on expand, not preloaded for
  // every org in the list.
  const [expandedOrgId, setExpandedOrgId] = useState<string | null>(null);
  const [orgDetail, setOrgDetail] = useState<{
    billing: { plan: string; status: string; seatCount: number; billingContact: string | null };
    billingProvider: string;
    members: { uid: string; email: string | null; role: string; status: string; joinedAt: string | null }[];
  } | null>(null);
  const [isLoadingOrgDetail, setIsLoadingOrgDetail] = useState(false);
  // Set when the Provision form is pre-filled to EDIT an existing org
  // (reuses the same upsert-by-orgId POST /api/admin/orgs endpoint) rather
  // than create a new one.
  const [editingOrgId, setEditingOrgId] = useState<string | null>(null);
  // Whether each messaging provider has credentials configured on the
  // server (env vars present) - a configuration signal for the Overview's
  // Communications card, not a delivery/volume metric. null until the
  // first successful /api/admin/summary fetch.
  const [communications, setCommunications] = useState<{ twilioConfigured: boolean; brevoConfigured: boolean; pushConfigured: boolean } | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Forms State
  const [searchQuery, setSearchQuery] = useState('');
  const [auditCategoryFilter, setAuditCategoryFilter] = useState<'all' | keyof typeof AUDIT_CATEGORIES>('all');
  const [verifiedFilter, setVerifiedFilter] = useState<'all' | 'verified' | 'unverified'>('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  // Saved Views - per-browser convenience (not shared state other admins
  // need to see), so localStorage is the right home for it rather than a
  // Firestore collection. Each view is just a snapshot of the three filter
  // fields above under a name the admin picked.
  const [savedViews, setSavedViews] = useState<{ name: string; searchQuery: string; verifiedFilter: typeof verifiedFilter; roleFilter: string; planFilter: string }[]>(() => {
    try {
      const raw = localStorage.getItem('blaze_admin_people_views');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [newViewName, setNewViewName] = useState('');
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [selectedUserRole, setSelectedUserRole] = useState('user');
  const [pendingAction, setPendingAction] = useState<
    | { type: 'suspend'; uid: string; email: string | null; currentlyActive: boolean }
    | { type: 'revokeAdmin'; uid: string; email: string }
    | null
  >(null);
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [grantingEntitlementUid, setGrantingEntitlementUid] = useState<string | null>(null);
  const [grantPlanChoice, setGrantPlanChoice] = useState<'free' | 'core' | 'performance' | 'executive'>('performance');
  const [grantStatusChoice, setGrantStatusChoice] = useState<'active' | 'trial' | 'grace' | 'past_due' | 'cancelled' | 'expired'>('active');
  // Kept as the raw input string (not a number) so an empty field can mean
  // "no fixed end" without fighting an empty-string-to-0 coercion - parsed
  // to a real number only at submit time, in handleGrantEntitlement.
  const [grantDurationDays, setGrantDurationDays] = useState('');

  // New Admin User Form State
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminRole, setNewAdminRole] = useState('platform_admin');
  // Required on every promotion/role-change - see server.ts's
  // AdminPanelRoleSchema. escalationHours left blank means a permanent
  // grant; set means temporary privilege escalation that expires itself.
  const [newAdminReason, setNewAdminReason] = useState('');
  const [newAdminEscalationHours, setNewAdminEscalationHours] = useState('');
  const [isAddingAdmin, setIsAddingAdmin] = useState(false);

  // Change Role form - the update-role endpoint already existed server-
  // side but had no UI wired to it; previously the only way to change an
  // existing admin's role was to revoke and re-promote them.
  const [changeRoleTarget, setChangeRoleTarget] = useState<PlatformAdmin | null>(null);
  const [changeRoleValue, setChangeRoleValue] = useState('platform_admin');
  const [changeRoleReason, setChangeRoleReason] = useState('');
  const [changeRoleEscalationHours, setChangeRoleEscalationHours] = useState('');
  const [isChangingRole, setIsChangingRole] = useState(false);

  // New Organisation Form State
  const [newOrgId, setNewOrgId] = useState('');
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgThreshold, setNewOrgThreshold] = useState('5');
  const [newOrgAdminEmail, setNewOrgAdminEmail] = useState('');
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [orgFormError, setOrgFormError] = useState('');

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const loadAllData = async () => {
    try {
      setLoading(true);
      setError(null);
      setLoadError(null);

      let loadedUsers: AdminUser[] = [];
      let loadedAdmins: PlatformAdmin[] = [];
      let loadedLogs: AuditLog[] = [];
      let fetchFailed = false;
      // A 429 (rate limited) is a completely different situation from a
      // real server error, and looks nothing like it from the user's side -
      // this was mistaken for a broken dashboard once already because the
      // generic message gave no way to tell them apart. Any 429 among the
      // three fetches below wins over a generic failure, since "wait a
      // few minutes" is actionable and a generic error message isn't.
      let rateLimited = false;

      try {
        // 1. Fetch Users from secure API
        const usersRes = await secureApiFetch('/api/admin/users');
        if (usersRes.ok) {
          const uData = await usersRes.json();
          loadedUsers = uData.users || [];
          setUsersCapped(Boolean(uData.capped));
        } else {
          console.error("API returned error for users list:", usersRes.status);
          if (usersRes.status === 429) rateLimited = true;
          fetchFailed = true;
        }
      } catch (e) {
        console.error("Could not reach user API:", e);
        fetchFailed = true;
      }

      try {
        // 2. Fetch Admin Users List
        const adminsRes = await secureApiFetch('/api/admin/admin-users');
        if (adminsRes.ok) {
          const aData = await adminsRes.json();
          loadedAdmins = aData.admins || [];
        } else {
          console.error("API returned error for admin users:", adminsRes.status);
          if (adminsRes.status === 429) rateLimited = true;
          fetchFailed = true;
        }
      } catch (e) {
        console.error("Could not reach admin users API:", e);
        fetchFailed = true;
      }

      try {
        // 3. Fetch Audit Logs
        const auditRes = await secureApiFetch('/api/admin/audit-logs');
        if (auditRes.ok) {
          const logData = await auditRes.json();
          loadedLogs = logData.logs || [];
        } else {
          console.error("API returned error for audit logs:", auditRes.status);
          if (auditRes.status === 429) rateLimited = true;
          fetchFailed = true;
        }
      } catch (e) {
        console.error("Could not reach audit logs API:", e);
        fetchFailed = true;
      }

      let loadedOrgs: typeof orgs = [];
      try {
        // 3b. Fetch Organisations (not fatal if this fails - a fresh install
        // with no customer orgs yet is a normal, expected state)
        const orgsRes = await secureApiFetch('/api/admin/orgs');
        if (orgsRes.ok) {
          const orgData = await orgsRes.json();
          loadedOrgs = orgData.orgs || [];
        }
      } catch (e) {
        console.error("Could not reach organisations API:", e);
      }
      setOrgs(loadedOrgs);

      let loadedFeedback: FeedbackSubmission[] = [];
      try {
        // Not fatal if this fails, same reasoning as organisations above -
        // no feedback submitted yet is a normal, expected state, not an
        // error condition worth showing the dashboard's red banner for.
        const feedbackRes = await secureApiFetch('/api/admin/feedback');
        if (feedbackRes.ok) {
          const feedbackData = await feedbackRes.json();
          loadedFeedback = feedbackData.submissions || [];
        }
      } catch (e) {
        console.error("Could not reach feedback API:", e);
      }
      setFeedbackSubmissions(loadedFeedback);

      // Only a genuine fetch failure counts as an error here - an empty
      // list (no admin promotions yet, no audit log entries yet) is a
      // normal, honest state for a lightly-used platform, and each tab
      // already renders its own clear "nothing here yet" message for it.
      // Treating "loaded fine, genuinely nothing there" the same as
      // "failed to load" showed a scary error banner on a completely
      // healthy first-time view.
      if (fetchFailed) {
        setLoadError(
          rateLimited
            ? "Too many requests in a short time — please wait a few minutes and retry."
            : "Couldn't load live data — showing nothing rather than placeholders."
        );
      }

      setUsers(loadedUsers);
      setAdmins(loadedAdmins);
      setAuditLogs(loadedLogs);

      // 4. Calculate Somatic Reset Metrics
      await fetchSomaticMetrics();
      // 5. Support Circle messaging cost visibility
      await fetchCostUsage();

    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchCostUsage = async () => {
    try {
      const res = await secureApiFetch('/api/admin/cost-usage');
      if (!res.ok) { setSupportCircleCost(null); setCommsUsage(null); return; }
      const data = await res.json();
      setSupportCircleCost({
        periodDays: data.periodDays ?? 7,
        guardianAlertCount: data.smsByCategory?.guardian_alert ?? 0,
        smsUsd: data.estimatedCostUsd?.smsUsd ?? 0,
      });
      setCommsUsage({
        periodDays: data.periodDays ?? 7,
        smsByCategory: { guardian_alert: 0, ally_nudge: 0, manual_send: 0, ...data.smsByCategory },
        smsSegmentCount: data.usage?.smsSegmentCount ?? 0,
        estimatedCostUsd: { smsUsd: 0, novaTextUsd: 0, novaVoiceUsd: 0, diagnoseUsd: 0, totalUsd: 0, ...data.estimatedCostUsd },
      });
    } catch (e) {
      // Non-fatal - this card just falls back to its own "not available"
      // state rather than failing the whole dashboard load.
      setSupportCircleCost(null);
      setCommsUsage(null);
    }
  };

  const fetchSomaticMetrics = async () => {
    try {
      const res = await secureApiFetch('/api/admin/summary');
      if (!res.ok) {
        // A genuine fetch failure - distinct from the "zero resets logged
        // yet" case below, which is not an error. This used to set the
        // same loadError for both, which meant a completely healthy,
        // lightly-used account (0 somatic resets so far - an entirely
        // normal, honest state) permanently showed the app's red
        // "couldn't load" banner on every single visit, indistinguishable
        // from a real outage.
        if (res.status === 429) {
          setLoadError("Too many requests in a short time — please wait a few minutes and retry.");
        } else {
          setLoadError("Couldn't load live data — showing nothing rather than placeholders.");
        }
        setMetrics(null);
        setCommunications(null);
        return;
      }
      const data = await res.json();

      setMetrics({
        totalSessions: data.totalResets ?? 0,
        avgStartIntensity: data.avgIntensityBefore ?? 0,
        avgEndIntensity: data.avgIntensityAfter ?? 0,
        avgReduction: data.avgIntensityReduction ?? 0,
        mostUsedTool: data.mostUsedResetTool || 'None',
        toolUsage: data.toolCounts ?? {},
        safetyEscalations: data.safetyEscalations ?? 0,
        crisisReferrals: data.crisisReferrals ?? 0,
      });
      setCommunications(data.communications ?? null);

    } catch (err) {
      console.error("Somatic aggregation failed: ", err);
      setLoadError("Couldn't load live data — showing nothing rather than placeholders.");
      setMetrics(null);
      setCommunications(null);
    }
  };

  const handleCreateOrg = async () => {
    if (!newOrgId.trim() || !newOrgName.trim()) return;
    setIsCreatingOrg(true);
    setOrgFormError('');
    try {
      const res = await secureApiFetch('/api/admin/orgs', {
        method: 'POST',
        data: {
          // Same upsert-by-orgId endpoint handles both create and edit -
          // when editing, the slug is already fixed (the field is
          // disabled in the form) so this just re-sends it unchanged.
          orgId: newOrgId.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-'),
          name: newOrgName.trim(),
          privacyThreshold: Number(newOrgThreshold) || 5,
          initialAdminEmail: newOrgAdminEmail.trim() || undefined,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        setOrgFormError(data.error || 'Could not save that organisation.');
      } else {
        showSuccess(editingOrgId ? 'Organisation updated.' : `Organisation created. Join code: ${data.joinCode}`);
        setNewOrgId('');
        setNewOrgName('');
        setNewOrgThreshold('5');
        setNewOrgAdminEmail('');
        setEditingOrgId(null);
        const orgsRes = await secureApiFetch('/api/admin/orgs');
        if (orgsRes.ok) {
          const orgData = await orgsRes.json();
          setOrgs(orgData.orgs || []);
        }
      }
    } catch (e) {
      setOrgFormError('Could not save that organisation.');
    }
    setIsCreatingOrg(false);
  };

  const startEditingOrg = (org: (typeof orgs)[number]) => {
    setEditingOrgId(org.id);
    setNewOrgId(org.id);
    setNewOrgName(org.name);
    setNewOrgThreshold(String(org.privacyThreshold));
    setNewOrgAdminEmail('');
    setOrgFormError('');
  };

  const cancelEditingOrg = () => {
    setEditingOrgId(null);
    setNewOrgId('');
    setNewOrgName('');
    setNewOrgThreshold('5');
    setNewOrgAdminEmail('');
    setOrgFormError('');
  };

  // Lazily fetches one org's billing state + member list (access-control
  // info only - uid/email/role/status, never wellbeing content) on first
  // expand, rather than preloading detail for every org in the list.
  const toggleOrgDetail = async (orgId: string) => {
    if (expandedOrgId === orgId) {
      setExpandedOrgId(null);
      setOrgDetail(null);
      return;
    }
    setExpandedOrgId(orgId);
    setOrgDetail(null);
    setIsLoadingOrgDetail(true);
    try {
      const res = await secureApiFetch(`/api/admin/orgs/${orgId}`);
      if (res.ok) {
        const data = await res.json();
        setOrgDetail({ billing: data.billing, billingProvider: data.billingProvider, members: data.members || [] });
      }
    } catch (e) {
      // Non-fatal - the detail panel just shows its own "couldn't load" state.
    } finally {
      setIsLoadingOrgDetail(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const handleUpdateRole = async (uid: string) => {
    try {
      setIsUpdatingRole(true);
      setError(null);
      const res = await secureApiFetch(`/api/admin/users/${uid}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: selectedUserRole })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to update user custom claims.');
      }

      showSuccess(`Successfully updated custom claims for user to: ${selectedUserRole}`);
      // Deliberately doesn't clear selectedUser (the Account Control
      // Drawer's target) - an admin doing a role change followed by a
      // plan grant on the same account shouldn't have the drawer vanish
      // out from under them after the first action succeeds.
      await loadAllData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsUpdatingRole(false);
    }
  };

  // Grants or clears a paid entitlement directly - the same "admin comp"
  // path server.ts documents as the one real way to give an account paid
  // access today, pending a live Stripe/Apple/Google integration (beta
  // testers, support cases, or the founder's own account). `plan` is any
  // of entitlements.ts's PURCHASABLE_PLANS (free/core/performance/
  // executive) - this used to only ever be called with 'performance' or
  // 'free' hardcoded, even though the server route always supported the
  // full set; the picker panel below is what actually exposes that choice
  // now. `durationDays` omitted/undefined means no fixed end, matching
  // the server's own "omitted or null = stays in effect until changed
  // here again" behaviour. 'legacy_premium' is never an admin-assignable
  // value, only a read-path outcome for accounts that predate the
  // multi-tier model (docs/LEGACY_CUSTOMER_MIGRATION.md) - the picker
  // never offers it, and the server rejects it outright either way.
  const handleGrantEntitlement = async (
    uid: string,
    plan: 'free' | 'core' | 'performance' | 'executive',
    status: 'active' | 'trial' | 'grace' | 'past_due' | 'cancelled' | 'expired' = 'active',
    durationDays?: number,
  ) => {
    try {
      setGrantingEntitlementUid(uid);
      setError(null);
      const res = await secureApiFetch(`/api/admin/users/${uid}/entitlement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, status, ...(durationDays ? { durationDays } : {}) })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Couldn't update that account's plan.");
      }

      showSuccess(
        plan === 'free'
          ? 'Account reverted to Free.'
          : `Account granted ${PLAN_LABELS[plan]} (${GRANTABLE_STATUSES.find((s) => s.value === status)?.label || status})${durationDays ? ` for ${durationDays} day${durationDays === 1 ? '' : 's'}` : ''}.`
      );
      // Deliberately doesn't clear selectedUser - see handleUpdateRole's
      // comment above for why the drawer should outlive a single action.
      await loadAllData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGrantingEntitlementUid(null);
    }
  };

  const handleToggleSuspend = async (uid: string, currentlyActive: boolean) => {
    try {
      setLoading(true);
      const res = await secureApiFetch(`/api/admin/users/${uid}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suspend: currentlyActive })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Account suspension failed.');
      }

      showSuccess(`Account state successfully toggled.`);
      await loadAllData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminEmail || !newAdminReason.trim()) return;

    try {
      setIsAddingAdmin(true);
      setError(null);

      const escalationHours = newAdminEscalationHours.trim() === '' ? undefined : Number(newAdminEscalationHours);
      const res = await secureApiFetch('/api/admin/admin-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newAdminEmail,
          role: newAdminRole,
          displayName: newAdminName,
          reason: newAdminReason.trim(),
          ...(escalationHours ? { escalationHours } : {}),
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to assign custom admin credentials.');
      }

      showSuccess(
        escalationHours
          ? `Successfully promoted ${newAdminEmail} - this access expires automatically in ${escalationHours}h.`
          : `Successfully promoted ${newAdminEmail} to admin tier.`
      );
      setNewAdminEmail('');
      setNewAdminName('');
      setNewAdminReason('');
      setNewAdminEscalationHours('');
      await loadAllData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsAddingAdmin(false);
    }
  };

  // Previously the update-role endpoint existed server-side with no UI
  // calling it - the only way to change an existing admin's role was to
  // revoke and re-promote them, losing the account's history in the
  // process. This wires the Change Role form to that same endpoint.
  const handleChangeAdminRole = async () => {
    if (!changeRoleTarget || !changeRoleReason.trim()) return;
    try {
      setIsChangingRole(true);
      setError(null);
      const escalationHours = changeRoleEscalationHours.trim() === '' ? undefined : Number(changeRoleEscalationHours);
      const res = await secureApiFetch(`/api/admin/admin-users/${changeRoleTarget.uid}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: changeRoleValue,
          reason: changeRoleReason.trim(),
          ...(escalationHours ? { escalationHours } : {}),
        })
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Couldn't update that admin's role.");
      }
      showSuccess(
        escalationHours
          ? `Role updated - this access expires automatically in ${escalationHours}h.`
          : 'Role updated.'
      );
      setChangeRoleTarget(null);
      setChangeRoleReason('');
      setChangeRoleEscalationHours('');
      await loadAllData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsChangingRole(false);
    }
  };

  const handleRevokeAdmin = async (uid: string) => {
    try {
      setLoading(true);
      const res = await secureApiFetch(`/api/admin/admin-users/${uid}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to revoke administrative privileges.');
      }

      showSuccess('Administrative credentials revoked successfully.');
      await loadAllData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(u =>
    ((u.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.uid.includes(searchQuery)) &&
    (verifiedFilter === 'all' || (verifiedFilter === 'verified') === u.emailVerified) &&
    (roleFilter === 'all' || (u.role || 'user') === roleFilter) &&
    (planFilter === 'all' || (u.plan || 'free') === planFilter)
  );

  const filteredAuditLogs = auditLogs.filter((log) =>
    auditCategoryFilter === 'all' || (AUDIT_CATEGORIES[auditCategoryFilter] as readonly string[]).includes(log.action)
  );

  // Distinct roles actually present in the loaded page, not the full
  // platform-admin role list - most accounts are plain end-users with a
  // mix of app-level AuthRole values (individual/employee/manager/...),
  // not platform-staff roles, so this filter reflects what's really there.
  const rolesInView = Array.from(new Set(users.map((u) => u.role || 'user'))).sort();

  const lifecycleOf = (u: AdminUser): { label: string; tone: 'active' | 'muted' | 'warning' | 'destructive' } => {
    if (u.accessStatus === 'unknown') return { label: 'Orphaned (no Auth record)', tone: 'warning' };
    if (u.accessStatus === 'disabled') return { label: 'Suspended', tone: 'destructive' };
    if (u.isAnonymous) return { label: 'Anonymous (Demo)', tone: 'muted' };
    if (!u.emailVerified) return { label: 'Pending Verification', tone: 'warning' };
    return { label: 'Active', tone: 'active' };
  };

  // Whether an account's STORED entitlement is actually live right now -
  // `storedPlan` can be e.g. 'performance' while the computed `plan`
  // already fell back to 'free' because entitlementEnd has passed. Without
  // this distinction an expired time-limited grant and an account that was
  // never granted anything both just show "Free", with no way to tell
  // "this access ended" from "this access was never given" - exactly the
  // kind of silently-collapsed-to-zero state the Command Centre is meant
  // to avoid.
  const entitlementEffectiveState = (u: AdminUser): { label: string; tone: 'active' | 'muted' | 'warning' } => {
    if (!u.storedPlan || u.storedPlan === 'free') return { label: 'Free', tone: 'muted' };
    if (u.plan === 'free') return { label: 'Expired', tone: 'warning' };
    return { label: 'Live', tone: 'active' };
  };

  const applySavedView = (view: (typeof savedViews)[number]) => {
    setSearchQuery(view.searchQuery);
    setVerifiedFilter(view.verifiedFilter);
    setRoleFilter(view.roleFilter);
    setPlanFilter(view.planFilter);
  };

  const saveCurrentView = () => {
    const name = newViewName.trim();
    if (!name) return;
    const next = [...savedViews.filter((v) => v.name !== name), { name, searchQuery, verifiedFilter, roleFilter, planFilter }];
    setSavedViews(next);
    try { localStorage.setItem('blaze_admin_people_views', JSON.stringify(next)); } catch { /* per-viewer convenience only - fine to silently skip if storage is unavailable */ }
    setNewViewName('');
  };

  const deleteSavedView = (name: string) => {
    const next = savedViews.filter((v) => v.name !== name);
    setSavedViews(next);
    try { localStorage.setItem('blaze_admin_people_views', JSON.stringify(next)); } catch { /* per-viewer convenience only */ }
  };

  // Opens the Account Control Drawer for one account, prefilling the role
  // and entitlement pickers from its real current values - replaces the
  // two separate "Edit Claims" / "Grant Access" buttons and their own
  // independent inline panels with one consolidated per-account surface.
  const openAccountDrawer = (u: AdminUser) => {
    setSelectedUser(u);
    setSelectedUserRole(u.role && ROLE_HIERARCHY.some((r) => r.value === u.role) ? u.role : 'user');
    setGrantPlanChoice(u.plan && GRANTABLE_PLANS.some((p) => p.value === u.plan) ? (u.plan as typeof grantPlanChoice) : 'performance');
    setGrantStatusChoice(u.entitlementStatus && u.entitlementStatus !== 'expired' ? u.entitlementStatus : 'active');
    setGrantDurationDays('');
  };

  const closeAccountDrawer = () => setSelectedUser(null);

  // Keeps the open drawer's snapshot in sync with the freshly reloaded
  // `users` list after an action (suspend/grant/role write all end in
  // loadAllData()) - without this, the drawer's lifecycle badge and
  // Suspend/Reactivate button would keep showing the pre-action state
  // until it was closed and reopened, since selectedUser is otherwise
  // just a point-in-time copy taken when the drawer was opened.
  useEffect(() => {
    if (!selectedUser) return;
    const fresh = users.find((u) => u.uid === selectedUser.uid);
    if (fresh && fresh !== selectedUser) setSelectedUser(fresh);
  }, [users]);

  if (!isAdmin) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-xl mx-auto p-8 rounded-xl border border-border bg-card space-y-6 text-center shadow-lg relative overflow-hidden my-12"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-destructive" />
        <div className="p-4 bg-destructive/10 text-destructive rounded-full w-16 h-16 flex items-center justify-center mx-auto border border-destructive/20">
          <Lock className="w-8 h-8" />
        </div>
        
        <div className="space-y-2">
          <h3 className="text-xl font-display font-bold text-text-main">Access Denied</h3>
          <p className="text-xs text-text-muted uppercase tracking-widest font-black">
            Required: Platform Admin Role
          </p>
          <p className="text-sm text-text-muted leading-relaxed">
            Your current account role (<span className="text-[#9a3412] dark:text-primary font-bold font-mono">{appRole}</span>) is unauthorised to read platform security custom claims or audit logs. Ask a Platform Owner to grant you a Command Centre role.
          </p>
        </div>
      </motion.div>
    );
  }

  // Real count from server-computed safetyLevel data, not an invented formula
  const safetyEventsCount = metrics?.safetyEscalations ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8 max-w-6xl mx-auto"
    >
      {/* Title Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <h3 className="text-2xl font-display font-bold text-text-main flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-primary" /> Platform Command Centre
          </h3>
          <p className="text-xs text-text-muted mt-1 uppercase tracking-widest font-black">
            Access, operations, security and platform health.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={loadAllData} 
            disabled={loading} 
            className="px-4 py-2 bg-surface hover:bg-border text-xs font-bold uppercase tracking-wider rounded-xl transition-all border border-border flex items-center gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-text-muted ${loading ? 'animate-spin' : ''}`} />
            Sync Vault
          </button>
        </div>
      </div>

      {/* Success and Error Indicators */}
      <AnimatePresence>
        {successMsg && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -10 }}
            role="status"
            aria-live="polite"
            className="p-4 bg-success/10 border border-success/30 text-success dark:text-[#4ade80] rounded-xl text-sm font-bold flex items-center gap-2"
          >
            <Check className="w-4 h-4 shrink-0" />
            {successMsg}
          </motion.div>
        )}
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -10 }}
            role="alert"
            className="p-4 bg-destructive/10 border border-destructive/30 text-destructive dark:text-[#f87171] rounded-xl text-sm font-bold flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </motion.div>
        )}
        {loadError && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -10 }}
            role="alert"
            className="p-4 bg-destructive/10 border border-destructive/30 text-destructive dark:text-[#f87171] rounded-xl text-sm font-bold flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {loadError}
            </div>
            <button onClick={loadAllData} className="hover:opacity-80 transition-opacity">
              [Retry]
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overview - truthful platform-state summary. Every card below
          either shows a real count already loaded for other tabs, or
          says plainly that nothing is connected/configured yet - never a
          number that looks real but is actually hardcoded or guessed. */}
      {activeTab === 'overview' && (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: People */}
        <div className="p-6 bg-surface dark:bg-card border border-border rounded-2xl space-y-4 shadow-sm relative overflow-hidden hover:border-primary/40 transition-all duration-300">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-text-muted block">People</span>
              <h4 className="text-3xl font-display font-black text-text-main flex items-baseline gap-2">
                {users.length}{usersCapped ? '+' : ''}
              </h4>
            </div>
            <div className="p-3 bg-primary/10 text-primary rounded-xl">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-text-muted">
            <span>Corporate seats / individual plans: <strong className="text-text-muted font-semibold">Not yet tracked</strong></span>
          </div>
        </div>

        {/* Card 2: Commercial - no billing system exists yet, so this
            honestly says so rather than showing numbers that would look
            like real, currently-zero metrics but are actually just
            hardcoded and could never change. */}
        <div className="p-6 bg-surface dark:bg-card border border-border rounded-2xl space-y-4 shadow-sm relative overflow-hidden hover:border-primary/40 transition-all duration-300">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-text-muted block">Commercial</span>
              <h4 className="text-xl font-display font-black text-text-muted">
                Not yet tracked
              </h4>
            </div>
            <div className="p-3 bg-primary/10 text-primary rounded-xl">
              <CreditCard className="w-5 h-5" />
            </div>
          </div>
          <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-text-muted">
            <span>Paid tiers / ARR: <strong className="text-text-muted font-semibold">No billing system connected yet</strong></span>
          </div>
        </div>

        {/* Card 3: Safety & Support */}
        <div className="p-6 bg-surface dark:bg-card border border-border rounded-2xl space-y-4 shadow-sm relative overflow-hidden hover:border-primary/40 transition-all duration-300">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-text-muted block">Somatic Safety Alerts</span>
              <h4 className="text-3xl font-display font-black text-destructive dark:text-[#f87171] flex items-baseline gap-2">
                {safetyEventsCount}
                <span className="text-xs text-text-muted font-normal">Active Resets</span>
              </h4>
            </div>
            <div className="p-3 bg-destructive/10 text-destructive rounded-xl">
              <HeartPulse className="w-5 h-5" />
            </div>
          </div>
          <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-text-muted">
            <span>
              Guardian Alerts ({supportCircleCost?.periodDays ?? 7}d): {supportCircleCost ? (
                <strong className="text-text-main font-semibold">{supportCircleCost.guardianAlertCount} Sent</strong>
              ) : (
                <strong className="text-text-muted font-semibold">Not available</strong>
              )}
            </span>
            <span>Crisis Referrals: <strong className="text-text-main font-semibold">{metrics?.crisisReferrals ?? 0} Triggers</strong></span>
          </div>
          {supportCircleCost && supportCircleCost.smsUsd > 0 && (
            <div className="pt-2 border-t border-white/5 text-[11px] text-text-muted">
              <span>All SMS/WhatsApp ({supportCircleCost.periodDays}d) est. cost: <strong className="text-text-main font-semibold">${supportCircleCost.smsUsd.toFixed(2)}</strong> <span className="italic">(rough internal estimate, not live provider billing - see docs/COST_MONITORING.md)</span></span>
            </div>
          )}
        </div>

        {/* Card 4: Communications - real env-presence configuration state
            for each provider, not a delivery/volume metric (that's a
            later Command Centre PR's job). */}
        <div className="p-6 bg-surface dark:bg-card border border-border rounded-2xl space-y-4 shadow-sm relative overflow-hidden hover:border-primary/40 transition-all duration-300">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-text-muted block">Communications</span>
              <h4 className="text-xl font-display font-black text-text-main">
                {communications ? [communications.twilioConfigured, communications.brevoConfigured, communications.pushConfigured].filter(Boolean).length : 0} / 3 configured
              </h4>
            </div>
            <div className="p-3 bg-primary/10 text-primary rounded-xl">
              <MessageSquare className="w-5 h-5" />
            </div>
          </div>
          <div className="pt-2 border-t border-white/5 space-y-1 text-[11px] text-text-muted">
            <div className="flex items-center justify-between"><span>SMS / WhatsApp (Twilio)</span><strong className={communications?.twilioConfigured ? 'text-success' : 'text-text-muted'}>{communications ? (communications.twilioConfigured ? 'Configured' : 'Not configured') : 'Not available'}</strong></div>
            <div className="flex items-center justify-between"><span>Email (Brevo)</span><strong className={communications?.brevoConfigured ? 'text-success' : 'text-text-muted'}>{communications ? (communications.brevoConfigured ? 'Configured' : 'Not configured') : 'Not available'}</strong></div>
            <div className="flex items-center justify-between"><span>Push</span><strong className={communications?.pushConfigured ? 'text-success' : 'text-text-muted'}>{communications ? (communications.pushConfigured ? 'Configured' : 'Not configured') : 'Not available'}</strong></div>
          </div>
        </div>

        {/* Card 5: Security & Audit - real counts from data already loaded
            for the Security & Audit tab, not a separate fetch. */}
        <div className="p-6 bg-surface dark:bg-card border border-border rounded-2xl space-y-4 shadow-sm relative overflow-hidden hover:border-primary/40 transition-all duration-300">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-text-muted block">Security & Audit</span>
              <h4 className="text-3xl font-display font-black text-text-main flex items-baseline gap-2">
                {admins.length}
                <span className="text-xs text-text-muted font-normal">Platform Admins</span>
              </h4>
            </div>
            <div className="p-3 bg-primary/10 text-primary rounded-xl">
              <ShieldAlert className="w-5 h-5" />
            </div>
          </div>
          <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-text-muted">
            <span>Audit events logged: <strong className="text-text-main font-semibold">{auditLogs.length}</strong></span>
          </div>
        </div>

        {/* Card 6: Organisations */}
        <div className="p-6 bg-surface dark:bg-card border border-border rounded-2xl space-y-4 shadow-sm relative overflow-hidden hover:border-primary/40 transition-all duration-300">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-text-muted block">Organisations</span>
              <h4 className="text-3xl font-display font-black text-text-main">
                {orgs.length}
              </h4>
            </div>
            <div className="p-3 bg-primary/10 text-primary rounded-xl">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
          <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-text-muted">
            <span>Total members across orgs: <strong className="text-text-main font-semibold">{orgs.reduce((sum, o) => sum + (o.memberCount || 0), 0)}</strong></span>
          </div>
        </div>
      </div>
      )}

      {/* Tabs Menu */}
      <div className="flex border-b border-white/5 pb-px overflow-x-auto gap-4">
        {[
          { id: 'overview', label: 'Overview', icon: ShieldCheck },
          { id: 'users', label: 'User Roles & claims', icon: Key },
          { id: 'entitlements', label: 'Plans & Entitlements', icon: CreditCard },
          { id: 'admins', label: 'Promote Platform Admins', icon: ShieldAlert },
          { id: 'orgs', label: 'Organisations', icon: Building2 },
          { id: 'communications', label: 'Communications', icon: MessageSquare },
          { id: 'audit', label: 'Auditor Event Log', icon: Activity },
          { id: 'somatic', label: 'Somatic De-escalation Stats', icon: Heart },
          { id: 'feedback', label: 'Feedback & Testimonials', icon: MessageSquare }
        ].map((tab) => {
          const IconComponent = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              className={`flex items-center gap-2.5 pb-4 px-1 text-sm font-bold tracking-tight border-b-2 transition-all shrink-0 cursor-pointer ${
                activeTab === tab.id 
                  ? 'border-primary text-text-main' 
                  : 'border-transparent text-text-muted hover:text-text-main'
              }`}
            >
              <IconComponent className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Main Content Area */}
      <div className="min-h-[400px]">
        {/* Tab 1: Users & Role Assignment */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="flex flex-col sm:flex-row gap-3 w-full flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    type="text"
                    aria-label="Query accounts by Email or UID"
                    placeholder="Query accounts by Email or UID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-surface dark:bg-card border border-border rounded-xl text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
                <select
                  aria-label="Filter by email verification status"
                  value={verifiedFilter}
                  onChange={(e) => setVerifiedFilter(e.target.value as 'all' | 'verified' | 'unverified')}
                  className="px-3 py-2.5 bg-surface dark:bg-card border border-border rounded-xl text-sm text-text-main focus:outline-none focus:border-primary transition-colors shrink-0"
                >
                  <option value="all">Any email status</option>
                  <option value="verified">Verified only</option>
                  <option value="unverified">Unverified only</option>
                </select>
                <select
                  aria-label="Filter by role"
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="px-3 py-2.5 bg-surface dark:bg-card border border-border rounded-xl text-sm text-text-main focus:outline-none focus:border-primary transition-colors shrink-0"
                >
                  <option value="all">Any role</option>
                  {rolesInView.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <select
                  aria-label="Filter by plan"
                  value={planFilter}
                  onChange={(e) => setPlanFilter(e.target.value)}
                  className="px-3 py-2.5 bg-surface dark:bg-card border border-border rounded-xl text-sm text-text-main focus:outline-none focus:border-primary transition-colors shrink-0"
                >
                  <option value="all">Any plan</option>
                  {GRANTABLE_PLANS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                  <option value="legacy_premium">Legacy Premium</option>
                </select>
              </div>
              <div className="text-xs uppercase tracking-wider font-black text-text-muted shrink-0">
                Displaying {filteredUsers.length} of {users.length}{usersCapped ? '+' : ''} registered
                {usersCapped && <span className="block normal-case font-medium text-[10px] mt-0.5">Showing the first {users.length} - there are more.</span>}
              </div>
            </div>

            {/* Saved Views - a per-browser convenience for quickly re-
                applying a filter combination, not shared state other
                admins need to see. */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Saved Views:</span>
              {savedViews.length === 0 && (
                <span className="text-[11px] text-text-muted italic">None yet</span>
              )}
              {savedViews.map((v) => (
                <span key={v.name} className="inline-flex items-center gap-1 pl-3 pr-1.5 py-1 rounded-lg bg-surface dark:bg-card border border-border text-xs">
                  <button onClick={() => applySavedView(v)} className="text-text-main font-semibold hover:text-primary transition-colors">
                    {v.name}
                  </button>
                  <button
                    onClick={() => deleteSavedView(v.name)}
                    aria-label={`Delete saved view ${v.name}`}
                    title="Delete this saved view"
                    className="p-1 text-text-muted hover:text-destructive transition-colors"
                  >
                    <AlertCircle className="w-3 h-3 rotate-45" />
                  </button>
                </span>
              ))}
              <div className="flex items-center gap-1.5 ml-1">
                <input
                  type="text"
                  aria-label="New saved view name"
                  placeholder="Name this filter combo..."
                  value={newViewName}
                  onChange={(e) => setNewViewName(e.target.value)}
                  className="px-2.5 py-1 bg-surface dark:bg-card border border-border rounded-lg text-xs text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary w-40"
                />
                <button
                  onClick={saveCurrentView}
                  disabled={!newViewName.trim()}
                  className="px-2.5 py-1 bg-primary/10 hover:bg-primary/20 text-[#9a3412] dark:text-primary text-[10px] font-black uppercase tracking-widest rounded-lg transition-all disabled:opacity-40"
                >
                  Save View
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-xs uppercase font-black tracking-widest text-text-muted">Accessing Secure Claims Ledger...</p>
              </div>
            ) : (
              <div className="card p-6 bg-surface dark:bg-card border border-border dark:border-border shadow-xl rounded-2xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/5">
                        <th scope="col" className="pb-3 text-xs font-black uppercase tracking-widest text-text-muted">User ID</th>
                        <th scope="col" className="pb-3 text-xs font-black uppercase tracking-widest text-text-muted">Email Address</th>
                        <th scope="col" className="pb-3 text-xs font-black uppercase tracking-widest text-text-muted">Lifecycle</th>
                        <th scope="col" className="pb-3 text-xs font-black uppercase tracking-widest text-text-muted">Role</th>
                        <th scope="col" className="pb-3 text-xs font-black uppercase tracking-widest text-text-muted">Plan</th>
                        <th scope="col" className="pb-3 text-xs font-black uppercase tracking-widest text-text-muted">Date Joined</th>
                        <th scope="col" className="pb-3 text-xs font-black uppercase tracking-widest text-text-muted">Last Active</th>
                        <th scope="col" className="pb-3 text-xs font-black uppercase tracking-widest text-text-muted text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      {filteredUsers.map((u) => {
                        const lifecycle = lifecycleOf(u);
                        return (
                        <tr key={u.uid} className="border-b border-white/[0.02] hover:bg-white/5 transition-colors">
                          <td className="py-4 text-text-muted font-mono text-[10px] truncate max-w-[110px]" title={u.uid}>{u.uid}</td>
                          <td className="py-4 font-bold text-text-main">
                            {u.email || (
                              <span className="font-normal italic text-text-muted">
                                {u.isAnonymous ? 'No email (anonymous/demo account)' : 'No email on record'}
                              </span>
                            )}
                            {!u.emailVerified && u.email && (
                              <span className="block text-[10px] font-normal normal-case text-[#9a3412] dark:text-warning mt-0.5">Unverified</span>
                            )}
                          </td>
                          <td className="py-4">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest ${
                              lifecycle.tone === 'active' ? 'bg-success/10 text-success dark:text-[#4ade80]'
                              : lifecycle.tone === 'destructive' ? 'bg-destructive/10 text-destructive dark:text-[#f87171]'
                              : lifecycle.tone === 'warning' ? 'bg-warning/10 text-[#9a3412] dark:text-warning'
                              : 'bg-surface text-text-muted'
                            }`}>
                              {lifecycle.label}
                            </span>
                          </td>
                          <td className="py-4 text-text-muted text-xs font-mono">{u.role || 'user'}</td>
                          <td className="py-4">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest ${
                              u.plan === 'executive' ? 'bg-primary/10 text-primary'
                              : u.plan === 'performance' ? 'bg-success/10 text-success dark:text-[#4ade80]'
                              : u.plan === 'core' ? 'bg-info/10 text-info'
                              : u.plan === 'legacy_premium' ? 'bg-warning/10 text-[#9a3412] dark:text-warning'
                              : 'bg-surface text-text-muted'
                            }`}>
                              {u.plan ? PLAN_LABELS[u.plan] || u.plan : 'Unknown'}
                            </span>
                            {u.entitlementStatus && u.entitlementStatus !== 'active' && u.plan !== 'free' && (
                              <span className="block text-[10px] text-text-muted mt-1 normal-case">{u.entitlementStatus}</span>
                            )}
                          </td>
                          <td className="py-4 text-text-muted text-xs">{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'Unknown'}</td>
                          <td className="py-4 text-text-muted text-xs">{u.lastSignIn ? new Date(u.lastSignIn).toLocaleDateString() : 'Unknown'}</td>
                          <td className="py-4 text-right">
                            <button
                              onClick={() => openAccountDrawer(u)}
                              className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-[#9a3412] dark:text-primary text-[10px] font-black uppercase tracking-widest rounded-lg transition-all"
                            >
                              Manage Account
                            </button>
                          </td>
                        </tr>
                        );
                      })}
                      {filteredUsers.length === 0 && (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-text-muted text-sm italic">
                            No matching user accounts registered on this node.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Plans & Entitlements - provenance (who/what granted this
            account's access), whether the stored grant is actually live
            right now, and an Access Timeline of every grant_entitlement
            audit event for that account. Reuses the same users/auditLogs
            data already loaded for People/Security & Audit - no separate
            fetch - and the same Account Control Drawer for making
            changes, rather than a second, duplicate editing surface. */}
        {activeTab === 'entitlements' && (
          <div className="space-y-6">
            <p className="text-xs text-text-muted leading-relaxed max-w-2xl">
              Every row below is this account's real stored entitlement record - not a derived guess. "Effective" shows whether that grant is live right now; a "Live" grant can still show "Expired" here once its end date passes, even though nothing else about the record changed.
            </p>
            {loading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-xs uppercase font-black tracking-widest text-text-muted">Accessing Secure Claims Ledger...</p>
              </div>
            ) : (
              <div className="card p-6 bg-surface dark:bg-card border border-border dark:border-border shadow-xl rounded-2xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/5">
                        <th scope="col" className="pb-3 text-xs font-black uppercase tracking-widest text-text-muted">Account</th>
                        <th scope="col" className="pb-3 text-xs font-black uppercase tracking-widest text-text-muted">Stored Plan</th>
                        <th scope="col" className="pb-3 text-xs font-black uppercase tracking-widest text-text-muted">Effective</th>
                        <th scope="col" className="pb-3 text-xs font-black uppercase tracking-widest text-text-muted">Source</th>
                        <th scope="col" className="pb-3 text-xs font-black uppercase tracking-widest text-text-muted">Expires</th>
                        <th scope="col" className="pb-3 text-xs font-black uppercase tracking-widest text-text-muted">Last Verified</th>
                        <th scope="col" className="pb-3 text-xs font-black uppercase tracking-widest text-text-muted text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      {filteredUsers.map((u) => {
                        const effective = entitlementEffectiveState(u);
                        const timeline = auditLogs.filter((log) => log.action === 'grant_entitlement' && log.targetUid === u.uid);
                        return (
                          <React.Fragment key={u.uid}>
                            <tr className="border-b border-white/[0.02] hover:bg-white/5 transition-colors">
                              <td className="py-4 font-bold text-text-main max-w-[220px] truncate" title={u.email || u.uid}>
                                {u.email || <span className="font-normal italic text-text-muted">{u.isAnonymous ? 'No email (demo account)' : 'No email on record'}</span>}
                              </td>
                              <td className="py-4">
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest ${
                                  u.storedPlan === 'executive' ? 'bg-primary/10 text-primary'
                                  : u.storedPlan === 'performance' ? 'bg-success/10 text-success dark:text-[#4ade80]'
                                  : u.storedPlan === 'core' ? 'bg-info/10 text-info'
                                  : u.storedPlan === 'legacy_premium' ? 'bg-warning/10 text-[#9a3412] dark:text-warning'
                                  : 'bg-surface text-text-muted'
                                }`}>
                                  {u.storedPlan ? PLAN_LABELS[u.storedPlan] || u.storedPlan : 'Unknown'}
                                </span>
                              </td>
                              <td className="py-4">
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest ${
                                  effective.tone === 'active' ? 'bg-success/10 text-success dark:text-[#4ade80]'
                                  : effective.tone === 'warning' ? 'bg-warning/10 text-[#9a3412] dark:text-warning'
                                  : 'bg-surface text-text-muted'
                                }`}>
                                  {effective.label}
                                </span>
                                {u.cancelAtPeriodEnd && effective.tone === 'active' && (
                                  <span className="block text-[10px] text-text-muted mt-1 normal-case">Not renewing</span>
                                )}
                              </td>
                              <td className="py-4 text-text-muted text-xs">
                                {u.billingSource ? (BILLING_SOURCE_LABELS[u.billingSource] || u.billingSource) : 'Not connected'}
                              </td>
                              <td className="py-4 text-text-muted text-xs">{u.entitlementEnd ? new Date(u.entitlementEnd).toLocaleDateString() : 'No fixed end'}</td>
                              <td className="py-4 text-text-muted text-xs">{u.lastVerifiedAt ? new Date(u.lastVerifiedAt).toLocaleDateString() : 'Never'}</td>
                              <td className="py-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => setExpandedTimelineUid(expandedTimelineUid === u.uid ? null : u.uid)}
                                    disabled={timeline.length === 0}
                                    className="px-3 py-1.5 bg-surface hover:bg-border text-text-muted text-[10px] font-black uppercase tracking-widest rounded-lg transition-all disabled:opacity-40"
                                  >
                                    Timeline ({timeline.length})
                                  </button>
                                  <button
                                    onClick={() => openAccountDrawer(u)}
                                    className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-[#9a3412] dark:text-primary text-[10px] font-black uppercase tracking-widest rounded-lg transition-all"
                                  >
                                    Manage
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {expandedTimelineUid === u.uid && timeline.length > 0 && (
                              <tr className="border-b border-white/[0.02] bg-background/40">
                                <td colSpan={7} className="py-3 px-2">
                                  <div className="space-y-2 pl-2 border-l-2 border-primary/30">
                                    {timeline.map((log) => (
                                      <div key={log.id} className="text-xs text-text-muted">
                                        <span className="font-mono text-[10px] text-text-muted">{new Date(log.createdAt).toLocaleString()}</span>
                                        {' — '}
                                        <span className="text-text-main font-semibold">{log.actorEmail}</span> granted{' '}
                                        <span className="text-text-main">{PLAN_LABELS[log.metadata?.plan] || log.metadata?.plan}</span>
                                        {log.metadata?.previousPlan && (
                                          <span> (from {PLAN_LABELS[log.metadata.previousPlan] || log.metadata.previousPlan}, {log.metadata.planChange})</span>
                                        )}
                                        {log.metadata?.durationDays && <span> for {log.metadata.durationDays} day{log.metadata.durationDays === 1 ? '' : 's'}</span>}
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                      {filteredUsers.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-text-muted text-sm italic">
                            No matching user accounts registered on this node.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Promoting Platform Admins */}
        {activeTab === 'admins' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Invite Form */}
            <div className="card p-6 bg-surface dark:bg-card border border-border rounded-2xl h-fit space-y-6">
              <h4 className="font-display text-lg font-bold text-text-main flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-primary" /> Promote Admin Account
              </h4>
              <p className="text-xs text-text-muted leading-relaxed">
                Enter an existing user's email to elevate them to administrative levels. This applies permanent custom claims and logs their role inside the collective admin registry.
              </p>

              <form onSubmit={handleAddAdmin} className="space-y-4">
                <div>
                  <label htmlFor="admin-new-admin-email" className="block text-xs font-black uppercase tracking-wider text-text-muted mb-2">User Email</label>
                  <input
                    id="admin-new-admin-email"
                    type="email"
                    required
                    placeholder="Enter email e.g. team@example.com"
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    className="w-full px-4 py-2.5 bg-surface dark:bg-card border border-border rounded-xl text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label htmlFor="admin-new-admin-name" className="block text-xs font-black uppercase tracking-wider text-text-muted mb-2">Display Name (Optional)</label>
                  <input
                    id="admin-new-admin-name"
                    type="text"
                    placeholder="E.g. Nova Analyst"
                    value={newAdminName}
                    onChange={(e) => setNewAdminName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-surface dark:bg-card border border-border rounded-xl text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label htmlFor="admin-new-admin-role" className="block text-xs font-black uppercase tracking-wider text-text-muted mb-2">Assign Admin Role</label>
                  <select
                    id="admin-new-admin-role"
                    value={newAdminRole}
                    onChange={(e) => setNewAdminRole(e.target.value)}
                    className="w-full p-3 bg-surface border border-border rounded-xl text-sm text-text-main focus:outline-none focus:border-primary"
                  >
                    {PLATFORM_ADMIN_ROLES.map((role) => (
                      <option key={role} value={role}>{PLATFORM_ADMIN_ROLE_LABELS[role]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="admin-new-admin-reason" className="block text-xs font-black uppercase tracking-wider text-text-muted mb-2">Reason (required)</label>
                  <input
                    id="admin-new-admin-reason"
                    type="text"
                    required
                    minLength={3}
                    maxLength={500}
                    placeholder="Why does this account need this access?"
                    value={newAdminReason}
                    onChange={(e) => setNewAdminReason(e.target.value)}
                    className="w-full px-4 py-2.5 bg-surface dark:bg-card border border-border rounded-xl text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label htmlFor="admin-new-admin-escalation" className="block text-xs font-black uppercase tracking-wider text-text-muted mb-2">Temporary Escalation (hours, optional)</label>
                  <input
                    id="admin-new-admin-escalation"
                    type="number"
                    min={1}
                    max={720}
                    placeholder="Leave blank for a permanent grant"
                    value={newAdminEscalationHours}
                    onChange={(e) => setNewAdminEscalationHours(e.target.value)}
                    className="w-full px-4 py-2.5 bg-surface dark:bg-card border border-border rounded-xl text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary"
                  />
                  <p className="text-[10px] text-text-muted mt-1.5">Set this for incident-response or time-boxed access - the role expires itself, enforced server-side, with no need to remember to revoke it.</p>
                </div>

                <button
                  type="submit"
                  disabled={isAddingAdmin || !newAdminReason.trim()}
                  className="w-full btn-primary py-3 flex items-center justify-center gap-2 group text-xs uppercase tracking-widest disabled:opacity-50"
                >
                  {isAddingAdmin ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  Promote to Admin
                </button>
              </form>
            </div>

            {/* Admin Users Registry List */}
            <div className="lg:col-span-2 card p-6 bg-surface dark:bg-card border border-border rounded-2xl">
              <div className="flex items-center justify-between mb-6">
                <h4 className="text-sm font-bold text-text-main">Active Administrator Registry</h4>
                <div className="text-right">
                  <div className="text-xs uppercase font-black tracking-widest text-text-muted">
                    Total Admins: {admins.length}
                  </div>
                  {admins.length > 0 && (
                    <div className={`text-[10px] font-bold uppercase tracking-wide mt-0.5 ${
                      admins.every((a) => a.mfaEnabled) ? 'text-success dark:text-[#4ade80]' : 'text-[#9a3412] dark:text-warning'
                    }`}>
                      {admins.filter((a) => a.mfaEnabled).length} / {admins.length} have MFA enabled
                    </div>
                  )}
                </div>
              </div>

              {/* Change Role form - targets changeRoleTarget, set by the
                  per-row "Change Role" button below. */}
              <AnimatePresence>
                {changeRoleTarget && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-6 p-5 bg-primary/5 rounded-2xl border border-primary/20 space-y-3 overflow-hidden"
                  >
                    <h5 className="font-display text-sm font-bold text-text-main">Change Role: {changeRoleTarget.displayName || changeRoleTarget.email}</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <select
                        aria-label="New role"
                        value={changeRoleValue}
                        onChange={(e) => setChangeRoleValue(e.target.value)}
                        className="w-full p-3 bg-surface border border-border rounded-xl text-sm text-text-main focus:outline-none focus:border-primary"
                      >
                        {PLATFORM_ADMIN_ROLES.map((role) => (
                          <option key={role} value={role}>{PLATFORM_ADMIN_ROLE_LABELS[role]}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        max={720}
                        placeholder="Temporary escalation (hours, optional)"
                        value={changeRoleEscalationHours}
                        onChange={(e) => setChangeRoleEscalationHours(e.target.value)}
                        className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary"
                      />
                    </div>
                    <input
                      type="text"
                      required
                      minLength={3}
                      maxLength={500}
                      placeholder="Reason (required)"
                      value={changeRoleReason}
                      onChange={(e) => setChangeRoleReason(e.target.value)}
                      className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary"
                    />
                    <div className="flex gap-3 justify-end">
                      <button
                        onClick={() => setChangeRoleTarget(null)}
                        className="px-4 py-2 bg-transparent text-text-muted hover:text-text-main text-xs font-bold uppercase tracking-wider transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleChangeAdminRole}
                        disabled={isChangingRole || !changeRoleReason.trim()}
                        className="px-5 py-2.5 bg-primary hover:bg-primary-dark text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 disabled:opacity-50"
                      >
                        {isChangingRole ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        Update Role
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th scope="col" className="pb-3 text-xs font-black uppercase tracking-widest text-text-muted">Administrator</th>
                      <th scope="col" className="pb-3 text-xs font-black uppercase tracking-widest text-text-muted">Assigned Role</th>
                      <th scope="col" className="pb-3 text-xs font-black uppercase tracking-widest text-text-muted">2FA</th>
                      <th scope="col" className="pb-3 text-xs font-black uppercase tracking-widest text-text-muted text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {admins.map((adminUser) => {
                      const isExpired = !!adminUser.expiresAt && Date.parse(adminUser.expiresAt) < Date.now();
                      return (
                      <tr key={adminUser.uid} className="border-b border-white/[0.02] hover:bg-white/5 transition-colors">
                        <td className="py-4">
                          <div className="font-bold text-text-main">{adminUser.displayName}</div>
                          <div className="text-xs text-text-muted font-mono">{adminUser.email}</div>
                          {adminUser.reason && (
                            <div className="text-[10px] text-text-muted mt-1 italic max-w-xs truncate" title={adminUser.reason}>"{adminUser.reason}"</div>
                          )}
                        </td>
                        <td className="py-4">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                            adminUser.role === 'platform_owner'
                              ? 'bg-destructive/10 text-destructive dark:text-[#f87171] border border-destructive/20'
                              : adminUser.role === 'platform_admin'
                              ? 'bg-primary/10 text-[#9a3412] dark:text-primary border border-primary/20'
                              : 'bg-accent/10 text-[#9a3412] dark:text-[#fdba74] border border-accent/20'
                          }`}>
                            {adminUser.role.replace('_', ' ')}
                          </span>
                          {adminUser.expiresAt && (
                            <span className={`block text-[10px] mt-1.5 font-bold uppercase tracking-wide ${isExpired ? 'text-destructive dark:text-[#f87171]' : 'text-text-muted normal-case'}`}>
                              {isExpired ? 'Escalation expired - access already revoked' : `Expires ${new Date(adminUser.expiresAt).toLocaleString()}`}
                            </span>
                          )}
                        </td>
                        <td className="py-4">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest ${
                            adminUser.mfaEnabled ? 'bg-success/10 text-success dark:text-[#4ade80]' : 'bg-warning/10 text-[#9a3412] dark:text-warning'
                          }`}>
                            {adminUser.mfaEnabled ? 'Enabled' : 'Not enabled'}
                          </span>
                        </td>
                        <td className="py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setChangeRoleTarget(adminUser);
                                setChangeRoleValue(adminUser.role);
                                setChangeRoleReason('');
                                setChangeRoleEscalationHours('');
                              }}
                              className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-[#9a3412] dark:text-primary text-[10px] font-black uppercase tracking-widest rounded-lg transition-all"
                            >
                              Change Role
                            </button>
                            <button
                              onClick={() => setPendingAction({ type: 'revokeAdmin', uid: adminUser.uid, email: adminUser.email })}
                              aria-label={`Revoke admin claims for ${adminUser.displayName}`}
                              className="p-2 text-destructive hover:bg-destructive/10 rounded-xl transition-all"
                              title="Revoke Admin claims"
                            >
                              <UserMinus className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                    {admins.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-12 text-center text-text-muted text-sm italic">
                          No administrative promotions logged yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab: Organisations (customer B2B provisioning) */}
        {activeTab === 'orgs' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="card p-6 bg-surface dark:bg-card border border-border rounded-2xl h-fit space-y-6">
              <h4 className="font-display text-lg font-bold text-text-main flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" /> {editingOrgId ? 'Edit Organisation' : 'Provision New Organisation'}
              </h4>
              <p className="text-xs text-text-muted leading-relaxed">
                {editingOrgId
                  ? 'Updates this organisation\'s name and privacy threshold. The ID and join code stay fixed.'
                  : 'Creates a new customer organisation. If you designate an initial admin, they must already have a Blaze Break account under that email.'}
              </p>
              {orgFormError && (
                <div role="alert" className="p-3 bg-destructive/10 border border-destructive/20 text-destructive dark:text-[#f87171] text-xs rounded-xl">{orgFormError}</div>
              )}
              <div className="space-y-4">
                <div>
                  <label htmlFor="admin-org-id" className="text-xs font-bold uppercase tracking-widest text-text-muted block mb-1.5">Organisation ID (slug)</label>
                  <input
                    id="admin-org-id"
                    type="text"
                    value={newOrgId}
                    onChange={(e) => setNewOrgId(e.target.value)}
                    disabled={!!editingOrgId}
                    placeholder="e.g. acme-corp"
                    className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-text-main focus:outline-none focus:border-primary disabled:opacity-60"
                  />
                </div>
                <div>
                  <label htmlFor="admin-org-name" className="text-xs font-bold uppercase tracking-widest text-text-muted block mb-1.5">Display Name</label>
                  <input
                    id="admin-org-name"
                    type="text"
                    value={newOrgName}
                    onChange={(e) => setNewOrgName(e.target.value)}
                    placeholder="e.g. Acme Corp"
                    className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-text-main focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label htmlFor="admin-org-threshold" className="text-xs font-bold uppercase tracking-widest text-text-muted block mb-1.5">Minimum Cohort Size</label>
                  <input
                    id="admin-org-threshold"
                    type="number"
                    min="3"
                    max="100"
                    value={newOrgThreshold}
                    onChange={(e) => setNewOrgThreshold(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-text-main focus:outline-none focus:border-primary"
                  />
                  <p className="text-[11px] text-text-muted mt-1">Aggregate dashboards stay locked below this many opted-in members.</p>
                </div>
                {!editingOrgId && (
                  <div>
                    <label htmlFor="admin-org-email" className="text-xs font-bold uppercase tracking-widest text-text-muted block mb-1.5">Initial Admin Email (optional)</label>
                    <input
                      id="admin-org-email"
                      type="email"
                      value={newOrgAdminEmail}
                      onChange={(e) => setNewOrgAdminEmail(e.target.value)}
                      placeholder="hr-lead@acmecorp.com"
                      className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-text-main focus:outline-none focus:border-primary"
                    />
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                {editingOrgId && (
                  <button
                    onClick={cancelEditingOrg}
                    className="px-4 py-3 bg-transparent text-text-muted hover:text-text-main text-xs font-bold uppercase tracking-wider transition-colors"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={handleCreateOrg}
                  disabled={isCreatingOrg || !newOrgId.trim() || !newOrgName.trim()}
                  className="flex-1 py-3 bg-primary hover:opacity-90 text-primary-foreground text-xs font-bold uppercase tracking-widest rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isCreatingOrg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {editingOrgId ? 'Update Organisation' : 'Create Organisation'}
                </button>
              </div>
            </div>

            <div className="lg:col-span-2 space-y-4">
              <h4 className="font-display text-lg font-bold text-text-main">Existing Organisations ({orgs.length})</h4>
              {orgs.length === 0 ? (
                <div className="p-12 text-center border-2 border-dashed border-border rounded-2xl">
                  <Building2 className="w-8 h-8 mx-auto text-text-muted mb-3 opacity-40" />
                  <p className="text-text-muted text-sm">No organisations provisioned yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {orgs.map(org => (
                    <div key={org.id} className="card p-5 bg-surface dark:bg-card border border-border rounded-xl">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <h5 className="font-bold text-text-main">{org.name}</h5>
                          <p className="text-xs text-text-muted font-mono">{org.id}</p>
                          {org.createdAt && <p className="text-[10px] text-text-muted mt-0.5">Created {new Date(org.createdAt).toLocaleDateString()}</p>}
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-text-muted"><strong className="text-text-main">{org.memberCount}</strong> members</span>
                          <span className="text-text-muted"><strong className="text-text-main">{org.adminCount}</strong> admins</span>
                          <span className="text-text-muted">min <strong className="text-text-main">{org.privacyThreshold}</strong></span>
                          {org.billingPlan && (
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest ${
                              org.billingPlan === 'enterprise' ? 'bg-primary/10 text-primary'
                              : org.billingPlan === 'business' ? 'bg-success/10 text-success dark:text-[#4ade80]'
                              : org.billingPlan === 'starter' ? 'bg-info/10 text-info'
                              : 'bg-surface text-text-muted'
                            }`}>
                              {org.billingPlan}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-2 pt-3 border-t border-border">
                        <span className="text-[11px] uppercase font-bold tracking-widest text-text-muted">Join Code</span>
                        <span className="font-mono text-sm font-bold text-[#9a3412] dark:text-primary bg-primary/10 px-3 py-1 rounded-lg tracking-widest">{org.joinCode}</span>
                        <button
                          onClick={() => { navigator.clipboard.writeText(org.joinCode); showSuccess('Join code copied'); }}
                          aria-label={`Copy join code for ${org.name}`}
                          className="p-1.5 text-text-muted hover:text-primary transition-colors"
                          title="Copy join code"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <div className="flex-1" />
                        <button
                          onClick={() => startEditingOrg(org)}
                          className="px-3 py-1.5 bg-surface hover:bg-border text-text-muted text-[10px] font-black uppercase tracking-widest rounded-lg transition-all"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => toggleOrgDetail(org.id)}
                          className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-[#9a3412] dark:text-primary text-[10px] font-black uppercase tracking-widest rounded-lg transition-all"
                        >
                          {expandedOrgId === org.id ? 'Hide Detail' : 'View Detail'}
                        </button>
                      </div>

                      {expandedOrgId === org.id && (
                        <div className="mt-3 pt-3 border-t border-border space-y-3">
                          {isLoadingOrgDetail ? (
                            <div className="flex items-center justify-center py-6">
                              <Loader2 className="w-5 h-5 animate-spin text-primary" />
                            </div>
                          ) : orgDetail ? (
                            <>
                              <div className="flex flex-wrap items-center gap-4 text-xs">
                                <span className="text-text-muted">Billing: <strong className="text-text-main capitalize">{orgDetail.billing.plan}</strong> ({orgDetail.billing.status})</span>
                                <span className="text-text-muted">Seats: <strong className="text-text-main">{orgDetail.billing.seatCount}</strong></span>
                                <span className="text-text-muted">Contact: <strong className="text-text-main">{orgDetail.billing.billingContact || 'Not set'}</strong></span>
                                {orgDetail.billingProvider === 'null' && (
                                  <span className="text-[10px] text-text-muted italic">(No real billing provider connected - admin-managed seat count only)</span>
                                )}
                              </div>
                              <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-2">Members ({orgDetail.members.length}) - access level only, never wellbeing content</p>
                                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                  {orgDetail.members.map((m) => (
                                    <div key={m.uid} className="flex items-center justify-between text-xs py-1.5 px-2.5 bg-background rounded-lg">
                                      <span className="text-text-main font-mono truncate max-w-[200px]" title={m.email || m.uid}>{m.email || m.uid}</span>
                                      <span className="text-text-muted uppercase text-[10px] font-bold">{m.role} - {m.status}</span>
                                    </div>
                                  ))}
                                  {orgDetail.members.length === 0 && (
                                    <p className="text-xs text-text-muted italic py-2">No members yet.</p>
                                  )}
                                </div>
                              </div>
                            </>
                          ) : (
                            <p className="text-xs text-text-muted italic">Couldn't load organisation detail.</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Communications - provider configuration status (reused from the
            Overview card) plus the real SMS/WhatsApp usage breakdown
            already computed by /api/admin/cost-usage for Support Circle
            cost visibility. Email/Push have no aggregate send-volume
            tracking anywhere in this codebase today, so this says so
            rather than fabricating a count. */}
        {activeTab === 'communications' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {([
                { key: 'twilioConfigured' as const, label: 'SMS / WhatsApp (Twilio)', envHint: 'TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN' },
                { key: 'brevoConfigured' as const, label: 'Email (Brevo)', envHint: 'BREVO_API_KEY' },
                { key: 'pushConfigured' as const, label: 'Push', envHint: 'VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY' },
              ]).map((p) => {
                const isConfigured = communications ? communications[p.key] : false;
                return (
                  <div key={p.key} className="p-5 bg-surface dark:bg-card border border-border rounded-2xl">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-black uppercase tracking-widest text-text-muted">{p.label}</span>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest ${
                        isConfigured ? 'bg-success/10 text-success dark:text-[#4ade80]' : 'bg-surface text-text-muted'
                      }`}>
                        {communications ? (isConfigured ? 'Configured' : 'Not configured') : 'Not available'}
                      </span>
                    </div>
                    <p className="text-[10px] text-text-muted font-mono">{p.envHint}</p>
                  </div>
                );
              })}
            </div>

            <div className="card p-6 bg-surface dark:bg-card border border-border rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-display text-sm font-bold text-text-main">SMS / WhatsApp Usage ({commsUsage?.periodDays ?? 7}d)</h4>
                <span className="text-[10px] text-text-muted italic">Rough internal estimate, not live provider billing - see docs/COST_MONITORING.md</span>
              </div>
              {commsUsage ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 bg-background rounded-xl">
                      <span className="text-[10px] font-black uppercase tracking-widest text-text-muted block mb-1">Guardian Alerts</span>
                      <span className="text-2xl font-display font-black text-text-main">{commsUsage.smsByCategory.guardian_alert}</span>
                      <p className="text-[10px] text-text-muted mt-1">Safety feature - exempt from the aggregate cap below</p>
                    </div>
                    <div className="p-4 bg-background rounded-xl">
                      <span className="text-[10px] font-black uppercase tracking-widest text-text-muted block mb-1">Ally Nudges</span>
                      <span className="text-2xl font-display font-black text-text-main">{commsUsage.smsByCategory.ally_nudge}</span>
                    </div>
                    <div className="p-4 bg-background rounded-xl">
                      <span className="text-[10px] font-black uppercase tracking-widest text-text-muted block mb-1">Manual Sends</span>
                      <span className="text-2xl font-display font-black text-text-main">{commsUsage.smsByCategory.manual_send}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-border text-xs">
                    <span className="text-text-muted">Total segments: <strong className="text-text-main">{commsUsage.smsSegmentCount}</strong></span>
                    <span className="text-text-muted">Estimated cost: <strong className="text-text-main">${commsUsage.estimatedCostUsd.smsUsd.toFixed(2)}</strong></span>
                  </div>
                </>
              ) : (
                <p className="text-sm text-text-muted italic">Couldn't load usage data.</p>
              )}
              <div className="p-3 bg-background rounded-xl text-[10px] text-text-muted leading-relaxed">
                <strong className="text-text-main">Guardrail policy:</strong> Ally Nudge and Manual Send are capped per-account at 20/day and 150/month (sms-guardrails.ts) to limit runaway cost/abuse. Guardian Alert has its own dedicated, tighter safety limiter and is never subject to this shared cap - a safety alert can never be silently swallowed because an account used up an unrelated SMS quota.
              </div>
            </div>

            <div className="card p-6 bg-surface dark:bg-card border border-border rounded-2xl">
              <h4 className="font-display text-sm font-bold text-text-main mb-2">Email & Push Volume</h4>
              <p className="text-xs text-text-muted leading-relaxed">Not yet tracked. Configuration status above reflects whether credentials are present; neither provider's send volume is aggregated anywhere in this codebase today, so no count is shown rather than a fabricated one.</p>
            </div>
          </div>
        )}

        {/* Tab 3: Audit Timeline */}
        {activeTab === 'audit' && (
          <div className="card p-6 bg-surface dark:bg-card border border-border rounded-2xl">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 mb-6">
              <div>
                <h4 className="text-sm font-bold text-text-main">Audit Event Trail</h4>
                <p className="text-xs text-text-muted mt-0.5">
                  Immutable administrative security activity registry - firestore.rules denies all client writes to this collection (<code className="font-mono">allow write: if false</code>); only server-side admin actions can ever append to it.
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <select
                  aria-label="Filter by category"
                  value={auditCategoryFilter}
                  onChange={(e) => setAuditCategoryFilter(e.target.value as typeof auditCategoryFilter)}
                  className="px-3 py-2 bg-surface dark:bg-card border border-border rounded-xl text-xs text-text-main focus:outline-none focus:border-primary"
                >
                  <option value="all">All categories</option>
                  {Object.keys(AUDIT_CATEGORIES).map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <div className="text-xs uppercase font-black tracking-widest text-text-muted">
                  Showing {filteredAuditLogs.length} of {auditLogs.length}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {filteredAuditLogs.map((log) => (
                <div key={log.id} className="p-4 bg-card hover:bg-white/[0.01] rounded-xl border border-white/5 transition-all flex items-start gap-4">
                  <div className={`p-2 rounded-lg shrink-0 ${
                    log.action.includes('suspend') 
                      ? 'bg-destructive/10 text-destructive' 
                      : log.action.includes('role')
                      ? 'bg-primary/10 text-primary'
                      : 'bg-success/10 text-success dark:text-[#4ade80]'
                  }`}>
                    <Activity className="w-4 h-4" />
                  </div>
                  <div className="flex-1 space-y-1 min-w-0">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-xs font-black uppercase tracking-wider text-text-main font-mono">{log.action.replace(/_/g, ' ')}</span>
                      <span className="text-[10px] text-text-muted shrink-0 font-mono">{new Date(log.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-text-muted leading-relaxed">
                      Admin <span className="font-bold text-text-main">{log.actorEmail}</span> executed action targeting <span className="font-mono text-text-main select-all">{log.targetUid || log.targetEmail}</span>.
                    </p>
                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <div className="p-2.5 bg-surface rounded-lg text-[10px] font-mono text-text-muted mt-2 border border-white/5 max-w-lg truncate">
                        Details: {JSON.stringify(log.metadata)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {filteredAuditLogs.length === 0 && (
                <div className="py-12 text-center text-text-muted text-sm italic">
                  {auditLogs.length === 0 ? 'No administrative actions are logged in this ledger yet.' : 'No events in this category.'}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab: Feedback & Testimonials */}
        {activeTab === 'feedback' && (
          <div className="card p-6 bg-surface dark:bg-card border border-border rounded-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h4 className="text-sm font-bold text-text-main">User Feedback & Testimonials</h4>
                <p className="text-xs text-text-muted mt-0.5">Submissions land here privately - nothing shown here is ever displayed publicly on its own.</p>
              </div>
              <div className="text-xs uppercase font-black tracking-widest text-text-muted">
                Submissions: {feedbackSubmissions.length}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-5">
              {(['all', 'general', 'bug', 'feature_request', 'testimonial'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFeedbackCategoryFilter(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold tracking-tight border transition-all cursor-pointer ${
                    feedbackCategoryFilter === cat
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-white/10 text-text-muted hover:text-text-main'
                  }`}
                >
                  {cat === 'all' ? 'All' : formatFeedbackCategory(cat)}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              {feedbackSubmissions
                .filter((item) => feedbackCategoryFilter === 'all' || item.category === feedbackCategoryFilter)
                .map((item) => (
                  <div key={item.id} className="p-4 bg-card hover:bg-white/[0.01] rounded-xl border border-white/5 transition-all">
                    <div className="flex items-center justify-between gap-4 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black uppercase tracking-wider text-text-main font-mono">
                          {formatFeedbackCategory(item.category)}
                        </span>
                        {item.category === 'testimonial' && item.publicUseConsent && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-success/10 text-success dark:text-[#4ade80] border border-success/20">
                            Cleared for public use
                          </span>
                        )}
                        {item.rating != null && (
                          <span className="flex items-center gap-0.5 text-[10px] text-text-muted">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star key={i} className={`w-3 h-3 ${i < item.rating! ? 'fill-primary text-primary' : 'text-text-muted'}`} />
                            ))}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-text-muted font-mono">{new Date(item.createdAt).toLocaleString()}</span>
                        <button
                          onClick={() => { navigator.clipboard.writeText(item.message); showSuccess('Feedback copied'); }}
                          aria-label={`Copy feedback from ${item.userEmail}`}
                          className="p-1.5 text-text-muted hover:text-primary transition-colors"
                          title="Copy feedback"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-text-muted leading-relaxed whitespace-pre-wrap">{item.message}</p>
                    <p className="text-[10px] text-text-muted mt-2 font-mono">{item.userEmail}</p>
                  </div>
                ))}
              {feedbackSubmissions.length === 0 && (
                <div className="py-12 text-center text-text-muted text-sm italic">
                  No feedback or testimonials submitted yet.
                </div>
              )}
              {feedbackSubmissions.length > 0 && feedbackSubmissions.filter((item) => feedbackCategoryFilter === 'all' || item.category === feedbackCategoryFilter).length === 0 && (
                <div className="py-12 text-center text-text-muted text-sm italic">
                  No submissions match this filter.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 4: Somatic & GAD Analytics */}
        {activeTab === 'somatic' && metrics && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="p-5 bg-surface dark:bg-card border border-border rounded-2xl space-y-1">
                <span className="text-xs font-black uppercase tracking-wider text-text-muted block">Total De-escalations</span>
                <h3 className="text-3xl font-display font-bold text-text-main">{metrics.totalSessions}</h3>
                <span className="text-[10px] text-success dark:text-[#4ade80] font-semibold flex items-center gap-1">
                  <Heart className="w-3 h-3 fill-current" /> Active Somatic Handrails
                </span>
              </div>
              <div className="p-5 bg-surface dark:bg-card border border-border rounded-2xl space-y-1">
                <span className="text-xs font-black uppercase tracking-wider text-text-muted block">Average Entry Intensity</span>
                <h3 className="text-3xl font-display font-bold text-destructive dark:text-[#f87171]">{metrics.avgStartIntensity} <span className="text-xs text-text-muted">/10</span></h3>
                <span className="text-[10px] text-text-muted">Subjective GAD Stress Baseline</span>
              </div>
              <div className="p-5 bg-surface dark:bg-card border border-border rounded-2xl space-y-1">
                <span className="text-xs font-black uppercase tracking-wider text-text-muted block">Average Exit Intensity</span>
                <h3 className="text-3xl font-display font-bold text-success dark:text-[#4ade80]">{metrics.avgEndIntensity} <span className="text-xs text-text-muted">/10</span></h3>
                <span className="text-[10px] text-text-muted">Post-Somatic Stabilisation State</span>
              </div>
              <div className="p-5 bg-surface dark:bg-card border border-border rounded-2xl space-y-1">
                <span className="text-xs font-black uppercase tracking-wider text-text-muted block">System Effectiveness</span>
                <h3 className="text-3xl font-display font-bold text-[#9a3412] dark:text-primary">{metrics.avgReduction} <span className="text-xs text-text-muted">pts</span></h3>
                <span className="text-[10px] text-success dark:text-[#4ade80] font-semibold">Average Arousal Drop (0-10 scale)</span>
              </div>
            </div>

            {/* Deeper tool engagement and effectiveness table */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 card p-6 bg-surface dark:bg-card border border-border rounded-2xl space-y-4">
                <div>
                  <h4 className="text-sm font-bold text-text-main">Somatic Reset Tool Engagement Rate</h4>
                  <p className="text-xs text-text-muted mt-0.5">Most active autonomic sensory handrails deployed by burned-out professionals</p>
                </div>

                <div className="space-y-4 pt-4">
                  {Object.keys(metrics.toolUsage).length === 0 ? (
                    <p className="text-xs text-text-muted italic">No somatic resets logged yet.</p>
                  ) : (
                    Object.entries(metrics.toolUsage).map(([toolName, count]) => {
                      const total = Object.values(metrics.toolUsage).reduce((a, b) => a + b, 0);
                      const percentage = total > 0 ? (count / total) * 100 : 0;
                      return (
                        <div key={toolName} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-text-main">{toolName}</span>
                            <span className="text-text-muted font-mono">{count} Deployments ({percentage.toFixed(0)}%)</span>
                          </div>
                          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Secure Insights */}
              <div className="p-6 bg-destructive/10 border border-destructive/20 rounded-2xl flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="p-2.5 bg-destructive/10 text-destructive rounded-xl w-fit">
                    <Heart className="w-5 h-5 fill-current" />
                  </div>
                  <h4 className="font-display text-lg font-bold text-text-main">Tool Usage Insight</h4>
                  <p className="text-xs text-text-muted leading-relaxed">
                    Based on anonymised telemetry events, <span className="text-text-main font-semibold">"{metrics.mostUsedTool}"</span> is the most frequently selected tool - this reflects usage volume, not measured effectiveness per tool.
                  </p>
                  <p className="text-xs text-text-muted leading-relaxed">
                    "Average Arousal Drop" above is the only measured before/after effectiveness figure, and it's aggregated across all tools together, not broken down per tool.
                  </p>
                </div>

                <div className="p-4 bg-surface rounded-xl border border-border text-[10px] text-text-muted font-mono mt-6">
                  <strong>Zero Personal Data Leaked:</strong> This dashboard renders fully aggregated metadata. All specific private triggers, text notes, and intensity scales remain strictly private in users' local containers.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Account Control Drawer - the single consolidated surface for
          everything an admin can do to one account (role, entitlement,
          suspension), replacing the two separate inline accordion panels
          this used to be split across. Opens via openAccountDrawer()
          from a row's "Manage Account" button; the underlying handlers
          (handleUpdateRole/handleGrantEntitlement/handleToggleSuspend)
          are unchanged from before this drawer existed. */}
      <AnimatePresence>
        {selectedUser && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeAccountDrawer}
              className="fixed inset-0 bg-black/50 z-40"
              aria-hidden="true"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.2 }}
              role="dialog"
              aria-label="Account Control Drawer"
              className="fixed top-0 right-0 h-full w-full max-w-md bg-surface dark:bg-card border-l border-border shadow-2xl z-50 overflow-y-auto p-6 space-y-6"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <h4 className="font-display text-lg font-bold text-text-main">Account Control</h4>
                  <p className="text-xs font-mono text-text-muted truncate" title={selectedUser.email || selectedUser.uid}>
                    {selectedUser.email || (selectedUser.isAnonymous ? 'No email (anonymous/demo account)' : 'No email on record')}
                  </p>
                  <p className="text-[10px] font-mono text-text-muted truncate">{selectedUser.uid}</p>
                </div>
                <button
                  onClick={closeAccountDrawer}
                  aria-label="Close Account Control Drawer"
                  className="p-2 text-text-muted hover:text-text-main transition-colors shrink-0"
                >
                  <AlertCircle className="w-5 h-5 rotate-45" />
                </button>
              </div>

              <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest ${
                lifecycleOf(selectedUser).tone === 'active' ? 'bg-success/10 text-success dark:text-[#4ade80]'
                : lifecycleOf(selectedUser).tone === 'destructive' ? 'bg-destructive/10 text-destructive dark:text-[#f87171]'
                : lifecycleOf(selectedUser).tone === 'warning' ? 'bg-warning/10 text-[#9a3412] dark:text-warning'
                : 'bg-background text-text-muted'
              }`}>
                {lifecycleOf(selectedUser).label}
              </span>

              {/* Role section */}
              <div className="space-y-3 pt-2 border-t border-white/5">
                <h5 className="font-display text-sm font-bold text-text-main flex items-center gap-2">
                  <Key className="w-4 h-4 text-primary" /> Role & Claims
                </h5>
                <p className="text-xs text-text-muted">
                  Current role: <strong className="text-text-main font-mono">{selectedUser.role || 'user'}</strong>. Assigning a new claim overrides it immediately in Firebase Authentication and is recorded in the Auditor Event log.
                </p>
                <select
                  aria-label="Select new role"
                  value={selectedUserRole}
                  onChange={(e) => setSelectedUserRole(e.target.value)}
                  className="w-full p-3 bg-background border border-border rounded-xl text-sm text-text-main focus:outline-none focus:border-primary"
                >
                  {ROLE_HIERARCHY.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => handleUpdateRole(selectedUser.uid)}
                  disabled={isUpdatingRole || appRole !== 'platform_owner'}
                  title={appRole !== 'platform_owner' ? 'Only a Platform Owner can write a security claim' : undefined}
                  className="w-full px-5 py-2.5 bg-primary hover:bg-primary-dark text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isUpdatingRole ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Write Security Claim
                </button>
              </div>

              {/* Entitlement section */}
              <div className="space-y-3 pt-4 border-t border-white/5">
                <h5 className="font-display text-sm font-bold text-text-main flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-success dark:text-[#4ade80]" /> Access & Entitlement
                </h5>
                <p className="text-xs text-text-muted">
                  Currently {selectedUser.plan ? (PLAN_LABELS[selectedUser.plan] || selectedUser.plan) : 'Unknown'}. Sets this account's plan directly (admin comp - no billing involved); recorded in the Auditor Event log with the previous plan and whether it's an upgrade, downgrade, or lateral change.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <select
                    aria-label="Plan"
                    value={grantPlanChoice}
                    onChange={(e) => setGrantPlanChoice(e.target.value as typeof grantPlanChoice)}
                    className="w-full p-3 bg-background border border-border rounded-xl text-sm text-text-main focus:outline-none focus:border-primary"
                  >
                    {GRANTABLE_PLANS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                  <select
                    aria-label="Status"
                    value={grantStatusChoice}
                    onChange={(e) => setGrantStatusChoice(e.target.value as typeof grantStatusChoice)}
                    className="w-full p-3 bg-background border border-border rounded-xl text-sm text-text-main focus:outline-none focus:border-primary"
                  >
                    {GRANTABLE_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <input
                  aria-label="Duration in days, optional"
                  type="number"
                  min={1}
                  max={3650}
                  placeholder="Duration in days (leave blank for no fixed end)"
                  value={grantDurationDays}
                  onChange={(e) => setGrantDurationDays(e.target.value)}
                  className="w-full p-3 bg-background border border-border rounded-xl text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleGrantEntitlement(selectedUser.uid, 'free')}
                    disabled={grantingEntitlementUid === selectedUser.uid || selectedUser.plan === 'free'}
                    className="flex-1 px-4 py-2.5 bg-background hover:bg-border text-text-muted text-xs font-bold uppercase tracking-wider rounded-xl transition-all disabled:opacity-50"
                  >
                    Revert to Free
                  </button>
                  <button
                    onClick={() => {
                      const parsedDuration = grantDurationDays.trim() === '' ? undefined : Number(grantDurationDays);
                      handleGrantEntitlement(selectedUser.uid, grantPlanChoice, grantStatusChoice, parsedDuration);
                    }}
                    disabled={grantingEntitlementUid === selectedUser.uid}
                    className="flex-1 px-4 py-2.5 bg-success hover:opacity-90 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {grantingEntitlementUid === selectedUser.uid ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
                    Grant {PLAN_LABELS[grantPlanChoice]}
                  </button>
                </div>
              </div>

              {/* Suspension section */}
              <div className="space-y-3 pt-4 border-t border-white/5">
                <h5 className="font-display text-sm font-bold text-text-main flex items-center gap-2">
                  <Lock className="w-4 h-4 text-destructive dark:text-[#f87171]" /> Access
                </h5>
                <button
                  onClick={() => setPendingAction({ type: 'suspend', uid: selectedUser.uid, email: selectedUser.email, currentlyActive: selectedUser.accessStatus === 'active' })}
                  className={`w-full px-4 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${
                    selectedUser.accessStatus === 'active'
                      ? 'bg-destructive/10 hover:bg-destructive/20 text-destructive dark:text-[#f87171]'
                      : 'bg-success/10 hover:bg-success/20 text-success dark:text-[#4ade80]'
                  }`}
                >
                  {selectedUser.accessStatus === 'active' ? 'Suspend Account' : 'Reactivate Account'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Safety Notice Block */}
      <div className="bg-primary/5 border border-primary/20 p-5 rounded-2xl text-xs text-text-muted flex gap-3">
        <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div>
          <strong className="text-[#9a3412] dark:text-primary block mb-1">Privacy & Role Hierarchy Guideline</strong> 
          Every administrative claim promotion (e.g. `platform_owner`, `platform_admin`, etc.) overrides the token claims in Firebase. Under GDPR, NICE, and standard professional guidelines, this board enforces complete isolation of clinical records—no clinical diagnosis data of Generalised Anxiety Disorder (GAD) is ever logged or exposed to organisation-level dashboards.
        </div>
      </div>

      <ConfirmDialog
        open={!!pendingAction}
        title={
          pendingAction?.type === 'suspend'
            ? `${pendingAction.currentlyActive ? 'Suspend' : 'Unsuspend'} this account?`
            : 'Revoke all administrative privileges?'
        }
        message={
          pendingAction?.type === 'suspend'
            ? `This will ${pendingAction.currentlyActive ? 'suspend' : 'unsuspend'} ${pendingAction.email}'s account access.`
            : pendingAction?.type === 'revokeAdmin'
            ? `This revokes every administrative role ${pendingAction.email} holds immediately, without touching any other account claims they have.`
            : ''
        }
        confirmLabel={pendingAction?.type === 'suspend' ? (pendingAction.currentlyActive ? 'Suspend' : 'Unsuspend') : 'Revoke'}
        onConfirm={() => {
          if (!pendingAction) return;
          if (pendingAction.type === 'suspend') handleToggleSuspend(pendingAction.uid, pendingAction.currentlyActive);
          else handleRevokeAdmin(pendingAction.uid);
          setPendingAction(null);
        }}
        onCancel={() => setPendingAction(null)}
      />
    </motion.div>
  );
};
