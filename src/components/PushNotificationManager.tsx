'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';

type Status = 'checking' | 'unsupported' | 'ios-needs-install' | 'denied' | 'subscribed' | 'unsubscribed';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function PushNotificationManager() {
  const { user } = useAuth();
  const [status, setStatus] = useState<Status>('checking');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const check = async () => {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true;

      if (isIOS && !isStandalone) {
        setStatus('ios-needs-install');
        return;
      }

      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setStatus('unsupported');
        return;
      }

      if (Notification.permission === 'denied') {
        setStatus('denied');
        return;
      }

      const registration = await navigator.serviceWorker.getRegistration();
      const existing = await registration?.pushManager.getSubscription();
      setStatus(existing ? 'subscribed' : 'unsubscribed');
    };

    check();
  }, []);

  const handleEnable = async () => {
    if (!user) return;
    setBusy(true);
    setError('');

    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) throw new Error('Push notifications are not configured');

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus('denied');
        setBusy(false);
        return;
      }

      const registration = await navigator.serviceWorker.register(
        new URL('../lib/service-worker.js', import.meta.url),
        { scope: '/' }
      );
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, subscription: subscription.toJSON() }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error || 'Failed to enable notifications');
        setBusy(false);
        return;
      }

      setStatus('subscribed');
    } catch {
      setError('Failed to enable notifications');
    }
    setBusy(false);
  };

  const handleDisable = async () => {
    setBusy(true);
    setError('');

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();

      if (subscription) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }

      setStatus('unsubscribed');
    } catch {
      setError('Failed to disable notifications');
    }
    setBusy(false);
  };

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
      <h2 className="text-sm font-semibold text-gray-400 mb-3">🔔 Notifications</h2>

      {status === 'checking' && <p className="text-sm text-gray-500">Checking...</p>}

      {status === 'unsupported' && (
        <p className="text-sm text-gray-500">
          Notifications aren&apos;t supported in this browser.
        </p>
      )}

      {status === 'ios-needs-install' && (
        <p className="text-sm text-gray-500">
          Install this app to your home screen first (tap Share → Add to Home Screen), then come back here to enable notifications.
        </p>
      )}

      {status === 'denied' && (
        <p className="text-sm text-gray-500">
          Notifications are blocked for this site in your browser settings. Enable them there to get pick reminders.
        </p>
      )}

      {status === 'unsubscribed' && (
        <>
          <p className="text-sm text-gray-400 mb-3">Get a reminder the day before picks lock if you haven&apos;t finished picking.</p>
          <button
            onClick={handleEnable}
            disabled={busy}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50"
          >
            {busy ? 'Enabling...' : 'Enable Notifications'}
          </button>
        </>
      )}

      {status === 'subscribed' && (
        <>
          <p className="text-sm text-green-400 mb-3">✓ Notifications enabled</p>
          <button
            onClick={handleDisable}
            disabled={busy}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm font-medium disabled:opacity-50"
          >
            {busy ? 'Disabling...' : 'Disable'}
          </button>
        </>
      )}

      {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
    </div>
  );
}
