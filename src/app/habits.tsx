import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useHabits } from '../context/habit-context';
import type { TimeOfDay } from '../context/task-context';
import RowMenu from '../components/row-menu';
import { confirmDelete } from '../utils/confirm';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TIME_LABELS: Record<TimeOfDay, string> = {
  morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', night: 'Night',
};

function daysLabel(days: number[]) {
  if (days.length === 7) return 'Every day';
  return DAY_NAMES.filter((_, i) => days.includes(i)).join(', ');
}

// A plain list. Adding and editing both use the Add Task screen, in habit mode.
export default function Habits() {
  const router = useRouter();
  const { habits, deleteHabit } = useHabits();

  const edit = (id: string) => router.push({ pathname: '/add-task', params: { habitId: id } });

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.topRow}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.back}>‹ Back</Text>
          </Pressable>
          <Text style={styles.header}>Habits</Text>
          <View style={{ width: 50 }} />
        </View>

        {habits.length === 0 ? (
          <Text style={styles.empty}>No habits yet. Tap + to add one.</Text>
        ) : (
          habits.map(h => (
            <View key={h.id} style={styles.habitRow}>
              <Pressable style={{ flex: 1 }} onPress={() => edit(h.id)}>
                <Text style={styles.habitTitle}>{h.title}</Text>
                <Text style={styles.habitMeta}>
                  {daysLabel(h.days)}{h.timeOfDay ? ` · ${TIME_LABELS[h.timeOfDay]}` : ''}{h.tag ? ` · ${h.tag}` : ''}
                </Text>
              </Pressable>
              <RowMenu actions={[
                { label: 'Edit habit', onPress: () => edit(h.id) },
                {
                  label: 'Delete habit',
                  destructive: true,
                  onPress: () =>
                    confirmDelete('Delete this habit?', 'It stops repeating. Past records stay.', () => deleteHabit(h.id)),
                },
              ]} />
            </View>
          ))
        )}
      </ScrollView>

      <Pressable style={styles.fab} onPress={() => router.push({ pathname: '/add-task', params: { habit: '1' } })}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { padding: 20, paddingTop: 60, paddingBottom: 120 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  back: { color: '#4A90D9', fontSize: 16, width: 50 },
  header: { fontSize: 24, fontWeight: 'bold', color: '#111' },
  empty: { fontSize: 15, color: '#888', marginTop: 20 },
  habitRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 12, padding: 14, marginBottom: 10, elevation: 1 },
  habitTitle: { fontSize: 16, fontWeight: '600', color: '#111' },
  habitMeta: { fontSize: 13, color: '#888', marginTop: 2 },
  fab: { position: 'absolute', bottom: 30, right: 30, width: 56, height: 56, borderRadius: 28, backgroundColor: '#4A90D9', justifyContent: 'center', alignItems: 'center', elevation: 4 },
  fabText: { color: 'white', fontSize: 28, lineHeight: 30 },
});
