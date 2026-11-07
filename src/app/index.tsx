import { useState, useEffect, useMemo} from 'react';
import {ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import { useRouter } from 'expo-router';
import { useTasks, Task, Priority, ESSENTIAL_TAGS} from '../context/task-context';
import { useMode } from '../context/mode-context';
import {getDoneToday, getModeView, deadlineLabel, daysUntil, MEDIUM_WINDOW_DAYS } from '../utils/mode-view';
import RecoveryView from '../components/recovery-view';
import { useAuth } from '../context/auth-context';
import { logEvent } from '../utils/log-event';
import { breakDownTask } from '../utils/task-breakdown';
import { useEvents } from '../utils/use-events';
import { startOfDay } from '../utils/analytics-summary';
import { computeFrictionMap, recommendTask } from '../utils/recommend-task';

// Neutral blues/grey: traffic-light colours are reserved for the mood picker
const PRIORITY_COLORS: Record<Priority, string> = {
  High: '#1F5FA8',
  Medium: '#4A90D9',
  Low: '#999',
};

function TaskRow({ task, onPress, showCheckbox }: { task: Task; onPress: () => void; showCheckbox: boolean }) {
  const router = useRouter();
  const label = deadlineLabel(task.deadline) ?? task.deadline;
  const days = daysUntil(task.deadline);
  const urgent = days !== null && days <= 1;
  

  return (
       <Pressable style={styles.row} onPress={onPress} onLongPress={() => router.push({ pathname: '/add-task', params: { id: task.id } })} >
      {showCheckbox && (
        <View style={[styles.checkbox, task.completed && styles.checkboxChecked]}>
          {task.completed && <Text style={styles.checkmark}>✓</Text>}
        </View>
      )}
      <View style={styles.rowText}>
        <Text style={styles.taskText}>
          {task.important ? '★ ' : ''}
          {task.title}
        </Text>
        <Text style={styles.meta}>
          <Text style={{ color: PRIORITY_COLORS[task.priority], fontWeight: '600' }}>{task.priority}</Text>
          {task.tag ? `  ·  ${task.tag}` : ''}
          {label ? '  ·  ' : ''}
          {label ? <Text style={urgent && styles.urgent}>{label}</Text> : null}
        </Text>
      </View>
    </Pressable>
  );
}

function SingleTask({ task, intro, onDone, secondaryLabel, onSecondary }: {
  task: Task; intro: string; onDone: () => void;
  secondaryLabel?: string; onSecondary?: () => void;
}) {
  const { updateTask } = useTasks();
  const { mode } = useMode();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const label = deadlineLabel(task.deadline) ?? task.deadline;
  const subtasks = task.subtasks ?? [];

  const handleBreakDown = async () => {
    setLoading(true);
    const result = await breakDownTask(task, mode);
    updateTask(task.id, { subtasks: result.subtasks, friction: result.friction, stakes: result.stakes });
    logEvent(user?.uid ?? null, 'task_broken_down', {
      taskId: task.id, source: result.source, count: result.subtasks.length, mode,
    });
    setLoading(false);
  };

  const toggleSub = (sid: string) =>
    updateTask(task.id, {
      subtasks: subtasks.map(s => (s.id === sid ? { ...s, done: !s.done } : s)),
    });

  const nextId = subtasks.find(s => !s.done)?.id;

  return (
    <View style={styles.card}>
      <Text style={styles.cardIntro}>{intro}</Text>
      <Text style={styles.cardTitle}>{task.title}</Text>
      <Text style={styles.cardMeta}>{[task.tag, label].filter(Boolean).join(' · ')}</Text>

      {subtasks.length === 0 ? (
        <Pressable style={styles.secondaryButton} onPress={handleBreakDown} disabled={loading}>
          {loading ? <ActivityIndicator /> : <Text style={styles.secondaryButtonText}>Break it into small steps</Text>}
        </Pressable>
      ) : (
        <View style={{ marginBottom: 16 }}>
          {subtasks.map(s => (
            <Pressable key={s.id} style={styles.row} onPress={() => toggleSub(s.id)}>
              <View style={[styles.checkbox, s.done && styles.checkboxChecked]}>
                {s.done && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={[styles.taskText, s.id === nextId && { fontWeight: '700' }, s.done && { opacity: 0.4 }]}>
                {s.title}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

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

  const view = getModeView(tasks, mode);
  const doneToday = getDoneToday(tasks);
  const chosen = chosenId ? tasks.find(t => t.id === chosenId && !t.completed) : undefined;
  const events = useEvents(startOfDay(-14));
  const friction = useMemo(() => computeFrictionMap(tasks, events), [tasks, events]);
  const rec = useMemo(() => recommendTask(tasks, mode, friction), [tasks, mode, friction]);

  const essentials =
  mode === 'Low'
    ? tasks.filter(t =>
        !t.completed && t.habitId && t.tag && ESSENTIAL_TAGS.includes(t.tag) &&
        t.id !== rec?.task.id && t.id !== chosenId)
    : [];

  useEffect(() => {
    if (rec) logEvent(user?.uid ?? null, 'recommendation_shown', { taskId: rec.task.id, path: rec.path, mode });
  }, [rec?.task.id, mode]);

  const renderContent = () => {

  if (mode === 'Recovery') {
    const openTasks = tasks.filter(t => !t.completed);
    return (
      <>
        <RecoveryView onFeelingBetter={() => setMode('Low')} />
        <Pressable onPress={() => setShowTasks(prev => !prev)}>
          <Text style={styles.linkText}>{showTasks ? 'Hide my tasks' : 'Look at my tasks'}</Text>
        </Pressable>
        {showTasks && (
          <FlatList
            data={openTasks}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <TaskRow task={item} showCheckbox onPress={() => toggleTask(item.id)}  />
            
            )}
          />
        )}
      </>
    );
  }   
    // A task the user picked from the "nothing urgent" list
    if (mode !== 'High' && chosen) {
      return (
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
      );
    }

    // Low mode: the recommender may surface a heavy task before its due date
    if (mode === 'Low' && rec) {
      if (declined) {
        return (
          <>
            <Text style={styles.calmText}>That's okay. It will be here when you're ready.</Text>
            <Pressable onPress={() => setDeclined(false)}>
              <Text style={styles.linkText}>Show it again</Text>
            </Pressable>
          </>
        );
      }
      return (
        <SingleTask
          task={rec.task}
          intro={rec.reason}
          onDone={() => toggleTask(rec.task.id)}
          secondaryLabel="Not now"
          onSecondary={() => setDeclined(true)}
        />
      );
    }

    switch (view.kind) {
      case 'empty':
        return (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{view.allDone ? 'All done for now' : 'No tasks yet'}</Text>
            <Text style={styles.cardMeta}>
              {view.allDone ? 'Add another whenever you\'re ready.' : 'Want to add one?'}
            </Text>
            <Pressable style={styles.primaryButton} onPress={() => router.push('/add-task')}>
              <Text style={styles.primaryButtonText}>Add a task</Text>
            </Pressable>
          </View>
        );

            case 'all':
        return (
          <FlatList
            data={view.tasks}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <TaskRow task={item} showCheckbox onPress={() => toggleTask(item.id)} />
            )}
          />
        );

      case 'due-soon':
        return (
          <>
          {rec && (
              <Pressable
                style={styles.recBanner}
                onPress={() => {
                  logEvent(user?.uid ?? null, 'recommendation_accepted', { taskId: rec.task.id, path: rec.path, mode });
                  setChosenId(rec.task.id);
                }}
              >
                <Text style={styles.recLabel}>Suggested start</Text>
                <Text style={styles.recTitle}>{rec.task.title}</Text>
                <Text style={styles.recReason}>{rec.reason}</Text>
              </Pressable>
            )}
            <Text style={styles.sectionTitle}>Coming up</Text>
            <Text style={styles.sectionHint}>
              Due in the next {MEDIUM_WINDOW_DAYS} days. Starting early leaves you room to breathe.
            </Text>
            <FlatList
              data={view.tasks}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TaskRow task={item} showCheckbox onPress={() => toggleTask(item.id)} />
              )}
            />
          </>
        );

      case 'single': {
        const t = rec?.task ?? view.task;
        return (
          <SingleTask
            task={t}
            intro={rec?.reason ?? "Here's one thing to start with"}
            onDone={() => toggleTask(t.id)}
          />
        );
      }

      case 'nothing-urgent':
        if (choosing) {
          return (
            <>
              <Text style={styles.sectionTitle}>Pick a task</Text>
              <FlatList
                data={view.available}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                  <TaskRow
                    task={item}
                    showCheckbox={false}
                    onPress={() => {
                      setChosenId(item.id);
                      setChoosing(false);
                    }}
                  />
                )}
              />
              <Pressable onPress={() => setChoosing(false)}>
                <Text style={styles.linkText}>Back</Text>
              </Pressable>
            </>
          );
        }

        if (mode === 'Low' && declined) {
          return (
            <>
              <Text style={styles.calmText}>That's okay. Nothing needs you right now.</Text>
              <Pressable onPress={() => { setDeclined(false); setChoosing(true); }}>
                <Text style={styles.linkText}>Actually, choose a task</Text>
              </Pressable>
            </>
          );
        }

        return (
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
        );

      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Home</Text>
      <Text style={styles.modeLine}>{mode} mode</Text>

      {essentials.length > 0 && (
        <View style={styles.essentials}>
          <Text style={styles.essentialsLabel}>Daily essentials</Text>
          {essentials.map(t => (
            <TaskRow key={t.id} task={t} showCheckbox onPress={() => toggleTask(t.id)} />
          ))}
        </View>
      )}

      {renderContent()}
      

      {doneToday.length > 0 && (
        <View style={styles.doneSection}>
          <Pressable onPress={() => setShowDone(prev => !prev)}>
            <Text style={styles.linkText}>
              {showDone ? 'Hide' : 'Show'} done today ({doneToday.length})
            </Text>
          </Pressable>
          {showDone && (
            <ScrollView style={styles.doneList}>
              {doneToday.map(item => (
                <TaskRow key={item.id} task={item} showCheckbox onPress={() => toggleTask(item.id)} />
              ))}
            </ScrollView>
          )}
        </View>
      )}

      <Pressable style={styles.fab} onPress={() => router.push('/add-task')}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 60 },
  header: { fontSize: 24, fontWeight: 'bold' },
  modeLine: { fontSize: 14, color: '#888', marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 4 },
  sectionHint: { fontSize: 14, color: '#666', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  rowText: { flex: 1 },
  checkbox: { width: 24, height: 24, borderWidth: 2, borderColor: '#888', borderRadius: 6, marginRight: 12, justifyContent: 'center', alignItems: 'center' },
  checkboxChecked: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  checkmark: { color: 'white', fontWeight: 'bold' },
  taskText: { fontSize: 18 },
  meta: { fontSize: 12, color: '#888', marginTop: 2 },
  urgent: { color: '#1F5FA8', fontWeight: '700' },
  card: { backgroundColor: 'white', borderRadius: 16, padding: 24, marginTop: 20, elevation: 2 },
  cardIntro: { fontSize: 14, color: '#666', marginBottom: 8 },
  cardTitle: { fontSize: 26, fontWeight: '600', marginBottom: 8 },
  cardMeta: { fontSize: 14, color: '#888', marginBottom: 24 },
  primaryButton: { backgroundColor: '#4A90D9', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  primaryButtonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  secondaryButton: { backgroundColor: '#f0f0f0', borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 10 },
  secondaryButtonText: { fontSize: 16 },
  linkText: { color: '#4A90D9', textAlign: 'center', marginTop: 16, fontSize: 15 },
  calmText: { fontSize: 16, color: '#666', textAlign: 'center', marginTop: 40 },
  fab: { position: 'absolute', bottom: 30, right: 30, width: 56, height: 56, borderRadius: 28, backgroundColor: '#4A90D9', justifyContent: 'center', alignItems: 'center', elevation: 4 },
  fabText: { color: 'white', fontSize: 28, lineHeight: 30 },
  doneSection: { paddingBottom: 60 },
  doneList: { maxHeight: 220 }, 
  recBanner: { backgroundColor: '#e3eefa', borderRadius: 12, padding: 16, marginBottom: 16 },
  recLabel: { fontSize: 12, color: '#1F5FA8', fontWeight: '700', marginBottom: 4 },
  recTitle: { fontSize: 18, fontWeight: '600' },
  recReason: { fontSize: 13, color: '#44566b', marginTop: 4 },
  essentials: { backgroundColor: '#e3eefa', borderRadius: 12, padding: 12, marginBottom: 12 },
essentialsLabel: { fontSize: 12, color: '#1F5FA8', fontWeight: '700', marginBottom: 4 },
});