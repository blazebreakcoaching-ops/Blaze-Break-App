// RN port of the add/list/remove core of ../../../../src/components/
// NovaInvisibleLoad.tsx, reusing nova-invisible-load-contract.ts
// directly (see nova-invisible-load-context.tsx's own header - that file
// has zero imports and is framework-agnostic, so there is nothing
// web-specific to port here).
//
// "Get help with this" now branches into the real native Calendar
// Protection/Task Deferral screens, same two choices the web version
// offers. Breakdown steps/corrections/defer are still deferred - this
// covers the add/review/remove core plus the two real hand-off
// destinations the practical-assistance offer promises.
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text, TextInput } from '../../../src/lib/native-ui';
import { useNativeTheme } from '../../../src/lib/native-theme';
import type { NativeThemeColors } from '../../../src/lib/native-theme-palette';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useNovaInvisibleLoad } from '../../../src/lib/nova-invisible-load-context';
import type { NovaInvisibleLoadCategory } from '../../../../nova-invisible-load-contract';

const CATEGORY_LABEL: Record<NovaInvisibleLoadCategory, string> = {
  commitment: 'Commitment',
  obligation: 'Obligation',
  practical_friction: 'Practical friction',
};
const CATEGORIES = Object.keys(CATEGORY_LABEL) as NovaInvisibleLoadCategory[];
const MAX_DESCRIPTION_LENGTH = 300;

export default function InvisibleLoadScreen() {
  const styles = useThemedStyles();
  const { state, addItem, removeItem } = useNovaInvisibleLoad();
  const [draft, setDraft] = useState('');
  const [category, setCategory] = useState<NovaInvisibleLoadCategory>('obligation');
  const [helpItemId, setHelpItemId] = useState<string | null>(null);

  const canAdd = draft.trim().length > 0 && draft.trim().length <= MAX_DESCRIPTION_LENGTH;

  const handleAdd = () => {
    if (!canAdd) return;
    // userCertain always true here - this screen has no "I'm not sure
    // this belongs here" input yet, matching the web component's own
    // default when that toggle is left alone.
    addItem(draft.trim(), category, true);
    setDraft('');
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back to Nova chat" style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={styles.colors.text} />
          </TouchableOpacity>
          <View>
            <Text style={styles.title}>What's on your plate</Text>
            <Text style={styles.subtitle}>Kept only for this session - not saved or scored.</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.list}>
          {state.items.length === 0 && (
            <Text style={styles.empty}>Nothing added yet.</Text>
          )}
          {state.items.map((item) => (
            <View key={item.id} style={styles.card} accessible accessibilityLabel={`${CATEGORY_LABEL[item.category]}: ${item.description}`}>
              <View style={styles.cardHeader}>
                <Text style={styles.categoryBadge}>{CATEGORY_LABEL[item.category]}</Text>
                <TouchableOpacity onPress={() => removeItem(item.id)} accessibilityRole="button" accessibilityLabel={`Remove ${item.description}`}>
                  <Ionicons name="close" size={18} color={styles.colors.muted} />
                </TouchableOpacity>
              </View>
              <Text style={styles.cardText}>{item.description}</Text>
              {helpItemId === item.id ? (
                <View style={styles.helpNotice}>
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: '/(tabs)/nova/calendar-protection', params: { title: item.description } })}
                    accessibilityRole="button" accessibilityLabel="Protect time for it" style={styles.helpChoice}
                  >
                    <Text style={styles.helpNoticeLink}>Protect time for it</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: '/(tabs)/nova/task-deferral', params: { description: item.description } })}
                    accessibilityRole="button" accessibilityLabel="Defer or reprioritise it" style={styles.helpChoice}
                  >
                    <Text style={styles.helpNoticeLink}>Defer or reprioritise it</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setHelpItemId(null)} accessibilityRole="button" accessibilityLabel="Cancel">
                    <Text style={styles.helpNoticeText}>Never mind</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={() => setHelpItemId(item.id)} accessibilityRole="button" style={styles.helpButton}>
                  <Text style={styles.helpButtonText}>Get help with this</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </ScrollView>

        <TouchableOpacity
          onPress={() => router.push({ pathname: '/(tabs)/nova/proactive-suggestions', params: { obligation: state.items[0]?.description ?? '' } })}
          accessibilityRole="button" accessibilityLabel="See what Nova might proactively suggest" style={styles.suggestButton}
        >
          <Ionicons name="bulb-outline" size={16} color={styles.colors.muted} />
          <Text style={styles.suggestButtonText}>See what Nova might proactively suggest</Text>
        </TouchableOpacity>

        <View style={styles.composer}>
          <View style={styles.categoryRow}>
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c}
                onPress={() => setCategory(c)}
                accessibilityRole="button"
                accessibilityLabel={`Category: ${CATEGORY_LABEL[c]}`}
                style={[styles.categoryChip, category === c && styles.categoryChipActive]}
              >
                <Text style={[styles.categoryChipText, category === c && styles.categoryChipTextActive]}>{CATEGORY_LABEL[c]}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.addRow}>
            <TextInput
              accessibilityLabel="Describe an obligation, commitment, or friction"
              value={draft}
              onChangeText={setDraft}
              placeholder="Something you're carrying right now..."
              placeholderTextColor={styles.colors.muted}
              style={styles.input}
              maxLength={MAX_DESCRIPTION_LENGTH}
              multiline
            />
            <TouchableOpacity
              onPress={handleAdd}
              disabled={!canAdd}
              accessibilityRole="button"
              accessibilityLabel="Add"
              style={[styles.addButton, !canAdd && styles.addButtonDisabled]}
            >
              <Ionicons name="add" size={22} color={styles.colors.onAccent} />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createThemedStyles = (colors: NativeThemeColors) => StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: colors.background },
  topBar: { minHeight: 62, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderColor: colors.border },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 11, color: colors.muted },
  list: { padding: 16, gap: 12, flexGrow: 1 },
  empty: { color: colors.muted, fontSize: 14, textAlign: 'center', marginTop: 24 },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, gap: 8 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  categoryBadge: { fontSize: 11, fontWeight: '700', color: colors.accent, textTransform: 'uppercase', letterSpacing: 0.5 },
  cardText: { fontSize: 15, color: colors.text, lineHeight: 21 },
  helpButton: { alignSelf: 'flex-start' },
  helpButtonText: { fontSize: 13, color: colors.accent, fontWeight: '600' },
  helpNotice: { backgroundColor: colors.surface, borderRadius: 10, padding: 10, gap: 8 },
  helpChoice: { minHeight: 36, justifyContent: 'center' },
  helpNoticeText: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  helpNoticeLink: { fontSize: 13, color: colors.accent, fontWeight: '700' },
  suggestButton: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', minHeight: 40, marginHorizontal: 16, marginBottom: 8 },
  suggestButtonText: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  composer: { padding: 12, gap: 10, borderTopWidth: 1, borderColor: colors.border },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  categoryChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  categoryChipText: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  categoryChipTextActive: { color: colors.onAccent },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  input: { flex: 1, maxHeight: 100, minHeight: 44, paddingHorizontal: 14, paddingVertical: 10, color: colors.text, fontSize: 15, backgroundColor: colors.surface, borderRadius: 14 },
  addButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  addButtonDisabled: { opacity: 0.45 },
});

function useThemedStyles() {
  const { colors } = useNativeTheme();
  return React.useMemo(() => ({ ...createThemedStyles(colors), colors }), [colors]);
}
