// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  accountProfileStorageKey, readAccountProfile,
  writeAccountProfile, patchAccountProfile, clearAccountProfile,
} from './account-profile-storage';

beforeEach(() => localStorage.clear());

describe('private profile preferences on a shared browser', () => {
  it('does not read the previous global Blaze Break profile', () => {
    localStorage.setItem('blaze_profile', JSON.stringify({
      fullName: 'Previous User', purpose: 'private goal',
    }));
    expect(readAccountProfile('new-user')).toEqual({});
    expect(readAccountProfile(undefined)).toEqual({});
  });

  it('isolates each account name and situational information', () => {
    writeAccountProfile('account-A', { fullName: 'Person A', primaryDrain: 'A pressure' });
    writeAccountProfile('account-B', { fullName: 'Person B', primaryDrain: 'B pressure' });
    expect(readAccountProfile('account-A').fullName).toBe('Person A');
    expect(readAccountProfile('account-B').fullName).toBe('Person B');
    expect(readAccountProfile('account-B').primaryDrain).toBe('B pressure');
    expect(accountProfileStorageKey('account-A')).not.toBe(accountProfileStorageKey('account-B'));
  });

  it('only patches the current account and can clear it', () => {
    writeAccountProfile('account-A', { novaTone: 'Calm' });
    writeAccountProfile('account-B', { novaTone: 'Direct' });
    patchAccountProfile('account-A', { novaTone: 'Reflective' });
    expect(readAccountProfile('account-A').novaTone).toBe('Reflective');
    expect(readAccountProfile('account-B').novaTone).toBe('Direct');
    clearAccountProfile('account-A');
    expect(readAccountProfile('account-A')).toEqual({});
  });

  it('returns empty instead of throwing on corrupted or nonobject data', () => {
    localStorage.setItem(accountProfileStorageKey('A'), 'not-json');
    expect(readAccountProfile('A')).toEqual({});
    localStorage.setItem(accountProfileStorageKey('A'), '[1,2,3]');
    expect(readAccountProfile('A')).toEqual({});
  });
});
