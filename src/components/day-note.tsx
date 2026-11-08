import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';

type Props = {
  note: string | null;
  editable: boolean;                 // false = read-only (e.g. past days)
  editStyle: 'button' | 'pencil';    // blue button at the bottom, or a pencil icon
  onSave: (text: string) => void;
};

export default function DayNote({ note, editable, editStyle, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const start = () => { setDraft(note ?? ''); setEditing(true); };
  const save = () => {
    const t = draft.trim();
    if (t && t !== note) onSave(t);
    setEditing(false);
  };

  return (
    <View style={styles.card}>
      <View style={styles.headRow}>
        <Text style={styles.label}>{editStyle === 'button' ? 'End-of-day note (optional)' : 'Your note'}</Text>
        {editable && !!note && !editing && editStyle === 'pencil' && (
          <Pressable onPress={start} hitSlop={12}>
            <Text style={styles.pencil}>✏️</Text>
          </Pressable>
        )}
      </View>

      {editing ? (
        <>
          <TextInput
            style={styles.input}
            placeholder="Anything you want to remember about today?"
            placeholderTextColor="#888"
            value={draft}
            onChangeText={setDraft}
            multiline
            autoFocus
          />
          <Pressable style={styles.primaryButton} onPress={save}>
            <Text style={styles.primaryButtonText}>Save note</Text>
          </Pressable>
          <Pressable onPress={() => setEditing(false)}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        </>
      ) : note ? (
        <>
          <Text style={styles.noteText}>{note}</Text>
          {editable && editStyle === 'button' && (
            <Pressable style={[styles.primaryButton, { marginTop: 14 }]} onPress={start}>
              <Text style={styles.primaryButtonText}>Edit note</Text>
            </Pressable>
          )}
        </>
      ) : editable ? (
        <Pressable style={styles.primaryButton} onPress={start}>
          <Text style={styles.primaryButtonText}>Add note</Text>
        </Pressable>
      ) : (
        <Text style={styles.meta}>No note for this day.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: 'white', borderRadius: 16, padding: 20, marginBottom: 16, elevation: 2 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  label: { fontSize: 14, color: '#666' },
  pencil: { fontSize: 18 },
  noteText: { fontSize: 16, lineHeight: 22, color: '#111' },
  meta: { fontSize: 14, color: '#888' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, minHeight: 80, color: '#111',
    textAlignVertical: 'top', marginBottom: 12 },
  primaryButton: { backgroundColor: '#4A90D9', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  primaryButtonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  cancel: { color: '#888', textAlign: 'center', marginTop: 12, fontSize: 15 },
});
