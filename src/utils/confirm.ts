import { Alert, Platform } from 'react-native';

// One pop-up confirmation used for every delete in the app
export function confirmDelete(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    // Alert.alert doesn't work on web, so use the browser's confirm box there
    if (window.confirm(`${title}\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onConfirm },
  ]);
}

// Shown when someone tries to leave a form with unsaved changes
export function confirmDiscard(onDiscard: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm('Discard changes?\nYou have unsaved changes.')) onDiscard();
    return;
  }
  Alert.alert('Discard changes?', 'You have unsaved changes.', [
    { text: 'Keep editing', style: 'cancel' },
    { text: 'Discard', style: 'destructive', onPress: onDiscard },
  ]);
}