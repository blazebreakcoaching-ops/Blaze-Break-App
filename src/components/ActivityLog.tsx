import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Activity, Clock } from 'lucide-react';
import { NovaMemory, getNovaBrain } from '../lib/nova-brain';

export const ActivityLog = ({ 
  onDragStart, 
  onDragOver, 
  onDrop 
}: {
  onDragStart?: (e: React.DragEvent, id: string) => void,
  onDragOver?: (e: React.DragEvent, id: string) => void,
  onDrop?: (e: React.DragEvent, id: string) => void
}) => {
  const [logs, setLogs] = useState<NovaMemory[]>([]);

  useEffect(() => {
    const fetchLogs = () => {
      const brain = getNovaBrain();
      const stateMemories = brain
        .filter(m => m.type === 'state')
        .sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5); // Only latest 5
      setLogs(stateMemories);
    };

    fetchLogs();

    const handleUpdate = () => fetchLogs();
    window.addEventListener('nova-brain-updated', handleUpdate);
    return () => window.removeEventListener('nova-brain-updated', handleUpdate);
  }, []);

  const formatTime = (isoString: string) => {
    const d = new Date(isoString);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  };

  return (
    <div
      id="activity"
      draggable
      tabIndex={0}
      onDragStart={(e) => onDragStart?.(e, 'activity')}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver?.(e, 'activity');
      }}
      onDrop={(e) => onDrop?.(e, 'activity')}
      className="card p-6 bg-card border border-border shadow-md space-y-6 cursor-grab active:cursor-grabbing hover:shadow-lg transition-all"
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
          <Activity className="w-4 h-4" />
        </div>
        <h3 className="text-sm font-black uppercase tracking-widest text-text-main">Recovery Actions Log</h3>
      </div>
      
      <div className="space-y-4" role="log" aria-live="polite">
        {logs.length > 0 ? (
          <AnimatePresence>
            {logs.map((log) => (
              <motion.div 
                key={log.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex gap-4 border-l-2 border-primary/20 pl-4 py-1"
              >
                <div className="flex-1 space-y-1">
                  <p className="text-xs text-text-main font-medium leading-relaxed">
                    {log.content.replace(/^User Action:\s*/, '')}
                  </p>
                  <div className="flex items-center gap-1.5 text-[10px] uppercase font-black tracking-widest text-text-muted">
                    <Clock className="w-3 h-3" />
                    {formatTime(log.createdAt)}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        ) : (
          <div className="text-center py-6">
            <p className="text-sm text-text-muted font-medium italic">No recent recovery logs found. Complete an action to establish your baseline.</p>
          </div>
        )}
      </div>
    </div>
  );
};
