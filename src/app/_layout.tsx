import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { AuthProvider, useAuth } from '../context/auth-context';
import { TasksProvider } from '../context/task-context';
import { ModeProvider } from '../context/mode-context';
import AuthScreen from '../components/auth-screen';

function AppTabs() {
  const { user, loading } = useAuth();

  return (
    <View style={{ flex: 1 }}>
      <Tabs>
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="focus" options={{ title: 'Focus' }} />
        <Tabs.Screen name="mode-switch" options={{ title: 'Mode' }} />
        <Tabs.Screen name="analytics" options={{ title: 'Analytics' }} />
        <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
        <Tabs.Screen name="add-task" options={{ href: null }} />
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
        <ModeProvider>
          <AppTabs />
        </ModeProvider>
      </TasksProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loading: {backgroundColor: '#f5f5f5', justifyContent: 'center', alignItems: 'center' },
});