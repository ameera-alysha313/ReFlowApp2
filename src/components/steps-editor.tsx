import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTasks, Task, Subtask } from '../context/task-context';
import { useMode } from '../context/mode-context';
import { useAuth } from '../context/auth-context';
import { breakDownTask } from '../utils/task-breakdown';
import { logEvent } from '../utils/log-event';

// The small steps for one task: tick them off, generate them, or edit them to suit you.
// Used under a task on Home (the dropdown) and inside the Low-mode card.
export default function StepsEditor({ task }: { task: Task }) {
  const { updateTask } = useTasks();
  const { mode } = useMode();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Subtask[]>([]);
  const [newStep, setNewStep] = useState('');

  const subtasks = task.subtasks ?? [];
  const nextId = subtasks.find(s => !s.done)?.id;

  const makeSteps = async () => {
    setLoading(true);
    const result = await breakDownTask(task, mode);
    updateTask(task.id, { subtasks: result.subtasks, friction: result.friction, stakes: result.stakes });
    logEvent(user?.uid ?? null, 'task_broken_down', {
      taskId: task.id, source: result.source, count: result.subtasks.length, mode,
    });
    setLoading(false);
  };

  const toggleSub = (sid: string) =>
    updateTask(task.id, { subtasks: subtasks.map(s => (s.id === sid ? { ...s, done: !s.done } : s)) });

  // Editing happens on a local copy and is saved once, so typing doesn't spam the database
  const startEdit = () => {
    setDraft(subtasks.map(s => ({ ...s })));
    setNewStep('');
    setEditing(true);
  };
  const move = (i: number, dir: number) =>
    setDraft(prev => {
      const a = [...prev];
      const j = i + dir;
      if (j < 0 || j >= a.length) return a;
      [a[i], a[j]] = [a[j], a[i]];
      return a;
    });
  const saveEdit = () => {
    const extra = newStep.trim() ? [{ id: `${Date.now()}-new`, title: newStep.trim(), done: false }] : [];
    const cleaned = [...draft, ...extra]
      .map(s => ({ ...s, title: s.title.trim() }))
      .filter(s => s.title);
    updateTask(task.id, { subtasks: cleaned });
    logEvent(user?.uid ?? null, 'task_steps_edited', { taskId: task.id, count: cleaned.length });
    setEditing(false);
  };

  if (editing) {
    return (
      <View>
        {draft.map((s, i) => (
          <View key={s.id} style={styles.editRow}>
            <TextInput
              style={styles.input}
              value={s.title}
              multiline
              onChangeText={t => setDraft(prev => prev.map(x => (x.id === s.id ? { ...x, title: t } : x)))}
            />
            <Pressable style={styles.iconBtn} onPress={() => move(i, -1)} hitSlop={6}>
              <Text style={styles.icon}>↑</Text>
            </Pressable>
            <Pressable style={styles.iconBtn} onPress={() => move(i, 1)} hitSlop={6}>
              <Text style={styles.icon}>↓</Text>
            </Pressable>
            <Pressable style={styles.iconBtn} onPress={() => setDraft(prev => prev.filter(x => x.id !== s.id))} hitSlop={6}>
              <Text style={[styles.icon, { color: '#c0392b' }]}>✕</Text>
            </Pressable>
          </View>
        ))}
        <TextInput
          style={[styles.input, { marginTop: 6 }]}
          placeholder="Add a step"
          placeholderTextColor="#888"
          value={newStep}
          onChangeText={setNewStep}
          multiline
        />
        <View style={styles.editButtons}>
          <Pressable style={styles.saveBtn} onPress={saveEdit}>
            <Text style={styles.saveText}>Save steps</Text>
          </Pressable>
          <Pressable onPress={() => setEditing(false)}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (subtasks.length === 0) {
    return (
      <View>
        <Pressable style={styles.generate} onPress={makeSteps} disabled={loading}>
          {loading ? <ActivityIndicator /> : <Text style={styles.generateText}>Break it into small steps</Text>}
        </Pressable>
        <Pressable onPress={startEdit}>
          <Text style={styles.link}>Write my own steps</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      {subtasks.map(s => (
        <Pressable key={s.id} style={styles.stepRow} onPress={() => toggleSub(s.id)}>
          <View style={[styles.checkbox, s.done && styles.checkboxChecked]}>
            {s.done && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={[styles.stepText, s.id === nextId && { fontWeight: '700' }, s.done && { opacity: 0.4 }]}>
            {s.title}
          </Text>
        </Pressable>
      ))}
      <Pressable onPress={startEdit}>
        <Text style={styles.link}>Edit steps</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  stepRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  checkbox: { width: 24, height: 24, borderWidth: 2, borderColor: '#888', borderRadius: 6, marginRight: 12, justifyContent: 'center', alignItems: 'center' },
  checkboxChecked: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  checkmark: { color: 'white', fontWeight: 'bold' },
  stepText: { flex: 1, flexShrink: 1, fontSize: 16, color: '#111' },
  link: { color: '#4A90D9', fontSize: 14, marginTop: 8 },
  generate: { backgroundColor: '#f0f0f0', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  generateText: { fontSize: 15, color: '#111' },
  editRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 4 },
  input: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 8, fontSize: 15, color: '#111', backgroundColor: 'white' },
  iconBtn: { width: 30, height: 36, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 18, color: '#666' },
  editButtons: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 12 },
  saveBtn: { backgroundColor: '#4A90D9', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 18 },
  saveText: { color: 'white', fontSize: 15, fontWeight: '600' },
  cancel: { color: '#888', fontSize: 15 },
});