'use client';

import { useState } from 'react';

interface PopupModalProps {
  type: 'winner' | 'loser';
  weekNumber: number;
  message: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  onDismiss: () => void;
}

function getYouTubeEmbedUrl(url: string, autoplay: boolean = false): string | null {
  try {
    let id: string | null = null;

    if (url.includes('youtu.be/')) {
      id = url.split('youtu.be/')[1]?.split('?')[0] || null;
    } else if (url.includes('youtube.com')) {
      const match = url.match(/[?&]v=([^&]+)/);
      if (match) id = match[1];
      else if (url.includes('/embed/')) {
        id = url.split('/embed/')[1]?.split('?')[0] || null;
      }
    }

    if (!id) return null;
    return `https://www.youtube.com/embed/${id}${autoplay ? '?autoplay=1&rel=0' : '?rel=0'}`;
  } catch {
    return null;
  }
}

export default function PopupModal({ type, weekNumber, message, imageUrl, videoUrl, onDismiss }: PopupModalProps) {
  const [closing, setClosing] = useState(false);

  const handleDismiss = () => {
    setClosing(true);
    setTimeout(onDismiss, 300);
  };

  const embedUrl = videoUrl ? getYouTubeEmbedUrl(videoUrl, true) : null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center transition-opacity duration-300 ${
        closing ? 'opacity-0' : 'opacity-100'
      }`}
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.95)' }}
    >
      <div className="w-full h-full flex flex-col items-center justify-center overflow-y-auto p-4">
        <div
          className={`w-full max-w-lg rounded-2xl overflow-hidden transition-transform duration-300 ${
            closing ? 'scale-95' : 'scale-100'
          } ${
            type === 'winner'
              ? 'bg-gradient-to-b from-yellow-900/60 to-gray-900 border-2 border-yellow-600/50'
              : 'bg-gradient-to-b from-red-900/60 to-gray-900 border-2 border-red-600/50'
          }`}
        >
          {/* Header */}
          <div className="text-center pt-8 pb-2 px-6">
            <div className="text-6xl mb-3">
              {type === 'winner' ? '🏆' : '💀'}
            </div>
            <h2
              className={`text-3xl font-black tracking-tight ${
                type === 'winner' ? 'text-yellow-400' : 'text-red-400'
              }`}
            >
              {type === 'winner' ? 'WEEKLY WINNER!' : 'WEEKLY LOSER!'}
            </h2>
            <p className="text-gray-400 text-sm mt-1">Week {weekNumber}</p>
          </div>

          {/* Content */}
          <div className="px-6 pb-6 space-y-5 mt-4">
            {/* Message */}
            <p className="text-white text-center text-lg leading-relaxed font-medium">
              {message}
            </p>

            {/* Image */}
            {imageUrl && (
              <div className="rounded-xl overflow-hidden border border-gray-700">
                <img
                  src={imageUrl}
                  alt={type === 'winner' ? 'Winner celebration' : 'Loser roast'}
                  className="w-full object-contain max-h-72"
                />
              </div>
            )}

            {/* Video — full width, prominent */}
            {embedUrl && (
              <div className="rounded-xl overflow-hidden border border-gray-700 aspect-video">
                <iframe
                  src={embedUrl}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title={type === 'winner' ? 'Winner video' : 'Loser video'}
                />
              </div>
            )}

            {/* Dismiss button */}
            <button
              onClick={handleDismiss}
              className={`w-full py-4 rounded-xl font-bold text-base transition-colors ${
                type === 'winner'
                  ? 'bg-yellow-500 text-gray-900 hover:bg-yellow-400 active:bg-yellow-600'
                  : 'bg-red-600 text-white hover:bg-red-500 active:bg-red-700'
              }`}
            >
              {type === 'winner' ? 'Accept Your Crown 👑' : 'Accept Your Shame 😔'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
