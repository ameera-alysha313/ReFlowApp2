import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useTasks } from '../context/task-context';
import { useHabits } from '../context/habit-context';

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function daysLabel(days: number[]) {
  if (days.length === 7) return 'Every day';
  return DAY_NAMES.filter((_, i) => days.includes(i)).join(', ');
}

export default function Habits() {
  const router = useRouter();
  const { tags } = useTasks();
  const { habits, addHabit, deleteHabit } = useHabits();
  const [title, setTitle] = useState('');
  const [tag, setTag] = useState<string | undefined>(undefined);
  const [days, setDays] = useState<number[]>(ALL_DAYS);
  const [confirming, setConfirming] = useState<string | null>(null);

  const toggleDay = (d: number) =>
    setDays(prev => (prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort()));

  const save = () => {
    if (!title.trim() || days.length === 0) return;
    addHabit({ title: title.trim(), days, ...(tag ? { tag } : {}) });
    setTitle('');
    setTag(undefined);
    setDays(ALL_DAYS);
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.topRow}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.header}>Habits</Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>New habit</Text>
        <TextInput style={styles.input} placeholder="e.g. Brush teeth" value={title} onChangeText={setTitle} />

        <Text style={styles.cardLabel}>Repeats on</Text>
        <View style={styles.dayRow}>
          {DAY_LETTERS.map((l, i) => (
            <Pressable
              key={i}
              style={[styles.dayChip, days.includes(i) && styles.chipSelected]}
              onPress={() => toggleDay(i)}
            >
              <Text style={days.includes(i) && styles.chipTextSelected}>{l}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.cardLabel}>Tag (optional)</Text>
        <View style={styles.chipRow}>
          {tags.map(t => (
            <Pressable
              key={t}
              style={[styles.chip, tag === t && styles.chipSelected]}
              onPress={() => setTag(tag === t ? undefined : t)}
            >
              <Text style={tag === t && styles.chipTextSelected}>{t}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>
          Hygiene, Health and Safety habits stay visible even in Low mode.
        </Text>

        <Pressable style={[styles.primaryButton, (!title.trim() || days.length === 0) && { opacity: 0.5 }]} onPress={save}>
          <Text style={styles.primaryButtonText}>Save habit</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Your habits</Text>
      {habits.length === 0 ? (
        <Text style={styles.empty}>No habits yet.</Text>
      ) : (
        habits.map(h => (
          <View key={h.id} style={styles.habitRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.habitTitle}>{h.title}</Text>
              <Text style={styles.habitMeta}>{daysLabel(h.days)}{h.tag ? ` · ${h.tag}` : ''}</Text>
            </View>
            {confirming === h.id ? (
              <View style={styles.confirmRow}>
                <Pressable onPress={() => { deleteHabit(h.id); setConfirming(null); }}>
                  <Text style={styles.action}>Delete</Text>
                </Pressable>
                <Pressable onPress={() => setConfirming(null)}>
                  <Text style={styles.muted}>Keep</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => setConfirming(h.id)}>
                <Text style={styles.muted}>Delete</Text>
              </Pressable>
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  back: { color: '#4A90D9', fontSize: 16, width: 50 },
  header: { fontSize: 24, fontWeight: 'bold' },
  card: { backgroundColor: 'white', borderRadius: 16, padding: 20, marginBottom: 20, elevation: 2 },
  cardLabel: { fontSize: 14, color: '#666', marginBottom: 8, marginTop: 6 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginBottom: 10 },
  dayRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  dayChip: { flex: 1, alignItems: 'center', borderWidth: 1, borderColor: '#ccc', borderRadius: 16, paddingVertical: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  chip: { borderWidth: 1, borderColor: '#ccc', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 14 },
  chipSelected: { backgroundColor: '#4A90D9', borderColor: '#4A90D9' },
  chipTextSelected: { color: 'white' },
  hint: { fontSize: 12, color: '#888', marginBottom: 14 },
  primaryButton: { backgroundColor: '#4A90D9', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  primaryButtonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  empty: { fontSize: 14, color: '#888' },
  habitRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 12, padding: 14, marginBottom: 10, elevation: 1 },
  habitTitle: { fontSize: 16, fontWeight: '600' },
  habitMeta: { fontSize: 13, color: '#888', marginTop: 2 },
  confirmRow: { flexDirection: 'row', gap: 14 },
  action: { color: '#c0392b', fontSize: 15, fontWeight: '600' },
  muted: { color: '#888', fontSize: 15 },
});
