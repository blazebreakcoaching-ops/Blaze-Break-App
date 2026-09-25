import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
// Throwaway proof that Metro can resolve a shared, framework-agnostic
// module living outside /mobile at the repo root (see metro.config.js's
// watchFolders). Remove once real screens exist and exercise this for real.
import { ENTITLEMENT_PLANS } from '../entitlements';

export default function App() {
  return (
    <View style={styles.container}>
      <Text>Shared import check: {ENTITLEMENT_PLANS.join(', ')}</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
