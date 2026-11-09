import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useMode, Mode } from '../context/mode-context';

const MODES: { label: Mode; color: string }[] = [
  { label: 'High', color: '#4CAF50' },
  { label: 'Medium', color: '#F5A623' },
  { label: 'Low', color: '#E74C3C' },
];

const MODE_BLURBS: Record<Mode, string> = {
  High: 'Feeling capable. You see all your open tasks, with the highest priority first.',
  Medium: 'Steady and getting by. You see what is due in the next few days, with a suggested place to start.',
  Low: 'Low energy. You see one small thing at a time, nothing more.',
  Recovery: 'Recovery mode active. Offering tiny, gentle steps to get you back on track.',
};

// 1. Color map dictionary to easily handle the fallback for 'Recovery'
const MODE_COLORS: Record<Mode, string> = {
  High: '#4CAF50',
  Medium: '#F5A623',
  Low: '#E74C3C',
  Recovery: '#dfe8f1', // Subtle blue/grey matching your dev test button
};

export default function ModeSwitch() {
  const { mode, setMode } = useMode();

  // 2. Resolve the matching theme color dynamically
  const activeColor = MODE_COLORS[mode] || '#333';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>How are you feeling today?</Text>
      <Text style={styles.subtitle}>Pick what fits right now. You can change it any time.</Text>

      <Text style={styles.currentMode}>
        Current mode: <Text style={styles.modeHighlight}>{mode}</Text>
      </Text>

      {MODES.map(({ label, color }) => (
        <View key={label} style={styles.item}>
          <TouchableOpacity
            style={[
              styles.button,
              { backgroundColor: color },
              mode === label && styles.selectedButton,
            ]}
            onPress={() => setMode(label)}
          >
            <Text style={styles.buttonText}>{label}</Text>
          </TouchableOpacity>
        </View>
      ))}

      {__DEV__ && (
        <TouchableOpacity
          style={[styles.testButton, mode === 'Recovery' && styles.selectedButton]}
          onPress={() => setMode('Recovery')}
        >
          <Text style={styles.testButtonText}>Recovery (test only)</Text>
        </TouchableOpacity>
      )}

      {/* 3. POSITION SWAPPED: The Dynamic Blurb box is now on top */}
      <View style={[styles.descriptionContainer, { borderLeftColor: activeColor }]}>
        <Text style={styles.descriptionTitle}>About {mode} Mode</Text>
        <Text style={styles.descriptionText}>{MODE_BLURBS[mode]}</Text>
      </View>

      {/* 4. POSITION SWAPPED: The recovery note is now at the very bottom */}
      <Text style={styles.recoveryNote}>
        If you have been away for a while, ReFlo may switch to Recovery mode, which offers tiny, gentle steps.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 20,
    paddingVertical: 50
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
    color: '#111'
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 12,
  },
  currentMode: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 24,
  },
  modeHighlight: {
    fontWeight: 'bold',
    color: '#222',
  },
  item: {
    width: '80%',
    alignItems: 'center',
    marginBottom: 16
  },
  button: {
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center'
  },
  selectedButton: {
    borderWidth: 3,
    borderColor: '#333'
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600'
  },
  testButton: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 10,
    backgroundColor: '#dfe8f1',
    width: '80%',
    alignItems: 'center',
    marginBottom: 12,
  },
  testButtonText: {
    color: '#44566b',
    fontSize: 15,
    fontWeight: '600'
  },
  descriptionContainer: {
    width: '85%',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 12,
    marginTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderLeftWidth: 5,
    // Removed fixed color from style layout sheet to inject it dynamically inline
  },
  descriptionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#222',
    marginBottom: 4,
  },
  descriptionText: {
    fontSize: 13,
    color: '#555',
    lineHeight: 18,
  },
  recoveryNote: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
    width: '80%',
    marginTop: 24, // Added breathing room between the blurb card and this footnote
    lineHeight: 18,
  },
});
