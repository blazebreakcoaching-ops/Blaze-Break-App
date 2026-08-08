import { secureApiFetch } from './secure-api';

// Converts a URL-safe base64 VAPID key into the Uint8Array format
// pushManager.subscribe() requires. Standard, documented conversion for the
// Web Push API — there's no built-in browser helper for this step.
const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

// Subscribes this browser to real push notifications and registers the
// subscription with the backend. Returns true on success, false if push
// isn't supported/configured/permitted — callers should treat false as
// "silently skip", not as an error worth surfacing loudly, since this is a
// nice-to-have layered on top of the app's core functionality.
export const subscribeToPushNotifications = async (): Promise<boolean> => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;

  try {
    const keyRes = await secureApiFetch('/api/push/vapid-public-key');
    const { publicKey, configured } = await keyRes.json();
    if (!configured || !publicKey) return false;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    await secureApiFetch('/api/push/subscribe', {
      method: 'POST',
      data: subscription.toJSON(),
    });
    return true;
  } catch (e) {
    console.warn('[push-notifications] subscribe skipped:', e);
    return false;
  }
};

// Reports the current recovery score so the scheduled server-side check has
// something real to look at — this is what lets the low-score/stale-checkin
// push actually fire later, without the app needing to be open at that moment.
export const reportPulseStatus = async (score: number): Promise<void> => {
  try {
    await secureApiFetch('/api/pulse/report', {
      method: 'POST',
      data: { score },
    });
  } catch (e) {
    // Non-fatal — this is a background signal, not something the user is waiting on.
  }
};
