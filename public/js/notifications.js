function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function getPermissionState() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function requestAndSubscribe(reminderTime) {
  if (!pushSupported()) {
    throw new Error('Push notifications are not supported in this browser context. On iPhone, add this app to your Home Screen first, then open it from there.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.');
  }

  const reg = await navigator.serviceWorker.ready;
  const keyRes = await fetch('/api/vapid-public-key');
  if (!keyRes.ok) throw new Error('Could not reach the reminder server.');
  const { publicKey } = await keyRes.json();

  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const res = await fetch('/api/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription, reminderTime, timezone }),
  });
  if (!res.ok) throw new Error('Server rejected the subscription.');
  return true;
}

export async function updateReminderTime(reminderTime) {
  const reg = await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.getSubscription();
  if (!subscription) return false;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const res = await fetch('/api/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription, reminderTime, timezone }),
  });
  return res.ok;
}

export async function unsubscribe() {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.getSubscription();
  if (!subscription) return;
  await fetch('/api/unsubscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  await subscription.unsubscribe();
}
