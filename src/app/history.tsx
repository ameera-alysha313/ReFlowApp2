import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTasks } from '../context/task-context';
import { useEvents } from '../utils/use-events';
import {
  MODES, MODE_COLORS, emptyModes,
  startOfDay, startOfWeek, addDays, formatDuration,
  daySummary, modeSecondsByDay, dominantMode,
} from '../utils/analytics-summary';

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const FULL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dayLabel(ts: number) {
  const d = new Date(ts);
  return `${FULL_DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export default function History() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();
  const { tasks } = useTasks();
  const todayStart = startOfDay();

  const [selected, setSelected] = useState(todayStart);

  // This screen stays mounted as a hidden tab, so follow the date passed in from Analytics
  useEffect(() => {
    if (params.date) {
      const n = Number(params.date);
      if (!isNaN(n)) setSelected(n);
    }
  }, [params.date]);

  const weekStart = startOfWeek(selected);
  const events = useEvents(addDays(weekStart, -1), addDays(weekStart, 7));
  const modeMap = useMemo(() => modeSecondsByDay(events), [events]);
  const day = useMemo(() => daySummary(events, selected), [events, selected]);

  const modes = modeMap.get(selected) ?? emptyModes();
  const modeTotal = MODES.reduce((s, m) => s + modes[m], 0);
  const titles = day.completedTaskIds.map(
    id => tasks.find(t => t.id === id)?.title ?? 'A task you finished'
  );

  const isCurrentWeek = weekStart >= startOfWeek(todayStart);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.topRow}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.header}>History</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* Week strip */}
      <View style={styles.weekNav}>
        <Pressable onPress={() => setSelected(addDays(selected, -7))} hitSlop={12}>
          <Text style={styles.arrow}>‹</Text>
        </Pressable>
        <Text style={styles.weekLabel}>
          {new Date(weekStart).getDate()} {MONTHS[new Date(weekStart).getMonth()]} –{' '}
          {new Date(addDays(weekStart, 6)).getDate()} {MONTHS[new Date(addDays(weekStart, 6)).getMonth()]}
        </Text>
        <Pressable
          onPress={() => setSelected(Math.min(addDays(selected, 7), todayStart))}
          disabled={isCurrentWeek}
          hitSlop={12}
        >
          <Text style={[styles.arrow, isCurrentWeek && { opacity: 0.25 }]}>›</Text>
        </Pressable>
      </View>

      <View style={styles.strip}>
        {Array.from({ length: 7 }, (_, i) => {
          const ts = addDays(weekStart, i);
          const future = ts > todayStart;
          const mode = future ? null : dominantMode(modeMap.get(ts));
          return (
            <Pressable
              key={i}
              disabled={future}
              onPress={() => setSelected(ts)}
              style={[styles.stripDay, ts === selected && styles.stripDaySelected, future && { opacity: 0.35 }]}
            >
              <Text style={styles.stripLetter}>{WEEKDAY_LETTERS[i]}</Text>
              <Text style={styles.stripDate}>{new Date(ts).getDate()}</Text>
              <View style={[styles.stripDot, { backgroundColor: mode ? MODE_COLORS[mode] : 'transparent' }]} />
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.dayTitle}>{dayLabel(selected)}</Text>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Focus time</Text>
        <Text style={styles.bigNumber}>{formatDuration(day.focusSeconds)}</Text>
        <Text style={styles.cardMeta}>
          {day.sessions === 0
            ? 'No focus sessions this day.'
            : `Across ${day.sessions} session${day.sessions === 1 ? '' : 's'}`}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Tasks completed</Text>
        <Text style={styles.bigNumber}>{titles.length}</Text>
        {titles.length === 0 ? (
          <Text style={styles.cardMeta}>Nothing ticked off this day.</Text>
        ) : (
          titles.map((t, i) => <Text key={i} style={styles.listItem}>✓  {t}</Text>)
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Time in each mode</Text>
        {modeTotal === 0 ? (
          <Text style={styles.cardMeta}>No mode data for this day.</Text>
        ) : (
          MODES.filter(m => modes[m] > 0).map(m => {
            const pct = Math.round((modes[m] / modeTotal) * 100);
            return (
              <View key={m} style={styles.modeRow}>
                <View style={styles.modeHeader}>
                  <Text style={styles.modeName}>{m}</Text>
                  <Text style={styles.modePct}>{pct}%  ·  {formatDuration(modes[m])}</Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: MODE_COLORS[m] }]} />
                </View>
              </View>
            );
          })
        )}
      </View>

      {day.note ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Your note</Text>
          <Text style={styles.noteText}>{day.note}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  back: { color: '#4A90D9', fontSize: 16, width: 50 },
  header: { fontSize: 24, fontWeight: 'bold' },
  weekNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  arrow: { fontSize: 28, color: '#4A90D9', paddingHorizontal: 12 },
  weekLabel: { fontSize: 14, color: '#666' },
  strip: { flexDirection: 'row', marginBottom: 20 },
  stripDay: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12 },
  stripDaySelected: { backgroundColor: '#e3eefa' },
  stripLetter: { fontSize: 12, color: '#888' },
  stripDate: { fontSize: 18, fontWeight: '600', marginVertical: 2 },
  stripDot: { width: 8, height: 8, borderRadius: 4, marginTop: 2 },
  dayTitle: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  card: { backgroundColor: 'white', borderRadius: 16, padding: 20, marginBottom: 16, elevation: 2 },
  cardLabel: { fontSize: 14, color: '#666', marginBottom: 6 },
  bigNumber: { fontSize: 32, fontWeight: '600', marginBottom: 4 },
  cardMeta: { fontSize: 14, color: '#888' },
  listItem: { fontSize: 16, marginTop: 6 },
  noteText: { fontSize: 16, lineHeight: 22 },
  modeRow: { marginTop: 10 },
  modeHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  modeName: { fontSize: 15, fontWeight: '600' },
  modePct: { fontSize: 13, color: '#666' },
  barTrack: { height: 10, borderRadius: 5, backgroundColor: '#eee', overflow: 'hidden' },
  barFill: { height: 10, borderRadius: 5 },
});