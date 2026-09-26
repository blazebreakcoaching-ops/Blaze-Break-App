// Deliberately lean vs. web's HomeSection.tsx (a 16-widget customizable
// dashboard) - only the genuinely backend-derived pieces: resume-prompt
// (takes priority when something's unfinished), else the recommendation
// engine's single suggestion, plus the weekly recap. No Recovery Score
// hero number (it's a client-side heuristic built from web-only
// localStorage tools not in Phase 1 - see the mobile plan). Widget grid,
// gamification, streaks etc. are out of scope this phase.
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/lib/auth-context';
import { secureApiFetch } from '../../src/lib/secure-api';
import { DailyCheckInModal } from '../../src/components/DailyCheckInModal';

type Recommendation = {
  tool: string;
  tab: string;
  title: string;
  message: string;
  points: number;
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
};

export default function PulseScreen() {
  const { user } = useAuth();
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [recommendationLoading, setRecommendationLoading] = useState(true);
  const [weeklyRecap, setWeeklyRecap] = useState<WeeklyRecap | null>(null);
  const [checkInVisible, setCheckInVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
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
  }, []);

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

  const handleRecommendationPress = () => {
    if (!recommendation) return;
    const route = TAB_ROUTES[recommendation.tab];
    if (route) {
      router.push(route as never);
    } else if (recommendation.tab === 'home') {
      setCheckInVisible(true);
    }
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
            <Ionicons name="person-circle-outline" size={28} color="#9a3412" />
          </TouchableOpacity>
        </View>

        {user?.isAnonymous && (
          <TouchableOpacity style={styles.signUpBanner} onPress={() => router.push('/sign-up')}>
            <Text style={styles.signUpBannerText}>Using a temporary session - tap to save your progress</Text>
          </TouchableOpacity>
        )}

        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>Nova&apos;s suggestion</Text>
          {recommendationLoading ? (
            <ActivityIndicator style={styles.cardLoading} />
          ) : recommendation ? (
            <>
              <Text style={styles.cardTitle}>{recommendation.title}</Text>
              <Text style={styles.cardMessage}>{recommendation.message}</Text>
              <TouchableOpacity style={styles.cardButton} onPress={handleRecommendationPress}>
                <Text style={styles.cardButtonText}>
                  {TAB_ROUTES[recommendation.tab] ? `Open ${recommendation.tool}` : 'Talk it through with Nova'}
                </Text>
              </TouchableOpacity>
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

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 20, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  header: { fontSize: 28, fontWeight: '800' },
  signUpBanner: {
    backgroundColor: '#fff7ed',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  signUpBannerText: { color: '#9a3412', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  card: {
    backgroundColor: '#fafafa',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#eee',
    padding: 18,
    marginBottom: 16,
  },
  cardEyebrow: { fontSize: 11, fontWeight: '800', color: '#999', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  cardTitle: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
  cardMessage: { fontSize: 14, color: '#444', lineHeight: 20 },
  cardSubtext: { fontSize: 13, color: '#777', marginTop: 6 },
  cardLoading: { marginVertical: 8 },
  cardButton: {
    backgroundColor: '#ea580c',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  cardButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  claimButton: {
    borderWidth: 2,
    borderColor: '#ea580c',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  claimButtonText: { color: '#ea580c', fontWeight: '800', fontSize: 16 },
});
