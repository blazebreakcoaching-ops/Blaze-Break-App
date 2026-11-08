import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text, TextInput } from '../lib/native-ui';
import { useNativeTheme } from '../lib/native-theme';
import type { NativeThemeColors } from '../lib/native-theme-palette';
import { readPersonalProfile, savePersonalProfile, type PersonalProfile } from '../lib/personal-profile';
import { useNativeI18n } from '../lib/i18n';
import { SUPPORTED_LOCALES } from '../../../i18n';

export function PersonalWelcomeSettings({ uid }: { uid: string }) {
  const { colors } = useNativeTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const { t, setLocale, dir } = useNativeI18n();
  const [state, setState] = useState<{ uid: string; profile: PersonalProfile } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const profile = state?.uid === uid ? state.profile : null;

  useEffect(() => {
    let active = true;
    setState(null);
    setError('');
    readPersonalProfile(uid).then(value => {
      if (active) setState({ uid, profile: value });
    }).catch(() => {
      if (active) setError('Could not load welcome settings. Reopen Account to try again.');
    });
    return () => { active = false; };
  }, [uid]);

  const patch = (fields: Partial<PersonalProfile>) => {
    setSaved(false);
    setState(current => current?.uid === uid ? { uid, profile: { ...current.profile, ...fields } } : current);
  };
  const save = async () => {
    if (!profile || busy) return;
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await savePersonalProfile(uid, profile);
      setLocale(profile.language);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your preferences.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.card, { direction: dir }]}>
      <Text style={styles.heading} accessibilityRole="header">Your welcome</Text>
      <Text style={styles.hint}>Make Blaze Break feel comfortable for you. You can change this later.</Text>
      {!profile ? (
        <Text style={styles.hint}>{error || 'Loading preferences…'}</Text>
      ) : (
        <>
          <Text style={styles.label}>{t('onboarding.preferredName')}</Text>
          <TextInput style={styles.input} accessibilityLabel="Preferred name"
            value={profile.preferredName} onChangeText={preferredName => patch({ preferredName })}
            maxLength={60} placeholder={t('onboarding.preferredNamePlaceholder')} autoCapitalize="words" />
          <Text style={styles.label}>{t('settings.timeZone')}</Text>
          <TextInput style={styles.input} accessibilityLabel="Your time zone"
            value={profile.timeZone} onChangeText={timeZone => patch({ timeZone })}
            autoCapitalize="none" autoCorrect={false} placeholder="Europe/London" />
          <Text style={styles.hint}>{t('settings.timeZoneHelp')}</Text>
          <Text style={styles.label}>{t('settings.region')}</Text>
          <TextInput style={styles.input} accessibilityLabel="Country or region"
            value={profile.region} onChangeText={region => patch({ region })} maxLength={60} />
          <Text style={styles.label}>{t('settings.language')}</Text>
          <View style={styles.options} accessibilityRole="radiogroup">
            {SUPPORTED_LOCALES.map(l => (
              <TouchableOpacity key={l.code} style={[styles.option, profile.language === l.code && styles.active]}
                accessibilityRole="radio" accessibilityState={{ checked: profile.language === l.code }}
                accessibilityLabel={`${l.nativeName}, ${l.englishName}`} accessibilityLanguage={l.intl}
                onPress={() => { patch({ language: l.code }); setLocale(l.code); }}>
                <Text style={styles.optionText}>{l.nativeName}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {profile.language !== 'en' ? <Text style={styles.hint}>{t('settings.languageDraft')}</Text> : null}
          <Text style={styles.label}>{t('settings.welcomeStyle')}</Text>
          <View style={styles.options} accessibilityRole="radiogroup">
            {(['warm', 'simple', 'direct'] as const).map(tone => (
              <TouchableOpacity key={tone} style={[styles.option, profile.tone === tone && styles.active]}
                accessibilityRole="radio" accessibilityState={{ checked: profile.tone === tone }}
                onPress={() => patch({ tone })}>
                <Text style={styles.optionText}>{t(`settings.tone.${tone}`)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.switchRow} accessibilityRole="switch"
            accessibilityState={{ checked: profile.enabled }} onPress={() => patch({ enabled: !profile.enabled })}>
            <Text style={styles.optionText}>{t('settings.showWelcome')}</Text>
            <Text style={styles.optionText}>{profile.enabled ? 'On' : 'Off'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.switchRow} accessibilityRole="switch"
            accessibilityState={{ checked: profile.useName }} onPress={() => patch({ useName: !profile.useName })}>
            <Text style={styles.optionText}>{t('settings.useName')}</Text>
            <Text style={styles.optionText}>{profile.useName ? 'On' : 'Off'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.switchRow} accessibilityRole="switch"
            accessibilityState={{ checked: profile.lowEnergyMode }} accessibilityHint={t('settings.lowEnergyHint')}
            onPress={() => patch({ lowEnergyMode: !profile.lowEnergyMode })}>
            <Text style={styles.optionText}>{t('settings.lowEnergy')}</Text>
            <Text style={styles.optionText}>{profile.lowEnergyMode ? 'On' : 'Off'}</Text>
          </TouchableOpacity>
          {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
          {saved ? <Text accessibilityLiveRegion="polite" style={styles.hint}>Your settings have been saved.</Text> : null}
          <TouchableOpacity style={styles.save} accessibilityRole="button" disabled={busy} onPress={() => { void save(); }}>
            {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.saveText}>{t('common.save')}</Text>}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const makeStyles = (colors: NativeThemeColors) => StyleSheet.create({
  card: { marginTop: 24, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 16, gap: 10 },
  heading: { fontWeight: '800', fontSize: 18 },
  hint: { fontSize: 13, lineHeight: 19, color: colors.muted },
  label: { fontSize: 14, fontWeight: '700', marginTop: 6 },
  input: { backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 16 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { paddingVertical: 12, paddingHorizontal: 14, minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  active: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  optionText: { color: colors.text, fontSize: 14 },
  switchRow: { minHeight: 48, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, gap: 12 },
  save: { backgroundColor: colors.accent, borderRadius: 10, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontSize: 16, color: colors.onAccent, fontWeight: '700' },
  error: { fontSize: 13, color: colors.danger },
});
