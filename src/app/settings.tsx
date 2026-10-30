import { View, Text, StyleSheet, Button, Alert } from 'react-native';
import { useAuth } from '../context/auth-context';

export default function Settings() {
  const { user, isGuest, signOut } = useAuth();

  const handleLogout = () => {
    Alert.alert('Log out?', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Settings</Text>
      <Text style={styles.label}>Account</Text>
      <Text style={styles.value}>{isGuest ? 'Guest' : user?.email}</Text>
      <Button title="Log out" onPress={handleLogout} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 60 },
  header: { fontSize: 24, fontWeight: 'bold', marginBottom: 30 },
  label: { fontSize: 14, color: '#666', marginBottom: 4 },
  value: { fontSize: 18, marginBottom: 24 },
});