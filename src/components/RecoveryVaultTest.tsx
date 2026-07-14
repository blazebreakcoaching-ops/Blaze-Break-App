import React, { useState } from 'react';
import { Shield } from 'lucide-react';
import { secureApiFetch } from '../lib/secure-api';
// We don't use 'secureApiFetch' for Firestore directly unless there are REST endpoints. 
// For this frontend we will use firebase JS SDK directly for Firestore.
import { getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

export const RecoveryVaultTest = () => {
  const [log, setLog] = useState<string[]>([]);
  

  const handleLog = (msg: string) => setLog(prev => [msg, ...prev]);

  const testCheckin = async () => {
    try {
      if (!auth.currentUser) throw new Error("No user");
      const ref = doc(db, 'users', auth.currentUser.uid, 'checkins', 'test_checkin');
      await setDoc(ref, {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        energyLevel: 5,
        focusLevel: 5,
        detachmentLevel: 5,
        stressLoad: 5,
        source: 'user',
        note: 'Test checkin'
      });
      handleLog('✅ Created check-in');
      
      const snap = await getDoc(ref);
      handleLog(`✅ Read check-in: ${JSON.stringify(snap.data())}`);
      
      await updateDoc(ref, { energyLevel: 6, updatedAt: new Date().toISOString() });
      handleLog('✅ Updated check-in energyLevel to 6');
      
      await deleteDoc(ref);
      handleLog('✅ Deleted check-in');
    } catch (e: any) {
      handleLog(`❌ Error: ${e.message}`);
    }
  };

  const testMoodPulse = async () => {
    try {
      if (!auth.currentUser) throw new Error("No user");
      const ref = doc(db, 'users', auth.currentUser.uid, 'mood_pulses', 'test_mood');
      await setDoc(ref, {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        moodLabel: 'calm',
        intensity: 5,
        source: 'user'
      });
      handleLog('✅ Created mood pulse');
      await deleteDoc(ref);
      handleLog('✅ Deleted mood pulse');
    } catch (e: any) {
      handleLog(`❌ Error: ${e.message}`);
    }
  };

  const testBodyCheckin = async () => {
    try {
      if (!auth.currentUser) throw new Error("No user");
      const ref = doc(db, 'users', auth.currentUser.uid, 'body_checkins', 'test_body');
      await setDoc(ref, {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        signals: ['jaw_tension', 'calm_settled'],
        source: 'user'
      });
      handleLog('✅ Created body checkin');
      await deleteDoc(ref);
      handleLog('✅ Deleted body checkin');
    } catch (e: any) {
      handleLog(`❌ Error: ${e.message}`);
    }
  };

  const testWin = async () => {
    try {
      if (!auth.currentUser) throw new Error("No user");
      const ref = doc(db, 'users', auth.currentUser.uid, 'wins', 'test_win');
      await setDoc(ref, {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        title: 'Test Win',
        content: 'I did a good thing',
        category: 'boundary'
      });
      handleLog('✅ Created win');
      await deleteDoc(ref);
      handleLog('✅ Deleted win');
    } catch (e: any) {
      handleLog(`❌ Error: ${e.message}`);
    }
  };

  const testGoal = async () => {
    try {
      if (!auth.currentUser) throw new Error("No user");
      const ref = doc(db, 'users', auth.currentUser.uid, 'goals', 'test_goal');
      await setDoc(ref, {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        title: 'Sleep better',
        status: 'active',
        category: 'sleep'
      });
      handleLog('✅ Created goal');
      await deleteDoc(ref);
      handleLog('✅ Deleted goal');
    } catch (e: any) {
      handleLog(`❌ Error: ${e.message}`);
    }
  };

  const testPermissions = async () => {
    try {
      if (!auth.currentUser) throw new Error("No user");
      const ref = doc(db, 'users', auth.currentUser.uid, 'nova_permissions', 'current');
      await setDoc(ref, {
        allowCheckins: true,
        allowEnergyBudgets: true,
        allowMoodPulses: true,
        allowBodyCheckins: true,
        allowWins: true,
        allowWeeklyReviews: true,
        allowBoundaryScripts: true,
        allowGoals: true,
        updatedAt: new Date().toISOString(),
      });
      handleLog('✅ Updated Nova permissions');
    } catch (e: any) {
      handleLog(`❌ Error: ${e.message}`);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="bg-card border border-border p-6 rounded-2xl">
        <h2 className="text-xl font-bold flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-primary" /> Private Recovery Vault Test Area
        </h2>
        <div className="bg-destructive/10 text-destructive text-xs p-2 rounded-lg mb-4 font-bold uppercase tracking-widest text-center border border-destructive/20">
          Internal staging test tool — not available in controlled-live or public mode.
        </div>
        <p className="text-sm text-text-muted mb-6">
          Phase 2B ensures strict permissions via Firestore rules. Click below to execute CRUD operations to test.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          <button onClick={testCheckin} className="btn-secondary text-xs p-2">Test CheckIn</button>
          <button onClick={testMoodPulse} className="btn-secondary text-xs p-2">Test MoodPulse</button>
          <button onClick={testBodyCheckin} className="btn-secondary text-xs p-2">Test BodyCheckIn</button>
          <button onClick={testWin} className="btn-secondary text-xs p-2">Test Win</button>
          <button onClick={testGoal} className="btn-secondary text-xs p-2">Test Goal</button>
          <button onClick={testPermissions} className="btn-secondary text-xs p-2">Test Permissions</button>
        </div>
        
        <div className="bg-surface border border-border rounded-lg p-4 h-64 overflow-y-auto font-mono text-[10px] space-y-1">
          {log.length === 0 ? <span className="opacity-50">Test logs will appear here...</span> : log.map((msg, i) => (
            <div key={i}>{msg}</div>
          ))}
        </div>
      </div>
    </div>
  );
};
