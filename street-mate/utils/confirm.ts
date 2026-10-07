// Alert.alert is a silent no-op on react-native-web, so on the web this falls back to the
// browser's own confirm()/alert() dialogs. On Android/iOS it is the normal native Alert.

import { Alert, Platform } from 'react-native';

/** Two-button confirmation. `onConfirm` runs only if the person accepts. */
export function confirmAction(title: string, message: string, confirmLabel: string, cancelLabel: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: cancelLabel, style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

/** One-button notice. */
export function notify(title: string, message: string) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}
