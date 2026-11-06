// Public legal documents must be readable before a user creates an account.
// Server/provider exceptions can include internal URLs, tokens or HTML, so
// never echo an exception's message into the Terms/Privacy modal.
// HTTP status is sufficient to offer the visitor a useful next step.
export function readableLegalDocumentError(error: unknown): string {
  const suppliedStatus = error && typeof error === 'object' && 'status' in error
    ? (error as { status?: unknown }).status
    : undefined;
  if (suppliedStatus === 0) {
    return 'Could not connect. Check your connection and try opening the document again.';
  }
  if (suppliedStatus === 403) {
    return 'We could not verify this request. Refresh the page and try again.';
  }
  if (suppliedStatus === 429) {
    return 'Too many requests. Please try opening the document again shortly.';
  }
  return 'Could not load this document right now. Please try again later.';
}
