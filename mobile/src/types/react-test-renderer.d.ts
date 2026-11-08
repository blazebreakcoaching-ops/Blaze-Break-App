// Minimal typings for the parts of react-test-renderer (already installed
// via jest-expo) used by component tests. Avoids adding a new dependency.
declare module 'react-test-renderer' {
  import type { ReactElement } from 'react';
  export interface ReactTestInstance {
    props: Record<string, any>;
    findAll(predicate: (node: ReactTestInstance) => boolean): ReactTestInstance[];
  }
  export interface ReactTestRenderer {
    root: ReactTestInstance;
    toJSON(): unknown;
    unmount(): void;
  }
  export function create(element: ReactElement): ReactTestRenderer;
  export function act(callback: () => void | Promise<void>): Promise<void>;
}
