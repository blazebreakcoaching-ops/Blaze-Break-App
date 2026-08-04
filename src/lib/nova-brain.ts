export type MemoryType = 'profile' | 'trigger' | 'state' | 'rule' | 'preference';
export type ConfidenceLevel = 'low' | 'medium' | 'high' | 'verified';

export interface NovaMemory {
  id: string;
  type: MemoryType;
  content: string;
  source: string;
  confidence: ConfidenceLevel;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
}

export const getNovaBrain = (): NovaMemory[] => {
  try {
    const stored = localStorage.getItem('blaze_nova_brain');
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {}
  
  return [];
};

export const addNovaMemory = (memory: Omit<NovaMemory, 'id' | 'createdAt' | 'updatedAt'>) => {
  const brain = getNovaBrain();
  const newMemory: NovaMemory = {
    ...memory,
    id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  brain.push(newMemory);
  localStorage.setItem('blaze_nova_brain', JSON.stringify(brain));
  window.dispatchEvent(new Event('nova-brain-updated'));
};

export const logJourney = (action: string, details?: string) => {
  let brain = getNovaBrain();
  
  const content = `User Action: ${action}${details ? ` - ${details}` : ''}`;
  const newMemory: NovaMemory = {
    id: `mem_journey_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    type: 'state',
    content,
    source: 'App Journey Protocol',
    confidence: 'verified',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    canEdit: false,
  };
  
  brain.push(newMemory);
  
  const stateMemories = brain.filter(m => m.type === 'state').sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const olderStatesToRemove = stateMemories.slice(15);
  const idsToRemove = new Set(olderStatesToRemove.map(m => m.id));
  
  brain = brain.filter(m => !idsToRemove.has(m.id));
  
  localStorage.setItem('blaze_nova_brain', JSON.stringify(brain));
  window.dispatchEvent(new Event('nova-brain-updated'));
};

export const deleteNovaMemory = (id: string) => {
  let brain = getNovaBrain();
  brain = brain.filter(m => m.id !== id);
  localStorage.setItem('blaze_nova_brain', JSON.stringify(brain));
  window.dispatchEvent(new Event('nova-brain-updated'));
};

export const updateNovaMemoryBySourceAndType = (
  source: string,
  type: MemoryType,
  memoryParams: Omit<NovaMemory, 'id' | 'createdAt' | 'updatedAt' | 'source' | 'type'>
) => {
  const brain = getNovaBrain();
  const existingIndex = brain.findIndex(m => m.source === source && m.type === type);
  
  if (existingIndex > -1) {
    brain[existingIndex] = {
      ...brain[existingIndex],
      ...memoryParams,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem('blaze_nova_brain', JSON.stringify(brain));
    window.dispatchEvent(new Event('nova-brain-updated'));
  } else {
    addNovaMemory({
      source,
      type,
      ...memoryParams
    });
  }
};

