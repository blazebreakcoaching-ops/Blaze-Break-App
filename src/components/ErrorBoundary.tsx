import React from 'react';

// A crash in a mental-health app can happen while someone is in a bad
// place. The single worst outcome is a blank white screen at that moment,
// with no way to reach help. This boundary exists so that never happens:
// if any part of the tree throws during render, the user still sees a
// calm message and - critically - the real crisis phone lines, rendered
// as plain anchors that depend on nothing else in the app (no lucide,
// no motion, no shared component that might be the very thing that
// crashed). The numbers are duplicated from CrisisSupport.tsx on purpose:
// coupling this fallback to that component would defeat the point, since
// that component could be the source of the crash.

interface ErrorBoundaryProps {
  children: React.ReactNode;
  // 'app' wraps the whole application - its fallback assumes nothing else
  // on screen survived, so it shows the crisis lines and offers a full
  // reload. 'section' wraps a single lazy-loaded view - the app chrome
  // (including the persistent crisis button) is still alive around it, so
  // its fallback is lighter and just offers to retry that one section.
  level?: 'app' | 'section';
  sectionName?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

// Duplicated deliberately - see the file header. Kept minimal: the lines
// most likely to be immediately useful, not the full localised list.
const CRISIS_LINES: { label: string; detail: string; href: string }[] = [
  { label: 'Samaritans (UK & Ireland)', detail: 'Call 116 123 · free · 24/7', href: 'tel:116123' },
  { label: '988 Lifeline (US & Canada)', detail: 'Call or text 988 · free · 24/7', href: 'tel:988' },
  { label: 'Emergency services', detail: 'Call 999 (UK) or 911 (US) for immediate danger', href: 'tel:999' },
];

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log locally only. Deliberately no network call here - a reporting
    // request that itself fails (which is plausible if the app is in a
    // bad enough state to have crashed) must not throw inside the very
    // handler meant to contain the crash.
    console.error(`[ErrorBoundary${this.props.level === 'section' ? `:${this.props.sectionName || 'section'}` : ':app'}]`, error, info?.componentStack);
  }

  handleRetry = () => {
    // Section-level: re-mount the children by clearing the error state, so
    // a transient failure (a flaky lazy-chunk load, say) can recover
    // without losing the rest of the user's session.
    this.setState({ hasError: false });
  };

  handleReload = () => {
    if (typeof window !== 'undefined') window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.level === 'section') {
      // The surrounding app - including the persistent crisis-support
      // button - is still alive, so this stays deliberately small and
      // doesn't repeat the crisis lines the chrome already offers.
      return (
        <div
          role="alert"
          style={{
            padding: '2rem 1.5rem',
            margin: '1rem 0',
            borderRadius: '16px',
            border: '1px solid rgba(120, 113, 108, 0.25)',
            background: 'rgba(120, 113, 108, 0.06)',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.4rem', color: 'inherit' }}>
            This part didn't load properly.
          </p>
          <p style={{ fontSize: '0.85rem', opacity: 0.75, margin: '0 0 1.25rem', lineHeight: 1.5 }}>
            That's a problem on our end, not anything you did. The rest of the app is still working.
          </p>
          <button
            onClick={this.handleRetry}
            style={{
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 700,
              padding: '0.6rem 1.4rem',
              borderRadius: '10px',
              border: 'none',
              background: '#ea580c',
              color: '#fff',
            }}
          >
            Try this section again
          </button>
        </div>
      );
    }

    // App-level: assume nothing else survived. Everything here is inline
    // and self-contained so it renders even if styles or other components
    // are part of the failure.
    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          background: '#fafaf9',
          color: '#1c1917',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div style={{ maxWidth: '30rem', width: '100%' }}>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 800, margin: '0 0 0.5rem' }}>
            Something went wrong.
          </h1>
          <p style={{ fontSize: '0.95rem', lineHeight: 1.55, margin: '0 0 1.5rem', color: '#57534e' }}>
            The app hit an unexpected error and couldn't carry on. This is on us, not you.
            Reloading usually fixes it. If you need support right now, these lines are always open:
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', margin: '0 0 1.75rem' }}>
            {CRISIS_LINES.map((line) => (
              <a
                key={line.href + line.label}
                href={line.href}
                style={{
                  display: 'block',
                  padding: '0.9rem 1rem',
                  borderRadius: '12px',
                  border: '1px solid rgba(234, 88, 12, 0.3)',
                  background: 'rgba(234, 88, 12, 0.08)',
                  textDecoration: 'none',
                  color: '#9a3412',
                }}
              >
                <span style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700 }}>{line.label}</span>
                <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', marginTop: '0.2rem' }}>
                  {line.detail}
                </span>
              </a>
            ))}
          </div>

          <button
            onClick={this.handleReload}
            style={{
              cursor: 'pointer',
              width: '100%',
              fontSize: '0.95rem',
              fontWeight: 700,
              padding: '0.85rem',
              borderRadius: '12px',
              border: 'none',
              background: '#ea580c',
              color: '#fff',
            }}
          >
            Reload the app
          </button>
        </div>
      </div>
    );
  }
}
