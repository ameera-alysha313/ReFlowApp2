import type { Priority } from '../context/task-context';

const LEVELS: Priority[] = ['Low', 'Medium', 'High'];

// Stand-in for the future LLM suggestion.
export function suggestPriority(deadline: string | undefined, important: boolean): Priority {
  let level = 0;

  if (deadline) {
    const due = new Date(deadline);
    if (!isNaN(due.getTime())) {
      const hoursLeft = (due.getTime() - Date.now()) / (1000 * 60 * 60);
      if (hoursLeft <= 24) level = 2;
      else if (hoursLeft <= 72) level = 1;
    }
  }

  if (important) level = Math.min(level + 1, 2);
  return LEVELS[level];
}