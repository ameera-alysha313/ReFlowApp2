import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export type MenuAction = { label: string; onPress: () => void; destructive?: boolean };

// The three-dot button on the right of each task / habit
export default function RowMenu({ actions }: { actions: MenuAction[] }) {
  const [open, setOpen] = useState(false);

  const run = (a: MenuAction) => {
    setOpen(false);
    // small delay so this menu finishes closing before a pop-up or screen change (iOS can't stack modals)
    setTimeout(a.onPress, 250);
  };

  return (
    <>
      <Pressable
        style={styles.button}
        onPress={() => setOpen(true)}
        hitSlop={8}
        accessibilityLabel="More options"
      >
        <View style={styles.dot} />
        <View style={styles.dot} />
        <View style={styles.dot} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            {actions.map(a => (
              <Pressable key={a.label} style={styles.item} onPress={() => run(a)}>
                <Text style={[styles.itemText, a.destructive && styles.destructive]}>{a.label}</Text>
              </Pressable>
            ))}
            <Pressable style={styles.item} onPress={() => setOpen(false)}>
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center', gap: 3, marginLeft: 4 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#888' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingVertical: 8, paddingBottom: 30 },
  item: { paddingVertical: 16, paddingHorizontal: 24 },
  itemText: { fontSize: 17, color: '#111' },
  destructive: { color: '#c0392b' },
  cancel: { fontSize: 17, color: '#888' },
});
