import { describe, it, expect } from 'vitest';
import {
  ORG_CONNECTOR_TYPES,
  isKnownConnectorType,
  initialAuthStatus,
  validateConnectorCreate,
  canSeeConnectorDetail,
} from './org-connectors';

describe('isKnownConnectorType', () => {
  it('accepts every registered type', () => {
    for (const type of Object.keys(ORG_CONNECTOR_TYPES)) {
      expect(isKnownConnectorType(type)).toBe(true);
    }
  });

  it('rejects unknown or non-string values', () => {
    expect(isKnownConnectorType('salesforce')).toBe(false);
    expect(isKnownConnectorType(undefined)).toBe(false);
    expect(isKnownConnectorType(null)).toBe(false);
    expect(isKnownConnectorType(42)).toBe(false);
  });
});

describe('initialAuthStatus', () => {
  it('a local connector starts as not_applicable, never connected - there is nothing to authenticate', () => {
    expect(initialAuthStatus('local')).toBe('not_applicable');
  });

  it('every OAuth-backed connector type starts as not_connected, never connected - no handshake has happened', () => {
    expect(initialAuthStatus('slack')).toBe('not_connected');
    expect(initialAuthStatus('jira')).toBe('not_connected');
    expect(initialAuthStatus('asana')).toBe('not_connected');
    expect(initialAuthStatus('calendly')).toBe('not_connected');
    expect(initialAuthStatus('monday')).toBe('not_connected');
  });

  it('an unknown type defaults to not_connected rather than throwing', () => {
    expect(initialAuthStatus('unknown_service')).toBe('not_connected');
  });

  it('never returns connected for any registered type - nothing has a real handshake yet', () => {
    for (const type of Object.keys(ORG_CONNECTOR_TYPES)) {
      expect(initialAuthStatus(type)).not.toBe('connected');
    }
  });
});

describe('validateConnectorCreate', () => {
  const valid = { type: 'slack', displayName: 'Team Slack' };

  it('accepts a valid minimal connector', () => {
    expect(validateConnectorCreate(valid)).toEqual({ valid: true });
  });

  it('accepts a valid connector with restrictedToTeams', () => {
    expect(validateConnectorCreate({ ...valid, restrictedToTeams: ['Engineering', 'Sales'] })).toEqual({ valid: true });
  });

  it('rejects null, undefined, and non-object input', () => {
    expect(validateConnectorCreate(null).valid).toBe(false);
    expect(validateConnectorCreate(undefined).valid).toBe(false);
    expect(validateConnectorCreate('nope').valid).toBe(false);
  });

  it('rejects an unknown connector type', () => {
    const res = validateConnectorCreate({ ...valid, type: 'salesforce' });
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/type/);
  });

  it('rejects a missing or empty displayName', () => {
    expect(validateConnectorCreate({ type: 'slack' }).valid).toBe(false);
    expect(validateConnectorCreate({ type: 'slack', displayName: '   ' }).valid).toBe(false);
  });

  it('rejects an overlong displayName', () => {
    expect(validateConnectorCreate({ type: 'slack', displayName: 'x'.repeat(201) }).valid).toBe(false);
  });

  it('rejects a non-array restrictedToTeams', () => {
    expect(validateConnectorCreate({ ...valid, restrictedToTeams: 'Engineering' }).valid).toBe(false);
  });

  it('rejects restrictedToTeams containing an empty or non-string entry', () => {
    expect(validateConnectorCreate({ ...valid, restrictedToTeams: [''] }).valid).toBe(false);
    expect(validateConnectorCreate({ ...valid, restrictedToTeams: [42] }).valid).toBe(false);
  });

  it('rejects an implausibly long restrictedToTeams list', () => {
    expect(validateConnectorCreate({ ...valid, restrictedToTeams: Array(51).fill('team') }).valid).toBe(false);
  });
});

describe('canSeeConnectorDetail', () => {
  it('is true only when the caller holds manage permission', () => {
    expect(canSeeConnectorDetail(true)).toBe(true);
    expect(canSeeConnectorDetail(false)).toBe(false);
  });
});
