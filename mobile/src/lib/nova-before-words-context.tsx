// Before Words is temporary, voluntary context for ONE Nova reply.
// Nothing here writes to storage, Firestore or analytics. A separate
// provider keyed by the Firebase uid prevents account-to-account leaks.
import React, { createContext, useContext, useState } from 'react';
import type { NovaTemporaryBeforeWordsContext } from '../../../nova-before-words-temporary-context';

interface BeforeWordsContextValue {
  pending: NovaTemporaryBeforeWordsContext | null;
  setPending: (value: NovaTemporaryBeforeWordsContext | null) => void;
  clear: () => void;
}

const BeforeWordsContext = createContext<BeforeWordsContextValue>({
  pending: null,
  setPending: () => {},
  clear: () => {},
});

export const useNovaBeforeWords = () => useContext(BeforeWordsContext);

export const NovaBeforeWordsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pending, setPending] = useState<NovaTemporaryBeforeWordsContext | null>(null);
  return (
    <BeforeWordsContext.Provider value={{ pending, setPending, clear: () => setPending(null) }}>
      {children}
    </BeforeWordsContext.Provider>
  );
};
