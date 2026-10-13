import { Alert, type AlertButton, Platform } from 'react-native';

/**
 * Alert.alert with a browser fallback. React Native Web's Alert does nothing, so on
 * the web a confirmation uses window.confirm (OK = the first non-cancel button,
 * Cancel = the cancel button) and a plain message uses window.alert.
 */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }
  const text = message ? `${title}\n\n${message}` : title;
  const cancel = buttons?.find((b) => b.style === 'cancel');
  const action = buttons?.find((b) => b.style !== 'cancel');
  if (!action) {
    window.alert(text);
    cancel?.onPress?.();
    return;
  }
  if (!cancel && buttons?.length === 1) {
    window.alert(text);
    action.onPress?.();
    return;
  }
  if (window.confirm(text)) action.onPress?.();
  else cancel?.onPress?.();
}
