import { useState, useEffect } from 'react';
import { Alert, View, Text, TextInput, StyleSheet, Button, Switch, Pressable, ScrollView, Platform } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTasks, Priority, TimeOfDay } from '../context/task-context';
import { useHabits } from '../context/habit-context';
import { suggestPriority } from '../utils/suggest-priority';
import { dateKey, tomorrowKey } from '../utils/date-key';

const PRIORITIES: Priority[] = ['High', 'Medium', 'Low'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const TIMES: { key: TimeOfDay; label: string }[] = [
  { key: 'morning', label: 'Morning' },
  { key: 'afternoon', label: 'Afternoon' },
  { key: 'evening', label: 'Evening' },
  { key: 'night', label: 'Night' },
];

function shortDate(key: string) {
  const m = key.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : key;
}
function dateFromKey(key: string) {
  const m = key.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
}

export default function AddTask() {
  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [tag, setTag] = useState<string | undefined>(undefined);
  const [newTag, setNewTag] = useState('');
  const [important, setImportant] = useState(false);
  const [priorityOverride, setPriorityOverride] = useState<Priority | null>(null);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay | undefined>(undefined);
  const [repeat, setRepeat] = useState(false);
  const [days, setDays] = useState<number[]>(ALL_DAYS);
  const { addTask, updateTask, tasks, tags, addTag, deleteTask } = useTasks();
  const { addHabit } = useHabits();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = id ? tasks.find(t => t.id === id) : undefined;

  // This tab stays mounted, so state must be re-filled whenever the id changes
  useEffect(() => {
    setTitle(editing?.title ?? '');
    setDeadline(editing?.deadline ?? '');
    setTag(editing?.tag);
    setImportant(editing?.important ?? false);
    setPriorityOverride(editing?.priority ?? null);
    setTimeOfDay(editing?.timeOfDay);
    setRepeat(false);
    setDays(ALL_DAYS);
    setShowPicker(false);
  }, [id]);

  const suggested = suggestPriority(deadline || undefined, important);
  const priority = priorityOverride ?? suggested;

  const todayK = dateKey();
  const tomorrowK = tomorrowKey();
  const isCustomDate = !!deadline && deadline !== todayK && deadline !== tomorrowK;

  const onPickDate = (e: DateTimePickerEvent, d?: Date) => {
    setShowPicker(false);
    if (e.type === 'dismissed' || !d) return;
    setDeadline(dateKey(d));
  };

  const toggleDay = (d: number) =>
    setDays(prev => (prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort()));

  const handleAddTag = () => {
    if (!newTag.trim()) return;
    addTag(newTag);
    setTag(newTag.trim());
    setNewTag('');
  };

  const resetForm = () => {
    setTitle('');
    setDeadline('');
    setTag(undefined);
    setNewTag('');
    setImportant(false);
    setPriorityOverride(null);
    setTimeOfDay(undefined);
    setRepeat(false);
    setDays(ALL_DAYS);
  };

  const handleSubmit = () => {
    if (!title.trim()) return;
    if (repeat && !editing) {
      if (days.length === 0) return;
      addHabit({ title: title.trim(), days, ...(tag ? { tag } : {}), ...(timeOfDay ? { timeOfDay } : {}) });
      resetForm();
      router.back();
      return;
    }
    const data = { title: title.trim(), deadline: deadline || undefined, tag, important, priority, timeOfDay };
    if (editing) updateTask(editing.id, data);
    else addTask(data);
    resetForm();
    router.back();
  };

  const handleDelete = () => {
    if (!editing) return;
    const doDelete = () => {
      deleteTask(editing.id);
      router.back();
    };
    // Alert.alert doesn't work on web, so use the browser's confirm box there
    if (Platform.OS === 'web') {
      if (window.confirm("Delete this task? This can't be undone.")) doDelete();
      return;
    }
    Alert.alert('Delete this task?', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: doDelete },
    ]);
  };

  const showRepeat = repeat && !editing;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.header}>{editing ? 'Edit Task' : showRepeat ? 'New Habit' : 'Add Task'}</Text>
      <TextInput
        style={styles.input}
        placeholder={showRepeat ? 'Habit name' : 'Task name'}
        placeholderTextColor="#888"
        value={title}
        onChangeText={setTitle}
      />

      {!editing && (
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Repeat (make this a habit)</Text>
          <Switch value={repeat} onValueChange={setRepeat} />
        </View>
      )}

      {showRepeat ? (
        <>
          <Text style={styles.label}>Repeats on</Text>
          <View style={styles.dayRow}>
            {DAY_LETTERS.map((l, i) => (
              <Pressable key={i} style={[styles.dayChip, days.includes(i) && styles.chipSelected]} onPress={() => toggleDay(i)}>
                <Text style={[styles.chipText, days.includes(i) && styles.chipTextSelected]}>{l}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : (
        <>
          <Text style={styles.label}>Deadline</Text>
          {Platform.OS === 'web' ? (
            <TextInput
              style={styles.input}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#888"
              value={deadline}
              onChangeText={setDeadline}
            />
          ) : (
            <>
              <View style={styles.chipRow}>
                <Pressable style={[styles.chip, deadline === todayK && styles.chipSelected]} onPress={() => setDeadline(todayK)}>
                  <Text style={[styles.chipText, deadline === todayK && styles.chipTextSelected]}>Today</Text>
                </Pressable>
                <Pressable style={[styles.chip, deadline === tomorrowK && styles.chipSelected]} onPress={() => setDeadline(tomorrowK)}>
                  <Text style={[styles.chipText, deadline === tomorrowK && styles.chipTextSelected]}>Tomorrow</Text>
                </Pressable>
                <Pressable style={[styles.chip, isCustomDate && styles.chipSelected]} onPress={() => setShowPicker(true)}>
                  <Text style={[styles.chipText, isCustomDate && styles.chipTextSelected]}>
                    {isCustomDate ? shortDate(deadline) : 'Pick a date'}
                  </Text>
                </Pressable>
                <Pressable style={[styles.chip, !deadline && styles.chipSelected]} onPress={() => setDeadline('')}>
                  <Text style={[styles.chipText, !deadline && styles.chipTextSelected]}>No deadline</Text>
                </Pressable>
              </View>
              {showPicker && (
                <DateTimePicker
                  value={deadline ? dateFromKey(deadline) : new Date()}
                  mode="date"
                  minimumDate={new Date()}
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  onChange={onPickDate}
                />
              )}
            </>
          )}
        </>
      )}

      <Text style={styles.label}>Usually around (optional)</Text>
      <View style={styles.chipRow}>
        {TIMES.map(t => (
          <Pressable key={t.key} style={[styles.chip, timeOfDay === t.key && styles.chipSelected]} onPress={() => setTimeOfDay(timeOfDay === t.key ? undefined : t.key)}>
            <Text style={[styles.chipText, timeOfDay === t.key && styles.chipTextSelected]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Tag</Text>
      <View style={styles.chipRow}>
        {tags.map(t => (
          <Pressable key={t} style={[styles.chip, tag === t && styles.chipSelected]} onPress={() => setTag(tag === t ? undefined : t)}>
            <Text style={[styles.chipText, tag === t && styles.chipTextSelected]}>{t}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.customTagRow}>
        <TextInput
          style={[styles.input, styles.customTagInput]}
          placeholder="Add your own tag"
          placeholderTextColor="#888"
          value={newTag}
          onChangeText={setNewTag}
        />
        <Button title="Add" onPress={handleAddTag} />
      </View>
      <Pressable onPress={() => router.push('/tags')}>
        <Text style={styles.manageLink}>Manage my tags ›</Text>
      </Pressable>

      {!showRepeat && (
        <>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>This is important</Text>
            <Switch value={important} onValueChange={setImportant} />
          </View>

          <Text style={styles.label}>Priority (suggested: {suggested})</Text>
          <View style={styles.chipRow}>
            {PRIORITIES.map(p => (
              <Pressable key={p} style={[styles.chip, priority === p && styles.chipSelected]} onPress={() => setPriorityOverride(p === suggested ? null : p)}>
                <Text style={[styles.chipText, priority === p && styles.chipTextSelected]}>{p}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      <Button title={editing ? 'Save Changes' : showRepeat ? 'Save Habit' : 'Save Task'} onPress={handleSubmit} />
      {editing && (
        <Pressable style={styles.deleteButton} onPress={handleDelete}>
          <Text style={styles.deleteText}>Delete task</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  header: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, color: '#111' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginBottom: 15, color: '#111' },
  label: { fontSize: 14, color: '#666', marginBottom: 8, marginTop: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15 },
  chip: { borderWidth: 1, borderColor: '#ccc', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 14 },
  chipText: { color: '#333' },
  chipSelected: { backgroundColor: '#4A90D9', borderColor: '#4A90D9' },
  chipTextSelected: { color: 'white' },
  dayRow: { flexDirection: 'row', gap: 6, marginBottom: 15 },
  dayChip: { flex: 1, alignItems: 'center', borderWidth: 1, borderColor: '#ccc', borderRadius: 16, paddingVertical: 8 },
  customTagRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  customTagInput: { flex: 1, marginBottom: 0 },
  manageLink: { color: '#4A90D9', fontSize: 14, marginTop: 8 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 15 },
  switchLabel: { fontSize: 16, color: '#111' },
  deleteButton: { marginTop: 40, alignItems: 'center', padding: 12 },
  deleteText: { color: '#888', fontSize: 15 },
});
