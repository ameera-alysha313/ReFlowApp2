import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';
import { app } from '../../config/firebaseConfig';
import type { Task, Subtask } from '../context/task-context';
import type { Mode } from '../context/mode-context';
import { deadlineLabel } from './mode-view';

const ATTEMPTS = [
  { name: 'gemini-3.5-flash-lite', timeoutMs: 4000 },
  { name: 'gemini-3.8-flash', timeoutMs: 4000 },
];

const models: Record<string, ReturnType<typeof getGenerativeModel>> = {};
function getModel(name: string) {
  if (!models[name]) {
    const ai = getAI(app, { backend: new GoogleAIBackend() });
    models[name] = getGenerativeModel(ai, {
      model: name,
      generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
    });
  }
  return models[name];
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      v => { clearTimeout(t); resolve(v); },
      e => { clearTimeout(t); reject(e); }
    );
  });
}

// If the AI keeps failing (no internet, bad model name), stop waiting on it for a few minutes
let llmFails = 0;
let llmPausedUntil = 0;
const llmAvailable = () => Date.now() >= llmPausedUntil;
function noteLlmFailure() {
  llmFails += 1;
  if (llmFails >= 2) {
    llmPausedUntil = Date.now() + 5 * 60 * 1000;
    llmFails = 0;
  }
}

// friction: 0 = easy to start, 1 = hard to start
// stakes: 0 = nothing much happens if it slips, 1 = serious consequences
type Rule = { match: RegExp; steps: string[]; friction: number; stakes: number };
const RULES: Rule[] = [
  { match: /\b(clean|tidy)\b.*\b(room|desk|bedroom|kitchen)\b/i, friction: 0.35, stakes: 0.2,
    steps: ['Put any rubbish in a bag', 'Collect dishes or cups and put them by the sink', 'Put clothes in the laundry pile', 'Clear the main surface', 'Wipe it down'] },
  { match: /\blaundry\b/i, friction: 0.3, stakes: 0.25,
    steps: ['Gather dirty clothes into one pile', 'Carry clothes to washing machine', 'Put the first load in the machine', 'Set a timer for when it finishes', 'Hang or dry the load', 'Fold or put away'] },
  { match: /\b(essay|report|assignment|dissertation|paper)\b/i, friction: 0.85, stakes: 0.9,
    steps: ['Open the document and write the title', 'List 3 main points as bullets', 'Write one rough paragraph (it can be bad)', 'Fill in the remaining points', 'Read through once and fix obvious mistakes'] },
  { match: /\b(study|revise|revision|exam|quiz|test)\b/i, friction: 0.65, stakes: 0.65,
    steps: ['Get your notes or slides open', 'Pick one topic only', 'Read it once, then write 3 key points from memory', 'Try two practice questions', 'Note what you still find confusing'] },
  { match: /\b(email|reply|message|text)\b/i, friction: 0.3, stakes: 0.4,
    steps: ['Open the message', 'Write one rough sentence of the reply', 'Finish the rest of the draft', 'Re-read once, then send'] },
  { match: /\b(pay|bill|form|apply|register|renew)\b/i, friction: 0.5, stakes: 0.8,
    steps: ['Find the link or document you need', 'Gather the details it asks for', 'Fill in the first section', 'Finish and submit', 'Screenshot or save the confirmation'] },
];

// The rules only know about writing, cleaning and admin. If the title mentions something else
// ("make video for assignment"), the keyword is misleading, so don't guess.
const NOT_A_RULE_TASK =
  /\b(video|film|record|recording|present|presentation|slides?|poster|code|coding|program|app|website|design|prototype|demo|experiment|lab|model|build|draw|paint|photo|group|meeting|interview|survey)\b/i;

function toSubtasks(titles: string[]): Subtask[] {
  return titles.map((title, i) => ({ id: `${Date.now()}-${i}`, title, done: false }));
}

function fromRules(task: Task) {
  if (NOT_A_RULE_TASK.test(task.title)) return null;
  const hit = RULES.find(r => r.match.test(task.title));
  return hit
    ? { subtasks: toSubtasks(hit.steps), friction: hit.friction, stakes: hit.stakes }
    : null;
}

const to01 = (n: unknown) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(1, Math.max(0, (v - 1) / 4)) : undefined;
};

async function fromLLM(
  task: Task,
  mode: Mode
): Promise<{ subtasks: Subtask[]; friction?: number; stakes?: number; model: string }> {
  const maxSteps = mode === 'Low' || mode === 'Recovery' ? 5 : 7;
  const prompt =
    'You help people with executive dysfunction start tasks.' +
    `Break the task into at most ${maxSteps} tiny, concrete steps. ` +
    'Each step should be under 12 words. The first step must take under 2 minutes and need no decisions. ' +
    'Instructions must help user carry out task from beginning to end. Instructions should be easily digestible. ' +
    'Read the whole task title carefully and fit the steps to what it actually asks for ' +
    '(for example, making a video is not the same as writing a document). ' +
    'Do not assume the definition of acronyms, keep them as is.'+
    'No motivational language, but keep tone conversational. Also rate two things on a 1 to 5 scale. ' +
    'difficulty: how hard the task is to START and keep going (1 = tiny and familiar, ' +
    '3 = moderate effort, 5 = large, vague or multi-hour). ' +
    'consequence: what happens if it is NOT done by its deadline (1 = almost nothing, ' +
    'it can slip a day; 3 = real inconvenience; 5 = serious penalty such as lost marks, ' +
    'a missed submission, fees or safety). ' +
    'Reply ONLY with JSON in this shape: ' +
    '{"difficulty": 3, "consequence": 2, "steps": ["...", "..."]}\n\n' +
    `Task: ${task.title}${task.tag ? ` (category: ${task.tag})` : ''}\n` +
    `Deadline: ${deadlineLabel(task.deadline) ?? 'none'}`;

  let lastErr: unknown;
  for (const { name, timeoutMs } of ATTEMPTS) {
    try {
      const result = await withTimeout(getModel(name).generateContent(prompt), timeoutMs);
      const parsed = JSON.parse(result.response.text());
      const arr = parsed?.steps;
      if (!Array.isArray(arr) || arr.length === 0) throw new Error('Bad LLM output');
      return {
        subtasks: toSubtasks(arr.slice(0, maxSteps).map(String)),
        friction: to01(parsed?.difficulty),
        stakes: to01(parsed?.consequence),
        model: name,
      };
    } catch (e) {
      lastErr = e;
      console.warn(`Model ${name} failed`, e);
    }
  }
  throw lastErr;
}

const GENERIC = [
  'Open or gather whatever you need for this',
  'Work on it for just 5 minutes',
  'Decide what the next small step is',
];

const BY_TAG: Record<string, string[]> = {
  Study: ['Open your notes or the material', 'Pick one small section only', 'Work on it for 10 minutes', 'Jot down what you got through'],
  Chores: ['Gather what you need', 'Do just the first part', 'Set a 10-minute timer and keep going'],
  Admin: ['Find the link, form or document', 'Gather the details it asks for', 'Complete the first section'],
  Personal: ['Decide what "done" looks like in one sentence', 'Do the smallest first piece', 'Note what is left'],
};

// Order: 1) the AI, which reads the whole title  2) keyword rules, if it's a plain match  3) generic steps
export async function breakDownTask(
  task: Task,
  mode: Mode
): Promise<{
  subtasks: Subtask[];
  friction?: number;
  stakes?: number;
  source: 'rules' | 'llm' | 'generic';
  model?: string;
  ms: number;
}> {
  const start = Date.now();

  if (llmAvailable()) {
    try {
      const r = await fromLLM(task, mode);
      llmFails = 0;
      return { ...r, source: 'llm', ms: Date.now() - start };
    } catch (e) {
      noteLlmFailure();
      console.warn('AI breakdown failed, trying rules', e);
    }
  }

  const ruled = fromRules(task);
  if (ruled) return { ...ruled, source: 'rules', ms: Date.now() - start };

  const steps = (task.tag && BY_TAG[task.tag]) || GENERIC;
  return { subtasks: toSubtasks(steps), source: 'generic', ms: Date.now() - start };
}