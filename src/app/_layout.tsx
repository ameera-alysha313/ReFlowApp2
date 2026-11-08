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
import Onboarding from '../components/onboarding';

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
      <Tabs screenOptions={{ headerShown: false, tabBarLabelPosition: 'below-icon', tabBarLabelStyle: { fontSize: 11 } }}>
        <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon(require('../../assets/icons/home.png')) }} />
        <Tabs.Screen name="focus" options={{ title: 'Focus', tabBarIcon: tabIcon(require('../../assets/icons/focus.png')) }} />
        <Tabs.Screen name="mode-switch" options={{ title: 'Mode', tabBarIcon: tabIcon(require('../../assets/icons/mode.png')) }} />
        <Tabs.Screen name="analytics" options={{ title: 'Analytics', tabBarIcon: tabIcon(require('../../assets/icons/analytics.png')) }} />
        <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: tabIcon(require('../../assets/icons/settings.png')) }} />
        <Tabs.Screen name="add-task" options={{ href: null }} />
        <Tabs.Screen name="history" options={{ href: null }} />
        <Tabs.Screen name="habits" options={{ href: null }} />
        <Tabs.Screen name="tags" options={{ href: null }} />
      </Tabs>
      {loading && (
        <View style={[StyleSheet.absoluteFill, styles.loading]}>
          <ActivityIndicator size="large" />
        </View>
      )}
      {!loading && !user && (
        <View style={StyleSheet.absoluteFill}>
          <AuthScreen />
        </View>
      )}
      {!loading && user && <Onboarding />}
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
  loading: { backgroundColor: '#f5f5f5', justifyContent: 'center', alignItems: 'center' },
});
