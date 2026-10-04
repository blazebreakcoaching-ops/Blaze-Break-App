import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

/**
 * Shared two-column desktop split for the Communication workspace (Nova
 * Overload Shield, Digital Boundary Shield, Boundary Architect, the
 * Communication tab's own top-level grid). `columns` must be a literal
 * Tailwind arbitrary-value class (e.g. "lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]")
 * so the JIT scanner can see it in each call site's source - centralizing
 * the actual column widths behind a prop here would hide them from Tailwind.
 */
export function CommunicationGrid({
  columns,
  gap = 'gap-8',
  className,
  children,
}: {
  columns: string;
  gap?: string;
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn('grid grid-cols-1', columns, gap, className)}>{children}</div>;
}

/** One column of a CommunicationGrid. min-w-0 so this column's content can never force its sibling wider than the grid track allows. */
export function CommunicationGridColumn({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn('space-y-8 min-w-0', className)}>{children}</div>;
}
