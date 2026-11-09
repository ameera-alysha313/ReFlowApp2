import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/auth-context';
import { useTasks } from '../context/task-context';
import { logEvent } from '../utils/log-event';
import { useEvents } from '../utils/use-events';
import {
  MODES, MODE_COLORS, MODE_TEXT, MODE_LETTER,
  startOfDay, addDays, formatDuration,
  summarise, modeSecondsByDay, dominantMode, completedHourCounts, focusSecondsByStartHour,
} from '../utils/analytics-summary';

import DayNote from '../components/day-note';

type Range = 'today' | 'week';
type Metric = 'task_completed' | 'focus_time';

const CHART_DAYS = 35;
const CHART_HEIGHT = 100;
const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];

function hourLabel(h: number) {
  const suffix = h < 12 ? 'am' : 'pm';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr} ${suffix}`;
}

function HourChart({
  values, selected, onSelect,
}: {
  values: number[];
  selected: number | null;
  onSelect: (h: number | null) => void;
}) {
  const max = Math.max(...values);
  return (
    <View>
      <View style={styles.chartRow}>
        {values.map((v, h) => (
          <Pressable key={h} style={styles.barSlot} onPress={() => onSelect(selected === h ? null : h)}>
            <View
              style={[
                styles.hourBar,
                {
                  height: v === 0 ? 3 : Math.max(6, (v / max) * CHART_HEIGHT),
                  backgroundColor: selected === h ? '#1F5FA8' : v === 0 ? '#e5e5e5' : '#4A90D9',
                },
              ]}
            />
          </Pressable>
        ))}
      </View>
      <View style={styles.axisRow}>
        {['12 am', '6 am', '12 pm', '6 pm'].map(l => (
          <Text key={l} style={styles.axisLabel}>{l}</Text>
        ))}
      </View>
    </View>
  );
}

function MoodCalendar({ onPressDay }: { onPressDay: (ts: number) => void }) {
  const todayStart = startOfDay();
  const [monthStart, setMonthStart] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  });

  const first = new Date(monthStart);
  const year = first.getFullYear();
  const month = first.getMonth();
  const nextMonthStart = new Date(year, month + 1, 1).getTime();
  const canGoNext = nextMonthStart <= todayStart;

  const events = useEvents(addDays(monthStart, -1), nextMonthStart);
  const modeMap = useMemo(() => modeSecondsByDay(events), [events]);

  // Sunday-first: blanks before the 1st, then every date, padded to full weeks
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(first.getDay()).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1).getTime()),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  return (
    <View>
      <View style={styles.monthNav}>
        <Pressable onPress={() => setMonthStart(new Date(year, month - 1, 1).getTime())} hitSlop={12}>
          <Text style={styles.arrow}>‹</Text>
        </Pressable>
        <Text style={styles.monthTitle}>{FULL_MONTHS[month]} {year}</Text>
        <Pressable onPress={() => setMonthStart(nextMonthStart)} disabled={!canGoNext} hitSlop={12}>
          <Text style={[styles.arrow, !canGoNext && { opacity: 0.25 }]}>›</Text>
        </Pressable>
      </View>

      <View style={styles.hmRow}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((l, i) => (
          <Text key={i} style={styles.hmHead}>{l}</Text>
        ))}
      </View>

      {rows.map((row, r) => (
        <View key={r} style={styles.hmRow}>
          {row.map((ts, c) => {
            if (ts === null) return <View key={c} style={styles.hmCell} />;
            const future = ts > todayStart;
            const mode = future ? null : dominantMode(modeMap.get(ts));
            return (
              <Pressable
                key={c}
                disabled={future}
                onPress={() => onPressDay(ts)}
                style={[
                  styles.hmCell,
                  { backgroundColor: mode ? MODE_COLORS[mode] : '#eee' },
                  future && { opacity: 0.4 },
                  ts === todayStart && styles.hmToday,
                ]}
              >
                <Text style={[styles.hmDate, { color: mode ? MODE_TEXT[mode] : '#777' }]}>
                  {new Date(ts).getDate()}
                </Text>
                {mode && (
                  <Text style={[styles.hmLetter, { color: MODE_TEXT[mode] }]}>{MODE_LETTER[mode]}</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}

      <View style={styles.legendRow}>
        {MODES.map(m => (
          <View key={m} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: MODE_COLORS[m] }]} />
            <Text style={styles.legendText}>{m}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function Analytics() {
  const { user } = useAuth();
  const { tasks } = useTasks();
  const router = useRouter();
  const uid = user?.uid ?? null;

  const [range, setRange] = useState<Range>('today');
  const [metric, setMetric] = useState<Metric>('focus_time');
  const [selectedHour, setSelectedHour] = useState<number | null>(null);

  const events = useEvents(startOfDay(-(CHART_DAYS - 1)));

  const rangeStart = startOfDay(range === 'today' ? 0 : -6);
  const rangeEvents = useMemo(() => events.filter(e => e.clientTime >= rangeStart), [events, rangeStart]);
  const summary = useMemo(() => summarise(rangeEvents), [rangeEvents]);
  const todayNote = useMemo(
    () => summarise(events.filter(e => e.clientTime >= startOfDay())).note,
    [events]
  );

  const values = useMemo(
    () => (metric === 'task_completed' ? completedHourCounts(events) : focusSecondsByStartHour(events)),
    [events, metric]
  );
  const chartTotal = values.reduce((a, b) => a + b, 0);
  const peakHour = values.indexOf(Math.max(...values));

  const formatValue = (v: number) =>
    metric === 'task_completed' ? `${v} task${v === 1 ? '' : 's'}` : `${formatDuration(v)} of focus`;

  const detailText =
    selectedHour !== null
      ? `${hourLabel(selectedHour)} – ${hourLabel((selectedHour + 1) % 24)}: ${
          values[selectedHour] === 0 ? 'nothing yet' : formatValue(values[selectedHour])
        }`
      : chartTotal === 0
      ? 'Not enough data yet. This fills in as you use the app.'
      : `Most often around ${hourLabel(peakHour)}. Tap a bar for details.`;

  const completedTitles = summary.completedTaskIds.map(
    id => tasks.find(t => t.id === id)?.title ?? 'A task you finished'
  );

  const openDay = (ts: number) => router.push({ pathname: '/history', params: { date: String(ts) } });
  const periodWord = range === 'today' ? 'today' : 'this week';

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.header}>Your progress</Text>

      <View style={styles.toggleRow}>
        {(['today', 'week'] as Range[]).map(r => (
          <Pressable
            key={r}
            style={[styles.toggle, range === r && styles.toggleSelected]}
            onPress={() => setRange(r)}
          >
            <Text style={range === r && styles.toggleTextSelected}>
              {r === 'today' ? 'Today' : 'Last 7 days'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Focus time */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Focus time</Text>
        <Text style={styles.bigNumber}>{formatDuration(summary.focusSeconds)}</Text>
        <Text style={styles.cardMeta}>
          {summary.sessions === 0
            ? `No focus sessions ${periodWord}. That's okay.`
            : `Across ${summary.sessions} session${summary.sessions === 1 ? '' : 's'}`}
        </Text>
      </View>

      {/* Completed tasks */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Tasks completed</Text>
        <Text style={styles.bigNumber}>{completedTitles.length}</Text>
        {completedTitles.length === 0 ? (
          <Text style={styles.cardMeta}>Nothing ticked off {periodWord}. Small steps still count.</Text>
        ) : (
          completedTitles.slice(0, 10).map((title, i) => (
            <Text key={i} style={styles.listItem}>✓  {title}</Text>
          ))
        )}
        {completedTitles.length > 10 && (
          <Text style={styles.cardMeta}>+ {completedTitles.length - 10} more</Text>
        )}
      </View>

      {/* Mood calendar */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Your mood, day by day</Text>
        <MoodCalendar onPressDay={openDay} />
        <Text style={[styles.cardMeta, { marginTop: 10 }]}>Tap a day to see what happened.</Text>
        <Pressable onPress={() => openDay(startOfDay())}>
          <Text style={styles.linkText}>Open history</Text>
        </Pressable>
      </View>

      {/* Time-of-day chart */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>When you work (last 5 weeks)</Text>
        <View style={styles.toggleRow}>
          {([
            ['focus_time', 'Focus time'],
            ['task_completed', 'Tasks ticked off'],
          ] as [Metric, string][]).map(([key, label]) => (
            <Pressable
              key={key}
              style={[styles.toggle, metric === key && styles.toggleSelected]}
              onPress={() => { setMetric(key); setSelectedHour(null); }}
            >
              <Text style={metric === key && styles.toggleTextSelected}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <HourChart values={values} selected={selectedHour} onSelect={setSelectedHour} />
        {metric === 'task_completed' && (
          <Text style={styles.cardMeta}>Based on when you tick tasks off, which can be later than when you did them.</Text>
        )}
        <Text style={[styles.detailText]}>{detailText}</Text>
      </View>

      {/* Optional reflection (today only) */}
      {range === 'today' && (
        <DayNote
          note={todayNote}
          editable
          editStyle="button"
          onSave={text => logEvent(uid, 'reflection_note', { text })}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  header: { fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
  toggleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  toggle: { borderWidth: 1, borderColor: '#ccc', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 14 },
  toggleSelected: { backgroundColor: '#4A90D9', borderColor: '#4A90D9' },
  toggleTextSelected: { color: 'white' },
  card: { backgroundColor: 'white', borderRadius: 16, padding: 20, marginBottom: 16, elevation: 2 },
  cardLabel: { fontSize: 14, color: '#666', marginBottom: 6 },
  bigNumber: { fontSize: 32, fontWeight: '600', marginBottom: 4 },
  cardMeta: { fontSize: 14, color: '#888' },
  listItem: { fontSize: 16, marginTop: 6 },
  linkText: { color: '#4A90D9', textAlign: 'center', marginTop: 12, fontSize: 15 },
  monthNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  monthTitle: { fontSize: 18, fontWeight: '600' },
  arrow: { fontSize: 28, color: '#4A90D9', paddingHorizontal: 12 },
  hmRow: { flexDirection: 'row' },
  hmHead: { flex: 1, textAlign: 'center', fontSize: 12, color: '#888', marginBottom: 4 },
  hmCell: { flex: 1, height: 48, margin: 2, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  hmToday: { borderWidth: 2, borderColor: '#333' },
  hmDate: { fontSize: 12 },
  hmLetter: { fontSize: 14, fontWeight: '700' },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendDot: { width: 12, height: 12, borderRadius: 3, marginRight: 6 },
  legendText: { fontSize: 12, color: '#666' },
  chartRow: { flexDirection: 'row', alignItems: 'flex-end', height: CHART_HEIGHT },
  barSlot: { flex: 1, height: CHART_HEIGHT, alignItems: 'center', justifyContent: 'flex-end' },
  hourBar: { width: '70%', borderRadius: 3 },
  axisRow: { flexDirection: 'row', marginTop: 6 },
  axisLabel: { flex: 1, fontSize: 11, color: '#888' },
  detailText: { fontSize: 14, color: '#444', marginTop: 10 },
  noteInput: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, minHeight: 80,
    textAlignVertical: 'top', marginBottom: 12 },
  primaryButton: { backgroundColor: '#4A90D9', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  primaryButtonText: { color: 'white', fontSize: 16, fontWeight: '600' },
});