import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ secureApiFetch: vi.fn() }));
vi.mock('../lib/secure-api', async () => {
  const actual = await vi.importActual<any>('../lib/secure-api');
  return { ...actual, secureApiFetch: mocks.secureApiFetch };
});

import { ExperienceLevelSwitcher } from './ExperienceLevelSwitcher';
import { useExperienceLevel } from '../hooks/useExperienceLevel';
import { SecureApiError } from '../lib/secure-api';

const ok = (body: unknown) => ({ ok: true, json: async () => body });
beforeEach(() => mocks.secureApiFetch.mockReset());

describe('ExperienceLevelSwitcher', () => {
  it('is an accessible three-option choice with short Nova guidance', () => {
    const onChange = vi.fn();
    render(<ExperienceLevelSwitcher level="novice" onChange={onChange} />);
    const group = screen.getByRole('radiogroup', { name: 'Your experience' });
    expect(group).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Novice' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText(/Just the essentials/)).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Expert' }));
    expect(onChange).toHaveBeenCalledWith('expert');
    fireEvent.click(screen.getByRole('radio', { name: 'Novice' }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('shows a save failure as an alert', () => {
    render(<ExperienceLevelSwitcher level="mastering" onChange={vi.fn()} error="Could not save." />);
    expect(screen.getByRole('alert').textContent).toBe('Could not save.');
  });
});

describe('useExperienceLevel', () => {
  it('loads the saved level, saves a change to the server, and resets on account switch', async () => {
    mocks.secureApiFetch.mockResolvedValueOnce(ok({ level: 'mastering', chosen: true }));
    const { result, rerender } = renderHook(({ uid }) => useExperienceLevel(uid), { initialProps: { uid: 'alice' as string | null } });
    await waitFor(() => expect(result.current.level).toBe('mastering'));
    mocks.secureApiFetch.mockResolvedValueOnce(ok({ level: 'expert' }));
    await act(async () => { await result.current.setLevel('expert'); });
    expect(mocks.secureApiFetch).toHaveBeenLastCalledWith('/api/user/preferences/experience-level', { method: 'PUT', data: { level: 'expert' } });
    expect(result.current.level).toBe('expert');
    rerender({ uid: null });
    expect(result.current.level).toBe('novice');
  });

  it('reverts and explains when the save fails', async () => {
    mocks.secureApiFetch.mockResolvedValueOnce(ok({ level: 'novice', chosen: false }));
    const { result } = renderHook(() => useExperienceLevel('u1'));
    await waitFor(() => expect(mocks.secureApiFetch).toHaveBeenCalledTimes(1));
    mocks.secureApiFetch.mockRejectedValueOnce(new SecureApiError('Choose Novice, Mastering or Expert.', 400));
    await act(async () => { await result.current.setLevel('expert'); });
    expect(result.current.level).toBe('novice');
    expect(result.current.error).toBe('Choose Novice, Mastering or Expert.');
  });

  it('guests use the default without any network call', () => {
    const { result } = renderHook(() => useExperienceLevel(undefined));
    expect(result.current.level).toBe('novice');
    expect(mocks.secureApiFetch).not.toHaveBeenCalled();
  });
});
