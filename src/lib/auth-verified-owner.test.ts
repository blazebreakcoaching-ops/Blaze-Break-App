import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isVerifiedOwnerBootstrapIdentity } from '../../admin-roles';

describe('client platform-owner bootstrap identity', () => {
  it('never promotes an unverified or mismatching email identity', () => {
    expect(isVerifiedOwnerBootstrapIdentity({ email: 'teampublication@gmail.com', emailVerified: false })).toBe(false);
    expect(isVerifiedOwnerBootstrapIdentity({ email: 'teampublication@googlemail.com', email_verified: false })).toBe(false);
    expect(isVerifiedOwnerBootstrapIdentity({ email: 'unknown@example.test', emailVerified: true })).toBe(false);
    expect(isVerifiedOwnerBootstrapIdentity({ email: 'teampublication@gmail.com', emailVerified: true })).toBe(true);
    expect(isVerifiedOwnerBootstrapIdentity({ email: 'teampublication@googlemail.com', email_verified: true })).toBe(true);
  });
  it('the AuthProvider uses the common verified-identity rule, not literal email checks', () => {
    const source = readFileSync('src/lib/auth.tsx', 'utf8');
    expect(source).toContain('const verifiedBootstrapOwner = isVerifiedOwnerBootstrapIdentity({');
    expect(source).toContain('email_verified: claims.email_verified === true');
    expect(source).toContain("else if (verifiedBootstrapOwner)");
    expect(source).not.toContain("userRecord.email === 'teampublication@gmail.com'");
    expect(source).not.toContain("userRecord.email === 'teampublication@googlemail.com'");
  });
});
