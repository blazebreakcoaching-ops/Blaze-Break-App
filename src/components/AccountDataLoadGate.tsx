import { Loader2 } from 'lucide-react';

/** An unavailable account read must never be treated as an empty profile. */
export function AccountDataLoadGate({ error, onRetry }: { error: boolean; onRetry: () => void }) {
  if (!error) {
    return (
      <main role="status" aria-live="polite" className="min-h-screen bg-background text-text-main flex items-center justify-center p-6">
        <span className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
          Loading your account…
        </span>
      </main>
    );
  }
  return (
    <main className="min-h-screen bg-background text-text-main flex items-center justify-center p-6">
      <section role="alert" aria-labelledby="account-load-error-heading" className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-6">
        <h1 id="account-load-error-heading" className="text-xl font-bold">We couldn't load your account</h1>
        <p className="text-sm text-text-muted">Your saved information has not been changed. Check your connection and try again.</p>
        <button type="button" className="btn-primary rounded-xl px-5 py-3" onClick={onRetry}>Try again</button>
        <p className="text-xs text-text-muted">If this continues, contact support. Please do not create another account.</p>
      </section>
    </main>
  );
}
