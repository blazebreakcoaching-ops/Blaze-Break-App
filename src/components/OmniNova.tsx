import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, X, Send, Loader2, Maximize2, Minimize2, Mic, MicOff } from 'lucide-react';
import { cn } from '../lib/utils';
import ReactMarkdown from 'react-markdown';
import { getNovaBrain } from '../lib/nova-brain';
import { secureApiFetch } from '../lib/secure-api';

interface OmniNovaProps {
  activeTab: string;
  fingerprint: any;
  stats: any;
}

export const OmniNova = ({ activeTab, fingerprint, stats }: OmniNovaProps) => {
  // Computed once rather than inline in the animate prop - regenerating
  // these on every render would make the waveform's rhythm visibly jump if
  // anything causes this component to re-render while it's showing.
  const waveformBars = useMemo(() => [...Array(4)].map(() => ({
    peakHeight: 15 + Math.random() * 20,
    duration: 0.6 + Math.random() * 0.4,
  })), []);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{role: 'user' | 'model', text: string, privacyMetadata?: { contextTriggered: boolean, modulesUsed: string[], rationale: string }}[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Live API Refs
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      let recentContextPhrase = '';
      try {
        const brain = getNovaBrain();
        const latestState = brain.filter(m => m.type === 'state').sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
        if (latestState) {
          recentContextPhrase = ` I've logged your recent action: "${latestState.content}".`;
        }
      } catch(e) {}
      
      setMessages([
        { role: 'model', text: `Nova online. I see you're currently in the **${activeTab.toUpperCase()}** module.${recentContextPhrase} Building context integration... How can I assist you with your recovery architecture right now?` }
      ]);
    }
  }, [isOpen, activeTab]);

  const pcmToBase64 = (pcmData: Float32Array) => {
    const buffer = new ArrayBuffer(pcmData.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < pcmData.length; i++) {
      const s = Math.max(-1, Math.min(1, pcmData[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  const playLiveAudioChunk = (audioCtx: AudioContext, base64: string) => {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const numSamples = bytes.length / 2;
    const audioBuffer = audioCtx.createBuffer(1, numSamples, 24000);
    const channelData = audioBuffer.getChannelData(0);
    const dataView = new DataView(bytes.buffer);
    for (let i = 0; i < numSamples; i++) {
      channelData[i] = dataView.getInt16(i * 2, true) / 32768;
    }
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);
    
    if (nextStartTimeRef.current < audioCtx.currentTime) {
      nextStartTimeRef.current = audioCtx.currentTime;
    }
    source.start(nextStartTimeRef.current);
    nextStartTimeRef.current += audioBuffer.duration;
  };

  const stopVoiceProcess = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsVoiceActive(false);
  };

  const toggleVoiceMode = async () => {
    if (isVoiceActive) {
      stopVoiceProcess();
      return;
    }

    try {
      setIsVoiceActive(true);
      const wsUrl = `ws${window.location.protocol === 'https:' ? 's' : ''}://${window.location.host}/api/nova/live`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioCtxRef.current = audioCtx;
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      nextStartTimeRef.current = audioCtx.currentTime;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const source = audioCtx.createMediaStreamSource(stream);
      sourceRef.current = source;
      
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      
      source.connect(processor);
      processor.connect(audioCtx.destination);

      processor.onaudioprocess = (e) => {
        if (ws.readyState === WebSocket.OPEN) {
          const base64 = pcmToBase64(e.inputBuffer.getChannelData(0));
          ws.send(JSON.stringify({ audio: base64 }));
        }
      };

      ws.onopen = () => {
        let brainContext = '';
        try {
          const brain = getNovaBrain();
          if (brain.length > 0) {
            brainContext = '\nNova Personal Brain Context:\n' + brain.map(mem => `[${mem.type}]: ${mem.content}`).join('\n') + '\n';
          }
        } catch(e) {}
        
        ws.send(JSON.stringify({
          initialPrompt: `User Burnout Fingerprint: ${JSON.stringify(fingerprint || 'Not taken yet')}. Active Context Tab: ${activeTab}. Voice over-watch mode initiated. ${brainContext}Be extremely brief.`
        }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.audio) {
            playLiveAudioChunk(audioCtx, msg.audio);
          }
          if (msg.interrupted) {
            nextStartTimeRef.current = audioCtx.currentTime;
          }
        } catch (err) {
          console.error("Audio msg decode error", err);
        }
      };

      ws.onclose = () => {
        stopVoiceProcess();
      };
    } catch (err) {
      console.error(err);
      alert("Voice access denied or system error.");
      stopVoiceProcess();
    }
  };

  useEffect(() => {
    return () => {
      stopVoiceProcess();
    };
  }, []);

  const handleSend = async () => {
    if (!input.trim()) return;
    
    const userText = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userText }]);
    setIsTyping(true);

    let brainContext = '';
    try {
      const brain = getNovaBrain();
      if (brain.length > 0) {
        brainContext = '\n--- Nova Personal Context Brain ---\n' + brain.map(mem => `[${mem.type.toUpperCase()}]: ${mem.content}`).join('\n') + '\n-----------------------------------\n';
      }
    } catch(e) {}

    const contextContext = `
      You are Nova, an AI recovery coach helping someone through burnout recovery.
      CURRENT APP STATE:
      - Active Module: ${activeTab}
      - What they're working toward: ${stats?.profile?.purpose || 'Not defined'}
      - Their role: ${stats?.profile?.role || 'Not specified'}
      - What's draining them most: ${stats?.profile?.primaryDrain || 'Unknown'}
      - Their preferred tone: ${stats?.profile?.novaTone || 'Direct'}
      - Burnout Profile: ${fingerprint?.profile || 'Unknown'}
      ${brainContext}

      You must provide contextual advice tailored to the '${activeTab}' module.
      Be practical and grounded rather than a generic therapist - give real, actionable support, not just validation. Match the tone they've indicated they prefer. Your goal is their wellbeing and sustainable recovery, not their output.
    `;

    try {
      const response = await secureApiFetch('/api/nova/chat', {
        method: 'POST',
        data: {
          message: userText,
          systemInstruction: contextContext,
          history: messages.map(m => ({
            role: m.role,
            parts: [{ text: m.text }]
          }))
        }
      });

      if (!response.ok) throw new Error('Failed to connect to Nova.');
      const data = await response.json();
      
      setMessages(prev => [...prev, { role: 'model', text: data.text, privacyMetadata: data.privacyMetadata }]);
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'model', text: 'Could not connect to voice chat. Please check your API key in Settings.' }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? "Close Nova Over-watch panel" : "Open Nova Over-watch panel"}
        aria-expanded={isOpen}
        className="fixed bottom-20 md:bottom-6 right-6 z-50 w-14 h-14 rounded-xl bg-card border border-border shadow-lg flex items-center justify-center text-text-main hover:bg-card transition-colors group"
      >
        <Sparkles className="w-6 h-6 text-primary group-hover:rotate-12 transition-transform" />
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className={cn(
              "fixed bottom-36 md:bottom-24 right-6 z-50 flex flex-col bg-card border border-border shadow-lg rounded-xl overflow-hidden transition-all duration-300",
              isExpanded ? "w-[calc(100vw-3rem)] md:w-[450px] h-[75vh]" : "w-[calc(100vw-3rem)] md:w-[350px] h-[500px]"
            )}
            role="dialog"
            aria-labelledby="omninova-panel-title"
          >
            <div className="flex items-center justify-between p-4 bg-card border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-[#9a3412] dark:text-primary" />
                </div>
                <div>
                  <h4 id="omninova-panel-title" className="text-sm font-bold text-text-main leading-none">Nova Over-watch</h4>
                  <p className="text-xs text-text-muted mt-1 uppercase tracking-widest flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                    NLP ACTIVE | {activeTab}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={toggleVoiceMode}
                  aria-label={isVoiceActive ? "Turn off live voice copilot" : "Turn on live voice copilot"}
                  className={cn("p-2 rounded-lg transition-colors border", isVoiceActive ? "bg-destructive/20 border-destructive text-destructive animate-pulse" : "border-transparent text-text-muted hover:bg-surface")}
                  title="Toggle Live Voice Copilot"
                >
                  {isVoiceActive ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
                <button 
                  onClick={() => setIsExpanded(!isExpanded)}
                  aria-label={isExpanded ? "Minimize panel" : "Expand panel"}
                  className="p-2 rounded-lg hover:bg-card text-text-muted transition-colors"
                >
                  {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button 
                  onClick={() => setIsOpen(false)}
                  aria-label="Close Nova Over-watch panel"
                  className="p-2 rounded-lg hover:bg-card text-text-muted transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {isVoiceActive ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 bg-surface relative">
                <div className="w-24 h-24 rounded-full bg-destructive/10 flex items-center justify-center relative shadow-lg shadow-destructive/10">
                  <motion.div 
                     animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0.8, 0.5] }}
                     transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                     className="absolute inset-0 bg-destructive/20 rounded-full blur-xl"
                  />
                  <Mic className="w-10 h-10 text-destructive relative z-10" />
                </div>
                <div className="text-center mt-6 z-10">
                  <h3 className="text-xl font-display font-bold text-text-main">Live Comm Link Active</h3>
                  <p className="text-sm text-text-muted mt-2">Speaking with Nova directly.</p>
                </div>
                <div className="flex gap-1.5 mt-8 z-10">
                   {waveformBars.map((bar, i) => (
                     <motion.div
                       key={i}
                       animate={{ height: ["8px", `${bar.peakHeight}px`, "8px"] }}
                       transition={{ duration: bar.duration, repeat: Infinity, ease: "easeInOut" }}
                       className="w-1.5 bg-destructive rounded-full"
                     />
                   ))}
                </div>
                <div className="absolute inset-x-0 bottom-0 top-1/2 bg-gradient-to-t from-destructive/5 to-transparent pointer-events-none" />
              </div>
            ) : (
              <div role="log" aria-live="polite" aria-relevant="additions" className="flex-1 overflow-y-auto p-4 space-y-4 bg-surface">
                {messages.map((msg, i) => (
                  <div key={i} className={cn("flex", msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                    <div className={cn(
                      "max-w-[85%] rounded-2xl p-4 text-sm",
                      msg.role === 'user' 
                        ? "bg-primary text-primary-foreground rounded-br-none" 
                        : "bg-surface text-text-main rounded-bl-none border border-border"
                    )}>
                      {msg.role === 'user' ? (
                        msg.text
                      ) : (
                        <div className="markdown-body text-text-main font-medium leading-relaxed prose-sm relative group">
                          <ReactMarkdown>{msg.text}</ReactMarkdown>
                          {msg.privacyMetadata && (
                            <div className="mt-2.5 pt-2 border-t border-border/10 text-[11px] text-text-muted flex items-start gap-1 cursor-help group-hover:text-[#9a3412] dark:group-hover:text-primary transition-colors" title={msg.privacyMetadata.rationale}>
                              <span className="shrink-0 text-success" aria-label="Privacy Shield">🛡️</span>
                              <span>Permissioned context used: Uses {msg.privacyMetadata.modulesUsed?.length > 0 ? "compact " + msg.privacyMetadata.modulesUsed.map((m: string) => m.replace(/_|-/g, ' ')).join(', ') + " summary" : "no personalized context"}. No raw notes shared (completely hidden).</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-card border border-border rounded-2xl p-4 rounded-bl-none">
                      <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}

            <div className="p-4 bg-card border-t border-border">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
                  disabled={isVoiceActive}
                  placeholder={isVoiceActive ? "Voice mode enabled..." : "Ask Nova for tactical support..."}
                  className="flex-1 bg-card border border-border rounded-xl px-4 py-3 text-sm text-text-main placeholder-slate-500 focus:outline-none focus:border-primary transition-colors disabled:"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isTyping || isVoiceActive}
                  aria-label="Send message to Nova"
                  className="w-12 h-12 flex items-center justify-center bg-primary text-primary-foreground rounded-xl disabled:opacity-50 hover:bg-primary-dark transition-colors shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
