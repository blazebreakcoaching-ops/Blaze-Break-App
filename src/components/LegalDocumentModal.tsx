import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { X, Loader2 } from 'lucide-react';
import { publicApiFetch, SecureApiError } from '../lib/secure-api';
import { useFocusTrap } from '../lib/useFocusTrap';

// Legal document type ids, kept as a local, duplicated string union rather
// than importing legal-documents.ts (the server-side registry/content
// module) - this codebase's client and server code don't share root-level
// .ts modules across that boundary (see entitlements.ts, user-data-collections.ts,
// none of which are imported from src/ either); the client only ever talks
// to the server's own /api/legal/... routes, never the registry directly.
export type LegalDocumentType = 'TERMS' | 'PRIVACY' | 'REFUND' | 'ACCEPTABLE_USE' | 'AI_NOTICE' | 'COOKIE_NOTICE';

interface LegalDocument {
  title: string;
  version: string;
  effectiveDate: string;
  content: string;
}

// Single, shared renderer for any published legal document - used at
// signup (LandingPage.tsx), Settings > Legal & Privacy, and the web
// footer, so the same document is never copy-pasted into multiple
// places that could drift apart. Content comes from the server's
// published registry (GET /api/legal/documents/:docType), never
// hardcoded here.
export const LegalDocumentModal = ({ docType, onClose }: { docType: LegalDocumentType; onClose: () => void }) => {
  const [doc, setDoc] = useState<LegalDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useFocusTrap(true);

  useEffect(() => {
    // Deliberately uses publicApiFetch, not secureApiFetch - reading a
    // legal document must never depend on any account existing, not even
    // the invisible anonymous session every visitor gets automatically.
    // A visitor should be able to read the Terms/Privacy before that
    // session is even created, exactly like any legitimate site's policy
    // pages. The server route itself has never required a signed-in user
    // (verifyAppCheck only, see server.ts) - this was purely a client-
    // side requirement that produced the "Unauthorized: User not signed
    // in." error being reported, and is now removed at the source.
    let cancelled = false;
    const load = async () => {
      try {
        const res = await publicApiFetch(`/api/legal/documents/${docType}`);
        if (!res.ok) throw new Error('Could not load this document.');
        const data = await res.json();
        if (!cancelled) setDoc(data);
      } catch (e) {
        // Shown on screen, not just logged to the console - the generic
        // message previously shown here for every failure (a missing
        // sign-in, an App Check failure, a genuine server error) made it
        // impossible to tell them apart without opening DevTools, which
        // wasn't a reasonable ask of a non-technical user reporting a bug.
        console.error('[LegalDocumentModal] Failed to load document:', docType, e);
        if (!cancelled) {
          const detail = e instanceof SecureApiError ? e.message : (e instanceof Error ? e.message : String(e));
          setError(`Could not load this document right now. (${detail})`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [docType]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div ref={modalRef as any} className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between p-6 border-b border-border shrink-0">
          <div>
            <h2 className="text-lg font-display font-bold text-text-main">{doc?.title || 'Loading…'}</h2>
            {doc && (
              <p className="text-xs text-text-muted mt-1">Version {doc.version} · Effective {doc.effectiveDate}</p>
            )}
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-full text-text-muted hover:text-text-main hover:bg-surface transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto custom-scrollbar p-6 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-text-muted animate-spin" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none text-text-main [&_h1]:font-display [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-3 [&_h2]:font-display [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-2 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-text-main">
              <ReactMarkdown>{doc?.content || ''}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
