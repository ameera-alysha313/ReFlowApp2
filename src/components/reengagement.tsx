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
// Based on how long the user has been away during their WAKING hours (sleep time doesn't count).
// 6 waking hours = they missed their whole morning (e.g. woke at 9am, first open after 3pm).
const RECOVERY_AFTER_AWAKE_MIN = 6 * 60;
const TEST_AWAY_MS = 60 * 1000; // test mode: Recovery after one minute away
const HEARTBEAT_MS = 60 * 1000; // "last seen" is saved this often while the app is open

// ---- How many reminders? Plenty, but spread out and tapering off ----
const MIN_GAP_MS = 60 * 60 * 1000; // never remind within an hour of leaving the app
const DAY_MAX = [7, 5, 3];         // reminders allowed today, tomorrow, the day after. Then silence.

// Time frames, as minutes after the user's wake time. A frame is dropped if it's too close to bedtime.
const FRAMES = [
  { id: 'morning', off: 60 },
  { id: 'midday', off: 240 },
  { id: 'afternoon', off: 420 },
  { id: 'evening', off: 660 },
] as const;
type Frame = typeof FRAMES[number]['id'];
const ORDER: Frame[] = FRAMES.map(f => f.id);

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

// Habits with no time of day get the afternoon slot
const frameOf = (t?: TimeOfDay): Frame =>
  t === 'morning' ? 'morning' : t === 'evening' || t === 'night' ? 'evening' : 'afternoon';

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
    ? (phrase ? `Your ${phrase} habit. A quick one to tick off.` : 'A quick habit to tick off.')
    : `Plus ${titles.length - 1} more${phrase ? ` for the ${phrase}` : ''}. Quick ones.`,
  data: { kind: 'habit' },
});
const carryEntry = (titles: string[], when: Date): Planned => ({
  when,
  kind: 'habit',
  title: titles[0],
  body: titles.length === 1
    ? 'Still open from earlier. A quick one?'
    : `Plus ${titles.length - 1} more still open. Quick ones.`,
  data: { kind: 'habit', carry: true },
});
const genericEntry = (when: Date, i = 0): Planned => ({
  when, kind: 'generic', title: 'ReFlo', body: MESSAGES[i % MESSAGES.length], data: { kind: 'generic' },
});

type Entry = Planned & { rank: number };

// Cancel only the daily reminders. Focus-session notifications (data.kind === 'focus') are left alone.
async function cancelReminders() {
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    pending
      .filter(n => (n.content.data as { kind?: string } | undefined)?.kind !== 'focus')
      .map(n => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {}))
  );
}
const byTime = (a: Planned, b: Planned) => a.when.getTime() - b.when.getTime();

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

  for (let day = 0; day < DAY_MAX.length; day++) {
    const base = startOfDayMs(now) + day * 86400000;
    const slots = FRAMES
      .filter(f => wakeMin + f.off <= end - 60) // keep at least an hour before bed
      .map(f => ({ id: f.id as Frame, when: new Date(base + (wakeMin + f.off) * 60000) }))
      .filter(s => s.when.getTime() >= now.getTime() + MIN_GAP_MS);
    if (slots.length === 0) continue;
    if (!genericSlot) genericSlot = (slots.find(s => s.id === 'afternoon') ?? slots[0]).when;

    // Habits scheduled for that day (today's already-ticked ones are skipped)
    const dow = new Date(base).getDay();
    const items = habits
      .filter(h => h.days.includes(dow))
      .filter(h => !(day === 0 && tasks.some(t => t.habitId === h.id && t.habitDate === todayK && t.completed)))
      .map(h => ({ title: h.title, frame: frameOf(h.timeOfDay), anytime: !h.timeOfDay }));

    const entries: Entry[] = [];
    const used = new Set<Frame>();

    // 1) habits in their own time frame
    for (const s of slots) {
      const hs = items.filter(h => h.frame === s.id);
      if (hs.length === 0) continue;
      entries.push({ ...habitEntry(hs.map(h => h.title), hs.every(h => h.anytime) ? '' : s.id, s.when), rank: 1 });
      used.add(s.id);
    }

    // 2) one task reminder, in the first free frame
    const free = slots.filter(s => !used.has(s.id));
    const taskSlot = (['midday', 'afternoon', 'morning', 'evening'] as Frame[])
      .map(id => free.find(x => x.id === id))
      .find(Boolean);
    if (taskSlot) {
      const pick = pickTask(open, taskSlot.when);
      if (pick) {
        entries.push({ ...taskEntry(pick, taskSlot.when), rank: 0 });
        used.add(taskSlot.id);
      }
    }

    // 3) habits from earlier frames that are still open, in the remaining frames
    for (const s of slots) {
      if (used.has(s.id)) continue;
      const carry = items.filter(h => ORDER.indexOf(h.frame) < ORDER.indexOf(s.id));
      if (carry.length === 0) continue;
      entries.push({ ...carryEntry(carry.map(h => h.title), s.when), rank: 2 });
      used.add(s.id);
    }

    // Keep the most useful ones (task, then habit, then still-open), then put them in time order
    entries.sort((a, b) => a.rank - b.rank || byTime(a, b));
    plan.push(...entries.slice(0, DAY_MAX[day]).sort(byTime));
  }

  // Nothing specific to say? One gentle, generic nudge.
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

export default function Reengagement() {
  const { user } = useAuth();
  const { setMode } = useMode();
  const { wakeMin, sleepMin } = useSchedule();
  const { tasks } = useTasks();
  const { habits } = useHabits();
  const uid = user?.uid ?? null;

  // Refs so listeners and timers always see the latest values
  const setModeRef = useRef(setMode);
  setModeRef.current = setMode;
  const scheduleRef = useRef({ wakeMin, sleepMin });
  scheduleRef.current = { wakeMin, sleepMin };
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const habitsRef = useRef(habits);
  habitsRef.current = habits;
  const queue = useRef<Promise<void>>(Promise.resolve());
  const run = (fn: () => Promise<void>) => {
    queue.current = queue.current.then(fn).catch(e => console.warn('Reengagement failed', e));
  };

  // Replace every pending reminder with a fresh plan. Done when the app opens, when it closes,
  // and shortly after tasks or habits change, so a reminder is always waiting even if the app
  // gets killed without warning.
  const scheduleReminders = async (log: boolean) => {
    if (!uid) return;
    await cancelReminders();
    const perm = await Notifications.getPermissionsAsync();
    if (perm.status !== 'granted') {
      if (log) logEvent(uid, 'reminders_scheduled', { total: 0, permission: perm.status });
      return;
    }
    const { wakeMin, sleepMin } = scheduleRef.current;
    const plan = buildPlan(new Date(), wakeMin, sleepMin, tasksRef.current, habitsRef.current);
    let failed = 0;
    let firstError = '';
    for (const p of plan) {
      try {
        await Notifications.scheduleNotificationAsync({
          content: { title: p.title, body: p.body, data: p.data },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: p.when,
            channelId: 'reminders',
          },
        });
      } catch (e: any) {
        failed += 1;
        if (!firstError) firstError = String(e?.message ?? e).slice(0, 120);
        console.warn('Schedule failed', e);
      }
    }
    if (log) {
      logEvent(uid, 'reminders_scheduled', {
        total: plan.length,
        task: plan.filter(p => p.kind === 'task').length,
        habit: plan.filter(p => p.kind === 'habit').length,
        generic: plan.filter(p => p.kind === 'generic').length,
        permission: perm.status,
        failed,
        ...(firstError ? { error: firstError } : {}),
      });
    }
  };
  const scheduleFn = useRef(scheduleReminders);
  scheduleFn.current = scheduleReminders;

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

  // Keep reminders in step with the user's tasks, habits and waking hours
  useEffect(() => {
    if (!uid) return;
    const t = setTimeout(() => {
      if (AppState.currentState === 'active') run(() => scheduleFn.current(false));
    }, 3000);
    return () => clearTimeout(t);
  }, [uid, tasks, habits, wakeMin, sleepMin]);

  useEffect(() => {
    if (!uid) return;
    const activeKey = `active:${uid}`; // when the app was last seen open

    const onOpen = async () => {
      const raw = await AsyncStorage.getItem(activeKey);
      const last = raw ? Number(raw) : null;
      const now = Date.now();
      if (last && !isNaN(last)) {
        const awake = awakeMinutesBetween(last, now, scheduleRef.current.wakeMin, scheduleRef.current.sleepMin);
        const away = TEST_MODE ? now - last >= TEST_AWAY_MS : awake >= RECOVERY_AFTER_AWAKE_MIN;
        if (away) {
          logEvent(uid, 'recovery_auto_triggered', {
            awayMinutes: Math.round((now - last) / 60000),
            awakeMinutes: awake,
          });
          setModeRef.current('Recovery');
        }
      }
      await AsyncStorage.setItem(activeKey, String(now));
      await scheduleReminders(false);
    };

    const onLeave = async () => {
      await AsyncStorage.setItem(activeKey, String(Date.now())); // remember this FIRST
      await scheduleReminders(true);
    };

    const setup = async () => {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('reminders', {
          name: 'Gentle reminders',
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') await Notifications.requestPermissionsAsync();
    };

    run(setup);
    run(onOpen); // also covers the app being opened fresh after being closed
    const sub = AppState.addEventListener('change', next => {
      run(next === 'active' ? onOpen : onLeave);
    });
    // "Last seen" keeps ticking while the app is open, so Recovery works even if the app is killed
    const beat = setInterval(() => {
      if (AppState.currentState === 'active') AsyncStorage.setItem(activeKey, String(Date.now())).catch(() => {});
    }, HEARTBEAT_MS);
    return () => { sub.remove(); clearInterval(beat); };
  }, [uid]);

  return null;
}