import { useState, useEffect, useMemo, ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTasks, Task, Priority } from '../context/task-context';
import { useMode } from '../context/mode-context';
import { getDoneToday, getModeView, deadlineLabel, daysUntil, MEDIUM_WINDOW_DAYS } from '../utils/mode-view';
import RecoveryView from '../components/recovery-view';
import HabitsToday from '../components/habits-today';
import RowMenu from '../components/row-menu';
import StepsEditor from '../components/steps-editor';
import { useAuth } from '../context/auth-context';
import { logEvent } from '../utils/log-event';
import { confirmDelete } from '../utils/confirm';
import { breakDownTask } from '../utils/task-breakdown';
import { useEvents } from '../utils/use-events';
import { startOfDay } from '../utils/analytics-summary';
import { computeFrictionMap, recommendTask, computeTimeProfile, bucketOf } from '../utils/recommend-task';

// Neutral blues/grey: traffic-light colours are reserved for the mood picker
const PRIORITY_COLORS: Record<Priority, string> = {
  High: '#1F5FA8',
  Medium: '#4A90D9',
  Low: '#999',
};

// Small arrow that points right when closed and down when open
function Chevron({ open }: { open: boolean }) {
  return <View style={[styles.chevron, open ? styles.chevronOpen : styles.chevronClosed]} />;
}

function TaskRow({ task, onPress, showCheckbox }: {
  task: Task; onPress: () => void; showCheckbox: boolean;
}) {
  const router = useRouter();
  const { deleteTask } = useTasks();
  const [expanded, setExpanded] = useState(false);
  const label = deadlineLabel(task.deadline) ?? task.deadline;
  const days = daysUntil(task.deadline);
  const urgent = days !== null && days <= 1;
  const subs = task.subtasks ?? [];
  const subsDone = subs.filter(s => s.done).length;
  return (
    <View style={styles.taskBlock}>
      <View style={styles.row}>
        <Pressable style={styles.rowMain} onPress={onPress}>
          {showCheckbox && (
            <View style={[styles.checkbox, task.completed && styles.checkboxChecked]}>
              {task.completed && <Text style={styles.checkmark}>✓</Text>}
            </View>
          )}
          <View style={styles.rowText}>
            <Text style={styles.taskText}>{task.title}</Text>
            <Text style={styles.meta}>
              <Text style={{ color: PRIORITY_COLORS[task.priority], fontWeight: '600' }}>{task.priority}</Text>
              {task.tag ? ` · ${task.tag}` : ''}
              {label ? ' · ' : ''}
              {label ? <Text style={urgent && styles.urgent}>{label}</Text> : null}
              {subs.length > 0 ? ` · ${subsDone}/${subs.length} steps` : ''}
            </Text>
          </View>
        </Pressable>
        <Pressable
          style={styles.chevronBtn}
          onPress={() => setExpanded(e => !e)}
          hitSlop={6}
          accessibilityLabel={expanded ? 'Hide small steps' : 'Show small steps'}
        >
          <Chevron open={expanded} />
        </Pressable>
        <RowMenu actions={[
          { label: 'Edit', onPress: () => router.push({ pathname: '/add-task', params: { id: task.id } }) },
          {
            label: 'Delete',
            destructive: true,
            onPress: () => confirmDelete('Delete this task?', "This can't be undone.", () => deleteTask(task.id)),
          },
        ]} />
      </View>
      {expanded && (
        <View style={styles.stepsPanel}>
          <StepsEditor task={task} />
        </View>
      )}
    </View>
  );
}

// The whole Home screen scrolls, so lists are plain Views, not nested scrolling lists
function TaskList({ tasks, onPressTask, showCheckbox = true }: {
  tasks: Task[]; onPressTask: (t: Task) => void; showCheckbox?: boolean;
}) {
  return (
    <View>
      {tasks.map(t => (
        <TaskRow key={t.id} task={t} showCheckbox={showCheckbox} onPress={() => onPressTask(t)} />
      ))}
    </View>
  );
}

function SingleTask({ task, intro, onDone, secondaryLabel, onSecondary }: {
  task: Task; intro: string; onDone: () => void;
  secondaryLabel?: string; onSecondary?: () => void;
}) {
  const label = deadlineLabel(task.deadline) ?? task.deadline;
  return (
    <View style={styles.card}>
      <Text style={styles.cardIntro}>{intro}</Text>
      <Text style={styles.cardTitle}>{task.title}</Text>
      <Text style={styles.cardMeta}>{[task.tag, label].filter(Boolean).join(' · ')}</Text>
      <View style={{ marginBottom: 16 }}>
        <StepsEditor task={task} />
      </View>
      <Pressable style={[styles.primaryButton, { marginTop: 10 }]} onPress={onDone}>
        <Text style={styles.primaryButtonText}>Mark as done</Text>
      </Pressable>
      {secondaryLabel ? (
        <Pressable onPress={onSecondary}><Text style={styles.linkText}>{secondaryLabel}</Text></Pressable>
      ) : null}
    </View>
  );
}

export default function Home() {
  const { tasks, toggleTask } = useTasks();
  const { mode, setMode } = useMode();
  const { user } = useAuth();
  const router = useRouter();
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  const [showDone, setShowDone] = useState(false);

  // Reset the "nothing urgent" choices whenever the mode changes
  useEffect(() => {
    setChosenId(null);
    setChoosing(false);
    setDeclined(false);
  }, [mode]);

  // Habit tasks live in the "Today's habits" card, so keep them out of the main lists
  const view = getModeView(tasks.filter(t => !t.habitId), mode);
  const doneToday = getDoneToday(tasks).filter(t => !t.habitId);
  const chosen = chosenId ? tasks.find(t => t.id === chosenId && !t.completed) : undefined;

  const events = useEvents(startOfDay(-30));
  const friction = useMemo(() => computeFrictionMap(tasks, events), [tasks, events]);
  const timeProfile = useMemo(() => computeTimeProfile(tasks, events), [tasks, events]);
  const bucket = bucketOf(new Date().getHours());
  const rec = useMemo(
    () => recommendTask(tasks, mode, friction, timeProfile, bucket),
    [tasks, mode, friction, timeProfile, bucket]
  );

  useEffect(() => {
    if (rec) logEvent(user?.uid ?? null, 'recommendation_shown', { taskId: rec.task.id, path: rec.path, mode, timeFit: rec.timeFit });
  }, [rec?.task.id, mode]);

  // top = the suggestion / main card. rest = the lists below it.
  // "Today's habits" sits between the two.
  const renderContent = (): { top: ReactNode; rest: ReactNode } => {
    if (mode === 'Recovery') {
      const openTasks = tasks.filter(t => !t.completed);
      return {
        top: <RecoveryView onFeelingBetter={() => setMode('Low')} />,
        rest: (
          <>
            <Pressable onPress={() => setShowTasks(prev => !prev)}>
              <Text style={styles.linkText}>{showTasks ? 'Hide my tasks' : 'Look at my tasks'}</Text>
            </Pressable>
            {showTasks && <TaskList tasks={openTasks} onPressTask={t => toggleTask(t.id)} />}
          </>
        ),
      };
    }

    // A task the user picked from the "nothing urgent" list
    if (mode !== 'High' && chosen) {
      return {
        top: (
          <SingleTask
            task={chosen}
            intro="Let's start with this one"
            onDone={() => toggleTask(chosen.id)}
            secondaryLabel="Pick a different task"
            onSecondary={() => {
              logEvent(user?.uid ?? null, 'task_passed_over', { taskId: chosen.id, mode });
              setChosenId(null);
              setChoosing(true);
            }}
          />
        ),
        rest: null,
      };
    }

    // Low mode: the recommender may surface a heavy task before its due date
    if (mode === 'Low' && rec) {
      return {
        top: declined ? (
          <>
            <Text style={styles.calmText}>That's okay. It will be here when you're ready.</Text>
            <Pressable onPress={() => setDeclined(false)}>
              <Text style={styles.linkText}>Show it again</Text>
            </Pressable>
          </>
        ) : (
          <SingleTask
            task={rec.task}
            intro={rec.reason}
            onDone={() => toggleTask(rec.task.id)}
            secondaryLabel="Not now"
            onSecondary={() => setDeclined(true)}
          />
        ),
        rest: null,
      };
    }

    switch (view.kind) {
      case 'empty':
        return {
          top: (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{view.allDone ? 'All done for now' : 'No tasks yet'}</Text>
              <Text style={styles.cardMeta}>
                {view.allDone ? 'Add another whenever you\'re ready.' : 'Want to add one?'}
              </Text>
              <Pressable style={styles.primaryButton} onPress={() => router.push('/add-task')}>
                <Text style={styles.primaryButtonText}>Add a task</Text>
              </Pressable>
            </View>
          ),
          rest: null,
        };
      case 'all':
        return { top: null, rest: <TaskList tasks={view.tasks} onPressTask={t => toggleTask(t.id)} /> };
      case 'due-soon':
        return {
          top: rec ? (
            <Pressable
              style={styles.recBanner}
              onPress={() => {
                logEvent(user?.uid ?? null, 'recommendation_accepted', { taskId: rec.task.id, path: rec.path, mode, timeFit: rec.timeFit });
                setChosenId(rec.task.id);
              }}
            >
              <Text style={styles.recLabel}>Suggested start</Text>
              <Text style={styles.recTitle}>{rec.task.title}</Text>
              <Text style={styles.recReason}>{rec.reason}</Text>
            </Pressable>
          ) : null,
          rest: (
            <>
              <Text style={styles.sectionTitle}>Coming up</Text>
              <Text style={styles.sectionHint}>
                Due in the next {MEDIUM_WINDOW_DAYS} days. Starting early leaves you room to breathe.
              </Text>
              <TaskList tasks={view.tasks} onPressTask={t => toggleTask(t.id)} />
            </>
          ),
        };
      case 'single': {
        const t = rec?.task ?? view.task;
        return {
          top: (
            <SingleTask
              task={t}
              intro={rec?.reason ?? "Here's one thing to start with"}
              onDone={() => toggleTask(t.id)}
            />
          ),
          rest: null,
        };
      }
      case 'nothing-urgent':
        if (choosing) {
          return {
            top: null,
            rest: (
              <>
                <Text style={styles.sectionTitle}>Pick a task</Text>
                <TaskList
                  tasks={view.available}
                  showCheckbox={false}
                  onPressTask={t => { setChosenId(t.id); setChoosing(false); }}
                />
                <Pressable onPress={() => setChoosing(false)}>
                  <Text style={styles.linkText}>Back</Text>
                </Pressable>
              </>
            ),
          };
        }
        if (mode === 'Low' && declined) {
          return {
            top: (
              <>
                <Text style={styles.calmText}>That's okay. Nothing needs you right now.</Text>
                <Pressable onPress={() => { setDeclined(false); setChoosing(true); }}>
                  <Text style={styles.linkText}>Actually, choose a task</Text>
                </Pressable>
              </>
            ),
            rest: null,
          };
        }
        return {
          top: (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                {mode === 'Low' ? 'Nothing urgent today' : 'Nothing urgent right now'}
              </Text>
              <Text style={styles.cardMeta}>
                {mode === 'Low'
                  ? 'Want to do something small anyway? No pressure either way.'
                  : 'Want to get ahead on something?'}
              </Text>
              <Pressable style={styles.primaryButton} onPress={() => setChoosing(true)}>
                <Text style={styles.primaryButtonText}>Choose a task</Text>
              </Pressable>
              {mode === 'Low' && (
                <Pressable style={styles.secondaryButton} onPress={() => setDeclined(true)}>
                  <Text style={styles.secondaryButtonText}>Not now</Text>
                </Pressable>
              )}
            </View>
          ),
          rest: null,
        };
      default:
        return { top: null, rest: null };
    }
  };

  const { top, rest } = renderContent();

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.header}>Home</Text>
        <Text style={styles.modeLine}>{mode} mode</Text>

        {top}
        {mode !== 'Recovery' && <HabitsToday lowMode={mode === 'Low'} />}
        {rest}

        {doneToday.length > 0 && (
          <View style={styles.doneSection}>
            <Pressable onPress={() => setShowDone(prev => !prev)}>
              <Text style={styles.linkText}>
                {showDone ? 'Hide' : 'Show'} done today ({doneToday.length})
              </Text>
            </Pressable>
            {showDone && <TaskList tasks={doneToday} onPressTask={t => toggleTask(t.id)} />}
          </View>
        )}
      </ScrollView>

      <Pressable style={styles.fab} onPress={() => router.push('/add-task')}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 60, paddingBottom: 120 },
  header: { fontSize: 24, fontWeight: 'bold', color: '#111' },
  modeLine: { fontSize: 14, color: '#888', marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 4, color: '#111' },
  sectionHint: { fontSize: 14, color: '#666', marginBottom: 12 },
  taskBlock: { borderBottomWidth: 1, borderBottomColor: '#eee' },
  row: { flexDirection: 'row', alignItems: 'center' },
  chevronBtn: { width: 32, height: 40, alignItems: 'center', justifyContent: 'center' },
  chevron: { width: 9, height: 9, borderRightWidth: 2, borderBottomWidth: 2, borderColor: '#888' },
  chevronClosed: { transform: [{ rotate: '-45deg' }] },
  chevronOpen: { transform: [{ rotate: '45deg' }] },
  stepsPanel: { paddingLeft: 36, paddingRight: 8, paddingBottom: 12 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  subRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  rowText: { flex: 1 },
  checkbox: { width: 24, height: 24, borderWidth: 2, borderColor: '#888', borderRadius: 6, marginRight: 12, justifyContent: 'center', alignItems: 'center' },
  checkboxChecked: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  checkmark: { color: 'white', fontWeight: 'bold' },
  taskText: { fontSize: 18, color: '#111' },
  meta: { fontSize: 12, color: '#888', marginTop: 2 },
  urgent: { color: '#1F5FA8', fontWeight: '700' },
  card: { backgroundColor: 'white', borderRadius: 16, padding: 24, marginTop: 20, elevation: 2 },
  cardIntro: { fontSize: 14, color: '#666', marginBottom: 8 },
  cardTitle: { fontSize: 26, fontWeight: '600', marginBottom: 8, color: '#111' },
  cardMeta: { fontSize: 14, color: '#888', marginBottom: 24 },
  primaryButton: { backgroundColor: '#4A90D9', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  primaryButtonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  secondaryButton: { backgroundColor: '#f0f0f0', borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 10 },
  secondaryButtonText: { fontSize: 16, color: '#111' },
  linkText: { color: '#4A90D9', textAlign: 'center', marginTop: 16, fontSize: 15 },
  calmText: { fontSize: 16, color: '#666', textAlign: 'center', marginTop: 40 },
  fab: { position: 'absolute', bottom: 30, right: 30, width: 56, height: 56, borderRadius: 28, backgroundColor: '#4A90D9', justifyContent: 'center', alignItems: 'center', elevation: 4 },
  fabText: { color: 'white', fontSize: 28, lineHeight: 30 },
  doneSection: { paddingBottom: 20 },
  recBanner: { backgroundColor: '#e3eefa', borderRadius: 12, padding: 16, marginBottom: 4 },
  recLabel: { fontSize: 12, color: '#1F5FA8', fontWeight: '700', marginBottom: 4 },
  recTitle: { fontSize: 18, fontWeight: '600', color: '#111' },
  recReason: { fontSize: 13, color: '#44566b', marginTop: 4 },
});
