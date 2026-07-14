const fs = require('fs');
let content = fs.readFileSync('src/components/NovaGuardianRelay.tsx', 'utf8');

const regex = /<div className="space-y-3">\s*<a href="tel:988"[\s\S]*?<\/div>/m;
if (!regex.test(content)) {
  console.log("Could not find regex!");
} else {
  const replacementStr = `<div className="space-y-6">
                  <div className="space-y-3">
                    <h5 className="text-[11px] font-black uppercase tracking-widest text-text-muted ml-1">If you're in the UK or Ireland</h5>
                    <a href="tel:116123" className="flex items-center justify-between p-4 rounded-xl border border-warning/20 dark:border-warning-foreground/30 bg-warning/10 dark:bg-warning-foreground/20 hover:bg-warning/20 dark:hover:bg-warning-foreground/40 transition-colors group">
                       <div className="space-y-1.5">
                         <span className="text-sm font-bold text-warning dark:text-warning block">Samaritans</span>
                         <span className="text-[11px] font-black uppercase tracking-widest text-warning/70 font-mono">Call or Text &middot; Free &middot; 24/7</span>
                       </div>
                       <PhoneCall className="w-5 h-5 text-warning group-hover:scale-110 transition-transform" />
                    </a>
                    <a href="sms:85258?body=SHOUT" className="flex items-center justify-between p-4 rounded-xl border border-primary-light dark:border-primary-dark/30 bg-primary-light dark:bg-primary-dark/20 hover:bg-primary-light dark:hover:bg-primary-dark/40 transition-colors group">
                       <div className="space-y-1.5">
                         <span className="text-sm font-bold text-primary dark:text-primary block">Shout</span>
                         <span className="text-[11px] font-black uppercase tracking-widest text-primary/70 font-mono">Text "SHOUT" to 85258</span>
                       </div>
                       <MessageCircle className="w-5 h-5 text-primary group-hover:scale-110 transition-transform" />
                    </a>
                    <a href="tel:999" className="flex items-center justify-between p-4 rounded-xl border border-rose-100 dark:border-rose-900/30 bg-rose-50 dark:bg-rose-950/20 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors group">
                       <div className="space-y-1.5">
                         <span className="text-sm font-bold text-rose-600 dark:text-destructive block">Emergency Services</span>
                         <span className="text-[11px] font-black uppercase tracking-widest text-destructive/70 font-mono">Tap routing &middot; 24/7 Availability</span>
                       </div>
                       <PhoneCall className="w-5 h-5 text-destructive group-hover:scale-110 transition-transform" />
                    </a>
                  </div>

                  <div className="space-y-3">
                    <h5 className="text-[11px] font-black uppercase tracking-widest text-text-muted ml-1">If you're in the US or Canada</h5>
                    <a href="tel:988" className="flex items-center justify-between p-4 rounded-xl border border-rose-100 dark:border-rose-900/30 bg-rose-50 dark:bg-rose-950/20 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors group">
                       <div className="space-y-1.5">
                         <span className="text-sm font-bold text-rose-600 dark:text-destructive block">988 Suicide & Crisis Lifeline</span>
                         <span className="text-[11px] font-black uppercase tracking-widest text-destructive/70 font-mono">Tap routing &middot; 24/7 Availability</span>
                       </div>
                       <PhoneCall className="w-5 h-5 text-destructive group-hover:scale-110 transition-transform" />
                    </a>
                    <a href="sms:741741?body=HOME" className="flex items-center justify-between p-4 rounded-xl border border-primary-light dark:border-primary-dark/30 bg-primary-light dark:bg-primary-dark/20 hover:bg-primary-light dark:hover:bg-primary-dark/40 transition-colors group">
                       <div className="space-y-1.5">
                         <span className="text-sm font-bold text-primary dark:text-primary block">Crisis Text Line</span>
                         <span className="text-[11px] font-black uppercase tracking-widest text-primary/70 font-mono">Payload: "HOME" TO 741741</span>
                       </div>
                       <MessageCircle className="w-5 h-5 text-primary group-hover:scale-110 transition-transform" />
                    </a>
                  </div>
                </div>`;
  content = content.replace(regex, replacementStr);
  content = content.replace('placeholder="+1 234 567 8900"', 'placeholder="Phone number"');
  fs.writeFileSync('src/components/NovaGuardianRelay.tsx', content);
  console.log("Updated successfully");
}
