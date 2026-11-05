import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';
import { app } from '../../config/firebaseConfig';
import type { Task, Subtask } from '../context/task-context';
import type { Mode } from '../context/mode-context';

// Tried in order. If one is slow or overloaded, the next one is used.
// If a model name 404s, the error message names the current replacement.
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

type Rule = { match: RegExp; steps: string[] };

// Rules for common tasks. Add more whenever you think of them.
const RULES: Rule[] = [
  { match: /\b(clean|tidy)\b.*\b(room|desk|bedroom|kitchen)\b/i,
    steps: ['Put any rubbish in a bag', 'Collect dishes or cups and put them by the sink', 'Put clothes in the laundry pile', 'Clear the main surface', 'Wipe it down'] },
  { match: /\blaundry\b/i,
    steps: ['Gather dirty clothes into one pile', 'Carry clothes to washing machine', 'Put the first load in the machine', 'Set a timer for when it finishes', 'Hang or dry the load', 'Fold or put away'] },
  { match: /\b(essay|report|assignment|dissertation|paper)\b/i,
    steps: ['Open the document and write the title', 'List 3 main points as bullets', 'Write one rough paragraph (it can be bad)', 'Fill in the remaining points', 'Read through once and fix obvious mistakes'] },
  { match: /\b(study|revise|revision|exam|quiz|test)\b/i,
    steps: ['Get your notes or slides open', 'Pick one topic only', 'Read it once, then write 3 key points from memory', 'Try two practice questions', 'Note what you still find confusing'] },
  { match: /\b(email|reply|message|text)\b/i,
    steps: ['Open the message', 'Write one rough sentence of the reply', 'Finish the rest of the draft', 'Re-read once, then send'] },
  { match: /\b(pay|bill|form|apply|register|renew)\b/i,
    steps: ['Find the link or document you need', 'Gather the details it asks for', 'Fill in the first section', 'Finish and submit', 'Screenshot or save the confirmation'] },
];

function toSubtasks(titles: string[]): Subtask[] {
  return titles.map((title, i) => ({ id: `${Date.now()}-${i}`, title, done: false }));
}

function fromRules(task: Task): Subtask[] | null {
  const hit = RULES.find(r => r.match.test(task.title));
  return hit ? toSubtasks(hit.steps) : null;
}

async function fromLLM(task: Task, mode: Mode): Promise<{ subtasks: Subtask[]; model: string }> {
  const maxSteps = mode === 'Low' || mode === 'Recovery' ? 5 : 7;
  const prompt =
    'You help people with executive dysfunction start and carry out tasks. Break the task into ' +
    `at most ${maxSteps} tiny, concrete steps. Each step starts with a verb and is ` +
    'under 12 words. The first step must take under 2 minutes and need no decisions. Instructions must help user carry out task from beginning to end' +
    'No motivational language. Reply ONLY with a JSON array of strings.\n\n' +
    `Task: ${task.title}${task.tag ? ` (category: ${task.tag})` : ''}`;

  let lastErr: unknown;
  for (const { name, timeoutMs } of ATTEMPTS) {
    try {
    const t0 = Date.now();
    const result = await withTimeout(getModel(name).generateContent(prompt), timeoutMs);
    console.log(`[breakdown] ${name} answered in ${Date.now() - t0} ms`);
        const arr = JSON.parse(result.response.text());
      if (!Array.isArray(arr) || arr.length === 0) throw new Error('Bad LLM output');
      return { subtasks: toSubtasks(arr.slice(0, maxSteps).map(String)), model: name };
    } catch (e) {
      lastErr = e;
      console.warn(`Model ${name} failed`, e);
    }
  }
  throw lastErr;
}

// Last-resort steps if every AI attempt fails
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

export async function breakDownTask(
  task: Task,
  mode: Mode
): Promise<{
  subtasks: Subtask[];
  source: 'rules' | 'llm' | 'generic';
  model?: string;
  ms: number;
}> {
  const start = Date.now();
  const ruled = fromRules(task);
  if (ruled) return { subtasks: ruled, source: 'rules', ms: Date.now() - start };
  try {
    const { subtasks, model } = await fromLLM(task, mode);
    return { subtasks, source: 'llm', model, ms: Date.now() - start };
  } catch (e) {
    console.warn('Breakdown fell back to generic', e);
    const steps = (task.tag && BY_TAG[task.tag]) || GENERIC;
    return { subtasks: toSubtasks(steps), source: 'generic', ms: Date.now() - start };
  }
}