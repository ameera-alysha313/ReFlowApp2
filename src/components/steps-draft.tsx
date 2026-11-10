import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Subtask } from '../context/task-context';

// Small steps inside the Add / Edit Task form. Works on a local list; the form saves it with the task.
export default function StepsDraft({
  steps, onChange, pending, onPendingChange, onGenerate, generating, canGenerate,
}: {
  steps: Subtask[];
  onChange: (next: Subtask[]) => void;
  pending: string;                       // text typed in "Add a step" but not added yet
  onPendingChange: (t: string) => void;
  onGenerate: () => void;
  generating: boolean;
  canGenerate: boolean;
}) {
  const rename = (id: string, title: string) =>
    onChange(steps.map(s => (s.id === id ? { ...s, title } : s)));
  const remove = (id: string) => onChange(steps.filter(s => s.id !== id));
  const move = (i: number, dir: number) => {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const a = [...steps];
    [a[i], a[j]] = [a[j], a[i]];
    onChange(a);
  };
  const add = () => {
    const t = pending.trim();
    if (!t) return;
    onChange([...steps, { id: `${Date.now()}-${steps.length}`, title: t, done: false }]);
    onPendingChange('');
  };

  return (
    <View style={{ marginBottom: 15 }}>
      {steps.map((s, i) => (
        <View key={s.id} style={styles.row}>
          <TextInput style={styles.input} value={s.title} multiline onChangeText={t => rename(s.id, t)} />
          <Pressable style={styles.iconBtn} onPress={() => move(i, -1)} hitSlop={6}>
            <Text style={styles.icon}>↑</Text>
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={() => move(i, 1)} hitSlop={6}>
            <Text style={styles.icon}>↓</Text>
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={() => remove(s.id)} hitSlop={6}>
            <Text style={[styles.icon, { color: '#c0392b' }]}>✕</Text>
          </Pressable>
        </View>
      ))}

      <View style={styles.row}>
        <TextInput
          style={styles.input}
          placeholder="Add a step"
          placeholderTextColor="#888"
          value={pending}
          onChangeText={onPendingChange}
          onSubmitEditing={add}
          returnKeyType="done"
        />
        <Pressable style={styles.addBtn} onPress={add} hitSlop={6}>
          <Text style={styles.addText}>Add</Text>
        </Pressable>
      </View>

      <Pressable
        style={[styles.generate, (!canGenerate || generating) && { opacity: 0.5 }]}
        onPress={onGenerate}
        disabled={!canGenerate || generating}
      >
        {generating
          ? <ActivityIndicator />
          : <Text style={styles.generateText}>{steps.length ? 'Regenerate steps for me' : 'Generate steps for me'}</Text>}
      </Pressable>
      {!canGenerate && <Text style={styles.hint}>Enter a task name first to generate steps.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 4 },
  input: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 8, fontSize: 15, color: '#111' },
  iconBtn: { width: 30, height: 36, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 18, color: '#666' },
  addBtn: { paddingHorizontal: 10, height: 36, justifyContent: 'center' },
  addText: { color: '#4A90D9', fontSize: 15, fontWeight: '600' },
  generate: { backgroundColor: '#f0f0f0', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  generateText: { fontSize: 15, color: '#111' },
  hint: { fontSize: 12, color: '#888', marginTop: 6 },
});