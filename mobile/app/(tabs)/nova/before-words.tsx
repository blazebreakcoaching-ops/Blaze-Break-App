// Native, optional Before Words journey. Reuses the exact pure state
// contract and one-turn handoff shape as the existing web component.
// No model call, diagnosis, background analysis or persistence here.
import React, { useState } from 'react';
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  initNheiBeforeWordsState, beginFreeExpression, setFreeExpressionText,
  moveToOptionalPrompts, answerPrompt, skipPrompt, moveToReview,
  addCorrection, decideProceedWithoutRetaining, NHEI_BEFORE_WORDS_PROMPTS,
  type NheiBeforeWordsPromptCategory,
} from '../../../../nhei-before-words-contract';
import { buildTemporaryNovaContextFromBeforeWords } from '../../../../nova-before-words-temporary-context';
import { useNovaBeforeWords } from '../../../src/lib/nova-before-words-context';

const CATEGORIES = Object.keys(NHEI_BEFORE_WORDS_PROMPTS) as NheiBeforeWordsPromptCategory[];
const MAX_FREE_TEXT = 2000;
const MAX_PROMPT_TEXT = 1000;
const MAX_CORRECTION = 1000;

export default function NativeBeforeWords() {
  const [state, setState] = useState(initNheiBeforeWordsState);
  const [correctionDraft, setCorrectionDraft] = useState('');
  const { setPending } = useNovaBeforeWords();

  const finish = (discardAll: boolean) => {
    const final = decideProceedWithoutRetaining(state);
    // Explicitly discard everything on "skip" rather than silently
    // retaining text previously entered in this component.
    setPending(discardAll ? null : buildTemporaryNovaContextFromBeforeWords(final));
    router.back();
  };

  const Button = ({ label, onPress, outline = false }: {
    label: string; onPress: () => void; outline?: boolean;
  }) => (
    <TouchableOpacity
      onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={[styles.button, outline && styles.buttonOutline]}
    >
      <Text style={[styles.buttonText, outline && styles.buttonOutlineText]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button"
            accessibilityLabel="Close Before Words" style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.title}>Before Words</Text>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {state.step === 'intro' && (
            <View style={styles.section}>
              <Text style={styles.heading}>Start wherever you are</Text>
              <Text style={styles.description}>
                You don't need the right words. Write freely, use a few optional prompts, or skip.
                Nothing here is saved as a reflection.
              </Text>
              <Button label="Start whenever you're ready" onPress={() => setState(beginFreeExpression(state))} />
              <Button label="Just talk to Nova" onPress={() => finish(true)} outline />
            </View>
          )}

          {state.step === 'free_expression' && (
            <View style={styles.section}>
              <Text style={styles.heading}>Write whatever comes to mind</Text>
              <TextInput
                accessibilityLabel="Free expression"
                placeholder="There's no wrong way to start..."
                placeholderTextColor="#6b7280"
                multiline textAlignVertical="top"
                value={state.freeExpressionText}
                maxLength={MAX_FREE_TEXT}
                onChangeText={(text) => setState((current) => setFreeExpressionText(current, text))}
                style={[styles.input, styles.longInput]}
              />
              <Button label="Continue to optional questions" onPress={() => setState(moveToOptionalPrompts(state))} />
              <Button label="Done for now — use my words in the next Nova reply" onPress={() => finish(false)} outline />
              <Button label="Discard and return to Nova" onPress={() => finish(true)} outline />
            </View>
          )}

          {state.step === 'optional_prompts' && (
            <View style={styles.section}>
              <Text style={styles.heading}>Optional questions</Text>
              <Text style={styles.description}>Answer whichever you choose. Skip any question without explanation.</Text>
              {CATEGORIES.map((category) => {
                const skipped = state.skippedPromptCategories.includes(category);
                const answer = state.promptResponses.find((response) => response.category === category);
                return (
                  <View key={category} style={styles.prompt}>
                    <Text style={styles.promptLabel}>{NHEI_BEFORE_WORDS_PROMPTS[category]}</Text>
                    {skipped ? <Text style={styles.muted}>Skipped</Text> : (
                      <>
                        <TextInput
                          accessibilityLabel={NHEI_BEFORE_WORDS_PROMPTS[category]}
                          value={answer?.text ?? ''}
                          onChangeText={(text) => setState((current) =>
                            answerPrompt(current, category, text, answer?.uncertain ?? false))}
                          maxLength={MAX_PROMPT_TEXT}
                          placeholder="Optional"
                          placeholderTextColor="#6b7280"
                          style={styles.input}
                        />
                        <View style={styles.promptActions}>
                          <TouchableOpacity
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: answer?.uncertain ?? false }}
                            onPress={() => setState((current) =>
                              answerPrompt(current, category, answer?.text ?? '', !(answer?.uncertain ?? false)))}
                            style={styles.smallTouch}
                          >
                            <Ionicons name={answer?.uncertain ? 'checkbox' : 'square-outline'} size={19} color="#9a3412" />
                            <Text style={styles.muted}>I'm not sure</Text>
                          </TouchableOpacity>
                          <TouchableOpacity accessibilityRole="button"
                            accessibilityLabel={`Skip: ${NHEI_BEFORE_WORDS_PROMPTS[category]}`}
                            onPress={() => setState((current) =>
                              answerPrompt(skipPrompt(current, category), category, '', false))}
                            style={styles.smallTouch}>
                            <Text style={styles.skip}>Skip</Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    )}
                  </View>
                );
              })}
              <Button label="Review what I shared" onPress={() => setState(moveToReview(state))} />
              <Button label="Discard and return to Nova" onPress={() => finish(true)} outline />
            </View>
          )}

          {state.step === 'review' && (
            <View style={styles.section}>
              <Text style={styles.heading}>Here's what you shared</Text>
              {!!state.freeExpressionText.trim() && <Text style={styles.sharedText}>{state.freeExpressionText}</Text>}
              {state.promptResponses.filter((r) => r.text.trim() &&
                !state.skippedPromptCategories.includes(r.category)).map((r) => (
                <View key={r.category} style={styles.prompt}>
                  <Text style={styles.promptLabel}>{NHEI_BEFORE_WORDS_PROMPTS[r.category]}</Text>
                  <Text style={styles.sharedText}>{r.text}{r.uncertain ? ' (not sure)' : ''}</Text>
                </View>
              ))}
              {state.corrections.map((correction, i) => (
                <Text key={i} style={styles.sharedText}>Correction: {correction}</Text>
              ))}
              <TextInput
                accessibilityLabel="Add a correction"
                value={correctionDraft}
                onChangeText={setCorrectionDraft}
                maxLength={MAX_CORRECTION}
                placeholder="Want to correct or add something?"
                placeholderTextColor="#6b7280"
                style={styles.input}
              />
              <Button label="Add correction" outline onPress={() => {
                if (!correctionDraft.trim()) return;
                setState((current) => addCorrection(current, correctionDraft.trim()));
                setCorrectionDraft('');
              }} />
              <Text style={styles.description}>
                Nova can use this for your next reply only. It isn't saved as a reflection or as a separate memory.
                Nova's ordinary reply may still appear in the chat until you clear it.
              </Text>
              <Button label="Done for now — continue without saving" onPress={() => finish(false)} />
              <Button label="Discard and return to Nova" onPress={() => finish(true)} outline />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, safeArea: { flex: 1, backgroundColor: '#fff' },
  header: { minHeight: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12,
    gap: 8, borderBottomWidth: 1, borderColor: '#e5e7eb' },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: '#111827' },
  content: { padding: 18, paddingBottom: 40 },
  section: { gap: 16 }, heading: { fontSize: 21, fontWeight: '700', color: '#111827' },
  description: { fontSize: 14, lineHeight: 22, color: '#4b5563' },
  button: { minHeight: 46, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#c2410c' },
  buttonOutline: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#c2410c' },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  buttonOutlineText: { color: '#9a3412' },
  input: { minHeight: 46, borderRadius: 12, backgroundColor: '#f3f4f6', color: '#111827',
    paddingHorizontal: 12, paddingVertical: 12, fontSize: 15 },
  longInput: { minHeight: 160 },
  prompt: { borderBottomWidth: 1, borderColor: '#e5e7eb', paddingBottom: 14, gap: 8 },
  promptLabel: { fontSize: 14, lineHeight: 21, color: '#374151', fontWeight: '600' },
  promptActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  smallTouch: { minHeight: 44, flexDirection: 'row', gap: 6, alignItems: 'center', paddingHorizontal: 4 },
  skip: { color: '#9a3412', fontWeight: '700' },
  muted: { color: '#6b7280', fontSize: 13 },
  sharedText: { fontSize: 15, lineHeight: 22, color: '#111827', padding: 10,
    backgroundColor: '#f3f4f6', borderRadius: 10 },
});
