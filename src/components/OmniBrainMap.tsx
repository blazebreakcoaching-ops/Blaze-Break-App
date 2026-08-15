import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { 
  Home, MapPin, BatteryFull, Battery, MessageSquare, Book, Sparkles, 
  Zap, ShieldCheck, Wind, Apple, Activity, Shield, Users, Settings, Brain,
  Search, ArrowRight, HeartPulse, GitCommit, Compass
} from 'lucide-react';
import { cn } from '../lib/utils';

import { SHIPStage } from '../types';

interface OmniBrainMapProps {
  activeTab: string;
  setActiveTab: (tab: any) => void;
  darkMode: boolean;
  setDarkMode: (d: boolean) => void;
  shipStage?: SHIPStage;
}

interface BrainNode {
  id: string;
  label: string;
  icon: React.ComponentType<any>;
  x: number;
  y: number;
  group: 'insight' | 'action' | 'regulation' | 'data' | 'system';
  description: string;
}

// 1. Definition of nodes in the network
const BRAIN_NODES: BrainNode[] = [
  // Pre-frontal (Executive / Insight)
  { id: 'home', label: 'Pulse', icon: Home, x: 50, y: 15, group: 'insight', description: 'Real-time autonomic nervous system indicator & delta tracking' },
  { id: 'diagnose', label: 'Fingerprint', icon: MapPin, x: 25, y: 25, group: 'insight', description: 'Diagnostic profiling across five burnout archetypes' },
  { id: 'simulator', label: 'Simulator', icon: Zap, x: 75, y: 25, group: 'insight', description: 'Predictive modeling of professional task overload and reserves' },
  
  // Motor Lobe (Execution / Boundaries)
  { id: 'communicate', label: 'Boundary Lab', icon: MessageSquare, x: 15, y: 50, group: 'action', description: 'Adaptive scripts & simulated negotiation under pressure' },
  { id: 'shield', label: 'Overload Shield', icon: ShieldCheck, x: 30, y: 40, group: 'action', description: 'Metadata guardian limiting predictive communication strain' },
  { id: 'budget', label: 'Energy Budget', icon: Battery, x: 35, y: 65, group: 'action', description: 'Capacitative allocation of focus tokens before burnout' },
  
  // Limbic System (Regulation / Energy)
  { id: 'reset', label: 'Studio', icon: Wind, x: 85, y: 50, group: 'regulation', description: 'Acoustic & somatic bio-guidance for neural de-escalation' },
  { id: 'fuel', label: 'Recovery Fuel', icon: Apple, x: 70, y: 40, group: 'regulation', description: 'Bidirectional gut-brain nutrition, sunlight, & caffeine windows' },
  { id: 'recover', label: 'Recovery Hub', icon: BatteryFull, x: 65, y: 65, group: 'regulation', description: 'Active repair tracker, point distribution, & credits' },
  
  // Occipital / Base (Data / Foundation)
  { id: 'signals', label: 'Recovery Signals', icon: Activity, x: 25, y: 80, group: 'data', description: 'Biometric tracker & subjective trigger log index' },
  { id: 'reflect', label: 'The Book', icon: Book, x: 75, y: 80, group: 'data', description: 'Actionable takeaways synthesized from personal relapse reflections' },
  
  // Temporal (Connections / Systems)
  { id: 'safety', label: 'Guardians', icon: Shield, x: 10, y: 70, group: 'system', description: 'Zero-transcript crisis relay, health check & contact escrow' },
  { id: 'org', label: 'Resilience', icon: Users, x: 90, y: 70, group: 'system', description: 'Anonymized workforce collective pulse monitoring metrics' },
  { id: 'integrations', label: 'Integrations', icon: Settings, x: 40, y: 85, group: 'system', description: 'Google Workspace ecosystem connectors' },
  { id: 'engine', label: 'Evolution Engine', icon: Settings, x: 60, y: 85, group: 'system', description: 'System parameter optimization feedback loops' },
];

// Node Positions for line connections mapping
const NODE_POSITIONS: Record<string, { x: number; y: number }> = {
  nova: { x: 50, y: 50 },
  home: { x: 50, y: 15 },
  diagnose: { x: 25, y: 25 },
  simulator: { x: 75, y: 25 },
  communicate: { x: 15, y: 50 },
  shield: { x: 30, y: 40 },
  budget: { x: 35, y: 65 },
  reset: { x: 85, y: 50 },
  fuel: { x: 70, y: 40 },
  recover: { x: 65, y: 65 },
  signals: { x: 25, y: 80 },
  reflect: { x: 75, y: 80 },
  safety: { x: 10, y: 70 },
  org: { x: 90, y: 70 },
  integrations: { x: 40, y: 85 },
  engine: { x: 60, y: 85 },
};

// 2. Pre-defined bidirectional edges in our brain constellation
const CONSTELLATION_EDGES = [
  { from: 'diagnose', to: 'home' },
  { from: 'home', to: 'simulator' },
  { from: 'communicate', to: 'shield' },
  { from: 'shield', to: 'budget' },
  { from: 'reset', to: 'fuel' },
  { from: 'fuel', to: 'recover' },
  { from: 'signals', to: 'integrations' },
  { from: 'integrations', to: 'engine' },
  { from: 'engine', to: 'reflect' },
  
  // Outer loop bridges
  { from: 'diagnose', to: 'communicate' },
  { from: 'simulator', to: 'reset' },
  { from: 'communicate', to: 'safety' },
  { from: 'reset', to: 'org' },
  { from: 'budget', to: 'integrations' },
  { from: 'recover', to: 'engine' },
  { from: 'signals', to: 'safety' },
  { from: 'reflect', to: 'org' },
];

// 3. Adjacency list for path-finding (including central 'nova' core)
const ADJACENCY_LIST: Record<string, string[]> = {
  nova: [
    'home', 'diagnose', 'simulator', 
    'communicate', 'shield', 'budget', 
    'reset', 'fuel', 'recover', 
    'signals', 'reflect', 
    'safety', 'org', 'integrations', 'engine'
  ],
  home: ['nova', 'diagnose', 'simulator'],
  diagnose: ['nova', 'home', 'communicate'],
  simulator: ['nova', 'home', 'reset'],
  communicate: ['nova', 'shield', 'diagnose', 'safety'],
  shield: ['nova', 'communicate', 'budget'],
  budget: ['nova', 'shield', 'integrations'],
  reset: ['nova', 'fuel', 'simulator', 'org'],
  fuel: ['nova', 'reset', 'recover'],
  recover: ['nova', 'fuel', 'engine'],
  signals: ['nova', 'integrations', 'safety'],
  reflect: ['nova', 'engine', 'org'],
  safety: ['nova', 'communicate', 'signals'],
  org: ['nova', 'reset', 'reflect'],
  integrations: ['nova', 'signals', 'engine', 'budget'],
  engine: ['nova', 'integrations', 'reflect', 'recover']
};

// 4. Biological Synchronization Breathing Settings based on S.H.I.P. Stage
const BREATHING_PRESETS = {
  Safety: { 
    duration: 6, 
    scaleMin: 0.98, 
    scaleMax: 1.05, 
    label: '6s Baseline', 
    pacing: 'Steady, protective breathing cycle for focus conservation', 
    shadow: 'shadow-[0_0_20px_rgba(244,63,94,0.15)]',
    color: 'emerald'
  },
  Habits: { 
    duration: 8, 
    scaleMin: 0.95, 
    scaleMax: 1.09, 
    label: '8s Restoration', 
    pacing: 'Deep, slow therapeutic cycle targeting somatic reset', 
    shadow: 'shadow-[0_0_25px_rgba(16,185,129,0.25)]',
    color: 'emerald'
  },
  Identity: { 
    duration: 5, 
    scaleMin: 0.97, 
    scaleMax: 1.07, 
    label: '5s Coherence', 
    pacing: 'Symmetric, balanced breathing rhythm to unify logic grids', 
    shadow: 'shadow-[0_0_20px_rgba(245,158,11,0.2)]',
    color: 'amber'
  },
  Purpose: { 
    duration: 4, 
    scaleMin: 0.96, 
    scaleMax: 1.06, 
    label: '4s Activation', 
    pacing: 'Dynamic, warming breathing pattern for mental transitions', 
    shadow: 'shadow-[0_0_20px_rgba(59,130,246,0.2)]',
    color: 'blue'
  },
};

// Map each SHIP stage to the functional module group it actively emphasizes
const PHASE_FOCUS_GROUPS: Record<SHIPStage, string> = {
  Safety: 'action',      // Boundaries, shielding, budget conservation
  Habits: 'regulation',     // Resets, fuel, somatic restoration
  Identity: 'data',      // Biometrics, metrics, takeaways, workspace
  Purpose: 'insight',        // Executive diagnostics, predictive sim
};

// Category styling lookup
const CATEGORY_STYLES = {
  insight: {
    color: 'blue',
    border: 'border-primary/30 hover:border-primary/70',
    bg: 'bg-primary-dark/40 hover:bg-primary-dark/70',
    text: 'text-primary',
    glow: 'shadow-[rgba(234,88,12,0.25)_0px_0px_20px]',
    dotClass: 'bg-primary',
    label: 'Executive & Diagnosis'
  },
  action: {
    color: 'rose',
    border: 'border-destructive/30 hover:border-destructive/70',
    bg: 'bg-destructive/10 hover:bg-destructive/20',
    text: 'text-destructive',
    glow: 'shadow-[rgba(220,38,38,0.25)_0px_0px_20px]',
    dotClass: 'bg-destructive',
    label: 'Boundaries & Priorities'
  },
  regulation: {
    color: 'emerald',
    border: 'border-success/30 hover:border-success/70',
    bg: 'bg-success/10 hover:bg-success/20',
    text: 'text-success',
    glow: 'shadow-[rgba(16,185,129,0.25)_0px_0px_20px]',
    dotClass: 'bg-success',
    label: 'Somatic Restoration'
  },
  data: {
    color: 'amber',
    border: 'border-warning/30 hover:border-warning/70',
    bg: 'bg-warning/10 hover:bg-warning/20',
    text: 'text-warning',
    glow: 'shadow-[rgba(245,158,11,0.25)_0px_0px_20px]',
    dotClass: 'bg-warning',
    label: 'Biometrics & Takeaways'
  },
  system: {
    color: 'neutral',
    border: 'border-text-muted/30 hover:border-text-muted/70',
    bg: 'bg-surface hover:bg-border',
    text: 'text-text-muted',
    glow: 'shadow-[rgba(120,113,108,0.2)_0px_0px_20px]',
    dotClass: 'bg-text-muted',
    label: 'ESC & workspace integrations'
  }
};

// Standard BFS shortest-path finder
const findShortestPath = (start: string, end: string): string[] => {
  if (!start || !end) return [];
  if (start === end) return [start];
  
  const queue: string[][] = [[start]];
  const visited = new Set<string>([start]);
  
  while (queue.length > 0) {
    const path = queue.shift()!;
    const node = path[path.length - 1];
    
    if (node === end) return path;
    
    const neighbors = ADJACENCY_LIST[node] || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([...path, neighbor]);
      }
    }
  }
  return [];
};

export const OmniBrainMap = ({ activeTab, setActiveTab, darkMode, setDarkMode, shipStage = 'Safety' }: OmniBrainMapProps) => {
  const [startNode, setStartNode] = useState<string>('diagnose');
  const [endNode, setEndNode] = useState<string>('recover');
  const [searchQuery, setSearchQuery] = useState('');
  
  const currentPreset = BREATHING_PRESETS[shipStage] || BREATHING_PRESETS.Safety;
  const currentFocusGroup = PHASE_FOCUS_GROUPS[shipStage] || 'regulation';

  // Compute shortest path based on current source & destination selection
  const shortestPath = useMemo(() => {
    return findShortestPath(startNode, endNode);
  }, [startNode, endNode]);

  // Compute successive connections that comprise the highlighted shortest path
  const pathPairs = useMemo(() => {
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < shortestPath.length - 1; i++) {
      pairs.push([shortestPath[i], shortestPath[i + 1]]);
    }
    return pairs;
  }, [shortestPath]);

  // Handle auto-completion node filtering
  const filteredSearchNodes = useMemo(() => {
    if (!searchQuery) return [];
    return BRAIN_NODES.filter(node => 
      node.label.toLowerCase().includes(searchQuery.toLowerCase()) || 
      node.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  // Coach insights dynamically calculated based on the relation / length of route
  const pathInsight = useMemo(() => {
    if (shortestPath.length === 0) return 'Select any two active nodes to map structural flows.';
    const length = shortestPath.length - 1;
    const startObj = BRAIN_NODES.find(n => n.id === startNode) || { label: 'Start' };
    const endObj = BRAIN_NODES.find(n => n.id === endNode) || { label: 'Destination' };

    if (length === 1) {
      return `Direct somatic mapping active. Connecting ${startObj.label} directly with ${endObj.label} represents immediate autonomic feedback to reinforce baseline reserves.`;
    }
    if (length === 2 && shortestPath.includes('nova')) {
      return `Core centralized routing. Insights from ${startObj.label} flow through the central Nova Core to optimize ${endObj.label}, balancing physiological cues with executive boundaries.`;
    }
    return `Synaptic flow verified (${length} Hops). Bridging ${startObj.label} with ${endObj.label} requires an integrated chain. This proves that cognitive recovery directly rests on biological scaffolding.`;
  }, [shortestPath, startNode, endNode]);

  return (
    <div className="min-h-screen w-full flex flex-col relative overflow-hidden bg-surface pt-6 md:pt-10 px-4 md:px-8 pb-16 font-sans">
      
      {/* Dynamic Background Organic Glows */}
      <div className="absolute inset-0 z-0 pointer-events-none flex items-center justify-center">
        <div className="absolute w-[600px] h-[600px] bg-primary/5 rounded-full blur-[140px] -translate-y-20" />
        <div className="absolute w-[400px] h-[400px] bg-success/5 rounded-full blur-[110px] translate-x-44" />
        <div className="absolute w-[400px] h-[400px] bg-destructive/5 rounded-full blur-[110px] -translate-x-44" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wMykiLz48L3N2Zz4=')] opacity-50" />
      </div>

      {/* Main Top Header */}
      <div className="z-10 flex flex-col md:flex-row items-center justify-between w-full max-w-7xl mx-auto mb-8 gap-4 border-b border-white/5 pb-6">
        <div className="flex items-center gap-4 text-left">
          <div className="p-3 bg-primary/10 border border-primary/30 rounded-2xl">
            <Brain className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-display font-black text-text-main tracking-tight leading-tight">
              OmniBrain Integration
            </h1>
            <p className="text-[#9a3412] dark:text-primary-light/50 font-mono text-xs uppercase tracking-[0.25em] mt-0.5">Central Nervous System Mapping Engine</p>
          </div>
        </div>

        {/* Biological Synchrony Breathe Indicator widget */}
        <div className="p-4 bg-card/60 border border-white/10 backdrop-blur-xl rounded-2xl flex items-center gap-4 max-w-xs md:max-w-md w-full">
          <div className="relative">
            <motion.div 
              animate={{ scale: [1, 1.25, 1] }}
              transition={{ duration: currentPreset.duration, repeat: Infinity, ease: "easeInOut" }}
              className="w-10 h-10 rounded-full border border-success/50 bg-success/10 flex items-center justify-center text-success/40"
            >
              <HeartPulse className="w-5 h-5 animate-pulse" />
            </motion.div>
            <div className="absolute -bottom-1 -right-1 w-4.5 h-4.5 bg-surface border border-white/10 rounded-full flex items-center justify-center">
              <span className="w-2.5 h-2.5 rounded-full bg-success animate-ping" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-success font-mono">Synced Breathing</span>
              <span className="px-1.5 py-0.5 bg-success-foreground text-success/40 rounded text-[11px] font-bold uppercase">{currentPreset.label}</span>
            </div>
            <p className="text-[11px] text-text-muted mt-1 leading-normal line-clamp-1">
              Active Stage: <strong className="text-text-main font-semibold">{shipStage}</strong> · {currentPreset.pacing}
            </p>
          </div>
        </div>
      </div>

      {/* Main Full Scale Multi-column responsive layout */}
      <div className="z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 w-full max-w-7xl mx-auto flex-1 items-stretch">
        
        {/* Left Hand: Controls Section (Path Finder, Autocomplete, Diagnostics) */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          {/* Node Direct Search Input */}
          <div className="card p-6 border border-border bg-surface space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
              <Compass className="w-4 h-4 text-primary" /> Core Module Search
            </h3>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search modules..." 
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/15 bg-surface/60 text-text-main placeholder-slate-500 text-xs font-medium focus:ring-1 focus:ring-primary focus:outline-none transition-all"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-text-muted hover:text-text-main"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Filter Dropdown list based on Autocomplete filter */}
            {searchQuery && (
              <div className="border border-white/10 rounded-xl bg-surface overflow-hidden max-h-48 overflow-y-auto divide-y divide-white/5">
                {filteredSearchNodes.length > 0 ? (
                  filteredSearchNodes.map(node => (
                    <button 
                      key={`search-res-${node.id}`}
                      onClick={() => {
                        setEndNode(node.id);
                        setSearchQuery('');
                      }}
                      className="w-full text-left p-3 hover:bg-white/5 transition-colors flex items-center justify-between text-xs cursor-pointer group"
                    >
                      <div className="flex items-center gap-3">
                        <node.icon className="w-4 h-4 text-primary" />
                        <div>
                          <p className="font-bold text-text-main">{node.label}</p>
                          <p className="text-xs text-text-muted truncate max-w-[180px]">{node.description}</p>
                        </div>
                      </div>
                      <span className="text-[11px] uppercase tracking-widest text-primary opacity-0 group-hover:opacity-100 transition-opacity">Select Dest</span>
                    </button>
                  ))
                ) : (
                  <p className="p-4 text-center text-text-muted text-xs">No matching recovery modules found.</p>
                )}
              </div>
            )}
          </div>

          {/* Interactive Path Finder Setup */}
          <div className="card p-6 border border-border bg-surface space-y-5">
            <h3 className="text-xs font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
              <GitCommit className="w-4 h-4 text-primary" /> Neural Path Routing
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 text-left">
                <label className="text-xs font-black uppercase tracking-wider text-text-muted">Source</label>
                <select 
                  value={startNode} 
                  onChange={(e) => setStartNode(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl border border-border bg-surface text-text-main text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                >
                  {BRAIN_NODES.map(node => (
                    <option key={`start-opt-${node.id}`} value={node.id} className="bg-surface">
                      {node.label}
                    </option>
                  ))}
                  <option value="nova" className="bg-surface">Nova Core</option>
                </select>
              </div>

              <div className="space-y-1.5 text-left">
                <label className="text-xs font-black uppercase tracking-wider text-text-muted">Destination</label>
                <select 
                  value={endNode} 
                  onChange={(e) => setEndNode(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl border border-border bg-surface text-text-main text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                >
                  {BRAIN_NODES.map(node => (
                    <option key={`end-opt-${node.id}`} value={node.id} className="bg-surface">
                      {node.label}
                    </option>
                  ))}
                  <option value="nova" className="bg-surface">Nova Core</option>
                </select>
              </div>
            </div>

            {/* Render Calculated Pathway */}
            <div className="p-4 bg-card/50 rounded-xl border border-white/5 space-y-3">
              <p className="text-[11px] font-black uppercase tracking-wider text-primary font-mono">Calculated Shortest Path</p>
              
              <div className="flex flex-wrap items-center gap-2">
                {shortestPath.map((nodeId, idx) => {
                  const nodeObj = BRAIN_NODES.find(n => n.id === nodeId) || { label: nodeId === 'nova' ? 'Nova Core' : nodeId };
                  return (
                    <React.Fragment key={`path-step-${nodeId}`}>
                      {idx > 0 && <ArrowRight className="w-3 h-3 text-text-muted" />}
                      <span className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-bold border",
                        nodeId === 'nova' 
                          ? "bg-card border-primary text-primary"
                          : "bg-surface border-white/10 text-text-main"
                      )}>
                        {nodeObj.label}
                      </span>
                    </React.Fragment>
                  );
                })}
              </div>

              <div className="pt-2 border-t border-white/5">
                <p className="text-[11px] text-[#9a3412] dark:text-primary-light/70 italic leading-relaxed text-left">
                  "{pathInsight}"
                </p>
              </div>
            </div>
          </div>

          {/* Somatic Context Checklist */}
          <div className="card p-6 border border-border bg-surface text-left space-y-4">
             <h4 className="text-xs font-black uppercase tracking-widest text-[#94a3b8]">Biological Coherence Checklist</h4>
             <ul className="space-y-2.5 text-xs text-text-muted">
               <li className="flex items-start gap-2.5">
                 <span className="w-4 h-4 rounded bg-primary/10 border border-primary/30 text-primary text-xs font-bold flex items-center justify-center shrink-0">1</span>
                 <span>Synchronize inhaling with target node expansions</span>
               </li>
               <li className="flex items-start gap-2.5">
                 <span className="w-4 h-4 rounded bg-primary/10 border border-primary/30 text-primary text-xs font-bold flex items-center justify-center shrink-0">2</span>
                 <span>Connect modules to establish functional boundaries</span>
               </li>
               <li className="flex items-start gap-2.5">
                 <span className="w-4 h-4 rounded bg-primary/10 border border-primary/30 text-primary text-xs font-bold flex items-center justify-center shrink-0">3</span>
                 <span>Consult system parameters using the shortest path</span>
               </li>
             </ul>
          </div>

          {/* Theme switcher */}
          <div className="mt-auto">
            <button 
              onClick={() => setDarkMode(!darkMode)}
              className="w-full px-6 py-3.5 rounded-2xl bg-surface border border-white/10 hover:border-muted-foreground text-text-muted hover:text-text-main transition-all text-xs font-black uppercase tracking-widest cursor-pointer hover:bg-card/60"
            >
              {darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            </button>
          </div>
        </div>

        {/* Right Hand: Interactive Map Card Grid */}
        <div className="lg:col-span-8 flex flex-col relative bg-surface rounded-xl border border-border p-6 min-h-[500px] md:min-h-[600px] justify-center items-center">
          
          {/* Main Visual Core map wrapper */}
          <div className="relative w-full max-w-4xl aspect-square z-10 flex items-center justify-center scale-90 md:scale-100">
            
            {/* Connection Highways SVG Layer */}
            <svg 
              className="absolute inset-0 w-full h-full pointer-events-none" 
              style={{ zIndex: -1 }}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="neural-gradient" x1="0" y1="0" x2="100" y2="100">
                  <stop offset="0%" stopColor="rgba(99, 102, 241, 0.4)" />
                  <stop offset="100%" stopColor="rgba(236, 72, 153, 0.4)" />
                </linearGradient>
              </defs>

              {/* Central Core Connection Lines */}
              {BRAIN_NODES.map(node => {
                const isPathSegment = shortestPath.includes(node.id) && shortestPath.includes('nova');
                return (
                  <path 
                    key={`conn-${node.id}`}
                    d={`M 50 50 L ${node.x} ${node.y}`}
                    stroke={isPathSegment ? "rgba(99, 102, 241, 0.8)" : "url(#neural-gradient)"}
                    strokeWidth={isPathSegment ? "0.3" : "0.15"}
                    fill="none"
                    strokeDasharray={isPathSegment ? "0" : "0.4 0.6"}
                    className={cn(
                      "transition-all duration-300",
                      isPathSegment ? "opacity-100" : "opacity-30"
                    )}
                  />
                );
              })}

              {/* Draw General Constellation Edges */}
              {CONSTELLATION_EDGES.map((edge, idx) => {
                const fromPos = NODE_POSITIONS[edge.from];
                const toPos = NODE_POSITIONS[edge.to];
                if (!fromPos || !toPos) return null;
                return (
                  <line 
                    key={`constellation-${idx}`}
                    x1={fromPos.x}
                    y1={fromPos.y}
                    x2={toPos.x}
                    y2={toPos.y}
                    stroke="rgba(255, 255, 255, 0.08)"
                    strokeWidth="0.1"
                  />
                );
              })}

              {/* Draw Highlighted Synaptic Routing (Action Shortest Path Pairs) */}
              {pathPairs.map(([fromNode, toNode], idx) => {
                const fromPos = NODE_POSITIONS[fromNode];
                const toPos = NODE_POSITIONS[toNode];
                if (!fromPos || !toPos) return null;
                return (
                  <g key={`highlighted-path-segment-${idx}`}>
                    {/* Glowing Blur Underlay */}
                    <line 
                      x1={fromPos.x}
                      y1={fromPos.y}
                      x2={toPos.x}
                      y2={toPos.y}
                      stroke="rgba(99, 102, 241, 0.7)"
                      strokeWidth="0.5"
                      className="animate-pulse"
                    />
                    {/* Core Solid routing Line */}
                    <line 
                      x1={fromPos.x}
                      y1={fromPos.y}
                      x2={toPos.x}
                      y2={toPos.y}
                      stroke="#818cf8"
                      strokeWidth="0.25"
                    />
                  </g>
                );
              })}
            </svg>

            {/* CENTRAL CORE - Nova brain center */}
            <motion.button 
              onClick={() => setActiveTab('nova')}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              className={cn(
                "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full bg-card border border-primary flex flex-col items-center justify-center gap-1 cursor-pointer z-20 group transition-all duration-300",
                shortestPath.includes('nova') ? "shadow-[0_0_55px_rgba(234,88,12,0.85)] scale-[1.08]" : "shadow-[0_0_35px_rgba(234,88,12,0.4)]"
              )}
            >
              <Sparkles className="w-8 h-8 text-primary group-hover:text-text-main transition-colors" />
              <span className="text-[11px] font-black uppercase tracking-wider text-primary">Nova Core</span>
              
              <div className="absolute inset-0 border-2 border-primary/20 rounded-full animate-ping" style={{ animationDuration: `${currentPreset.duration}s` }} />
            </motion.button>

            {/* Orbiting Brain Node Buttons */}
            {BRAIN_NODES.map((node, i) => {
              const NodeIcon = node.icon;
              const isPathActive = shortestPath.includes(node.id);
              const isGroupActive = node.group === currentFocusGroup;
              
              const styles = CATEGORY_STYLES[node.group];
              
              return (
                <motion.button
                  key={node.id}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ 
                    opacity: 1, 
                    // Nodes associated with the current SHIP focus group scale up slightly larger inside their synchronized breathe loop cycle
                    scale: isGroupActive 
                      ? [1, currentPreset.scaleMax + 0.02, 1] 
                      : [1, currentPreset.scaleMax, 1]
                  }}
                  transition={{ 
                    scale: {
                      duration: currentPreset.duration, 
                      repeat: Infinity, 
                      ease: "easeInOut",
                      delay: i * 0.15 
                    },
                    default: { delay: i * 0.05, type: 'spring' }
                  }}
                  whileHover={{ scale: 1.18, y: -4, transition: { duration: 0.2 } }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setActiveTab(node.id)}
                  className={cn(
                    "absolute -ml-12 -mt-12 w-24 h-24 flex flex-col items-center justify-center rounded-2xl border backdrop-blur-md cursor-pointer transition-all group duration-300",
                    styles.bg,
                    styles.border,
                    styles.text,
                    isPathActive
                      ? "border-primary outline outline-3 outline-primary/60 shadow-[0_0_35px_rgba(234,88,12,0.6)] font-extrabold"  
                      : isGroupActive 
                        ? "border-success/80 shadow-[0_0_20px_rgba(16,185,129,0.35)]" 
                        : styles.glow,
                  )}
                  style={{
                    left: `${node.x}%`,
                    top: `${node.y}%`
                  }}
                  title={node.description}
                >
                  <NodeIcon className="w-7 h-7 mb-1.5 opacity-85 group-hover:opacity-100 transition-opacity" />
                  <span className="text-xs font-black uppercase text-center leading-tight tracking-wider px-1">
                    {node.label}
                  </span>
                  {/* Subtle active status dot or highlight indicators */}
                  {isPathActive && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary animate-pulse" />
                  )}
                  {isGroupActive && (
                    <span className="absolute bottom-1.5 w-1.5 h-1.5 rounded-full bg-success animate-ping" />
                  )}
                </motion.button>
              );
            })}
          </div>

          {/* 5. FLOATING CATEGORY LEGEND */}
          <div className="absolute bottom-6 right-6 md:right-8 bg-card border border-border p-5 rounded-xl max-w-sm text-left shadow-lg space-y-3.5">
            <div className="flex items-center gap-2 border-b border-white/5 pb-2">
              <Compass className="w-4 h-4 text-primary" />
              <span className="text-xs font-black uppercase tracking-wider text-text-main">Interactive Legend</span>
            </div>
            
            <div className="grid grid-cols-1 gap-2.5">
              {Object.entries(CATEGORY_STYLES).map(([key, style]) => {
                const isGroupFocus = key === currentFocusGroup;
                return (
                  <div key={key} className="flex items-center justify-between text-xs font-medium">
                    <div className="flex items-center gap-2.5">
                      <span className={cn("w-2.5 h-2.5 rounded-full block shrink-0", style.dotClass)} />
                      <span className={cn("font-bold text-text-muted capitalize")}>{key}</span>
                      <span className="text-xs text-text-muted">· {style.label}</span>
                    </div>
                    {isGroupFocus && (
                      <span className="px-1.5 py-0.5 rounded bg-success-foreground/60 border border-success-foreground/40 text-success text-[10px] font-black uppercase tracking-wider scale-90">
                        Active Phase
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
