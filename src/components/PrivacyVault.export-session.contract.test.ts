import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
describe('Privacy Vault sensitive exports and audit logs', () => {
  it('binds private export to Firebase session before and after asynchronous work', () => {
    const src = readFileSync('src/components/PrivacyVault.tsx', 'utf8');
    const exportHandler = src.slice(src.indexOf('const processDownload = async () => {'), src.indexOf('\n  return (', src.indexOf('const processDownload = async () => {')));
    expect(exportHandler).toContain("const session = user;");
    expect(exportHandler).toContain("if (!session || auth.currentUser !== session) return;");
    expect(exportHandler).toContain("if (auth.currentUser !== session) return;");
    expect(exportHandler).toContain("await secureApiFetch('/api/user/export')");
    expect(exportHandler).toContain("if (auth.currentUser !== session) return;\n      if (!res.ok)");
  });
  it('never applies audit history from a previous account', () => {
    const src = readFileSync('src/components/PrivacyVault.tsx', 'utf8');
    expect(src).toContain("if (active && auth.currentUser === session) setAuditLogs(logs);");
    expect(src).toContain("[activeTab, user, profile.fullName]");
    expect(src).toContain("if (auth.currentUser === session) setAuditLogs(logs);");
  });
});
