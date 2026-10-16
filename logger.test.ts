import { describe, it, expect, vi, afterEach } from 'vitest';
import { logger, errorFields } from './logger';

function captured(spy: ReturnType<typeof vi.spyOn>) {
  return JSON.parse(spy.mock.calls[0][0] as string);
}

describe('logger', () => {
  afterEach(() => vi.restoreAllMocks());

  it('info/debug/warning write a single JSON line to stdout with the right severity', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.info('request handled', { requestId: 'r1', status: 200 });
    const entry = captured(spy);
    expect(entry).toMatchObject({ severity: 'INFO', message: 'request handled', requestId: 'r1', status: 200 });
    expect(typeof entry.timestamp).toBe('string');
  });

  it('error/critical write to stderr, not stdout', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.error('something broke', { requestId: 'r2' });
    expect(logSpy).not.toHaveBeenCalled();
    const entry = captured(errSpy);
    expect(entry).toMatchObject({ severity: 'ERROR', message: 'something broke', requestId: 'r2' });
  });

  it('critical severity is distinct from error', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.critical('process exiting');
    expect(captured(errSpy).severity).toBe('CRITICAL');
  });
});

describe('errorFields', () => {
  it('extracts message and stack from a real Error', () => {
    const fields = errorFields(new Error('boom'));
    expect(fields.errorMessage).toBe('boom');
    expect(typeof fields.stack).toBe('string');
  });

  it('stringifies a non-Error rejection reason without throwing', () => {
    expect(errorFields('some string reason')).toEqual({ errorMessage: 'some string reason' });
    expect(errorFields(undefined)).toEqual({ errorMessage: 'undefined' });
  });
});
