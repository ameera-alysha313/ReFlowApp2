import type { Task} from '../context/task-context';
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

export type Recommendation = { task: Task; reason: string; path: string };

// Heavy tasks need a head start in Low mode.
// friction < 0.4 -> only on the day; 0.65 -> ~3 days ahead; 0.85 -> ~5 days ahead
const LOW_RUNWAY_FROM = 0.4;
const LOW_RUNWAY_SCALE = 10;
const runwayDays = (fr: number) =>
  Math.max(0, Math.round((fr - LOW_RUNWAY_FROM) * LOW_RUNWAY_SCALE));

export function recommendTask(
  tasks: Task[],
  mode: Mode,
  friction: Map<string, number>
): Recommendation | null {
  if (mode === 'High' || mode === 'Recovery') return null;
  const open = tasks.filter(t => !t.completed);
  if (open.length === 0) return null;

  const f = (t: Task) => friction.get(t.id) ?? 0.5;
  const d = (t: Task) => daysUntil(t.deadline) ?? Infinity;
  const easiest = (a: Task, b: Task) => f(a) - f(b) || d(a) - d(b);

  // Cost of skipping: the AI's estimate, or high if the user starred it
  const tier = (t: Task) => {
    const s = Math.max(t.stakes ?? 0.5, t.important ? 0.9 : 0);
    return s >= 0.7 ? 0 : s >= 0.4 ? 1 : 2;
  };

  // ---- Low mode: each task builds "pull" as its deadline approaches ----
  if (mode === 'Low') {
    const weight = (t: Task) =>
      0.3 + 0.7 * Math.max(t.stakes ?? 0.5, t.important ? 0.9 : 0);
    const pull = (t: Task) => {
      const days = d(t);
      const runway = runwayDays(f(t));
      if (days > runway) return -1; // not surfaced yet
      const urgency = days <= 0 ? 1 : 1 - days / (runway + 1);
      return urgency * weight(t) + 0.1 * (1 - f(t));
    };

    const candidates = open.filter(t => pull(t) >= 0);
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
    return { task, path: days <= 0 ? 'due-now' : 'early-start', reason };
  }

  // ---- Medium mode ----
  const pick = (a: Task, b: Task) => tier(a) - tier(b) || d(a) - d(b) || easiest(a, b);

  const dueNow = open.filter(t => d(t) <= 0);
  if (dueNow.length > 0) {
    const task = [...dueNow].sort(pick)[0];
    return {
      task,
      path: 'due-now',
      reason: tier(task) === 0
        ? 'Due today and it matters, so it comes first. Start with one small step.'
        : 'Due today, and the most pressing of what is due.',
    };
  }

  const dueSoon = open.filter(t => d(t) > 0 && d(t) <= MEDIUM_WINDOW_DAYS);
  if (dueSoon.length > 0) {
    const task = [...dueSoon].sort(pick)[0];
    return { task, path: 'due-soon', reason: 'Due soon, and the one that matters most.' };
  }

  const task = [...open].sort(easiest)[0];
  return { task, path: 'momentum', reason: 'Nothing is urgent. This is a light one to get going.' };
}