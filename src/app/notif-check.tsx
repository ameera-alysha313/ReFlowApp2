import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';

type Row = { title: string; body: string; when: string; ms: number };

// A small diagnostics screen: is the phone allowing notifications, and what is waiting to be sent?
export default function NotifCheck() {
  const router = useRouter();
  const [perm, setPerm] = useState('checking...');
  const [channel, setChannel] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    try {
      const p = await Notifications.getPermissionsAsync();
      setPerm(p.status);
      if (Platform.OS === 'android') {
        const ch = await Notifications.getNotificationChannelAsync('reminders');
        setChannel(ch ? `found (importance ${ch.importance})` : 'MISSING');
      }
      const list = await Notifications.getAllScheduledNotificationsAsync();
      setRows(
        list
          .map(n => {
            const t: any = n.trigger;
            const raw = t?.value ?? t?.date ?? null;
            const ms = typeof raw === 'number' ? raw : raw ? new Date(raw).getTime() : NaN;
            return {
              title: n.content.title ?? '',
              body: n.content.body ?? '',
              when: isNaN(ms) ? 'time unknown' : new Date(ms).toLocaleString(),
              ms: isNaN(ms) ? Infinity : ms,
            };
          })
          .sort((a, b) => a.ms - b.ms)
      );
    } catch (e: any) {
      setMessage('Could not read notification state: ' + (e?.message ?? String(e)));
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const ask = async () => {
    const r = await Notifications.requestPermissionsAsync();
    setMessage('Permission: ' + r.status);
    refresh();
  };

  const nowTrigger: any = Platform.OS === 'android' ? { channelId: 'reminders' } : null;

  const showNow = async () => {
    try {
      await Notifications.scheduleNotificationAsync({
        content: { title: 'Test notification', body: 'If you can see this, notifications work.' },
        trigger: nowTrigger,
      });
      setMessage('Sent. Pull down your notification shade.');
    } catch (e: any) {
      setMessage('FAILED: ' + (e?.message ?? String(e)));
    }
  };

  const inTenSeconds = async () => {
    try {
      await Notifications.scheduleNotificationAsync({
        content: { title: 'Test in 10 seconds', body: 'This one was scheduled, so it works with the app closed.' },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 10,
          channelId: 'reminders',
        } as any,
      });
      setMessage('Scheduled. Close the app now and wait 10 seconds.');
      refresh();
    } catch (e: any) {
      setMessage('FAILED: ' + (e?.message ?? String(e)));
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.topRow}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.header}>Notification check</Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Permission</Text>
        <Text style={[styles.value, perm !== 'granted' && styles.bad]}>{perm}</Text>
        {Platform.OS === 'android' && (
          <>
            <Text style={styles.label}>Reminders channel</Text>
            <Text style={[styles.value, channel === 'MISSING' && styles.bad]}>{channel}</Text>
          </>
        )}
        {perm !== 'granted' && (
          <Pressable style={styles.button} onPress={ask}>
            <Text style={styles.buttonText}>Ask for permission</Text>
          </Pressable>
        )}
        <Pressable style={styles.button} onPress={() => Linking.openSettings()}>
          <Text style={styles.buttonText}>Open phone settings for ReFlo</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Try it</Text>
        <Pressable style={styles.button} onPress={showNow}>
          <Text style={styles.buttonText}>Show a notification now</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={inTenSeconds}>
          <Text style={styles.buttonText}>Send one in 10 seconds (then close the app)</Text>
        </Pressable>
        {!!message && <Text style={styles.message}>{message}</Text>}
      </View>

      <View style={styles.card}>
        <View style={styles.listHead}>
          <Text style={styles.label}>Waiting to be sent ({rows.length})</Text>
          <Pressable onPress={refresh} hitSlop={10}><Text style={styles.link}>Refresh</Text></Pressable>
        </View>
        {rows.length === 0 && <Text style={styles.value}>Nothing is scheduled.</Text>}
        {rows.map((r, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.rowTitle}>{r.title}</Text>
            <Text style={styles.rowBody}>{r.body}</Text>
            <Text style={styles.rowWhen}>{r.when}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.hint}>
        If a test notification never appears: Settings &gt; Apps &gt; ReFlo &gt; Notifications must be on, battery usage
        set to Unrestricted, and Do Not Disturb off.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  back: { color: '#4A90D9', fontSize: 16, width: 50 },
  header: { fontSize: 20, fontWeight: 'bold', color: '#111' },
  card: { backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 14, elevation: 1 },
  label: { fontSize: 14, fontWeight: '700', color: '#333', marginBottom: 4, marginTop: 4 },
  value: { fontSize: 15, color: '#444', marginBottom: 8 },
  bad: { color: '#c0392b', fontWeight: '700' },
  button: { backgroundColor: '#4A90D9', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  buttonText: { color: 'white', fontSize: 15, fontWeight: '600' },
  message: { fontSize: 14, color: '#333', marginTop: 10 },
  listHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { color: '#4A90D9', fontSize: 14 },
  row: { borderTopWidth: 1, borderTopColor: '#eee', paddingVertical: 8, marginTop: 6 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: '#111' },
  rowBody: { fontSize: 13, color: '#555', marginTop: 2 },
  rowWhen: { fontSize: 12, color: '#888', marginTop: 2 },
  hint: { fontSize: 13, color: '#888', lineHeight: 18 },
});