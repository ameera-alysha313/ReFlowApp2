import { useState } from 'react';
import { View, Text, StyleSheet, Button, Alert, Pressable, Modal, Platform, ScrollView } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/auth-context';
import { useSchedule } from '../context/schedule-context';

function formatMin(m: number) {
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${mm} ${h < 12 ? 'am' : 'pm'}`;
}

function dateFromMin(m: number) {
  const d = new Date();
  d.setHours(Math.floor(m / 60), m % 60, 0, 0);
  return d;
}

export default function Settings() {
  const { user, signOut } = useAuth();
  const { wakeMin, sleepMin, setSchedule } = useSchedule();
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<'wake' | 'sleep' | null>(null);

  const handleLogout = () => {
    Alert.alert('Log out?', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  const onPick = (e: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setEditing(null); // Android's dialog closes itself
    if (e.type === 'dismissed' || !date) return;
    const mins = date.getHours() * 60 + date.getMinutes();
    if (editing === 'wake') setSchedule({ wakeMin: mins, sleepMin });
    else setSchedule({ wakeMin, sleepMin: mins });
  };

  const pickerValue = dateFromMin(editing === 'sleep' ? sleepMin : wakeMin);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>Settings</Text>

      <Text style={styles.label}>Account</Text>
      <Text style={styles.value}>{user?.email}</Text>

      <Text style={styles.label}>Your day</Text>
      <Pressable style={styles.settingRow} onPress={() => setSheetOpen(true)}>
        <Text style={styles.settingTitle}>Waking hours</Text>
        <Text style={styles.settingValue}>{formatMin(wakeMin)} – {formatMin(sleepMin)} ›</Text>
      </Pressable>

      <Text style={[styles.label, { marginTop: 24 }]}>Habits</Text>
      <Pressable style={styles.settingRow} onPress={() => router.push('/habits')}>
        <Text style={styles.settingTitle}>Recurring habits</Text>
        <Text style={styles.settingValue}>Manage ›</Text>
      </Pressable>

      <Text style={[styles.label, { marginTop: 24 }]}>Tags</Text>
      <Pressable style={styles.settingRow} onPress={() => router.push('/tags')}>
        <Text style={styles.settingTitle}>Custom tags</Text>
        <Text style={styles.settingValue}>Manage ›</Text>
      </Pressable>

      <Text style={[styles.label, { marginTop: 24 }]}>Help</Text>
      <Pressable style={styles.settingRow} onPress={() => router.push('/notif-check' as any)}>
        <Text style={styles.settingTitle}>Notification check</Text>
        <Text style={styles.settingValue}>Open ›</Text>
      </Pressable>

      <View style={{ marginTop: 32 }}>
        <Button title="Log out" onPress={handleLogout} />
      </View>

      <Modal
        visible={sheetOpen}
        transparent
        animationType="fade"
        onRequestClose={() => { setEditing(null); setSheetOpen(false); }}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Waking hours</Text>
            <Pressable style={styles.timeRow} onPress={() => setEditing('wake')}>
              <Text style={styles.timeLabel}>Wake up</Text>
              <Text style={styles.timeValue}>{formatMin(wakeMin)}</Text>
            </Pressable>
            <Pressable style={styles.timeRow} onPress={() => setEditing('sleep')}>
              <Text style={styles.timeLabel}>Go to sleep</Text>
              <Text style={styles.timeValue}>{formatMin(sleepMin)}</Text>
            </Pressable>
            {editing !== null && (
              <DateTimePicker
                value={pickerValue}
                mode="time"
                is24Hour={false}
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={onPick}
              />
            )}
            <Pressable style={styles.doneButton} onPress={() => { setEditing(null); setSheetOpen(false); }}>
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, paddingBottom: 60 },
  header: { fontSize: 24, fontWeight: 'bold', marginBottom: 30 },
  label: { fontSize: 14, color: '#666', marginBottom: 8 },
  value: { fontSize: 18, marginBottom: 24 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: 'white', borderRadius: 12, padding: 16, elevation: 2 },
  settingTitle: { fontSize: 16 },
  settingValue: { fontSize: 15, color: '#4A90D9' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  sheetTitle: { fontSize: 18, fontWeight: '600', marginBottom: 16, textAlign: 'center' },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#eee' },
  timeLabel: { fontSize: 16 },
  timeValue: { fontSize: 16, color: '#4A90D9', fontWeight: '600' },
  doneButton: { backgroundColor: '#4A90D9', borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  doneText: { color: 'white', fontSize: 16, fontWeight: '600' },
});