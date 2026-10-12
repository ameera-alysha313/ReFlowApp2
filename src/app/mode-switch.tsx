import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useMode, Mode } from '../context/mode-context';

const MODES: { label: Mode; color: string }[] = [
  { label: 'High', color: '#4CAF50' },
  { label: 'Medium', color: '#F5A623' },
  { label: 'Low', color: '#E74C3C' },
];

export default function ModeSwitch() {
  const { mode, setMode } = useMode();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>How are you feeling today?</Text>
      {MODES.map(({ label, color }) => (
        <TouchableOpacity
          key={label}
          style={[
            styles.button,
            { backgroundColor: color },
            mode === label && styles.selectedButton,
          ]}
          onPress={() => setMode(label)}
        >
          <Text style={styles.buttonText}>{label}</Text>
        </TouchableOpacity>
      ))}
      {/* TEMPORARY: Recovery is meant to trigger automatically. Remove once auto-trigger is built. */}
      <TouchableOpacity
        style={[styles.testButton, mode === 'Recovery' && styles.selectedButton]}
        onPress={() => setMode('Recovery')}
      >
        <Text style={styles.testButtonText}>Recovery (test only)</Text>
      </TouchableOpacity>

      <Text style={styles.currentMode}>Current mode: {mode}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5', padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 30 },
  button: { paddingVertical: 15, paddingHorizontal: 40, borderRadius: 10, marginVertical: 8, width: '80%', alignItems: 'center' },
  selectedButton: { borderWidth: 3, borderColor: '#333' },
  buttonText: { color: 'white', fontSize: 18, fontWeight: '600' },
  currentMode: { marginTop: 20, fontSize: 14, color: '#666' },
  testButton: { marginTop: 16, paddingVertical: 12, paddingHorizontal: 30, borderRadius: 10,
  backgroundColor: '#dfe8f1', width: '80%', alignItems: 'center' },
testButtonText: { color: '#44566b', fontSize: 15, fontWeight: '600' },
});