import { lazy, Suspense, useEffect, useState } from 'react';
import { FileText, ChevronRight, Mail } from 'lucide-react';
import { secureApiFetch, SecureApiError } from '../lib/secure-api';
import type { LegalDocumentType } from './LegalDocumentModal';

const LegalDocumentModal = lazy(() => import('./LegalDocumentModal').then(m => ({ default: m.LegalDocumentModal })));

interface LegalDocumentSummary {
  docType: LegalDocumentType;
  title: string;
  version: string;
  effectiveDate: string;
}

// The versioned, dated legal-document registry - deliberately separate
// from PrivacyPolicyAccordion above it (a plain-English explainer, not a
// legal instrument). Reads from GET /api/legal/documents, the same
// server-authoritative source the signup acknowledgment (LandingPage.tsx)
// links to, so there is exactly one place this content is ever defined -
// see legal-documents.ts.
export const LegalDocumentsSection = () => {
  const [documents, setDocuments] = useState<LegalDocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openDoc, setOpenDoc] = useState<LegalDocumentType | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await secureApiFetch('/api/legal/documents');
        if (!res.ok) throw new Error('Could not load legal documents.');
        const data = await res.json();
        if (!cancelled) setDocuments(data.documents || []);
      } catch (e) {
        // Leaves the list empty - the section still renders a graceful
        // "couldn't load" state rather than crashing the Policies tab -
        // but shows the real reason on screen (not just the console) so
        // a non-technical user reporting the bug can just read it off,
        // rather than being asked to open DevTools.
        console.error('[LegalDocumentsSection] Failed to load document list:', e);
        if (!cancelled) {
          setLoadError(e instanceof SecureApiError ? e.message : (e instanceof Error ? e.message : String(e)));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-xl font-display font-bold text-text-main">Legal Documents</h3>
        <p className="text-xs text-text-muted mt-1">The current, dated version of every Blaze Break legal document.</p>
      </div>

      {loading ? (
        <p className="text-xs text-text-muted">Loading…</p>
      ) : documents.length === 0 ? (
        <p className="text-xs text-text-muted">
          Couldn't load legal documents right now.{loadError ? ` (${loadError})` : ' Please try again shortly.'}
        </p>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <button
              key={doc.docType}
              onClick={() => setOpenDoc(doc.docType)}
              className="w-full flex items-center justify-between gap-3 border border-border rounded-xl p-4 text-left hover:bg-surface transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="w-4 h-4 text-text-muted shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-text-main truncate">{doc.title}</p>
                  <p className="text-[11px] text-text-muted">Version {doc.version} · Effective {doc.effectiveDate}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-text-muted shrink-0" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}

      <a
        href="mailto:support@blazebreak.app"
        className="w-full flex items-center gap-3 border border-dashed border-border rounded-xl p-4 text-text-muted hover:text-text-main hover:border-primary/40 transition-colors"
      >
        <Mail className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span className="text-sm font-bold">Contact Blaze Break</span>
      </a>

      {openDoc && (
        <Suspense fallback={null}>
          <LegalDocumentModal docType={openDoc} onClose={() => setOpenDoc(null)} />
        </Suspense>
      )}
    </div>
  );
};
