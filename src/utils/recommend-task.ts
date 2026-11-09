import type { Task, TimeOfDay } from '../context/task-context';
import type { Mode } from '../context/mode-context';
import type { EventDoc } from './analytics-summary';
import { daysUntil, MEDIUM_WINDOW_DAYS } from './mode-view';

const DAY_MS = 86400000;
const HALF_LIFE_DAYS = 5;
export const HIGH_FRICTION = 0.65;

// How much each behaviour adds to a task's friction (before decay)
const WEIGHTS: Record<string, number> = {
  task_postponed: 0.12,
  task_passed_over: 0.08,
  task_abandoned: 0.25,
};

// Default friction: more steps = a heavier task
function baseFriction(task: Task): number {
  return task.friction ?? 0.5;
}

export function computeFrictionMap(
  tasks: Task[],
  events: EventDoc[],
  now = Date.now()
): Map<string, number> {
  const extra = new Map<string, number>();
  for (const e of events) {
    let w = WEIGHTS[e.type] ?? 0;
    // A session that lapsed on a task counts as abandonment; ending it yourself doesn't
    if (e.type === 'focus_ended' && e.reason === 'grace_exceeded') w = WEIGHTS.task_abandoned;
    if (!w || !e.taskId) continue;
    const ageDays = (now - e.clientTime) / DAY_MS;
    const decayed = w * Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
    extra.set(e.taskId, (extra.get(e.taskId) ?? 0) + decayed);
  }
  const map = new Map<string, number>();
  for (const t of tasks) {
    map.set(t.id, Math.min(1, baseFriction(t) + (extra.get(t.id) ?? 0)));
  }
  return map;
}

// ---- When does this person usually do each kind of task? ----
export type TimeBucket = TimeOfDay;
const BUCKET_PHRASE: Record<TimeBucket, string> = {
  morning: 'in the morning',
  afternoon: 'in the afternoon',
  evening: 'in the evening',
  night: 'at night',
};
export function bucketOf(hour: number): TimeBucket {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night'; // 10pm to 5am
}

export type TimeProfile = Map<string, Record<TimeBucket, number>>; // tag -> weighted counts

const PROFILE_HALF_LIFE_DAYS = 14; // recent habits count more than old ones
const MIN_PROFILE_WEIGHT = 2;      // need a few real data points before trusting a pattern
const PRIOR = 1;                   // pulls small samples toward "no preference"
const TIME_WEIGHT = 0.15;          // how strongly time-of-day nudges Low mode ranking

// Ticking a task off is often LATE ("I brushed my teeth 2 hours ago"), so:
//  - focus sessions (started in real time) are the strongest signal
//  - ticks count for less, and are spread over the previous ~2 hours
//  - bursts of ticks (catching up) are mostly ignored
//  - ticks made from the end-of-day check-in are ignored
const COMPLETION_WEIGHT = 0.5;
const LAG_HOURS = 2;
const CLUSTER_WINDOW_MS = 15 * 60 * 1000;
const CLUSTER_SIZE = 3;

export function computeTimeProfile(
  tasks: Task[],
  events: EventDoc[],
  now = Date.now()
): TimeProfile {
  const tagOf = new Map<string, string>();
  tasks.forEach(t => { if (t.tag) tagOf.set(t.id, t.tag); });
  const profile: TimeProfile = new Map();
  const decay = (t: number) => Math.pow(0.5, (now - t) / DAY_MS / PROFILE_HALF_LIFE_DAYS);
  const add = (tag: string, hour: number, w: number) => {
    const row = profile.get(tag) ?? { morning: 0, afternoon: 0, evening: 0, night: 0 };
    row[bucketOf(((hour % 24) + 24) % 24)] += w;
    profile.set(tag, row);
  };

  // Focus sessions start in real time, so they are the most trustworthy signal
  for (const e of events) {
    if (e.type !== 'focus_started' || !e.taskId || typeof e.localHour !== 'number') continue;
    const tag = tagOf.get(e.taskId);
    if (tag) add(tag, e.localHour, decay(e.clientTime));
  }

  // Ticks: lower weight, spread over the hours before the tick, bursts down-weighted
  const ticks = events
    .filter(e => e.type === 'task_completed' && !e.source && e.taskId && typeof e.localHour === 'number')
    .sort((a, b) => a.clientTime - b.clientTime);
  for (const e of ticks) {
    const tag = tagOf.get(e.taskId);
    if (!tag) continue;
    const near = ticks.filter(o => Math.abs(o.clientTime - e.clientTime) <= CLUSTER_WINDOW_MS).length;
    const reliability = near >= CLUSTER_SIZE ? 0.3 : 1;
    const w = COMPLETION_WEIGHT * reliability * decay(e.clientTime);
    for (let k = 0; k <= LAG_HOURS; k++) add(tag, e.localHour - k, w / (LAG_HOURS + 1));
  }
  return profile;
}

// -1 .. 1. 0 = no pattern (or not enough data), positive = "usually done around now"
export function timeFit(profile: TimeProfile | undefined, tag: string | undefined, bucket: TimeBucket): number {
  if (!profile || !tag) return 0;
  const row = profile.get(tag);
  if (!row) return 0;
  const total = row.morning + row.afternoon + row.evening + row.night;
  if (total < MIN_PROFILE_WEIGHT) return 0;
  const share = (row[bucket] + PRIOR) / (total + PRIOR * 4); // 0.25 = no preference
  return Math.round(Math.max(-1, Math.min(1, (share - 0.25) * 2)) * 10) / 10;
}

export type Recommendation = { task: Task; reason: string; path: string; timeFit: number };

// Heavy tasks need a head start in Low mode.
// friction < 0.4 -> only on the day; 0.65 -> ~3 days ahead; 0.85 -> ~5 days ahead
const LOW_RUNWAY_FROM = 0.4;
const LOW_RUNWAY_SCALE = 10;
const runwayDays = (fr: number) =>
  Math.max(0, Math.round((fr - LOW_RUNWAY_FROM) * LOW_RUNWAY_SCALE));

export function recommendTask(
  tasks: Task[],
  mode: Mode,
  friction: Map<string, number>,
  profile?: TimeProfile,
  bucket: TimeBucket = bucketOf(new Date().getHours())
): Recommendation | null {
  if (mode === 'High' || mode === 'Recovery') return null;
  // Habits live in their own "Today's habits" card, so they are never the suggested start
  const open = tasks.filter(t => !t.completed && !t.habitId);
  if (open.length === 0) return null;

  const f = (t: Task) => friction.get(t.id) ?? 0.5;
  const d = (t: Task) => daysUntil(t.deadline) ?? Infinity;
  // A time the user chose is a soft boost when it matches now, never a penalty when it doesn't.
  // Otherwise fall back to what we've learned about this tag.
  const fit = (t: Task) => t.timeOfDay ? (t.timeOfDay === bucket ? 0.8 : 0) : timeFit(profile, t.tag, bucket);
  const easiest = (a: Task, b: Task) => f(a) - f(b) || d(a) - d(b);
  // Only mention it when the pattern is clear
  const timeNote = (t: Task) =>
    t.timeOfDay === bucket
      ? ` You planned this for ${BUCKET_PHRASE[bucket]}.`
      : !t.timeOfDay && t.tag && fit(t) >= 0.25
        ? ` You often do ${t.tag} tasks ${BUCKET_PHRASE[bucket]}.`
        : '';

  // Cost of skipping: the AI's estimate, or high if the user starred it
  const tier = (t: Task) => {
    const s = Math.max(t.stakes ?? 0.5, t.important ? 0.9 : 0);
    return s >= 0.7 ? 0 : s >= 0.4 ? 1 : 2;
  };

  // ---- Low mode: each task builds "pull" as its deadline approaches ----
  if (mode === 'Low') {
    const weight = (t: Task) =>
      0.3 + 0.7 * Math.max(t.stakes ?? 0.5, t.important ? 0.9 : 0);
    const surfaced = (t: Task) => d(t) <= runwayDays(f(t)); // time-of-day never surfaces a task early
    const pull = (t: Task) => {
      const days = d(t);
      const runway = runwayDays(f(t));
      const urgency = days <= 0 ? 1 : 1 - days / (runway + 1);
      return urgency * weight(t) + 0.1 * (1 - f(t)) + TIME_WEIGHT * fit(t);
    };
    const candidates = open.filter(surfaced);
    if (candidates.length === 0) return null;
    const task = [...candidates].sort((a, b) => pull(b) - pull(a))[0];
    const days = d(task);
    const heavy = f(task) >= HIGH_FRICTION;
    let reason: string;
    if (days <= 0) {
      reason = tier(task) === 0
        ? 'Due today and it matters. Just try the first small step.'
        : 'Due today. A small one to clear.';
    } else if (heavy) {
      reason = `Due in ${days} day${days === 1 ? '' : 's'}. It's a big one, so a small start now makes it much lighter.`;
    } else {
      reason = 'Coming up soon, and a light one.';
    }
    return { task, path: days <= 0 ? 'due-now' : 'early-start', reason: reason + timeNote(task), timeFit: fit(task) };
  }

  // ---- Medium mode ----
  // Urgency first, then what usually suits this time of day, then deadline and effort
  const band = (t: Task) => { const days = d(t); return days <= 1 ? 0 : days <= 3 ? 1 : 2; };
  const pick = (a: Task, b: Task) =>
    tier(a) - tier(b) || band(a) - band(b) || fit(b) - fit(a) || d(a) - d(b) || easiest(a, b);

  const dueNow = open.filter(t => d(t) <= 0);
  if (dueNow.length > 0) {
    const task = [...dueNow].sort(pick)[0];
    return {
      task,
      path: 'due-now',
      reason: (tier(task) === 0
        ? 'Due today and it matters, so it comes first. Start with one small step.'
        : 'Due today, and the most pressing of what is due.') + timeNote(task),
      timeFit: fit(task),
    };
  }
  const dueSoon = open.filter(t => d(t) > 0 && d(t) <= MEDIUM_WINDOW_DAYS);
  if (dueSoon.length > 0) {
    const task = [...dueSoon].sort(pick)[0];
    return { task, path: 'due-soon', reason: 'Due soon, and the one that matters most.' + timeNote(task), timeFit: fit(task) };
  }
  // Nothing urgent: lean on what this person usually does at this time of day
  const task = [...open].sort((a, b) => fit(b) - fit(a) || easiest(a, b))[0];
  return {
    task,
    path: 'momentum',
    reason: task.timeOfDay === bucket
      ? `Nothing is urgent, and you planned this for ${BUCKET_PHRASE[bucket]}.`
      : !task.timeOfDay && fit(task) >= 0.25 && task.tag
        ? `Nothing is urgent. You often do ${task.tag} tasks ${BUCKET_PHRASE[bucket]}, so this could suit now.`
        : 'Nothing is urgent. This is a light one to get going.',
    timeFit: fit(task),
  };
}