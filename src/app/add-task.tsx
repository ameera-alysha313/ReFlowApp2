import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, Button, Switch, Pressable, ScrollView, Platform, BackHandler } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useTasks, Priority, TimeOfDay, Task, Subtask } from '../context/task-context';
import { useHabits } from '../context/habit-context';
import { useMode } from '../context/mode-context';
import { useAuth } from '../context/auth-context';
import StepsDraft from '../components/steps-draft';
import { suggestPriority } from '../utils/suggest-priority';
import { breakDownTask } from '../utils/task-breakdown';
import { logEvent } from '../utils/log-event';
import { dateKey, tomorrowKey } from '../utils/date-key';
import { confirmDelete, confirmDiscard } from '../utils/confirm';

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

// Used to tell whether the form has unsaved changes
type FormState = {
  title: string; deadline: string; tag?: string; priorityOverride: Priority | null; timeOfDay?: TimeOfDay;
  repeat: boolean; days: number[]; steps: Subtask[]; pendingStep: string; newTag: string;
};
const snap = (f: FormState) =>
  JSON.stringify([
    f.title, f.deadline, f.tag ?? null, f.priorityOverride, f.timeOfDay ?? null,
    f.repeat, f.days, f.steps.map(s => [s.title, s.done]), f.pendingStep, f.newTag,
  ]);

// Small arrow: points right when closed, down when open
function Chevron({ open }: { open: boolean }) {
  return <View style={[styles.chevron, open ? styles.chevronOpen : styles.chevronClosed]} />;
}

// One form for tasks AND habits.
//   /add-task                    -> new task
//   /add-task?habit=1            -> new habit (Repeat switched on)
//   /add-task?id=...             -> edit a task
//   /add-task?habitId=...        -> edit a habit
export default function AddTask() {
  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [tag, setTag] = useState<string | undefined>(undefined);
  const [newTag, setNewTag] = useState('');
  const [priorityOverride, setPriorityOverride] = useState<Priority | null>(null);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay | undefined>(undefined);
  const [repeat, setRepeat] = useState(false);
  const [days, setDays] = useState<number[]>(ALL_DAYS);
  const [steps, setSteps] = useState<Subtask[]>([]);
  const [pendingStep, setPendingStep] = useState('');
  const [stepsOpen, setStepsOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [rating, setRating] = useState<{ friction?: number; stakes?: number }>({});
  const [baseline, setBaseline] = useState<string | null>(null);
  const { mode } = useMode();
  const { user } = useAuth();
  const { addTask, updateTask, tasks, tags, addTag, deleteTask } = useTasks();
  const { habits, addHabit, updateHabit, deleteHabit } = useHabits();
  const router = useRouter();
  const { id, habit, habitId } = useLocalSearchParams<{ id?: string; habit?: string; habitId?: string }>();
  const editing = id ? tasks.find(t => t.id === id) : undefined;
  const editingHabit = habitId ? habits.find(h => h.id === habitId) : undefined;
  const loadedHabit = useRef<string | null>(null);

  // This tab stays mounted, so state must be re-filled whenever the params change
  useEffect(() => {
    if (habitId) return; // the habit effect below handles this
    loadedHabit.current = null;
    setTitle(editing?.title ?? '');
    setDeadline(editing?.deadline ?? '');
    setTag(editing?.tag);
    setNewTag('');
    setPriorityOverride(editing?.priority ?? null);
    setTimeOfDay(undefined); // "usually around" is for habits only
    setSteps((editing?.subtasks ?? []).map(s => ({ ...s })));
    setPendingStep('');
    setStepsOpen(false);
    setRating({});
    setRepeat(!!habit && !id);
    setDays(ALL_DAYS);
    setShowPicker(false);
    setBaseline(snap({
      title: editing?.title ?? '', deadline: editing?.deadline ?? '', tag: editing?.tag,
      priorityOverride: editing?.priority ?? null, timeOfDay: undefined, repeat: !!habit && !id,
      days: ALL_DAYS, steps: editing?.subtasks ?? [], pendingStep: '', newTag: '',
    }));
  }, [id, habit, habitId]);

  useEffect(() => {
    if (!habitId || !editingHabit || loadedHabit.current === habitId) return;
    loadedHabit.current = habitId;
    setTitle(editingHabit.title);
    setDeadline('');
    setTag(editingHabit.tag);
    setNewTag('');
    setPriorityOverride(null);
    setTimeOfDay(editingHabit.timeOfDay);
    setSteps([]);
    setPendingStep('');
    setRepeat(true);
    setDays(editingHabit.days);
    setShowPicker(false);
    setBaseline(snap({
      title: editingHabit.title, deadline: '', tag: editingHabit.tag, priorityOverride: null,
      timeOfDay: editingHabit.timeOfDay, repeat: true, days: editingHabit.days,
      steps: [], pendingStep: '', newTag: '',
    }));
  }, [habitId, editingHabit]);

  const habitMode = !!editingHabit || (repeat && !editing);

  const suggested = suggestPriority(deadline || undefined, false);
  const priority = priorityOverride ?? suggested;

  const todayK = dateKey();
  const tomorrowK = tomorrowKey();
  const isCustomDate = !!deadline && deadline !== todayK && deadline !== tomorrowK;

  const dirty =
    baseline !== null &&
    snap({ title, deadline, tag, priorityOverride, timeOfDay, repeat, days, steps, pendingStep, newTag }) !== baseline;

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

  const generateSteps = async () => {
    if (!title.trim()) return;
    setGenerating(true);
    const draftTask = {
      id: 'draft', title: title.trim(), completed: false, important: false, priority,
      tag, deadline: deadline || undefined,
    } as Task;
    const r = await breakDownTask(draftTask, mode);
    setSteps(r.subtasks);
    setPendingStep('');
    setRating({ friction: r.friction, stakes: r.stakes });
    logEvent(user?.uid ?? null, 'task_broken_down', { source: r.source, count: r.subtasks.length, mode, where: 'form' });
    setGenerating(false);
  };

  const resetForm = () => {
    setTitle('');
    setDeadline('');
    setTag(undefined);
    setNewTag('');
    setPriorityOverride(null);
    setTimeOfDay(undefined);
    setSteps([]);
    setPendingStep('');
    setStepsOpen(false);
    setRating({});
    setRepeat(false);
    setDays(ALL_DAYS);
  };

  // Clearing the params means the next visit with the same id still reloads the form
  const finish = () => {
    loadedHabit.current = null;
    resetForm();
    router.setParams({ id: '', habit: '', habitId: '' });
    router.back();
  };

  // Back button (top left and the phone's own back button): ask first if there are unsaved changes
  const goBack = () => (dirty ? confirmDiscard(finish) : finish());
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (dirtyRef.current) {
          confirmDiscard(() => finishRef.current());
          return true;
        }
        return false;
      });
      return () => sub.remove();
    }, [])
  );

  const handleSubmit = () => {
    if (!title.trim()) return;
    if (habitMode) {
      if (days.length === 0) return;
      const data = {
        title: title.trim(),
        days,
        ...(tag ? { tag } : {}),
        ...(timeOfDay ? { timeOfDay } : {}),
      };
      if (editingHabit) updateHabit(editingHabit.id, data);
      else addHabit(data);
      finish();
      return;
    }
    const allSteps = [...steps, ...(pendingStep.trim() ? [{ id: `${Date.now()}-p`, title: pendingStep, done: false }] : [])]
      .map(x => ({ ...x, title: x.title.trim() }))
      .filter(x => x.title);
    const data = {
      title: title.trim(),
      deadline: deadline || undefined,
      tag,
      // "important" now just means: the user raised priority to High above what the deadline suggests
      important: priority === 'High' && suggested !== 'High',
      priority,
      ...(editing ? { subtasks: allSteps, timeOfDay: undefined } : allSteps.length ? { subtasks: allSteps } : {}),
      ...(rating.friction !== undefined ? { friction: rating.friction } : {}),
      ...(rating.stakes !== undefined ? { stakes: rating.stakes } : {}),
    };
    if (editing) updateTask(editing.id, data);
    else addTask(data);
    finish();
  };

  const handleDelete = () => {
    if (editingHabit) {
      confirmDelete('Delete this habit?', 'It stops repeating. Past records stay.', () => {
        deleteHabit(editingHabit.id);
        finish();
      });
    } else if (editing) {
      confirmDelete('Delete this task?', "This can't be undone.", () => {
        deleteTask(editing.id);
        finish();
      });
    }
  };

  const heading = editingHabit ? 'Edit Habit' : editing ? 'Edit Task' : habitMode ? 'New Habit' : 'Add Task';
  const saveLabel = editingHabit || editing ? 'Save Changes' : habitMode ? 'Save Habit' : 'Save Task';
  const stepsStale = !!editing && steps.length > 0 && title.trim() !== editing.title;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.topRow}>
        <Pressable onPress={goBack} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.header}>{heading}</Text>
        <View style={{ width: 50 }} />
      </View>

      <TextInput
        style={styles.input}
        placeholder={habitMode ? 'Habit name' : 'Task name'}
        placeholderTextColor="#888"
        value={title}
        onChangeText={setTitle}
      />

      {!editing && !editingHabit && (
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Repeat (make this a habit)</Text>
          <Switch value={repeat} onValueChange={setRepeat} />
        </View>
      )}

      {!habitMode && (
        <View style={styles.stepsBlock}>
          <Pressable style={styles.stepsHeader} onPress={() => setStepsOpen(o => !o)}>
            <Text style={styles.stepsTitle}>
              Small steps{steps.length > 0 ? ` (${steps.length})` : ' (optional)'}
            </Text>
            <Chevron open={stepsOpen} />
          </Pressable>
          {stepsStale && (
            <Text style={styles.staleHint}>
              You changed the task name, so these steps may not fit any more. Edit them, or regenerate.
            </Text>
          )}
          {stepsOpen && (
            <View style={{ marginTop: 10 }}>
              <StepsDraft
                steps={steps}
                onChange={setSteps}
                pending={pendingStep}
                onPendingChange={setPendingStep}
                onGenerate={generateSteps}
                generating={generating}
                canGenerate={!!title.trim()}
              />
            </View>
          )}
        </View>
      )}

      {habitMode ? (
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
            <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor="#888" value={deadline} onChangeText={setDeadline} />
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
           <>
          <Text style={styles.label}>Priority (suggested: {suggested})</Text>
          <View style={styles.chipRow}>
            {PRIORITIES.map(p => (
              <Pressable key={p} style={[styles.chip, priority === p && styles.chipSelected]} onPress={() => setPriorityOverride(p === suggested ? null : p)}>
                <Text style={[styles.chipText, priority === p && styles.chipTextSelected]}>{p}</Text>
              </Pressable>
            ))}
          </View>
        </>

        </>
      )}

      {habitMode && (
        <>
          <Text style={styles.label}>Usually around (optional)</Text>
          <View style={styles.chipRow}>
            {TIMES.map(t => (
              <Pressable key={t.key} style={[styles.chip, timeOfDay === t.key && styles.chipSelected]} onPress={() => setTimeOfDay(timeOfDay === t.key ? undefined : t.key)}>
                <Text style={[styles.chipText, timeOfDay === t.key && styles.chipTextSelected]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

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

      <View style={{ marginTop: 10 }}>
        <Button title={saveLabel} onPress={handleSubmit} />
      </View>
      {(editing || editingHabit) && (
        <Pressable style={styles.deleteButton} onPress={handleDelete}>
          <Text style={styles.deleteText}>{editingHabit ? 'Delete habit' : 'Delete task'}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  back: { color: '#4A90D9', fontSize: 16, width: 50 },
  header: { fontSize: 24, fontWeight: 'bold', color: '#111' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginBottom: 15, color: '#111' },
  label: { fontSize: 15, fontWeight: '700', color: '#333', marginBottom: 8, marginTop: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15 },
  chip: { borderWidth: 1, borderColor: '#ccc', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 14 },
  chipText: { color: '#333' },
  chipSelected: { backgroundColor: '#4A90D9', borderColor: '#4A90D9' },
  chipTextSelected: { color: 'white' },
  dayRow: { flexDirection: 'row', gap: 6, marginBottom: 15 },
  dayChip: { flex: 1, alignItems: 'center', borderWidth: 1, borderColor: '#ccc', borderRadius: 16, paddingVertical: 8 },
  customTagRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  customTagInput: { flex: 1, marginBottom: 0 },
  manageLink: { color: '#4A90D9', fontSize: 14, marginTop: 8, marginBottom: 6 },
  stepsBlock: { backgroundColor: 'white', borderRadius: 12, padding: 14, marginBottom: 15, borderWidth: 1, borderColor: '#e5e5e5' },
  stepsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stepsTitle: { fontSize: 15, fontWeight: '700', color: '#333' },
  staleHint: { fontSize: 13, color: '#B26A00', marginTop: 8 },
  chevron: { width: 9, height: 9, borderRightWidth: 2, borderBottomWidth: 2, borderColor: '#888', marginRight: 4 },
  chevronClosed: { transform: [{ rotate: '-45deg' }] },
  chevronOpen: { transform: [{ rotate: '45deg' }] },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 15 },
  switchLabel: { fontSize: 16, color: '#111' },
  deleteButton: { marginTop: 30, backgroundColor: '#c0392b', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  deleteText: { color: 'white', fontSize: 16, fontWeight: '600' },
});