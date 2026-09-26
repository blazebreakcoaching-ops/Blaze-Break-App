// RN port of ../../../src/components/BlameLocateAcceptExchange.tsx -
// text-only. Voice mode is deliberately excluded here, not just hidden:
// Phase 1 doesn't wire in Nova Live's native audio pipeline at all (see
// the mobile plan's "BLAME Reset voice mode stays out of Phase 1" call),
// so there's no voiceEligible prop, no NovaVoiceCall import, nothing to
// gate - the whole voice code path simply doesn't exist in this file.
import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { secureApiFetch } from '../lib/secure-api';

interface GeminiHistoryTurn {
  role: 'user' | 'model';
  parts: [{ text: string }];
}

export interface BlameExchangeSummary {
  mode: 'text' | 'skipped';
  turns: number;
}

interface BlameLocateAcceptExchangeProps {
  title: string;
  instruction: string;
  prompt: string;
  onContinue: (summary: BlameExchangeSummary) => void;
}

const MAX_TEXT_TURNS = 3;

const BLAME_LOCATE_ACCEPT_SYSTEM_INSTRUCTION = `You are Nova, guiding someone through the Locate + Accept step of a BLAME Reset - a short crisis-interrupt technique. They are mid-activation right now, not journaling calmly afterward.

Locate asks: "What am I actually reacting to?" Accept asks: "What's true right now, even if I don't like it?"

Every reply: offer exactly ONE short, warm, grounding reflection or clarifying question that helps them name the real trigger underneath the surface reaction, and/or accept what's true without fighting it. Never a lecture, never a numbered list, never more than 2-3 sentences, never more than one question at a time. Do not introduce a new framework. This exchange is capped at a few messages - treat every reply as possibly the last thing you say before they move to deciding what to do about it next.`;

export function BlameLocateAcceptExchange({ title, instruction, prompt, onContinue }: BlameLocateAcceptExchangeProps) {
  const [history, setHistory] = useState<GeminiHistoryTurn[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnCount, setTurnCount] = useState(0);
  const [novaReplyReceived, setNovaReplyReceived] = useState(false);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending || turnCount >= MAX_TEXT_TURNS) return;
    setSending(true);
    setError(null);
    const priorHistory = history;
    setInput('');
    try {
      const response = await secureApiFetch('/api/nova/chat', {
        method: 'POST',
        data: { message: text, systemInstruction: BLAME_LOCATE_ACCEPT_SYSTEM_INSTRUCTION, history: priorHistory },
      });
      const data = await response.json();
      setHistory([
        ...priorHistory,
        { role: 'user', parts: [{ text }] },
        { role: 'model', parts: [{ text: data.text || '' }] },
      ]);
      setNovaReplyReceived(true);
      setTurnCount((c) => c + 1);
    } catch {
      setError("Couldn't reach Nova just now. You can try again, or continue.");
    }
    setSending(false);
  };

  const handleContinue = () => {
    onContinue({ mode: novaReplyReceived ? 'text' : 'skipped', turns: turnCount });
  };

  const capped = turnCount >= MAX_TEXT_TURNS;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.instruction}>{instruction}</Text>
      <Text style={styles.prompt}>&ldquo;{prompt}&rdquo;</Text>

      {history.length > 0 && (
        <ScrollView style={styles.history} contentContainerStyle={styles.historyContent}>
          {history.map((turn, i) => (
            <View key={i} style={[styles.bubble, turn.role === 'user' ? styles.bubbleUser : styles.bubbleModel]}>
              <Text style={styles.bubbleText}>{turn.parts[0]?.text}</Text>
            </View>
          ))}
        </ScrollView>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      {!capped && (
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="What's going on..."
            multiline
            editable={!sending}
          />
          <TouchableOpacity style={styles.sendButton} onPress={handleSend} disabled={sending || !input.trim()}>
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
      )}
      {capped && <Text style={styles.cappedText}>That&apos;s enough for now</Text>}

      {novaReplyReceived ? (
        <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
          <Text style={styles.continueButtonText}>Continue</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={handleContinue}>
          <Text style={styles.skipLink}>Skip this step for now</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', gap: 16 },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  instruction: { fontSize: 13, color: '#666', textAlign: 'center', lineHeight: 18 },
  prompt: { fontSize: 15, fontWeight: '700', fontStyle: 'italic', textAlign: 'center' },
  history: { maxHeight: 200 },
  historyContent: { gap: 10 },
  bubble: { maxWidth: '85%', borderRadius: 16, padding: 12 },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: '#fed7aa' },
  bubbleModel: { alignSelf: 'flex-start', backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#eee' },
  bubbleText: { fontSize: 13, lineHeight: 18, color: '#222' },
  error: { color: '#dc2626', fontSize: 12, textAlign: 'center' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 14,
    padding: 12,
    fontSize: 14,
    minHeight: 44,
    maxHeight: 100,
  },
  sendButton: { backgroundColor: '#ea580c', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 18 },
  sendButtonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  cappedText: { fontSize: 11, color: '#999', textAlign: 'center', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  continueButton: { backgroundColor: '#ea580c', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  continueButtonText: { color: '#fff', fontWeight: '800', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 },
  skipLink: { textAlign: 'center', color: '#999', fontSize: 12, fontWeight: '600', textDecorationLine: 'underline' },
});
