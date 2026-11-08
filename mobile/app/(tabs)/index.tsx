// Deliberately lean vs. web's HomeSection.tsx (a 16-widget customizable
// dashboard) - only the genuinely backend-derived pieces: resume-prompt
// (takes priority when something's unfinished), else the recommendation
// engine's single suggestion, plus the weekly recap. No Recovery Score
// hero number (it's a client-side heuristic built from web-only
// localStorage tools not in Phase 1 - see the mobile plan). Widget grid,
// gamification, streaks etc. are out of scope this phase.
import React, { useCallback, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { Text } from '../../src/lib/native-ui';
import { useNativeTheme } from '../../src/lib/native-theme';
import type { NativeThemeColors } from '../../src/lib/native-theme-palette';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/lib/auth-context';
import { secureApiFetch } from '../../src/lib/secure-api';
import { DailyCheckInModal } from '../../src/components/DailyCheckInModal';
import { readPersonalProfile, type PersonalProfile } from '../../src/lib/personal-profile';
import { personalWelcome } from '../../../personal-welcome';
import { useNativeI18n } from '../../src/lib/i18n';

type Recommendation = {
  tool: string;
  tab: string;
  title: string;
  message: string;
  points: number;
  type?: string;
  decisionId?: string | null;
};

type WeeklyRecap =
  | { hasActivity: false }
  | { hasActivity: true; checkinsCount: number; currentStreak: number; energyDirection: 'rising' | 'falling' | 'stable' | 'unknown'; highlight: string | null };

// Only these `tab` values from the recommendation/resume-prompt engines
// have a Phase 1 mobile destination. Anything else (recover, communicate,
// ally, nova, plan) belongs to a pillar this phase doesn't cover yet.
const TAB_ROUTES: Record<string, string> = {
  diagnose: '/(tabs)/checkin',
  reset: '/(tabs)/reset',
  nova: '/(tabs)/nova',
};

export default function PulseScreen() {
  const styles = useThemedStyles();
  const { user } = useAuth();
  const { locale: uiLanguage, tag: uiTag } = useNativeI18n();
  const [welcomeProfile, setWelcomeProfile] = useState<{ uid: string; value: PersonalProfile } | null>(null);
  const [welcomeTime, setWelcomeTime] = useState(() => new Date());
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [recommendationLoading, setRecommendationLoading] = useState(true);
  const [weeklyRecap, setWeeklyRecap] = useState<WeeklyRecap | null>(null);
  const [checkInVisible, setCheckInVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [outcomeSaving, setOutcomeSaving] = useState(false);
  const [outcomeError, setOutcomeError] = useState<string | null>(null);

  const recordRecommendationOutcome = async (action: 'started' | 'declined'): Promise<boolean> => {
    if (!recommendation?.decisionId || outcomeSaving) return false;
    setOutcomeSaving(true);
    setOutcomeError(null);
    try {
      await secureApiFetch('/api/recovery/routing-outcome', {
        method: 'POST', data: { decisionId: recommendation.decisionId, action },
      });
      if (action === 'declined') {
        setRecommendation(prev => prev ? {
          ...prev, decisionId: null, type: 'no_action', tool: '', tab: '', points: 0,
          title: 'No pressure to do more right now',
          message: 'Not now is a valid choice. You can return to your recovery tools whenever you want.',
        } : prev);
      }
      return true;
    } catch {
      setOutcomeError('Could not save your choice. Please try again.');
      return false;
    } finally {
      setOutcomeSaving(false);
    }
  };

  const load = useCallback(async () => {
    const currentUid = user?.uid;
    setWelcomeTime(new Date());
    if (currentUid && !user?.isAnonymous) {
      try {
        const value = await readPersonalProfile(currentUid);
        // readPersonalProfile rejects changes to the current signed-in account
        setWelcomeProfile({ uid: currentUid, value });
      } catch {
        setWelcomeProfile(null);
      }
    } else {
      setWelcomeProfile(null);
    }
    setOutcomeError(null);
    setRecommendationLoading(true);
    try {
      const resumeRes = await secureApiFetch('/api/user/resume-prompt');
      if (resumeRes.ok) {
        const resumeData = await resumeRes.json();
        if (resumeData.hasIncomplete) {
          setRecommendation({
            tool: resumeData.tool,
            tab: resumeData.tab,
            title: resumeData.title,
            message: resumeData.message,
            points: resumeData.points,
          });
          setRecommendationLoading(false);
          return;
        }
      }
      const res = await secureApiFetch('/api/user/recommendation');
      if (res.ok) {
        setRecommendation(await res.json());
      }
    } catch {
      // Leaves recommendation null - the card below shows a graceful fallback.
    }
    setRecommendationLoading(false);

    try {
      const recapRes = await secureApiFetch('/api/user/weekly-recap');
      if (recapRes.ok) setWeeklyRecap(await recapRes.json());
    } catch {
      setWeeklyRecap(null);
    }
  }, [user?.uid, user?.isAnonymous]);

  // Loads on mount AND whenever Pulse regains focus (e.g. after completing
  // a Reset tool or Check-in) - useFocusEffect alone covers both, since
  // Expo Router fires a focus event for a screen's first mount too.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleRecommendationPress = async () => {
    if (!recommendation || recommendation.type === 'no_action' || outcomeSaving) return;
    // A fallback route to Nova is not the user starting the recommended
    // intervention. Report "started" only for an actual native destination.
    const actualNativeTool = recommendation.tab === 'home'
      || recommendation.tab === 'diagnose' || recommendation.tab === 'reset';
    if (recommendation.decisionId && actualNativeTool && !(await recordRecommendationOutcome('started'))) return;
    if (recommendation.tab === 'home') {
      setCheckInVisible(true);
      return;
    }
    // Every other recommendation now has a real native destination:
    // explicit Phase 1 tools, or Nova to talk through a feature that
    // has not yet been ported. Never render a dead action.
    const route = TAB_ROUTES[recommendation.tab] ?? '/(tabs)/nova';
    router.push(route as never);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <View style={styles.headerRow}>
          <Text style={styles.header}>Pulse</Text>
          <TouchableOpacity onPress={() => router.push('/account')} accessibilityLabel="Account" hitSlop={12}>
            <Ionicons name="person-circle-outline" size={28} color={styles.colors.accent} />
          </TouchableOpacity>
        </View>

        {welcomeProfile && welcomeProfile.uid === user?.uid && welcomeProfile.value.enabled && (() => {
          const greeting = personalWelcome({
            now: welcomeTime,
            timeZone: welcomeProfile.value.timeZone,
            preferredName: welcomeProfile.value.preferredName,
            allowName: welcomeProfile.value.useName,
            tone: welcomeProfile.value.tone,
            locale: uiLanguage,
            seed: user?.uid || 'welcome',
          });
          return (
            <View style={styles.welcome}>
              <Text style={styles.welcomeTitle} accessibilityRole="header" accessibilityLanguage={uiTag}>{greeting.greeting}</Text>
              <Text style={styles.welcomeMessage} accessibilityLanguage={uiTag}>{greeting.message}</Text>
            </View>
          );
        })()}

        {user?.isAnonymous && (
          <TouchableOpacity style={styles.signUpBanner} onPress={() => router.push('/sign-up')}>
            <Text style={styles.signUpBannerText}>Using a temporary session - tap to save your progress</Text>
          </TouchableOpacity>
        )}

        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>{recommendation?.type === 'no_action' ? 'Recovery update' : "Nova's suggestion"}</Text>
          {recommendationLoading ? (
            <ActivityIndicator style={styles.cardLoading} />
          ) : recommendation ? (
            <>
              <Text style={styles.cardTitle}>{recommendation.title}</Text>
              <Text style={styles.cardMessage}>{recommendation.message}</Text>
              {recommendation.type !== 'no_action' && <TouchableOpacity style={styles.cardButton} disabled={outcomeSaving} onPress={handleRecommendationPress} accessibilityRole="button">
                <Text style={styles.cardButtonText}>
                  {recommendation.decisionId && (recommendation.tab === 'home' || recommendation.tab === 'diagnose' || recommendation.tab === 'reset')
                    ? `Start ${recommendation.tool}`
                    : recommendation.tab === 'home'
                      ? 'Open quick check-in'
                      : recommendation.tab === 'diagnose' || recommendation.tab === 'reset'
                        ? `Open ${recommendation.tool}`
                        : 'Talk it through with Nova'}
                </Text>
              </TouchableOpacity>}
              {recommendation.decisionId && recommendation.type !== 'no_action' && (
                <TouchableOpacity disabled={outcomeSaving}
                  onPress={() => { void recordRecommendationOutcome('declined'); }}
                  accessibilityRole="button" accessibilityLabel="Not now"
                  style={styles.declineButton}>
                  <Text style={styles.declineButtonText}>Not now</Text>
                </TouchableOpacity>
              )}
              {outcomeError && <Text accessibilityRole="alert" style={styles.outcomeError}>{outcomeError}</Text>}
            </>
          ) : (
            <Text style={styles.cardMessage}>Nothing urgent right now - come back any time.</Text>
          )}
        </View>

        {weeklyRecap?.hasActivity && (
          <View style={styles.card}>
            <Text style={styles.cardEyebrow}>This week</Text>
            <Text style={styles.cardMessage}>
              {weeklyRecap.checkinsCount} check-in{weeklyRecap.checkinsCount === 1 ? '' : 's'} logged
              {weeklyRecap.currentStreak > 0 ? ` · ${weeklyRecap.currentStreak}-day streak` : ''}
            </Text>
            {weeklyRecap.energyDirection !== 'unknown' && (
              <Text style={styles.cardSubtext}>Energy has been {weeklyRecap.energyDirection} this week.</Text>
            )}
            {weeklyRecap.highlight && <Text style={styles.cardSubtext}>Recent win: {weeklyRecap.highlight}</Text>}
          </View>
        )}

        <TouchableOpacity style={styles.claimButton} onPress={() => setCheckInVisible(true)}>
          <Text style={styles.claimButtonText}>Claim Pulse</Text>
        </TouchableOpacity>
      </ScrollView>

      <DailyCheckInModal
        visible={checkInVisible}
        onClose={() => setCheckInVisible(false)}
        onComplete={() => {
          setCheckInVisible(false);
          load();
        }}
      />
    </SafeAreaView>
  );
}

const createThemedStyles = (colors: NativeThemeColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  header: { fontSize: 28, fontWeight: '800' },
  welcome: { marginBottom: 16, gap: 5 },
  welcomeTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  welcomeMessage: { fontSize: 14, lineHeight: 21, color: colors.muted },
  signUpBanner: {
    backgroundColor: colors.accentSoft,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  signUpBannerText: { color: colors.accent, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    marginBottom: 16,
  },
  cardEyebrow: { fontSize: 11, fontWeight: '800', color: colors.subtle, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  cardTitle: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
  cardMessage: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  cardSubtext: { fontSize: 13, color: colors.muted, marginTop: 6 },
  cardLoading: { marginVertical: 8 },
  cardButton: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  cardButtonText: { color: colors.onAccent, fontWeight: '700', fontSize: 14 },
  declineButton: { alignItems: 'center', paddingVertical: 12 },
  declineButtonText: { color: colors.muted, fontWeight: '600', fontSize: 14 },
  outcomeError: { color: colors.accent, fontSize: 12, marginTop: 6 },
  claimButton: {
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  claimButtonText: { color: colors.accent, fontWeight: '800', fontSize: 16 },
});

function useThemedStyles() {
  const { colors } = useNativeTheme();
  return React.useMemo(() => ({ ...createThemedStyles(colors), colors }), [colors]);
}
