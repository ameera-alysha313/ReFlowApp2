import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { useAuth, friendlyError } from '../context/auth-context';

export default function AuthScreen() {
  const { signIn, signUp, continueAsGuest } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (isSignUp) await signUp(email.trim(), password);
      else await signIn(email.trim(), password);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleGuest = async () => {
    setBusy(true);
    setError('');
    try {
      await continueAsGuest();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={styles.overlay}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>ReFlo</Text>
      <Text style={styles.subtitle}>{isSignUp ? 'Create your account' : 'Welcome back'}</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={[styles.primaryButton, busy && styles.disabled]} onPress={handleSubmit} disabled={busy}>
        {busy ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.primaryButtonText}>{isSignUp ? 'Sign up' : 'Log in'}</Text>
        )}
      </Pressable>

      <Pressable onPress={() => { setIsSignUp(!isSignUp); setError(''); }} disabled={busy}>
        <Text style={styles.link}>
          {isSignUp ? 'Already have an account? Log in' : 'No account yet? Sign up'}
        </Text>
      </Pressable>

      <Pressable onPress={handleGuest} disabled={busy}>
        <Text style={styles.guestLink}>Continue as guest</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  overlay: { backgroundColor: '#f5f5f5' },
  content: { flexGrow: 1, justifyContent: 'center', padding: 30 },
  title: { fontSize: 36, fontWeight: 'bold', textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 30 },
  input: { backgroundColor: 'white', borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, marginBottom: 14, fontSize: 16 },
  error: { color: '#c0392b', marginBottom: 12 },
  primaryButton: { backgroundColor: '#4A90D9', borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginBottom: 20 },
  primaryButtonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.6 },
  link: { color: '#4A90D9', textAlign: 'center', fontSize: 15, marginBottom: 16 },
  guestLink: { color: '#888', textAlign: 'center', fontSize: 14 },
});