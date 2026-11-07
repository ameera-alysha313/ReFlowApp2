import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/auth-context';
import { useMode } from '../context/mode-context';
import { useSchedule } from '../context/schedule-context';
import { useTasks, Task } from '../context/task-context';
import { daysUntil } from '../utils/mode-view';
import { logEvent } from '../utils/log-event';
import { dateKey, tomorrowKey } from '../utils/date-key';

const TEST_MODE = false; // true = show the check-in at any time (and every time) for testing
const LEAD_MIN = 60;     // prompt this many minutes before the user's sleep time
const MAX_SHOWN = 5;

// Before wake time (e.g. 1am) still counts as the previous day
function logicalDay(now: Date, wakeMin: number) {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const d = new Date(now);
  if (nowMin < wakeMin) d.setDate(d.getDate() - 1);
  return d;
}

export default function EndOfDay() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { mode } = useMode();
  const { wakeMin, sleepMin } = useSchedule();
  const { tasks, toggleTask, updateTask, deleteTask } = useTasks();

  const [now, setNow] = useState(() => new Date());
  const [doneKey, setDoneKey] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [snoozed, setSnoozed] = useState(false);
  const [skipped, setSkipped] = useState<string[]>([]);
  const wasShown = useRef(false);

  // Re-check the clock every minute and when the app comes back to the front
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    const sub = AppState.addEventListener('change', s => { if (s === 'active') setNow(new Date()); });
    return () => { clearInterval(id); sub.remove(); };
  }, []);

  useEffect(() => {
    setLoaded(false);
    setSnoozed(false);
    if (!uid) return;
    AsyncStorage.getItem(`eod:${uid}`)
      .then(v => setDoneKey(v))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [uid]);

  const day = dateKey(logicalDay(now, wakeMin));
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const end = sleepMin > wakeMin ? sleepMin : sleepMin + 1440; // sleep time after midnight
  const nowAdj = nowMin < wakeMin ? nowMin + 1440 : nowMin;
  const timeIsRight = TEST_MODE || nowAdj >= end - LEAD_MIN;

  // Open tasks due today or overdue (includes today's habit tasks)
  const items = useMemo(
    () => tasks.filter(t => !t.completed && !skipped.includes(t.id) && (daysUntil(t.deadline) ?? 1) <= 0),
    [tasks, skipped]
  );

  const visible =
    !!uid && loaded && !snoozed && mode !== 'Recovery' &&
    (TEST_MODE || doneKey !== day) && timeIsRight && items.length > 0;

  const finish = (reason: 'all_handled' | 'done_for_tonight') => {
    if (!uid) return;
    setDoneKey(day);
    AsyncStorage.setItem(`eod:${uid}`, day).catch(() => {});
    logEvent(uid, 'eod_checkin_done', { reason, remaining: items.length });
    wasShown.current = false;
  };

  useEffect(() => { if (visible) wasShown.current = true; }, [visible]);
  // Everything handled -> close for the night
  useEffect(() => {
    if (wasShown.current && items.length === 0) finish('all_handled');
  }, [items.length]);

  const postpone = (t: Task) => {
    logEvent(uid, 'task_postponed', { taskId: t.id, source: 'eod' });
    updateTask(t.id, { deadline: tomorrowKey() });
  };
  const drop = (t: Task) => {
    logEvent(uid, 'task_abandoned', { taskId: t.id, source: 'eod' });
    deleteTask(t.id);
  };
  const skipHabit = (t: Task) => {
    logEvent(uid, 'task_abandoned', { taskId: t.id, habitId: t.habitId ?? null, source: 'eod' });
    setSkipped(prev => [...prev, t.id]);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setSnoozed(true)}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <Text style={styles.title}>Quick check-in</Text>
          <Text style={styles.sub}>
            Where did these end up today? No judgement. This just helps plan tomorrow.
          </Text>
          <ScrollView style={{ maxHeight: 360 }}>
            {items.slice(0, MAX_SHOWN).map(t => (
              <View key={t.id} style={styles.item}>
                <Text style={styles.itemTitle}>{t.title}</Text>
                <View style={styles.btnRow}>
                  <Pressable style={[styles.btn, styles.btnPrimary]} onPress={() => toggleTask(t.id)}>
                    <Text style={styles.btnPrimaryText}>Done</Text>
                  </Pressable>
                  {t.habitId ? (
                    <Pressable style={styles.btn} onPress={() => skipHabit(t)}>
                      <Text style={styles.btnText}>Skip today</Text>
                    </Pressable>
                  ) : (
                    <>
                      <Pressable style={styles.btn} onPress={() => postpone(t)}>
                        <Text style={styles.btnText}>Tomorrow</Text>
                      </Pressable>
                      <Pressable style={styles.btn} onPress={() => drop(t)}>
                        <Text style={styles.btnText}>Drop it</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              </View>
            ))}
            {items.length > MAX_SHOWN && (
              <Text style={styles.more}>+ {items.length - MAX_SHOWN} more. Handle these and the rest will show.</Text>
            )}
          </ScrollView>
          <Pressable onPress={() => finish('done_for_tonight')}>
            <Text style={styles.link}>Done for tonight</Text>
          </Pressable>
          <Pressable onPress={() => setSnoozed(true)}>
            <Text style={styles.linkMuted}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  box: { backgroundColor: 'white', borderRadius: 16, padding: 20, width: '100%' },
  title: { fontSize: 20, fontWeight: '600', textAlign: 'center', marginBottom: 6 },
  sub: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 14 },
  item: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  itemTitle: { fontSize: 16, marginBottom: 8 },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: { backgroundColor: '#f0f0f0', borderRadius: 14, paddingVertical: 6, paddingHorizontal: 14 },
  btnText: { fontSize: 14, color: '#444' },
  btnPrimary: { backgroundColor: '#4A90D9' },
  btnPrimaryText: { fontSize: 14, color: 'white', fontWeight: '600' },
  more: { fontSize: 13, color: '#888', marginTop: 10 },
  link: { color: '#4A90D9', textAlign: 'center', marginTop: 16, fontSize: 15 },
  linkMuted: { color: '#888', textAlign: 'center', marginTop: 10, fontSize: 14 },
});
