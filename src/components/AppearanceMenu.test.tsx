// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppearanceMenu } from './AppearanceMenu';

describe('appearance picker interaction', () => {
  it('lets a visitor explicitly choose System and reports the selection', () => {
    const onChange = vi.fn();
    render(<AppearanceMenu mode="light" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /appearance: light/i }));
    fireEvent.click(screen.getByRole('button', { name: 'System' }));
    expect(onChange).toHaveBeenCalledWith('system');
  });

  it('places collapsed desktop sidebar menu to the right, not off-screen left', () => {
    render(<AppearanceMenu mode="system" onChange={vi.fn()} compact above />);
    fireEvent.click(screen.getByRole('button', { name: /appearance: system/i }));
    expect(screen.getByRole('group', { name: 'Appearance options' }).className).toContain('left-0');
  });

  it('places compact mobile menu against its right edge', () => {
    render(<AppearanceMenu mode="dark" onChange={vi.fn()} compact />);
    fireEvent.click(screen.getByRole('button', { name: /appearance: dark/i }));
    expect(screen.getByRole('group', { name: 'Appearance options' }).className).toContain('right-0');
  });
});
