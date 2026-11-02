import React, { useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../../../src/lib/auth-context';
import { secureApiFetch } from '../../../src/lib/secure-api';
import { useNovaBeforeWords } from '../../../src/lib/nova-before-words-context';
import { useNovaAgenticJourneyEnabled } from '../../../src/lib/use-nova-agentic-journey';
import {
  buildNovaMobileChatBody, NOVA_MOBILE_MAX_MESSAGE_LENGTH,
  type NovaMobileMessage,
} from '../../../src/lib/nova-chat-contract';

// The actual native Nova screen, not a WebView. It uses the same protected
// /api/nova/chat route and server-side entitlement/safeguarding rules as
// the web app. Until native App Check is configured, requests fail closed
// rather than using a forged token or bypassing production protection.
//
// For privacy, conversation text lives in this mounted screen's memory,
// never in unencrypted AsyncStorage. Keying by Firebase uid prevents
// old account content crossing into a new session; encrypted persistence
// and advanced agentic steps are distinct follow-up integrations.
//
// offer_practical_assistance card: same planTrace pattern as the web
// app's NovaChat.tsx (data.planTrace.find(tool === 'offer_practical_
// assistance' && result.offered)) - reusing the server's own decision,
// never a client-side guess at when to show it. "Review what's on my
// plate" opens the real Invisible Load sub-screen (nova/invisible-load),
// not a placeholder.

interface PracticalAssistanceOffer {
  reason: string;
}

function findPracticalAssistanceOffer(planTrace: unknown): PracticalAssistanceOffer | null {
  if (!Array.isArray(planTrace)) return null;
  const call = planTrace.find((t: any) => t && t.tool === 'offer_practical_assistance' && t.result?.offered);
  if (!call || typeof call.result?.reason !== 'string') return null;
  return { reason: call.result.reason };
}

function NovaConversation() {
  const { pending: beforeWordsContext, clear: clearBeforeWords } = useNovaBeforeWords();
  const advancedJourneyEnabled = useNovaAgenticJourneyEnabled();
  const [messages, setMessages] = useState<NovaMobileMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [practicalAssistanceOffer, setPracticalAssistanceOffer] = useState<PracticalAssistanceOffer | null>(null);
  const practicalAssistanceOfferShownRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const canSend = !busy && draft.trim().length > 0 &&
    draft.trim().length <= NOVA_MOBILE_MAX_MESSAGE_LENGTH;

  const send = async () => {
    if (!canSend) return;
    const text = draft.trim();
    // A user can return from Before Words with one temporary context.
    // Never include it in displayed/persisted history or a system
    // instruction; the server quarantines it as lower-trust message data.
    const body = buildNovaMobileChatBody(text, messages,
      advancedJourneyEnabled ? beforeWordsContext : null);
    clearBeforeWords();
    setMessages((current) => [...current, { role: 'user', parts: [{ text }] }]);
    setDraft('');
    setBusy(true);
    setError(null);
    try {
      const res = await secureApiFetch('/api/nova/chat', { method: 'POST', data: body });
      const reply: unknown = await res.json();
      if (!reply || typeof reply !== 'object' ||
          !('text' in reply) || typeof reply.text !== 'string') {
        throw new Error('Nova returned an unexpected response. Please try again.');
      }
      setMessages((current) => [...current, { role: 'model', parts: [{ text: reply.text as string }] }]);
      const offer = 'planTrace' in reply ? findPracticalAssistanceOffer(reply.planTrace) : null;
      if (offer && !practicalAssistanceOfferShownRef.current) {
        practicalAssistanceOfferShownRef.current = true;
        setPracticalAssistanceOffer(offer);
      }
    } catch (err: unknown) {
      // No fake answer is inserted. The person can retry their message
      // rather than believing an external model replied successfully.
      setError(err instanceof Error ? err.message : 'Nova is unavailable. Please try again.');
      setDraft(text);
      setMessages((current) => current.slice(0, -1));
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    Alert.alert('Clear this conversation?', 'This clears the messages shown in this session.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear', style: 'destructive', onPress: () => {
          setMessages([]);
          setError(null);
          setDraft('');
          setPracticalAssistanceOffer(null);
          practicalAssistanceOfferShownRef.current = false;
        },
      },
    ]);
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.topBar}>
          <View style={styles.titleGroup}>
            <Ionicons name="sparkles-outline" size={23} color="#c2410c" />
            <View>
              <Text style={styles.title}>Nova</Text>
              <Text style={styles.subtitle}>Your Blaze Break conversation</Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={clear}
            disabled={messages.length === 0 || busy}
            accessibilityRole="button"
            accessibilityLabel="Clear Nova conversation"
            style={styles.clearButton}
          >
            <Ionicons name="trash-outline" size={20} color="#6b7280" />
          </TouchableOpacity>
        </View>

        {advancedJourneyEnabled && (
          <View style={styles.beforeWordsPanel}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Start with Before Words"
              disabled={busy}
              onPress={() => router.push('/(tabs)/nova/before-words')}
              style={styles.beforeWordsButton}
            >
              <Ionicons name="create-outline" size={18} color="#9a3412" />
              <Text style={styles.beforeWordsLabel}>Start with Before Words (optional)</Text>
            </TouchableOpacity>
            {beforeWordsContext && (
              <View style={styles.beforeWordsPending}>
                <Text style={styles.pendingText}>
                  Your words can help with your next Nova reply. They're not saved as a reflection.
                </Text>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Discard Before Words"
                  onPress={clearBeforeWords} style={styles.discardButton}>
                  <Text style={styles.discardLabel}>Discard</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        <ScrollView
          ref={scrollRef}
          style={styles.conversation}
          contentContainerStyle={styles.messageContainer}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          accessibilityLabel="Nova conversation"
        >
          {messages.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="chatbubbles-outline" size={40} color="#9a3412" />
              <Text style={styles.emptyTitle}>What's on your mind?</Text>
              <Text style={styles.emptyText}>
                Talk through a challenge or something on your plate. You can start wherever feels useful.
              </Text>
            </View>
          )}
          {messages.map((msg, index) => (
            <View
              key={index}
              style={[styles.bubble, msg.role === 'user' ? styles.userBubble : styles.novaBubble]}
              accessible
              accessibilityLabel={msg.role === 'user' ? 'You said' : 'Nova replied'}
            >
              <Text style={[styles.messageText, msg.role === 'user' && styles.userText]}>
                {msg.parts[0].text}
              </Text>
            </View>
          ))}
          {practicalAssistanceOffer && (
            <View style={styles.offerCard} accessibilityLabel="Nova is offering practical assistance">
              <Text style={styles.offerReason}>{practicalAssistanceOffer.reason}</Text>
              <TouchableOpacity
                style={styles.offerButton}
                accessibilityRole="button"
                onPress={() => router.push('/(tabs)/nova/invisible-load')}
              >
                <Text style={styles.offerButtonText}>Review what's on my plate</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setPracticalAssistanceOffer(null)}>
                <Text style={styles.offerDismiss}>Not now</Text>
              </TouchableOpacity>
            </View>
          )}
          {busy && <ActivityIndicator accessibilityLabel="Nova is responding" style={styles.spinner} color="#9a3412" />}
        </ScrollView>

        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <View style={styles.composer}>
          <TextInput
            accessibilityLabel="Message Nova"
            value={draft}
            onChangeText={setDraft}
            placeholder="Message Nova..."
            placeholderTextColor="#6b7280"
            style={styles.input}
            multiline
            maxLength={NOVA_MOBILE_MAX_MESSAGE_LENGTH}
            editable={!busy}
            textAlignVertical="top"
            returnKeyType="default"
          />
          <TouchableOpacity
            onPress={send}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            style={[styles.sendButton, !canSend && styles.sendDisabled]}
          >
            <Ionicons name="arrow-up" size={23} color="#fff" />
          </TouchableOpacity>
        </View>
        <Text style={styles.footnote}>Messages in this screen are not saved across app restarts yet.</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default function NovaTab() {
  const { user } = useAuth();
  // A changed Firebase identity always gets a new, empty conversation.
  return <NovaConversation key={user?.uid ?? 'signed-out'} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: '#fff' },
  topBar: { minHeight: 62, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: '#e5e7eb' },
  titleGroup: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 20, fontWeight: '800', color: '#111827' },
  beforeWordsPanel: { paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderColor: '#e5e7eb', gap: 8 },
  beforeWordsButton: { minHeight: 44, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  beforeWordsLabel: { color: '#9a3412', fontSize: 13, fontWeight: '700' },
  beforeWordsPending: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  pendingText: { flex: 1, fontSize: 12, lineHeight: 17, color: '#4b5563' },
  discardButton: { minHeight: 40, justifyContent: 'center' },
  discardLabel: { fontSize: 12, color: '#9a3412', fontWeight: '700' },
  subtitle: { fontSize: 12, color: '#6b7280' },
  clearButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  conversation: { flex: 1 },
  messageContainer: { paddingHorizontal: 16, paddingVertical: 20, gap: 12, flexGrow: 1 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
  emptyTitle: { fontSize: 21, fontWeight: '700', color: '#111827', textAlign: 'center' },
  emptyText: { color: '#4b5563', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  bubble: { maxWidth: '88%', padding: 13, borderRadius: 16, minHeight: 44 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#9a3412', borderBottomRightRadius: 4 },
  novaBubble: { alignSelf: 'flex-start', backgroundColor: '#f3f4f6', borderBottomLeftRadius: 4 },
  messageText: { color: '#111827', fontSize: 16, lineHeight: 23 },
  userText: { color: '#fff' },
  spinner: { alignSelf: 'flex-start', padding: 12 },
  offerCard: { alignSelf: 'flex-start', maxWidth: '92%', backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa', borderRadius: 16, padding: 14, gap: 10 },
  offerReason: { color: '#111827', fontSize: 14, lineHeight: 20 },
  offerButton: { backgroundColor: '#c2410c', borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  offerButtonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  offerDismiss: { color: '#6b7280', fontSize: 12, textAlign: 'center' },
  error: { paddingHorizontal: 16, paddingVertical: 6, color: '#b91c1c', fontSize: 13 },
  composer: { paddingHorizontal: 12, paddingTop: 10, flexDirection: 'row', gap: 8, alignItems: 'flex-end', borderTopWidth: 1, borderColor: '#e5e7eb' },
  input: { flex: 1, maxHeight: 126, minHeight: 46, paddingHorizontal: 14, paddingVertical: 12, color: '#111827', fontSize: 16, backgroundColor: '#f3f4f6', borderRadius: 16 },
  sendButton: { width: 46, height: 46, borderRadius: 16, backgroundColor: '#c2410c', alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.45 },
  footnote: { fontSize: 10, color: '#6b7280', textAlign: 'center', paddingVertical: 6 },
});
