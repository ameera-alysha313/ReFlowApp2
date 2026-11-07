import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { useTasks } from '../context/task-context';

export default function TagManager() {
  const { customTags, addTag, renameTag, deleteTag } = useTasks();
  const [newTag, setNewTag] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);

  const startEdit = (t: string) => { setEditing(t); setDraft(t); setConfirming(null); };
  const saveEdit = () => { if (editing) renameTag(editing, draft); setEditing(null); };

  return (
    <View style={styles.card}>
      {customTags.length === 0 && (
        <Text style={styles.empty}>No custom tags yet. Add one below or from the Add Task screen.</Text>
      )}
      {customTags.map(t => (
        <View key={t} style={styles.row}>
          {editing === t ? (
            <>
              <TextInput style={styles.input} value={draft} onChangeText={setDraft} autoFocus />
              <Pressable onPress={saveEdit}><Text style={styles.action}>Save</Text></Pressable>
              <Pressable onPress={() => setEditing(null)}><Text style={styles.muted}>Cancel</Text></Pressable>
            </>
          ) : confirming === t ? (
            <>
              <Text style={styles.tagName}>Delete {t}?</Text>
              <Pressable onPress={() => { deleteTag(t); setConfirming(null); }}>
                <Text style={styles.action}>Yes</Text>
              </Pressable>
              <Pressable onPress={() => setConfirming(null)}><Text style={styles.muted}>No</Text></Pressable>
            </>
          ) : (
            <>
              <Text style={styles.tagName}>{t}</Text>
              <Pressable onPress={() => startEdit(t)}><Text style={styles.action}>Rename</Text></Pressable>
              <Pressable onPress={() => { setConfirming(t); setEditing(null); }}>
                <Text style={styles.muted}>Delete</Text>
              </Pressable>
            </>
          )}
        </View>
      ))}
      <View style={styles.row}>
        <TextInput style={styles.input} placeholder="New tag" value={newTag} onChangeText={setNewTag} />
        <Pressable onPress={() => { addTag(newTag); setNewTag(''); }}>
          <Text style={styles.action}>Add</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>Deleting a tag keeps your tasks, they just lose that tag.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: 'white', borderRadius: 12, padding: 16, elevation: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8 },
  tagName: { flex: 1, fontSize: 16 },
  input: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 8, fontSize: 15 },
  action: { color: '#4A90D9', fontSize: 15, fontWeight: '600' },
  muted: { color: '#888', fontSize: 15 },
  empty: { fontSize: 14, color: '#888', marginBottom: 6 },
  hint: { fontSize: 12, color: '#888', marginTop: 8 },
});
