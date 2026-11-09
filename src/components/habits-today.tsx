import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTasks, TimeOfDay, Task, ESSENTIAL_TAGS } from '../context/task-context';
import { useHabits } from '../context/habit-context';
import RowMenu from './row-menu';
import { confirmDelete } from '../utils/confirm';
import { bucketOf } from '../utils/recommend-task';
import { dateKey } from '../utils/date-key';

const GROUPS: { key: TimeOfDay | 'anytime'; label: string }[] = [
  { key: 'morning', label: 'Morning' },
  { key: 'afternoon', label: 'Afternoon' },
  { key: 'evening', label: 'Evening' },
  { key: 'night', label: 'Night' },
  { key: 'anytime', label: 'Anytime' },
];

function HabitRow({ task, onToggle, onEdit, onDelete }: {
  task: Task; onToggle: () => void; onEdit: () => void; onDelete: () => void;
}) {
  return (
    <View style={styles.row}>
      <Pressable style={styles.rowMain} onPress={onToggle}>
        <View style={[styles.checkbox, task.completed && styles.checkboxChecked]}>
          {task.completed && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <Text style={[styles.rowText, task.completed && styles.rowDone]}>{task.title}</Text>
      </Pressable>
      <RowMenu actions={[
        { label: 'Edit habit', onPress: onEdit },
        { label: 'Delete habit', destructive: true, onPress: onDelete },
      ]} />
    </View>
  );
}

// Today's habits, grouped by when the user usually does them.
// Nothing expires: a morning habit still sits here at 6pm, ready to tick if it's already done.
// Low mode starts collapsed and only lists unfinished Hygiene/Health habits until expanded.
export default function HabitsToday({ lowMode = false }: { lowMode?: boolean }) {
  const router = useRouter();
  const { tasks, toggleTask } = useTasks();
  const { habits, deleteHabit } = useHabits();
  const [openChoice, setOpenChoice] = useState<boolean | null>(null);
  const open = openChoice ?? !lowMode;

  if (habits.length === 0) return null;

  const manage = () => router.push('/habits');
  const rowProps = (t: Task) => ({
    task: t,
    onToggle: () => toggleTask(t.id),
    onEdit: () => router.push({ pathname: '/add-task', params: { habitId: t.habitId } }),
    onDelete: () =>
      confirmDelete('Delete this habit?', 'It stops repeating. Past records stay.', () => deleteHabit(t.habitId!)),
  });

  const today = dateKey();
  const todays = tasks.filter(t => t.habitId && t.habitDate === today);

  if (todays.length === 0) {
    return (
      <Pressable style={styles.slim} onPress={manage}>
        <Text style={styles.slimText}>No habits scheduled today · Manage</Text>
      </Pressable>
    );
  }

  const doneCount = todays.filter(t => t.completed).length;
  const nowBucket = bucketOf(new Date().getHours());
  const essentialsOpen = todays.filter(t => !t.completed && t.tag && ESSENTIAL_TAGS.includes(t.tag));

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Pressable style={{ flex: 1 }} onPress={() => setOpenChoice(!open)}>
          <Text style={styles.title}>Today's habits ({doneCount}/{todays.length})</Text>
        </Pressable>
        <Pressable onPress={manage} hitSlop={10}>
          <Text style={styles.link}>Manage</Text>
        </Pressable>
        <Pressable onPress={() => setOpenChoice(!open)} hitSlop={10}>
          <Text style={[styles.link, { marginLeft: 14 }]}>{open ? 'Hide' : 'Show'}</Text>
        </Pressable>
      </View>

      {open && GROUPS.map(g => {
        const items = todays
          .filter(t => (t.timeOfDay ?? 'anytime') === g.key)
          .sort((a, b) => Number(a.completed) - Number(b.completed));
        if (items.length === 0) return null;
        return (
          <View key={g.key} style={styles.group}>
            <Text style={styles.groupLabel}>{g.label}{g.key === nowBucket ? ' · now' : ''}</Text>
            {items.map(t => <HabitRow key={t.id} {...rowProps(t)} />)}
          </View>
        );
      })}

      {!open && lowMode && essentialsOpen.length > 0 && (
        <View style={styles.group}>
          <Text style={styles.groupLabel}>Daily essentials</Text>
          {essentialsOpen.map(t => <HabitRow key={t.id} {...rowProps(t)} />)}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: 'white', borderRadius: 12, padding: 14, marginTop: 12, marginBottom: 12, elevation: 1 },
  slim: { paddingVertical: 8, marginBottom: 8 },
  slimText: { fontSize: 13, color: '#4A90D9' },
  header: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 15, fontWeight: '600', color: '#111' },
  link: { fontSize: 14, color: '#4A90D9' },
  group: { marginTop: 10 },
  groupLabel: { fontSize: 12, color: '#888', fontWeight: '600', marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  checkbox: { width: 24, height: 24, borderWidth: 2, borderColor: '#888', borderRadius: 6, marginRight: 12, justifyContent: 'center', alignItems: 'center' },
  checkboxChecked: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  checkmark: { color: 'white', fontWeight: 'bold' },
  rowText: { fontSize: 16, color: '#111', flex: 1 },
  rowDone: { opacity: 0.4, textDecorationLine: 'line-through' },
});
