// Shares one NovaInvisibleLoadContext between the native Nova chat screen
// and the Invisible Load sub-screen (app/(tabs)/nova/_layout.tsx wraps
// both in this provider) - React Navigation unmounts/remounts each
// screen on its own, so without this, navigating away and back would
// silently lose whatever was just added. Reuses
// nova-invisible-load-contract.ts directly from the repo root (it has
// zero imports of its own - see that file's header - so there is nothing
// web-specific to port); this file only adds the React state container
// around it, matching src/lib/firebase.ts's own cross-repo-reuse pattern
// for this project.
import React, { createContext, useContext, useState } from 'react';
import {
  initNovaInvisibleLoadContext, addInvisibleLoadItem, removeInvisibleLoadItem,
  type NovaInvisibleLoadContext as InvisibleLoadState, type NovaInvisibleLoadCategory,
} from '../../../nova-invisible-load-contract';

interface NovaInvisibleLoadContextValue {
  state: InvisibleLoadState;
  addItem: (description: string, category: NovaInvisibleLoadCategory, userCertain: boolean) => void;
  removeItem: (itemId: string) => void;
  reset: () => void;
}

const NovaInvisibleLoadContext = createContext<NovaInvisibleLoadContextValue>({
  state: initNovaInvisibleLoadContext(),
  addItem: () => {},
  removeItem: () => {},
  reset: () => {},
});

export const useNovaInvisibleLoad = () => useContext(NovaInvisibleLoadContext);

export const NovaInvisibleLoadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<InvisibleLoadState>(initNovaInvisibleLoadContext());

  const addItem = (description: string, category: NovaInvisibleLoadCategory, userCertain: boolean) => {
    setState((current) => addInvisibleLoadItem(current, description, category, userCertain));
  };
  const removeItem = (itemId: string) => {
    setState((current) => removeInvisibleLoadItem(current, itemId));
  };
  const reset = () => setState(initNovaInvisibleLoadContext());

  return (
    <NovaInvisibleLoadContext.Provider value={{ state, addItem, removeItem, reset }}>
      {children}
    </NovaInvisibleLoadContext.Provider>
  );
};
