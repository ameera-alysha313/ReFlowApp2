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

// For testing: 'evening' or 'morning' forces that check-in (and ignores "already done today").
// Must be null in the real build.
const TEST_FORCE: 'evening' | 'morning' | null = null;
const LEAD_MIN = 60; // evening check-in starts this many minutes before the user's sleep time
const MAX_SHOWN = 5;

type Kind = 'evening' | 'morning';

// Before wake time (e.g. 1am) still counts as the previous day
function logicalDay(now: Date, wakeMin: number) {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const d = new Date(now);
  if (nowMin < wakeMin) d.setDate(d.getDate() - 1);
  return d;
}

// Two check-ins:
//  - evening (about an hour before bed): what happened with today's tasks?
//  - morning (first open after waking): anything left over from before today, did it get done?
export default function EndOfDay() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { mode } = useMode();
  const { wakeMin, sleepMin } = useSchedule();
  const { tasks, toggleTask, updateTask, deleteTask } = useTasks();

  const [now, setNow] = useState(() => new Date());
  const [doneKeys, setDoneKeys] = useState<Record<Kind, string | null>>({ evening: null, morning: null });
  const [loaded, setLoaded] = useState(false);
  const [snoozed, setSnoozed] = useState(false);
  const [skipped, setSkipped] = useState<string[]>([]);
  const wasShown = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    const sub = AppState.addEventListener('change', s => { if (s === 'active') setNow(new Date()); });
    return () => { clearInterval(id); sub.remove(); };
  }, []);

  useEffect(() => {
    setLoaded(false);
    setSnoozed(false);
    if (!uid) return;
    Promise.all([AsyncStorage.getItem(`eod:${uid}`), AsyncStorage.getItem(`eodmorning:${uid}`)])
      .then(([e, m]) => setDoneKeys({ evening: e, morning: m }))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [uid]);

  const day = dateKey(logicalDay(now, wakeMin));
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const end = sleepMin > wakeMin ? sleepMin : sleepMin + 1440; // sleep time after midnight
  const nowAdj = nowMin < wakeMin ? nowMin + 1440 : nowMin;
  const kind: Kind = TEST_FORCE ?? (nowAdj >= end - LEAD_MIN ? 'evening' : 'morning');

  // evening: due today or overdue. morning: overdue only.
  const items = useMemo(
    () => tasks.filter(t =>
      !t.completed && !skipped.includes(t.id) &&
      (daysUntil(t.deadline) ?? 1) <= (kind === 'evening' ? 0 : -1)),
    [tasks, skipped, kind]
  );

  const visible =
    !!uid && loaded && !snoozed && mode !== 'Recovery' &&
    (!!TEST_FORCE || doneKeys[kind] !== day) && items.length > 0;

  const finish = (reason: 'all_handled' | 'done_for_now') => {
    if (!uid) return;
    setDoneKeys(prev => ({ ...prev, [kind]: day }));
    AsyncStorage.setItem(kind === 'evening' ? `eod:${uid}` : `eodmorning:${uid}`, day).catch(() => {});
    logEvent(uid, 'eod_checkin_done', { reason, kind, remaining: items.length });
    wasShown.current = false;
  };

  useEffect(() => { if (visible) wasShown.current = true; }, [visible]);
  useEffect(() => {
    if (wasShown.current && items.length === 0) finish('all_handled');
  }, [items.length]);

  const source = kind === 'evening' ? 'eod' : 'morning';
  const postpone = (t: Task) => {
    logEvent(uid, 'task_postponed', { taskId: t.id, source });
    updateTask(t.id, { deadline: kind === 'evening' ? tomorrowKey() : dateKey() });
  };
  const drop = (t: Task) => {
    logEvent(uid, 'task_abandoned', { taskId: t.id, source });
    deleteTask(t.id);
  };
  const skipHabit = (t: Task) => {
    logEvent(uid, 'task_abandoned', { taskId: t.id, habitId: t.habitId ?? null, source });
    setSkipped(prev => [...prev, t.id]);
  };

  const evening = kind === 'evening';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setSnoozed(true)}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <Text style={styles.title}>{evening ? 'Quick check-in' : 'Good morning'}</Text>
          <Text style={styles.sub}>
            {evening
              ? 'Where did these end up today? No judgement. This just helps plan tomorrow.'
              : 'These were due before today. Did any get done, or should they move?'}
          </Text>
          <ScrollView style={{ maxHeight: 360 }}>
            {items.slice(0, MAX_SHOWN).map(t => (
              <View key={t.id} style={styles.item}>
                <Text style={styles.itemTitle}>{t.title}</Text>
                <View style={styles.btnRow}>
                  <Pressable style={[styles.btn, styles.btnPrimary]} onPress={() => toggleTask(t.id, source)}>
                    <Text style={styles.btnPrimaryText}>{evening ? 'Done' : 'Already done'}</Text>
                  </Pressable>
                  {t.habitId ? (
                    <Pressable style={styles.btn} onPress={() => skipHabit(t)}>
                      <Text style={styles.btnText}>Skip today</Text>
                    </Pressable>
                  ) : (
                    <>
                      <Pressable style={styles.btn} onPress={() => postpone(t)}>
                        <Text style={styles.btnText}>{evening ? 'Tomorrow' : 'Move to today'}</Text>
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
          <Pressable onPress={() => finish('done_for_now')}>
            <Text style={styles.link}>{evening ? 'Done for tonight' : 'Done for now'}</Text>
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
  title: { fontSize: 20, fontWeight: '600', textAlign: 'center', marginBottom: 6, color: '#111' },
  sub: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 14 },
  item: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  itemTitle: { fontSize: 16, marginBottom: 8, color: '#111' },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: { backgroundColor: '#f0f0f0', borderRadius: 14, paddingVertical: 6, paddingHorizontal: 14 },
  btnText: { fontSize: 14, color: '#444' },
  btnPrimary: { backgroundColor: '#4A90D9' },
  btnPrimaryText: { fontSize: 14, color: 'white', fontWeight: '600' },
  more: { fontSize: 13, color: '#888', marginTop: 10 },
  link: { color: '#4A90D9', textAlign: 'center', marginTop: 16, fontSize: 15 },
  linkMuted: { color: '#888', textAlign: 'center', marginTop: 10, fontSize: 14 },
});
