'use client';

import { useEffect, useState } from 'react';

const DISMISS_KEY = 'cfb_install_hint_dismissed';

export default function InstallHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    const dismissed = localStorage.getItem(DISMISS_KEY) === 'true';

    if (isIOS && !isStandalone && !dismissed) {
      setVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, 'true');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-40 mx-auto max-w-sm rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 shadow-lg">
      <div className="flex items-start gap-3">
        <span className="text-xl">🏈</span>
        <div className="flex-1 text-sm text-gray-200">
          Install this app: tap <span className="font-semibold">Share</span>{' '}
          <span aria-hidden>⎋</span> then{' '}
          <span className="font-semibold">Add to Home Screen</span>.
        </div>
        <button
          onClick={handleDismiss}
          className="text-gray-500 hover:text-gray-300"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
