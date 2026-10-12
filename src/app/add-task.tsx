import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Button, Switch, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
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
  const { addTask, tags, addTag } = useTasks();
  const router = useRouter();

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
  addTask({ title, deadline: deadline || undefined, tag, important, priority });
  setTitle('');
  setDeadline('');
  setTag(undefined);
  setNewTag('');
  setImportant(false);
  setPriorityOverride(null);
  router.back();
};


  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>Add Task</Text>

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

      <Button title="Save Task" onPress={handleSubmit} />
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
});