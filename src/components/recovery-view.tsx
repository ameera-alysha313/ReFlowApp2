import { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useAuth } from '../context/auth-context';      // NEW
import { logEvent } from '../utils/log-event';          // NEW

const STEP_UP_AFTER = 5;                                 // NEW

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
  const { user } = useAuth();                            // NEW
  const uid = user?.uid ?? null;                         // NEW
  const [doneCount, setDoneCount] = useState(0);         // NEW

  const nextAction = () => {
    setIndex(prev => (prev + 1) % MICRO_ACTIONS.length);
    setDone(false);
  };


  const markDone = () => {
    logEvent(uid, 'recovery_action_done', { action: MICRO_ACTIONS[index] });
    setDoneCount(c => c + 1);
    setDone(true);
  };

  const skip = () => {
    logEvent(uid, 'recovery_action_skipped', { action: MICRO_ACTIONS[index] });
    nextAction();
  };

  const stepUp = () => {
    logEvent(uid, 'recovery_step_up', { doneCount });
    onFeelingBetter();
  };

  const stayHere = () => {
    logEvent(uid, 'recovery_step_up_dismissed', { doneCount });
    setDoneCount(0);
    nextAction();
  };

  //STEP UP PROMPT
  if (done && doneCount >= STEP_UP_AFTER) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>That's {doneCount} small things.</Text>
        <Text style={styles.meta}>Want to try a bit more? Staying here is fine too.</Text>
        <Pressable style={styles.primaryButton} onPress={stepUp}>
          <Text style={styles.primaryButtonText}>Move to Low mode</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={stayHere}>
          <Text style={styles.secondaryButtonText}>Stay here for now</Text>
        </Pressable>
      </View>
    );
  }

  if (done) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Nice. That counts.</Text>
        <Text style={styles.meta}>Small steps add up. There's no rush.</Text>
        <Pressable style={styles.primaryButton} onPress={nextAction}>
          <Text style={styles.primaryButtonText}>One more small thing</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={stepUp}>  
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
      <Pressable style={styles.primaryButton} onPress={markDone}>
        <Text style={styles.primaryButtonText}>I did it</Text>
      </Pressable>
      <Pressable onPress={skip}>
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
  secondaryButton: { backgroundColor: '#f0f0f0', borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 10 },
  secondaryButtonText: { fontSize: 16 },
  linkText: { color: '#4A90D9', textAlign: 'center', marginTop: 16, fontSize: 15 },
});