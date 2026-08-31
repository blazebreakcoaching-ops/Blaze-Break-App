import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, FileText, CheckCircle, Share2, Check } from 'lucide-react';
import { cn } from '../lib/utils.ts';

interface SmartCardProps {
  children: React.ReactNode;
  className?: string;
  id: string;
  onDragStart?: (e: React.DragEvent, id: string) => void;
  onDragOver?: (e: React.DragEvent, id: string) => void;
  onDrop?: (e: React.DragEvent, id: string) => void;
  title?: React.ReactNode;
  energyDrain?: 'low' | 'medium' | 'high';
}

export const SmartCard = ({ 
  children, 
  className, 
  id,
  onDragStart,
  onDragOver,
  onDrop,
  title,
  energyDrain
}: SmartCardProps) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const [clampedMenuPos, setClampedMenuPos] = useState({ x: 0, y: 0 });
  const [isMicroRecovery, setIsMicroRecovery] = useState(id === 'micro');
  const [isCopied, setIsCopied] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);

  // Reading cardRef.current directly inside the render's JSX (e.g. in a style
  // object) reads a ref during render, which React's rules disallow - it can
  // produce stale values if a render is discarded/redone under Concurrent
  // rendering. Measuring here, in a layout effect that fires right after the
  // menu's DOM mounts but before the browser paints, is the correct place.
  useLayoutEffect(() => {
    if (!showContextMenu || !cardRef.current) return;
    const rect = cardRef.current;
    setClampedMenuPos({
      x: Math.min(contextMenuPos.x, rect.clientWidth - 180),
      y: Math.min(contextMenuPos.y, rect.clientHeight - 150),
    });
  }, [showContextMenu, contextMenuPos]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showContextMenu) setShowContextMenu(false);
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [showContextMenu]);

  useEffect(() => {
    if (!showContextMenu) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowContextMenu(false); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showContextMenu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Position menu relative to card
    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      setContextMenuPos({ x, y });
      setShowContextMenu(true);
    }
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    const cardTitle = typeof title === 'string' ? title : id;
    
    const summary = `🔥 *Blaze Break Card Summary*\n\n` +
      `📌 *Focus Area*: ${cardTitle}\n` +
      `${energyDrain ? `⚡ *Energy Drain Level*: ${energyDrain.charAt(0).toUpperCase() + energyDrain.slice(1)}\n` : ''}` +
      `🛠️ *Current State*: ${isMicroRecovery ? 'Active Micro-Recovery' : 'Monitoring'}\n\n` +
      `_Exported via Guardian Alert_`;

    try {
      await navigator.clipboard.writeText(summary);
      setIsCopied(true);
      setTimeout(() => {
        setIsCopied(false);
        setShowContextMenu(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text', err);
    }
  };

  return (
    <motion.div 
      layout
      transition={{ layout: { type: "spring", stiffness: 350, damping: 25 } }}
      ref={cardRef}
      id={id}
      className={cn(
        "card relative group cursor-grab active:cursor-grabbing transition-colors duration-500",
        isMicroRecovery && "micro-recovery",
        className
      )}
      draggable
      tabIndex={0}
      onDragStart={(e: any) => {
        if (onDragStart) onDragStart(e, id);
        if (e.dataTransfer) {
          e.dataTransfer.setData('text/plain', id);
        }
      }}
      onDragOver={(e: any) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (onDragOver) onDragOver(e, id);
      }}
      onDrop={(e: any) => {
        e.preventDefault();
        if (onDrop) onDrop(e, id);
      }}
      onContextMenu={handleContextMenu}
    >
      <div className="absolute top-4 right-4 z-20 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity items-center">
        {energyDrain && (
          <div className="relative group/drain flex items-center justify-center">
            <div 
              tabIndex={0}
              aria-label={`Energy Drain: ${energyDrain}`}
              className={cn(
                "w-2 h-2 rounded-full cursor-help",
                energyDrain === 'high' ? 'bg-destructive animate-pulse' : 
                energyDrain === 'medium' ? 'bg-warning' : 'bg-success'
              )}
            />
            <div className="absolute top-full mt-2 right-0 bg-card text-xs font-bold text-text-main px-3 py-1.5 rounded-md shadow-lg opacity-0 group-hover/drain:opacity-100 group-focus-within/drain:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 border border-white/5">
               Energy Drain: <span className="capitalize">{energyDrain}</span>
            </div>
          </div>
        )}
        <button 
          onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
          aria-label={isExpanded ? "Collapse card" : "Expand card"}
          aria-expanded={isExpanded}
          className="p-1 rounded-md hover:bg-surface dark:bg-card/10 text-text-muted hover:text-text-main transition-colors"
        >
          <ChevronDown className={cn("w-4 h-4 transition-transform duration-300", isExpanded ? "rotate-180" : "")} />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded ? (
          <motion.div
            key="expanded"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {children}
          </motion.div>
        ) : (
          <motion.div 
            key="collapsed"
            className="p-6 md:p-8 flex items-center justify-between"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <div className="font-bold text-text-muted text-sm tracking-widest uppercase">
              {title || "Card Summary"}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showContextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute z-50 bg-card border border-border shadow-lg rounded-lg py-1 min-w-[160px]"
            style={{
              top: `${clampedMenuPos.y}px`,
              left: `${clampedMenuPos.x}px`
            }}
          >
            <button disabled aria-disabled="true" title="Not available yet" className="w-full px-4 py-2 text-left text-xs font-medium text-text-muted/50 flex items-center gap-2 cursor-not-allowed">
              <FileText className="w-3.5 h-3.5" /> Quick Note
            </button>
            <button disabled aria-disabled="true" title="Not available yet" className="w-full px-4 py-2 text-left text-xs font-medium text-text-muted/50 flex items-center gap-2 cursor-not-allowed">
              <CheckCircle className="w-3.5 h-3.5" /> Toggle Status
            </button>
            <button 
              onClick={handleShare}
              className="w-full px-4 py-2 text-left text-xs font-medium text-[#9a3412] dark:text-primary hover:bg-card hover:opacity-80 flex items-center gap-2"
            >
              {isCopied ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
              {isCopied ? "Copied format!" : "Share Summary"}
            </button>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setIsMicroRecovery(!isMicroRecovery);
                setShowContextMenu(false);
              }}
              aria-pressed={isMicroRecovery}
              className="w-full px-4 py-2 text-left text-xs font-medium text-[#9a3412] dark:text-warning hover:bg-card hover:opacity-80 flex items-center gap-2"
            >
              <div className={cn("w-2 h-2 rounded-full", isMicroRecovery ? "bg-warning animate-pulse" : "bg-surface")} />
              {isMicroRecovery ? "End Micro-Recovery" : "Micro-Recovery Mode"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
