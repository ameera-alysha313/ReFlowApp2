import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../context/auth-context';
import { useMode } from '../context/mode-context';
import { useSchedule } from '../context/schedule-context';
import { useTasks, Task, TimeOfDay } from '../context/task-context';
import { useHabits, Habit } from '../context/habit-context';
import { logEvent } from '../utils/log-event';
import { dateKey } from '../utils/date-key';
import { MEDIUM_WINDOW_DAYS } from '../utils/mode-view';

const TEST_MODE = false; // set to false for real values

// ---- When does Recovery mode switch on? ----
// Based on how long the user has been away during their WAKING hours (sleep time doesn't count),
// not on how many reminders went out. 16 waking hours = they missed a whole waking day.
const RECOVERY_AFTER_AWAKE_MIN = 16 * 60;
const TEST_AWAY_MS = 60 * 1000; // test mode: Recovery after one minute away

// ---- How many reminders? Few, spread out, and tapering off ----
const MIN_GAP_MS = 90 * 60 * 1000; // never remind within 90 minutes of leaving the app
const DAY1_MAX = 3;                // rest of today: up to 3 (one per time frame)
const DAY2_MAX = 1;                // tomorrow: just the single most useful one, then silence

// Time frames, as minutes after the user's wake time. The last is dropped if it's too close to bedtime.
const FRAMES = [
  { id: 'morning', off: 60 },
  { id: 'afternoon', off: 360 },
  { id: 'evening', off: 660 },
] as const;
type Frame = typeof FRAMES[number]['id'];

const MESSAGES = [
  "Whenever you're ready. Even one tiny thing counts.",
  'No pressure. Want to start with something small?',
  "A gentle check-in. Tap to open when you're ready.",
];
const RANK = { High: 0, Medium: 1, Low: 2 } as const;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

type Planned = {
  when: Date;
  kind: 'task' | 'habit' | 'generic';
  title: string;
  body: string;
  data: Record<string, unknown>;
};

// ---- helpers ----
function startOfDayMs(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

// Whole days from `at` until the deadline (negative = overdue)
function daysFrom(deadline: string | undefined, at: Date): number | null {
  if (!deadline) return null;
  const m = deadline.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const due = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(deadline);
  if (isNaN(due.getTime())) return null;
  const a = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  const b = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function taskBody(days: number): string {
  if (days < 0) return "It's overdue, but still doable. One small step?";
  if (days === 0) return 'Due today. Just the first step?';
  if (days === 1) return 'Due tomorrow. A small start now makes it lighter.';
  return `Due in ${days} days. A small start now makes it lighter.`;
}

const frameOf = (t?: TimeOfDay): Frame | null =>
  t === 'morning' ? 'morning' : t === 'afternoon' ? 'afternoon' : t ? 'evening' : null;

// The most pressing task as it will look at fire time (overdue first, then nearest deadline, then priority)
function pickTask(open: Task[], at: Date): { task: Task; days: number } | null {
  let best: { task: Task; days: number } | null = null;
  for (const t of open) {
    if (t.habitId) continue;
    const days = daysFrom(t.deadline, at);
    if (days === null || days > MEDIUM_WINDOW_DAYS || days < -7) continue; // ignore far-off and long-abandoned
    if (!best || days < best.days || (days === best.days && RANK[t.priority] < RANK[best.task.priority])) {
      best = { task: t, days };
    }
  }
  return best;
}

const taskEntry = (p: { task: Task; days: number }, when: Date): Planned => ({
  when, kind: 'task', title: p.task.title, body: taskBody(p.days), data: { kind: 'task', taskId: p.task.id },
});
const habitEntry = (titles: string[], phrase: string, when: Date): Planned => ({
  when,
  kind: 'habit',
  title: titles[0],
  body: titles.length === 1
    ? `Your ${phrase} habit. A quick one to tick off.`
    : `Plus ${titles.length - 1} more for the ${phrase}. Quick ones.`,
  data: { kind: 'habit' },
});
const genericEntry = (when: Date, i = 0): Planned => ({
  when, kind: 'generic', title: 'ReFlo', body: MESSAGES[i % MESSAGES.length], data: { kind: 'generic' },
});

function buildPlan(now: Date, wakeMin: number, sleepMin: number, tasks: Task[], habits: Habit[]): Planned[] {
  if (TEST_MODE) {
    const open = tasks.filter(t => !t.completed);
    const task = pickTask(open, now);
    const habit = open.find(t => t.habitId);
    const at = (s: number) => new Date(now.getTime() + s * 1000);
    return [
      task ? taskEntry(task, at(20)) : genericEntry(at(20), 0),
      habit ? habitEntry([habit.title], 'morning', at(40)) : genericEntry(at(40), 1),
      genericEntry(at(60), 2),
    ];
  }

  const end = sleepMin > wakeMin ? sleepMin : sleepMin + 1440; // sleep time after midnight
  const open = tasks.filter(t => !t.completed);
  const todayK = dateKey(now);
  const plan: Planned[] = [];
  let genericSlot: Date | null = null;

  for (let day = 0; day < 2; day++) {
    const base = startOfDayMs(now) + day * 86400000;
    const slots = FRAMES
      .filter(f => wakeMin + f.off <= end - 60) // keep at least an hour before bed
      .map(f => ({ id: f.id as Frame, when: new Date(base + (wakeMin + f.off) * 60000) }))
      .filter(s => s.when.getTime() >= now.getTime() + MIN_GAP_MS);
    if (slots.length === 0) continue;
    if (!genericSlot) genericSlot = (slots.find(s => s.id === 'afternoon') ?? slots[0]).when;

    // Habits for that day, by the time frame they usually happen in
    const dow = new Date(base).getDay();
    const habitItems = day === 0
      ? open.filter(t => t.habitId && t.habitDate === todayK).map(t => ({ title: t.title, frame: frameOf(t.timeOfDay) }))
      : habits.filter(h => h.days.includes(dow)).map(h => ({ title: h.title, frame: frameOf(h.timeOfDay) }));

    const entries: Planned[] = [];
    const free = [...slots];
    for (const s of slots) {
      const hs = habitItems.filter(h => h.frame === s.id);
      if (hs.length === 0) continue;
      entries.push(habitEntry(hs.map(h => h.title), s.id, s.when));
      free.splice(free.indexOf(s), 1);
    }

    // One task reminder per day, in the first free frame (afternoon preferred)
    const taskSlot = (['afternoon', 'morning', 'evening'] as Frame[])
      .map(id => free.find(x => x.id === id))
      .find(Boolean);
    if (taskSlot) {
      const pick = pickTask(open, taskSlot.when);
      if (pick) entries.push(taskEntry(pick, taskSlot.when));
    }

    // Keep only the most useful ones (a task beats a habit), then put them in time order
    const limit = day === 0 ? DAY1_MAX : DAY2_MAX;
    entries.sort((a, b) => (a.kind === 'task' ? 0 : 1) - (b.kind === 'task' ? 0 : 1) || a.when.getTime() - b.when.getTime());
    plan.push(...entries.slice(0, limit).sort((a, b) => a.when.getTime() - b.when.getTime()));
  }

  // Nothing specific to say? One gentle, generic nudge, no more.
  if (plan.length === 0 && genericSlot) plan.push(genericEntry(genericSlot));
  return plan;
}

// Minutes the user was awake (inside their wake/sleep window) between two moments
function awakeMinutesBetween(from: number, to: number, wakeMin: number, sleepMin: number) {
  if (to <= from) return 0;
  const end = sleepMin > wakeMin ? sleepMin : sleepMin + 1440;
  const day = new Date(from);
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() - 1); // a waking window that began yesterday can run past midnight
  let total = 0;
  for (let i = 0; i < 20 && day.getTime() < to; i++) {
    const base = day.getTime();
    const overlap = Math.min(base + end * 60000, to) - Math.max(base + wakeMin * 60000, from);
    if (overlap > 0) total += overlap;
    day.setDate(day.getDate() + 1);
  }
  return Math.round(total / 60000);
}

type Saved = { leftAt: number; ids: string[]; wakeMin?: number; sleepMin?: number };

export default function Reengagement() {
  const { user } = useAuth();
  const { setMode } = useMode();
  const { wakeMin, sleepMin } = useSchedule();
  const { tasks } = useTasks();
  const { habits } = useHabits();
  const uid = user?.uid ?? null;

  // Refs so the AppState listener always sees the latest values
  const setModeRef = useRef(setMode);
  setModeRef.current = setMode;
  const scheduleRef = useRef({ wakeMin, sleepMin });
  scheduleRef.current = { wakeMin, sleepMin };
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const habitsRef = useRef(habits);
  habitsRef.current = habits;
  const queue = useRef<Promise<void>>(Promise.resolve());

  // Log when a reminder is tapped (also works when the tap launched the app)
  const lastResponse = Notifications.useLastNotificationResponse();
  const loggedResponse = useRef<string | null>(null);
  useEffect(() => {
    if (!uid || !lastResponse) return;
    const id = lastResponse.notification.request.identifier;
    if (loggedResponse.current === id) return;
    loggedResponse.current = id;
    const kind = (lastResponse.notification.request.content.data as { kind?: string } | undefined)?.kind ?? 'unknown';
    logEvent(uid, 'reminder_opened', { kind });
  }, [uid, lastResponse]);

  useEffect(() => {
    if (!uid) return;
    const key = `ladder:${uid}`;

    const clearPending = async (): Promise<Saved | null> => {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return null;
      const saved = JSON.parse(raw) as Saved;
      await Promise.all((saved.ids ?? []).map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
      await AsyncStorage.removeItem(key);
      return saved;
    };

    const onOpen = async () => {
      const saved = await clearPending();
      if (!saved) return;
      const now = Date.now();
      const awake = awakeMinutesBetween(
        saved.leftAt, now,
        saved.wakeMin ?? scheduleRef.current.wakeMin,
        saved.sleepMin ?? scheduleRef.current.sleepMin
      );
      const away = TEST_MODE ? now - saved.leftAt >= TEST_AWAY_MS : awake >= RECOVERY_AFTER_AWAKE_MIN;
      if (away) {
        logEvent(uid, 'recovery_auto_triggered', {
          awayMinutes: Math.round((now - saved.leftAt) / 60000),
          awakeMinutes: awake,
          reminders: (saved.ids ?? []).length,
        });
        setModeRef.current('Recovery');
      }
    };

    const onLeave = async () => {
      await clearPending();
      const { wakeMin, sleepMin } = scheduleRef.current;
      const now = new Date();
      const plan = buildPlan(now, wakeMin, sleepMin, tasksRef.current, habitsRef.current);
      const ids: string[] = [];
      for (const p of plan) {
        try {
          const id = await Notifications.scheduleNotificationAsync({
            content: { title: p.title, body: p.body, data: p.data },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: p.when,
              channelId: 'reminders',
            },
          });
          ids.push(id);
        } catch (e) {
          console.warn('Schedule failed', e);
        }
      }
      // Always remember when they left, even with no reminders, so Recovery still works
      await AsyncStorage.setItem(key, JSON.stringify({ leftAt: now.getTime(), ids, wakeMin, sleepMin } as Saved));
      logEvent(uid, 'reminders_scheduled', {
        total: plan.length,
        task: plan.filter(p => p.kind === 'task').length,
        habit: plan.filter(p => p.kind === 'habit').length,
        generic: plan.filter(p => p.kind === 'generic').length,
      });
    };

    // Run one at a time so quick open/close flips can't interleave
    const run = (fn: () => Promise<void>) => {
      queue.current = queue.current.then(fn).catch(e => console.warn('Reengagement failed', e));
    };

    (async () => {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('reminders', {
          name: 'Gentle reminders',
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') await Notifications.requestPermissionsAsync();
    })().catch(() => {});

    run(onOpen); // also covers the app being opened fresh after being closed
    const sub = AppState.addEventListener('change', next => {
      run(next === 'active' ? onOpen : onLeave);
    });
    return () => sub.remove();
  }, [uid]);

  return null;
}