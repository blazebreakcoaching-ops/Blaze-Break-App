import { describe, expect, it } from 'vitest';
import { marketingListId, shouldJoinMarketingList } from './marketing-consent';

describe('explicit marketing opt-in boundaries', () => {
  it('does not subscribe anonymous, missing, or unverified contact details', () => {
    expect(shouldJoinMarketingList(false, true, 'user@example.test')).toBe(false);
    expect(shouldJoinMarketingList(true, false, 'user@example.test')).toBe(false);
    expect(shouldJoinMarketingList(true, true, null)).toBe(false);
    expect(shouldJoinMarketingList(true, true, 'user@example.test')).toBe(true);
  });
  it('only accepts positive integer marketing list IDs', () => {
    expect(marketingListId('123')).toBe(123);
    expect(marketingListId('0')).toBeNull();
    expect(marketingListId('oops')).toBeNull();
    expect(marketingListId(undefined)).toBeNull();
    expect(marketingListId('1,2')).toBeNull();
  });
});
