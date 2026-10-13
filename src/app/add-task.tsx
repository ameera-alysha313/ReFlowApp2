import { useState, useEffect } from 'react';
import { Alert, View, Text, TextInput, StyleSheet, Button, Switch, Pressable, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTasks, Priority } from '../context/task-context';
import { suggestPriority } from '../utils/suggest-priority';


const PRIORITIES: Priority[] = ['High', 'Medium', 'Low'];

export default function AddTask() {
  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState('');
  const [tag, setTag] = useState<string | undefined>(undefined);
  const [newTag, setNewTag] = useState('');
  const [important, setImportant] = useState(false);
  const [priorityOverride, setPriorityOverride] = useState<Priority | null>(null);
  const  { addTask, updateTask, tasks, tags, addTag, deleteTask} = useTasks();
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
}, [id]);

  const suggested = suggestPriority(deadline || undefined, important);
  const priority = priorityOverride ?? suggested;

  const handleAddTag = () => {
    if (!newTag.trim()) return;
    addTag(newTag);
    setTag(newTag.trim());
    setNewTag('');
  };
  
const handleSubmit = () => {
  if (!title.trim()) return;
  const data = { title, deadline: deadline || undefined, tag, important, priority };
  if (editing) updateTask(editing.id, data);
  else addTask(data);
  setTitle('');
  setDeadline('');
  setTag(undefined);
  setNewTag('');
  setImportant(false);
  setPriorityOverride(null);
  router.back();
};

const handleDelete = () => {
  if (!editing) return;
  Alert.alert('Delete this task?', "This can't be undone.", [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Delete',
      style: 'destructive',
      onPress: () => { deleteTask(editing.id); router.back(); },
    },
  ]);
};

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>{editing ? 'Edit Task' : 'Add Task'}</Text>

      <TextInput style={styles.input} placeholder="Task name" value={title} onChangeText={setTitle} />
      <TextInput
        style={styles.input}
        placeholder="Deadline (e.g. 2026-10-05)"
        value={deadline}
        onChangeText={setDeadline}
      />

      <Text style={styles.label}>Tag</Text>
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
      <View style={styles.customTagRow}>
        <TextInput
          style={[styles.input, styles.customTagInput]}
          placeholder="Add your own tag"
          value={newTag}
          onChangeText={setNewTag}
        />
        <Button title="Add" onPress={handleAddTag} />
      </View>

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>This is important</Text>
        <Switch value={important} onValueChange={setImportant} />
      </View>

      <Text style={styles.label}>Priority (suggested: {suggested})</Text>
      <View style={styles.chipRow}>
        {PRIORITIES.map(p => (
          <Pressable
            key={p}
            style={[styles.chip, priority === p && styles.chipSelected]}
            onPress={() => setPriorityOverride(p === suggested ? null : p)}
          >
            <Text style={priority === p && styles.chipTextSelected}>{p}</Text>
          </Pressable>
        ))}
      </View>

      <Button title={editing ? 'Save Changes' : 'Save Task'} onPress={handleSubmit}/>
        {editing && (
        <Pressable style={styles.deleteButton} onPress={handleDelete}>
          <Text style={styles.deleteText}>Delete task</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60 },
  header: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginBottom: 15 },
  label: { fontSize: 14, color: '#666', marginBottom: 8, marginTop: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15 },
  chip: { borderWidth: 1, borderColor: '#ccc', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 14 },
  chipSelected: { backgroundColor: '#4A90D9', borderColor: '#4A90D9' },
  chipTextSelected: { color: 'white' },
  customTagRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  customTagInput: { flex: 1, marginBottom: 0 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 15 },
  switchLabel: { fontSize: 16 },
  deleteButton: { marginTop: 40, alignItems: 'center', padding: 12 },
  deleteText: { color: '#888', fontSize: 15 },
});