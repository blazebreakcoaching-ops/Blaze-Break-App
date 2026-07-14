import React, { useState } from 'react';
import { Clock, BatteryCharging, Wind, Brain, Play, Square } from 'lucide-react';
import { cn } from '../lib/utils';
import { SHIPStage } from '../types';
import { SmartCard } from './SmartCard';

export const MicroInterventions = ({ shipStage, id = "micro", onDragStart, onDragOver, onDrop }: { 
  shipStage: SHIPStage, 
  id?: string,
  onDragStart?: any,
  onDragOver?: any,
  onDrop?: any
}) => {
  const [activeId, setActiveId] = useState<string | null>(null);

  const interventions = [
    {
      id: 'breathing',
      title: 'Box Breathing',
      duration: '2 min',
      icon: Wind,
      description: '4s inhale, 4s hold, 4s exhale, 4s hold. Resets the autonomic nervous system.',
      color: 'text-text-main',
      bg: 'bg-text-main/10'
    },
    {
      id: 'vision',
      title: 'Panoramic Vision',
      duration: '1 min',
      icon: Brain,
      description: 'Look at the horizon or widen your gaze to reduce narrow-focus stress.',
      color: 'text-primary',
      bg: 'bg-primary/10'
    },
    {
      id: 'movement',
      title: 'Physiological Sigh',
      duration: '3 min',
      icon: BatteryCharging,
      description: 'Two quick inhales through the nose, one long exhale through the mouth.',
      color: 'text-warning',
      bg: 'bg-warning/10'
    }
  ];

  return (
    <SmartCard 
      id={id} 
      title={
        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5 text-primary" />
          <div>
            <span className="font-display font-bold text-text-main">Micro-Interventions</span>
          </div>
        </div>
      }
      energyDrain="low"
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="space-y-6 flex flex-col p-6"
    >
      <div className="mb-2">
        <p className="text-xs font-semibold text-text-muted">Short, actionable recovery activities under 5 minutes.</p>
      </div>
      
      <div className="grid grid-cols-1 gap-4">
        {interventions.map(inter => {
          const isActive = activeId === inter.id;
          return (
            <div 
              key={inter.id} 
              onClick={() => setActiveId(isActive ? null : inter.id)}
              className={cn(
                "p-4 rounded-2xl border transition-all cursor-pointer group relative overflow-hidden",
                isActive ? "border-primary bg-primary/5 shadow-md shadow-primary/10" : "border-border bg-surface dark:bg-surface/50 hover:bg-white dark:hover:bg-surface/80 hover:border-border dark:hover:border-border"
              )}
            >
              {isActive && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 dark:via-white/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
              )}
              
              <div className="flex items-start justify-between mb-3 relative z-10">
                <div className={cn("p-2 rounded-lg flex items-center justify-center transition-transform", inter.bg, inter.color, isActive && "scale-110")}>
                  <inter.icon className="w-4 h-4" />
                </div>
                
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-xs font-black tracking-widest px-2 py-1 rounded-full transition-colors",
                    isActive ? "bg-primary text-primary-foreground" : "text-text-muted bg-white dark:bg-surface"
                  )}>
                    {inter.duration}
                  </span>
                  <button 
                    className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center transition-all",
                      isActive ? "bg-primary/20 text-primary" : "bg-border dark:bg-surface text-text-muted hover:bg-primary/10 hover:text-primary group-hover:scale-110"
                    )}
                  >
                    {isActive ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current ml-0.5" />}
                  </button>
                </div>
              </div>
              
              <div className="relative z-10">
                <h4 className={cn("font-bold text-sm mb-1 transition-colors", isActive ? "text-primary" : "text-text-main group-hover:text-primary")}>
                  {inter.title}
                </h4>
                <p className={cn("text-xs leading-relaxed transition-colors", isActive ? "text-text-main font-medium" : "text-text-muted")}>
                  {inter.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </SmartCard>
  );
};
