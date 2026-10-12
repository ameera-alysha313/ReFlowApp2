import { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';

const MICRO_ACTIONS = [
  'Sit up and take one slow breath',
  'Drink a glass of water',
  'Open the document you need to work on',
  'Read just one paragraph',
  'Sit at your desk',
  'Look at one task on your list',
];

export default function RecoveryView({ onFeelingBetter }: { onFeelingBetter: () => void }) {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * MICRO_ACTIONS.length));
  const [done, setDone] = useState(false);

  const nextAction = () => {
    setIndex(prev => (prev + 1) % MICRO_ACTIONS.length);
    setDone(false);
  };

  if (done) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Nice. That counts.</Text>
        <Text style={styles.meta}>Small steps add up. There's no rush.</Text>
        <Pressable style={styles.primaryButton} onPress={nextAction}>
          <Text style={styles.primaryButtonText}>One more small thing</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={onFeelingBetter}>
          <Text style={styles.secondaryButtonText}>I feel up for a bit more</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.intro}>Let's keep it small</Text>
      <Text style={styles.title}>{MICRO_ACTIONS[index]}</Text>
      <Text style={styles.meta}>No pressure. Just this one thing.</Text>
      <Pressable style={styles.primaryButton} onPress={() => setDone(true)}>
        <Text style={styles.primaryButtonText}>I did it</Text>
      </Pressable>
      <Pressable onPress={nextAction}>
        <Text style={styles.linkText}>Suggest something else</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: 'white', borderRadius: 16, padding: 24, marginTop: 20, elevation: 2 },
  intro: { fontSize: 14, color: '#666', marginBottom: 8 },
  title: { fontSize: 26, fontWeight: '600', marginBottom: 8 },
  meta: { fontSize: 14, color: '#888', marginBottom: 24 },
  primaryButton: { backgroundColor: '#4A90D9', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  primaryButtonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  secondaryButton: { backgroundColor: '#f0f0f0', borderRadius: 8, paddingVertical: 14,
    alignItems: 'center', marginTop: 10 },
  secondaryButtonText: { fontSize: 16 },
  linkText: { color: '#4A90D9', textAlign: 'center', marginTop: 16, fontSize: 15 },
});