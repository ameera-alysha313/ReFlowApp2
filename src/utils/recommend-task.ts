import type { Task } from '../context/task-context';
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
  const steps = task.subtasks?.length ?? 3;
  return Math.min(0.8, 0.2 + 0.1 * steps);
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

export function recommendTask(
  tasks: Task[],
  mode: Mode,
  friction: Map<string, number>
): Recommendation | null {
  if (mode === 'High' || mode === 'Recovery') return null; // out of base scope
  const open = tasks.filter(t => !t.completed);
  if (open.length === 0) return null;

  const f = (t: Task) => friction.get(t.id) ?? 0.5;
  const d = (t: Task) => daysUntil(t.deadline) ?? Infinity;
  const easiest = (a: Task, b: Task) => f(a) - f(b) || d(a) - d(b);

  // Node 1: due today or overdue
  const dueNow = open.filter(t => d(t) <= 0);
  if (dueNow.length > 0) {
    const task = [...dueNow].sort(easiest)[0];
    return {
      task,
      path: 'due-now',
      reason:
        f(task) >= HIGH_FRICTION
          ? 'Due today. This one has felt hard before, so just try the first small step.'
          : 'Due today, and the easiest of what is due.',
    };
  }

  // Node 2: Low mode with nothing due -> no push
  if (mode === 'Low') return null;

  // Node 3: due within the window (Medium)
  const dueSoon = open.filter(t => d(t) > 0 && d(t) <= MEDIUM_WINDOW_DAYS);
  if (dueSoon.length > 0) {
    const task = [...dueSoon].sort(easiest)[0];
    return { task, path: 'due-soon', reason: 'Due soon, and a gentle one to start with.' };
  }

  // Node 4: nothing urgent -> lightest task to build momentum
  const task = [...open].sort(easiest)[0];
  return { task, path: 'momentum', reason: 'Nothing is urgent. This is a light one to get going.' };
}