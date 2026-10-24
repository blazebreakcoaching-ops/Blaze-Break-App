import { MessageCircle } from 'lucide-react';

// Phase 5L (directive §3/§4/§8) - a small, consistent "return to the
// conversation afterward" affordance for the destination tabs Nova's
// suggest_feature coordinator can now send a user to for a boundary or
// in-the-moment recovery need (Boundary Architect/"communicate",
// Anxiety Reset, Reset Studio). The sidebar's own persistent Nova link
// already makes this one click away from any tab, and NovaChat's
// localStorage-persisted history means nothing is lost either way - this
// just makes that path explicit and visible right where a user who
// arrived via a Nova offer would look for it, rather than relying on them
// to notice the sidebar.
interface ReturnToNovaLinkProps {
  onNavigate: (tab: string) => void;
}

export const ReturnToNovaLink = ({ onNavigate }: ReturnToNovaLinkProps) => (
  <button
    onClick={() => onNavigate('nova')}
    className="text-xs font-bold text-primary flex items-center gap-1 hover:underline"
  >
    <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" /> Return to Nova chat
  </button>
);

export default ReturnToNovaLink;
