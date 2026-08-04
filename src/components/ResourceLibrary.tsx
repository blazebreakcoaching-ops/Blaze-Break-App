import { motion } from 'motion/react';
import { BookOpen, Headphones, Presentation, PlayCircle, Library, Lock, Star } from 'lucide-react';
import { BurnoutFingerprint } from '../types';

interface ResourceLibraryProps {
  fingerprint: BurnoutFingerprint | null;
}

const RESOURCES = [
  {
    id: 'r1',
    title: 'Understanding Neural Fatigue',
    type: 'Guide',
    category: 'Safety',
    readTime: '8 min',
    icon: BookOpen,
    description: 'A deep-dive into managing cognitive overload before it becomes physiological burnout.'
  },
  {
    id: 'r2',
    title: 'De-escalating the "Fawning" Response',
    type: 'Audio',
    category: 'Practice',
    readTime: '15 min',
    icon: Headphones,
    description: 'Guided audio practice for replacing people-pleasing with objective boundary-setting.'
  },
  {
    id: 'r3',
    title: 'Performance Identity Decoupling',
    type: 'Workshop',
    category: 'Reflect',
    readTime: '45 min',
    icon: Presentation,
    description: 'An interactive workshop on separating self-worth from output metrics.'
  },
  {
    id: 'r4',
    title: 'Nervous System Regulation Tactics',
    type: 'Video',
    category: 'Habits',
    readTime: '12 min',
    icon: PlayCircle,
    description: 'Visual techniques for bringing the sympathetic nervous system back to baseline.'
  }
];

export const ResourceLibrary = ({ fingerprint }: ResourceLibraryProps) => {
  return (
    <div className="space-y-12 pb-24">
      <div className="max-w-4xl">
        <div className="flex items-center gap-4 mb-4">
           <div className="tag">Blaze Book / Knowledge Base</div>
           <div className="h-px flex-1 bg-border/40" />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div className="space-y-4">
            <h3 className="text-5xl font-display font-bold text-text-main tracking-tight">Resource Library</h3>
            <p className="text-xl text-text-muted font-medium  max-w-2xl">
              "You cannot out-work a structural deficit. Learn the mechanics of High-Performance Recovery."
            </p>
          </div>
          <div className="flex items-center gap-3 px-6 py-3 bg-card rounded-full border border-primary/20 shadow-md">
            <Library className="w-5 h-5 text-primary" />
            <span className="text-xs font-black uppercase tracking-[0.2em] text-text-muted">4 Archives Available</span>
          </div>
        </div>
      </div>

      {fingerprint && (
        <div className="card border border-accent/20 bg-accent/5 p-8 relative overflow-hidden">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <Star className="w-4 h-4 text-accent" fill="currentColor" />
                <span className="text-xs font-black uppercase tracking-widest text-accent">Nova Recommendation</span>
              </div>
              <h4 className="text-2xl font-display font-bold text-text-main">Curated for "{fingerprint.profile || 'High Achiever'}"</h4>
              <p className="text-sm font-medium text-text-muted">Based on your latest fingerprint, Nova suggests starting with the Performance Identity Decoupling workshop.</p>
            </div>
            <button className="btn-primary hover:bg-accent hover:border-accent">Access Workshop</button>
          </div>
                  </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {RESOURCES.map((resource, i) => (
          <motion.div
            key={resource.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="card border border-border p-8 group hover:-translate-y-1 transition-all cursor-pointer relative overflow-hidden"
          >
            <div className="flex items-start justify-between mb-8">
              <div className="w-14 h-14 bg-white/50 dark:bg-surface rounded-2xl border border-border/40 shadow-inner flex items-center justify-center text-text-main group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-all">
                <resource.icon className="w-6 h-6" />
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="tag">{resource.category}</span>
                <span className="text-xs font-black uppercase tracking-widest text-text-muted ">{resource.type} • {resource.readTime}</span>
              </div>
            </div>
            <div className="space-y-3 relative z-10">
              <h4 className="text-xl font-display font-bold text-text-main group-hover:text-primary transition-colors">{resource.title}</h4>
              <p className="text-sm text-text-muted font-medium leading-relaxed ">{resource.description}</p>
            </div>
          </motion.div>
        ))}

        {/* Locked Pro Resource Placeholder */}
        <div className="card border border-dashed border-border p-8 bg-surface dark:bg-card/50 relative overflow-hidden">
            <div className="absolute inset-0 bg-card/5 backdrop-blur-[2px] z-20 flex items-center justify-center">
              <div className="bg-white dark:bg-surface px-6 py-3 rounded-full shadow-md flex items-center gap-3 border border-border">
                <Lock className="w-4 h-4 text-text-muted" />
                <span className="text-xs font-black uppercase tracking-widest text-text-main">Unlock at Rank: Vanguard</span>
              </div>
            </div>
            <div className="opacity-40">
              <div className="flex items-start justify-between mb-8">
                <div className="w-14 h-14 bg-border dark:bg-surface rounded-2xl flex items-center justify-center text-text-muted">
                  <Presentation className="w-6 h-6" />
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="tag">Masterclass</span>
                  <span className="text-xs font-black uppercase tracking-widest text-text-muted">Video • 60 min</span>
                </div>
              </div>
              <div className="space-y-3">
                <h4 className="text-xl font-display font-bold text-text-main">The Architecture of Capacity</h4>
                <p className="text-sm text-text-muted font-medium leading-relaxed">Advanced strategies for organizing your life and commitments to prevent baseline collapse.</p>
              </div>
            </div>
        </div>
      </div>
    </div>
  );
};
