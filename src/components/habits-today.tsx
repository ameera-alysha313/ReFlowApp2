import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTasks, TimeOfDay } from '../context/task-context';
import { bucketOf } from '../utils/recommend-task';
import { dateKey } from '../utils/date-key';

const GROUPS: { key: TimeOfDay | 'anytime'; label: string }[] = [
  { key: 'morning', label: 'Morning' },
  { key: 'afternoon', label: 'Afternoon' },
  { key: 'evening', label: 'Evening' },
  { key: 'night', label: 'Night' },
  { key: 'anytime', label: 'Anytime' },
];

// Today's habits, grouped by when the user usually does them.
// Nothing expires: a morning habit still sits here at 6pm, ready to tick if it's already done.
export default function HabitsToday() {
  const { tasks, toggleTask } = useTasks();
  const [open, setOpen] = useState(true);
  const today = dateKey();
  const habits = tasks.filter(t => t.habitId && t.habitDate === today);
  if (habits.length === 0) return null;

  const doneCount = habits.filter(t => t.completed).length;
  const nowBucket = bucketOf(new Date().getHours());

  return (
    <View style={styles.card}>
      <Pressable style={styles.header} onPress={() => setOpen(o => !o)}>
        <Text style={styles.title}>Today's habits ({doneCount}/{habits.length})</Text>
        <Text style={styles.toggle}>{open ? 'Hide' : 'Show'}</Text>
      </Pressable>
      {open && GROUPS.map(g => {
        const items = habits
          .filter(t => (t.timeOfDay ?? 'anytime') === g.key)
          .sort((a, b) => Number(a.completed) - Number(b.completed));
        if (items.length === 0) return null;
        return (
          <View key={g.key} style={styles.group}>
            <Text style={styles.groupLabel}>{g.label}{g.key === nowBucket ? ' · now' : ''}</Text>
            {items.map(t => (
              <Pressable key={t.id} style={styles.row} onPress={() => toggleTask(t.id)}>
                <View style={[styles.checkbox, t.completed && styles.checkboxChecked]}>
                  {t.completed && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={[styles.rowText, t.completed && styles.rowDone]}>{t.title}</Text>
              </Pressable>
            ))}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: 'white', borderRadius: 12, padding: 14, marginBottom: 12, elevation: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 15, fontWeight: '600', color: '#111' },
  toggle: { fontSize: 14, color: '#4A90D9' },
  group: { marginTop: 10 },
  groupLabel: { fontSize: 12, color: '#888', fontWeight: '600', marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  checkbox: { width: 24, height: 24, borderWidth: 2, borderColor: '#888', borderRadius: 6, marginRight: 12, justifyContent: 'center', alignItems: 'center' },
  checkboxChecked: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  checkmark: { color: 'white', fontWeight: 'bold' },
  rowText: { fontSize: 16, color: '#111', flex: 1 },
  rowDone: { opacity: 0.4, textDecorationLine: 'line-through' },
});
