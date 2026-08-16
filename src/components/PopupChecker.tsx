'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import PopupModal from './PopupModal';

interface PopupData {
  type: 'winner' | 'loser';
  weekNumber: number;
  weekId: number;
  message: string;
  imageUrl: string | null;
  videoUrl: string | null;
}

export default function PopupChecker({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [popup, setPopup] = useState<PopupData | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!user) {
      setChecked(true);
      return;
    }

    const checkForPopups = async () => {
      try {
        const res = await fetch(`/api/check-popup?userId=${user.id}`);
        const data = await res.json();

        if (data.success && data.popup) {
          setPopup(data.popup);
        }
      } catch (err) {
        console.error('Popup check failed:', err);
      }
      setChecked(true);
    };

    checkForPopups();
  }, [user]);

  const handleDismiss = async () => {
    if (popup && user) {
      await fetch('/api/popup-seen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, weekId: popup.weekId }),
      });
    }
    setPopup(null);
  };

  // Don't render children until we've checked for popups
  // This prevents any flash of content before the modal
  if (!checked && user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <>
      {popup && (
        <PopupModal
          type={popup.type}
          weekNumber={popup.weekNumber}
          message={popup.message}
          imageUrl={popup.imageUrl}
          videoUrl={popup.videoUrl}
          onDismiss={handleDismiss}
        />
      )}
      {children}
    </>
  );
}
