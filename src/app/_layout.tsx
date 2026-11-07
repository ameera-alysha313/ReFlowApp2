import { View, ActivityIndicator, StyleSheet, ColorValue, Image, ImageSourcePropType } from 'react-native';
import { Tabs } from 'expo-router';
import { AuthProvider, useAuth } from '../context/auth-context';
import { TasksProvider } from '../context/task-context';
import { HabitsProvider } from '../context/habit-context';
import { ModeProvider } from '../context/mode-context';
import { ScheduleProvider } from '../context/schedule-context';
import AuthScreen from '../components/auth-screen';
import Reengagement from '../components/reengagement';
import EndOfDay from '../components/end-of-day';

const tabIcon = (source: ImageSourcePropType) =>
  ({ color, size }: { color: ColorValue; size: number }) => (
    <Image source={source} style={{ width: size, height: size, tintColor: color }} resizeMode="contain" />
  );

function AppTabs() {
  const { user, loading } = useAuth();
  return (
    <View style={{ flex: 1 }}>
      <Reengagement />
      <EndOfDay />
      <Tabs screenOptions={{ headerShown: false }}>
        <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon(require('../../assets/icons/home.png')) }} />
        <Tabs.Screen name="focus" options={{ title: 'Focus', tabBarIcon: tabIcon(require('../../assets/icons/focus.png')) }} />
        <Tabs.Screen name="mode-switch" options={{ title: 'Mode', tabBarIcon: tabIcon(require('../../assets/icons/mode.png')) }} />
        <Tabs.Screen name="analytics" options={{ title: 'Analytics', tabBarIcon: tabIcon(require('../../assets/icons/analytics.png')) }} />
        <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: tabIcon(require('../../assets/icons/settings.png')) }} />
        <Tabs.Screen name="add-task" options={{ href: null }} />
        <Tabs.Screen name="history" options={{ href: null }} />
        <Tabs.Screen name="habits" options={{ href: null }} />
      </Tabs>
      {loading && (
        <View style={styles.loading}>
          <ActivityIndicator size="large" />
        </View>
      )}
      {!loading && !user && <AuthScreen />}
    </View>
  );
}

export default function Layout() {
  return (
    <AuthProvider>
      <TasksProvider>
        <HabitsProvider>
          <ModeProvider>
            <ScheduleProvider>
              <AppTabs />
            </ScheduleProvider>
          </ModeProvider>
        </HabitsProvider>
      </TasksProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: '#f5f5f5', justifyContent: 'center', alignItems: 'center' },
});
