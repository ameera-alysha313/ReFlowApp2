import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, Alert, AppState, FlatList,
  PanResponder, GestureResponderEvent,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useAuth } from '../context/auth-context';
import { logEvent } from '../utils/log-event';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useTasks } from '../context/task-context';

const STROKE_WIDTH = 14;
const RADIUS = 118;
const HANDLE_RADIUS = 14;
const HANDLE_STROKE = 4;
const RING_SIZE = 2 * (RADIUS + HANDLE_RADIUS + HANDLE_STROKE / 2);
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const CENTER = RING_SIZE / 2;
const HIT_BAND = 40;

const MINUTES_PER_LAP = 60;
const MIN_MINUTES = 5;
const MAX_MINUTES = 120;
const STEP_MINUTES = 5;

// ---- Break settings ----
const TEST_MODE = true; // set to false for real values
const EARN_SECONDS = TEST_MODE ? 10 : 20 * 60;
const REEARN_SECONDS = TEST_MODE ? 5 : 10 * 60;
const BREAK_SECONDS = TEST_MODE ? 15 : 5 * 60;
const GRACE_SECONDS = TEST_MODE ? 15 : 2 * 60;
const BACKGROUND_GRACE_SECONDS = TEST_MODE ? 10 : 5 * 60;

type Phase = 'idle' | 'focus' | 'break' | 'ready';
type Confirm = 'none' | 'break' | 'end' | 'switch';
type EndReason = 'completed' | 'manual' | 'grace_exceeded' | 'background_exceeded';

export default function Focus() {
  const [sessionMinutes, setSessionMinutes] = useState(25);
  const [secondsLeft, setSecondsLeft] = useState(sessionMinutes * 60);
  const [phase, setPhase] = useState<Phase>('idle');
  const [confirm, setConfirm] = useState<Confirm>('none');

  // Break state
  const [focusedSeconds, setFocusedSeconds] = useState(0);
  const [breakBanked, setBreakBanked] = useState(false);
  const [hasTakenBreak, setHasTakenBreak] = useState(false);
  const [breakLeft, setBreakLeft] = useState(BREAK_SECONDS);
  const [graceLeft, setGraceLeft] = useState(GRACE_SECONDS);
  
  const { user } = useAuth();
  const sessionIdRef = useRef<string | null>(null);
  const lastTickRef = useRef(Date.now());
  const bgAtRef = useRef<number | null>(null);
  const phaseRef = useRef<Phase>('idle');
  const endSessionRef = useRef<(reason: EndReason) => void>(() => {});
  
  const { tasks } = useTasks();
  const [taskId, setTaskId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const openTasks = tasks.filter(t => !t.completed);
  const currentTask = openTasks.find(t => t.id === taskId);

  // Drag bookkeeping
  const canDragRef = useRef(false);
  const sessionMinutesRef = useRef(sessionMinutes);
  const lapsRef = useRef(0);
  const lastPosRef = useRef(0);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // ---- One ticker for every phase ----
  // Counts real elapsed time instead of assuming 1 tick = 1 second, so the timer
  // stays correct when the browser throttles a background tab.
  useEffect(() => {
    if (phase === 'idle') return;
    let last = Date.now();
    const tick = () => {
      const now = Date.now();
      const whole = Math.floor((now - last) / 1000);
      if (whole < 1) return;
      last += whole * 1000;
      if (phase === 'focus') {
        setSecondsLeft(prev => Math.max(prev - whole, 0));
        setFocusedSeconds(prev => prev + whole);
      } else if (phase === 'break') {
        setBreakLeft(prev => Math.max(prev - whole, 0));
      } else if (phase === 'ready') {
        setGraceLeft(prev => Math.max(prev - whole, 0));
      }
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [phase]);


  // Background Grace Period
  useEffect(() => {
  const sub = AppState.addEventListener('change', state => {
    if (state === 'active') {
      const away = bgAtRef.current ? Date.now() - bgAtRef.current : 0;
      bgAtRef.current = null;
      if (phaseRef.current === 'focus' && away > BACKGROUND_GRACE_SECONDS * 1000) {
        endSessionRef.current('background_exceeded'); // silent, no popup
      }
    } else if (bgAtRef.current === null) {
      bgAtRef.current = Date.now();
    }
  });
  return () => sub.remove();
}, []);

// Keep the screen on while a session is running so you can see the time left
useEffect(() => {
  if (phase === 'idle') return;
  activateKeepAwakeAsync('focus');
  return () => { deactivateKeepAwake('focus'); };
}, [phase === 'idle']);

  // ---- Transitions ----
  useEffect(() => {
    if (phase === 'focus' && secondsLeft === 0) {
      endSession('completed');;
      Alert.alert('Session complete', 'Nice work. You finished the whole session.');
    }
  }, [phase, secondsLeft]);

  useEffect(() => {
    const threshold = hasTakenBreak ? REEARN_SECONDS : EARN_SECONDS;
    if (phase === 'focus' && !breakBanked && focusedSeconds >= threshold) {
      setBreakBanked(true);
    }
  }, [phase, focusedSeconds, breakBanked, hasTakenBreak]);

  useEffect(() => {
    if (phase === 'break' && breakLeft === 0) {
      setGraceLeft(GRACE_SECONDS);
      setPhase('ready');
    }
  }, [phase, breakLeft]);

  useEffect(() => {
    if (phase === 'ready' && graceLeft === 0) {
      const focusedMinutes = Math.floor((sessionMinutes * 60 - secondsLeft) / 60);
      endSession('grace_exceeded');;
      Alert.alert(
        'Session ended',
        `No worries. You focused for ${focusedMinutes} minute${focusedMinutes === 1 ? '' : 's'}. Start again whenever you're ready.`
      );
    }
  }, [phase, graceLeft]);

  // ---- Helpers ----
  const resetSession = () => {
    setPhase('idle');
    setConfirm('none');
    setSecondsLeft(sessionMinutes * 60);
    setFocusedSeconds(0);
    setBreakBanked(false);
    setHasTakenBreak(false);
    setBreakLeft(BREAK_SECONDS);
    setGraceLeft(GRACE_SECONDS);
  };


  const endSession = (reason: EndReason) => {
    logEvent(user?.uid ?? null, 'focus_ended', {
      sessionId: sessionIdRef.current,
      reason,
      plannedMinutes: sessionMinutes,
      focusedSeconds: sessionMinutes * 60 - secondsLeft,
      taskId: currentTask?.id ?? null,
    });
    resetSession();
  };

  const formatTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const setLength = (minutes: number) => {
    setSessionMinutes(minutes);
    setSecondsLeft(minutes * 60);
  };

  const adjustLength = (delta: number) => {
    setLength(Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, sessionMinutes + delta)));
  };

  // ---- Drag handling ----
  const positionFromTouch = (x: number, y: number) => {
    const dx = x - CENTER;
    const dy = y - CENTER;
    let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    return (deg / 360) * MINUTES_PER_LAP;
  };

  const distanceFromCenter = (x: number, y: number) =>
    Math.hypot(x - CENTER, y - CENTER);

  const updateFromTouch = (x: number, y: number) => {
    const pos = positionFromTouch(x, y);
    const delta = pos - lastPosRef.current;

    if (delta > MINUTES_PER_LAP / 2) lapsRef.current -= 1;
    else if (delta < -MINUTES_PER_LAP / 2) lapsRef.current += 1;
    lastPosRef.current = pos;

    const raw = lapsRef.current * MINUTES_PER_LAP + pos;
    const snapped = Math.round(raw / STEP_MINUTES) * STEP_MINUTES;
    const clamped = Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, snapped));
    setLength(clamped);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (e: GestureResponderEvent) => {
        if (!canDragRef.current) return false;
        const { locationX, locationY } = e.nativeEvent;
        return Math.abs(distanceFromCenter(locationX, locationY) - RADIUS) <= HIT_BAND;
      },
      onMoveShouldSetPanResponder: () => false,
      onPanResponderTerminationRequest: () => false,

      onPanResponderGrant: (e: GestureResponderEvent) => {
        const { locationX, locationY } = e.nativeEvent;
        dragStartRef.current = { x: locationX, y: locationY };

        const pos = positionFromTouch(locationX, locationY);
        lapsRef.current = Math.round((sessionMinutesRef.current - pos) / MINUTES_PER_LAP);
        lastPosRef.current = pos;
        updateFromTouch(locationX, locationY);
      },

      onPanResponderMove: (_e, g) => {
        updateFromTouch(dragStartRef.current.x + g.dx, dragStartRef.current.y + g.dy);
      },
    })
  ).current;

  // ---- Actions ----
  const handleStart = () => {
    sessionIdRef.current = String(Date.now());
    logEvent(user?.uid ?? null, 'focus_started', {
      sessionId: sessionIdRef.current,
      plannedMinutes: sessionMinutes,
      taskId: currentTask?.id ?? null,
    });
    setPhase('focus');
  };

  const startBreak = () => {
    setBreakBanked(false);
    setFocusedSeconds(0);
    setHasTakenBreak(true);
    setBreakLeft(BREAK_SECONDS);
    setPhase('break');
  };

  const backToWork = () => setPhase('focus');

  
  const chooseTask = (id: string) => {
    if (phase !== 'idle' && id !== taskId) {
      logEvent(user?.uid ?? null, 'focus_task_switched', {
        sessionId: sessionIdRef.current, from: taskId, to: id,
      });
    }
    setTaskId(id);
    setPickerOpen(false);
  };
  

  const confirmCopy: Record<Exclude<Confirm, 'none'>, string> = {
    break: 'Take a break now?',
    end: 'End the session early?',
    switch: 'Switch task?',
  };

  const handleConfirmYes = () => {
    const action = confirm;
    setConfirm('none');
    if (action === 'break') startBreak();
    else if (action === 'end') endSession('manual');
    else if (action === 'switch') setTimeout(() => setPickerOpen(true), 250);
  };

  // ---- Derived display values ----
  const isAtDefault = secondsLeft === sessionMinutes * 60;
  const canDrag = phase === 'idle' && isAtDefault;
  canDragRef.current = canDrag;
  phaseRef.current = phase;
  endSessionRef.current = endSession;
  sessionMinutesRef.current = sessionMinutes;

  const onBreak = phase === 'break';
  const perLapSeconds = onBreak ? BREAK_SECONDS : MINUTES_PER_LAP * 60;
  const ringSeconds = onBreak ? breakLeft : secondsLeft;
  const firstLapProgress = Math.min(ringSeconds, perLapSeconds) / perLapSeconds;
  const secondLapProgress = Math.max(ringSeconds - perLapSeconds, 0) / perLapSeconds;
  const firstLapOffset = CIRCUMFERENCE * (1 - firstLapProgress);
  const secondLapOffset = CIRCUMFERENCE * (1 - secondLapProgress);
  const ringColor = onBreak ? '#7BC8A4' : phase === 'ready' ? '#9bbfe6' : '#4A90D9';
  const centerText = formatTime(onBreak ? breakLeft : secondsLeft);

  const minutesLeft = secondsLeft / 60;
  const handleAngle = ((minutesLeft % MINUTES_PER_LAP) / MINUTES_PER_LAP) * 2 * Math.PI;
  const handleX = CENTER + RADIUS * Math.sin(handleAngle);
  const handleY = CENTER - RADIUS * Math.cos(handleAngle);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Focus Mode</Text>

      {/* Label slot */}
      {phase === 'break' && <Text style={styles.taskName}>On a break</Text>}
      {phase === 'ready' && <Text style={styles.taskName}>Break over! Ready?</Text>}
      {(phase === 'idle' || phase === 'focus') && (
        <View style={styles.taskRow}>
          <Text style={styles.taskName}>{currentTask ? currentTask.title : 'Pick a task'}</Text>
          <Pressable
            onPress={() => (phase === 'idle' ? setPickerOpen(true) : setConfirm('switch'))}
            hitSlop={12}
            style={styles.switchButton}
          >
            <Text style={styles.switchButtonText}>{currentTask ? 'Switch' : 'Pick'}</Text>
          </Pressable>
        </View>
      )}

      {/* Ring slot */}
      <View style={styles.ringWrapper} {...panResponder.panHandlers}>
        <Svg width={RING_SIZE} height={RING_SIZE} pointerEvents="none">
          <Circle
            cx={CENTER} cy={CENTER} r={RADIUS}
            stroke="#e0e0e0" strokeWidth={STROKE_WIDTH} fill="none"
          />
          <Circle
            cx={CENTER} cy={CENTER} r={RADIUS}
            stroke={ringColor} strokeWidth={STROKE_WIDTH} fill="none"
            strokeDasharray={CIRCUMFERENCE} strokeDashoffset={firstLapOffset}
            strokeLinecap="round" transform={`rotate(-90 ${CENTER} ${CENTER})`}
          />
          {secondLapProgress > 0 && (
            <Circle
              cx={CENTER} cy={CENTER} r={RADIUS}
              stroke="#2C5F94" strokeWidth={STROKE_WIDTH} fill="none"
              strokeDasharray={CIRCUMFERENCE} strokeDashoffset={secondLapOffset}
              strokeLinecap="round" transform={`rotate(-90 ${CENTER} ${CENTER})`}
            />
          )}
          {canDrag && (
            <Circle
              cx={handleX} cy={handleY} r={HANDLE_RADIUS}
              fill="white" stroke="#4A90D9" strokeWidth={HANDLE_STROKE}
            />
          )}
        </Svg>
        <Text style={styles.timer} pointerEvents="none">{centerText}</Text>
      </View>

      {/* Duration adjust (only before starting) */}
      {canDrag && (
        <View style={styles.adjustRow}>
          <Pressable
            style={styles.adjustButton}
            onPress={() => adjustLength(-STEP_MINUTES)}
            disabled={sessionMinutes <= MIN_MINUTES}
          >
            <Text style={styles.adjustButtonText}>−</Text>
          </Pressable>
          <Text style={styles.adjustLabel}>{sessionMinutes} min</Text>
          <Pressable
            style={styles.adjustButton}
            onPress={() => adjustLength(STEP_MINUTES)}
            disabled={sessionMinutes >= MAX_MINUTES}
          >
            <Text style={styles.adjustButtonText}>+</Text>
          </Pressable>
        </View>
      )}

      {/* Button slot */}
      <View style={styles.buttons}>
        {phase === 'idle' && (
          <Pressable style={[styles.actionButton, styles.primary]} onPress={handleStart}>
            <Text style={styles.primaryText}>Start</Text>
          </Pressable>
        )}

        {phase === 'focus' && (
          <>
            <Pressable
              style={[styles.actionButton, breakBanked ? styles.breakReady : styles.disabled]}
              onPress={() => setConfirm('break')}
              disabled={!breakBanked}
            >
              <Text style={[styles.actionText, breakBanked && styles.breakReadyText]}>
                Take a break
              </Text>
            </Pressable>
            <Pressable
              style={[styles.actionButton, styles.primary]}
              onPress={() => setConfirm('end')}
            >
              <Text style={styles.primaryText}>End Session</Text>
            </Pressable>
          </>
        )}

        {phase === 'break' && (
          <Pressable style={[styles.actionButton, styles.primary]} onPress={backToWork}>
            <Text style={styles.primaryText}>Back to work</Text>
          </Pressable>
        )}

        {phase === 'ready' && (
          <Pressable style={[styles.actionButton, styles.primary]} onPress={backToWork}>
            <Text style={styles.primaryText}>Resume ({formatTime(graceLeft)})</Text>
          </Pressable>
        )}
      </View>

      {/* Small Yes/No confirmation. The timer keeps running behind it */}
      <Modal
        visible={confirm !== 'none'}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirm('none')}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>
              {confirm !== 'none' ? confirmCopy[confirm] : ''}
            </Text>
            <View style={styles.modalRow}>
              <Pressable style={[styles.modalButton, styles.modalNo]} onPress={() => setConfirm('none')}>
                <Text style={styles.modalButtonText}>No</Text>
              </Pressable>
              <Pressable style={[styles.modalButton, styles.modalYes]} onPress={handleConfirmYes}>
                <Text style={styles.modalYesText}>Yes</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    
      <Modal
        visible={pickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Pick a task</Text>
            {openTasks.length === 0 ? (
              <Text style={styles.pickerEmpty}>No open tasks. Add one from Home.</Text>
            ) : (
              <FlatList
                style={styles.pickerList}
                data={openTasks}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                  <Pressable
                    style={[styles.pickerRow, item.id === taskId && styles.pickerRowSelected]}
                    onPress={() => chooseTask(item.id)}
                  >
                    <Text style={styles.pickerTitle}>{item.title}</Text>
                    {item.tag ? <Text style={styles.pickerMeta}>{item.tag}</Text> : null}
                  </Pressable>
                )}
              />
            )}
            <Pressable
              style={[styles.modalButton, styles.modalNo, { marginRight: 0, marginTop: 12 }]}
              onPress={() => setPickerOpen(false)}
            >
              <Text style={styles.modalButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  header: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  taskRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  taskName: { fontSize: 22, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
  switchButton: { marginLeft: 12, marginBottom: 10, paddingVertical: 4, paddingHorizontal: 12,
  borderRadius: 14, backgroundColor: '#e3eefa' },
switchButtonText: { fontSize: 14, color: '#4A90D9', fontWeight: '600' },
  ringWrapper: { width: RING_SIZE, height: RING_SIZE, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  timer: { position: 'absolute', fontSize: 48, fontWeight: '200' },
  adjustRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  adjustButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f0f0f0',
    justifyContent: 'center', alignItems: 'center', marginHorizontal: 20 },
  adjustButtonText: { fontSize: 24, fontWeight: 'bold' },
  adjustLabel: { fontSize: 16, minWidth: 60, textAlign: 'center' },

  buttons: { width: '100%', alignItems: 'center' },
  actionButton: { width: '100%', paddingVertical: 14, borderRadius: 28,
    alignItems: 'center', marginBottom: 12 },
  actionText: { fontSize: 16, color: '#555' },
  primary: { backgroundColor: '#5B9BDB' },
  primaryText: { fontSize: 16, color: 'white', fontWeight: '600' },
  disabled: { backgroundColor: '#c9c9c9' },
  breakReady: { backgroundColor: '#e8f5e9' },
  breakReadyText: { color: '#2e7d32', fontWeight: '600' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.12)', justifyContent: 'flex-end',
    alignItems: 'center', paddingBottom: 100 },
  modalBox: { backgroundColor: 'white', borderRadius: 16, padding: 20, width: '85%',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 6 },
  modalTitle: { fontSize: 17, fontWeight: '600', textAlign: 'center', marginBottom: 16 },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  modalButton: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  modalNo: { backgroundColor: '#f0f0f0', marginRight: 8 },
  modalYes: { backgroundColor: '#5B9BDB', marginLeft: 8 },
  modalButtonText: { fontSize: 16 },
  modalYesText: { fontSize: 16, color: 'white', fontWeight: '600' },
  pickerList: { maxHeight: 280 },
pickerRow: { paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#eee' },
pickerRowSelected: { backgroundColor: '#e3eefa', borderRadius: 8 },
pickerTitle: { fontSize: 16 },
pickerMeta: { fontSize: 12, color: '#888', marginTop: 2 },
pickerEmpty: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 12 },
});