import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { AppSettings } from '../types';

export interface SlideshowControlsState {
  active: boolean;
  total: number;
  currentIndex: number;
  currentName: string;
  paused: boolean;
  next: () => void;
  prev: () => void;
  togglePause: () => void;
}

interface BackgroundSlideshowProps {
  settings: AppSettings;
  onControlsReady?: (controls: SlideshowControlsState) => void;
}

function shuffleItems<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export const BackgroundSlideshow: React.FC<BackgroundSlideshowProps> = ({ settings, onControlsReady }) => {
  const [playlist, setPlaylist] = useState<{ id: string; name: string }[]>([]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  // Dual layer crossfade state
  const [layers, setLayers] = useState<[string, string]>(['/bg-crimson-fantasy.jpg', '']);
  const [activeLayer, setActiveLayer] = useState<0 | 1>(0);
  const currentUrlRef = useRef<string>('/bg-crimson-fantasy.jpg');

  const isFolderMode = settings.backgroundMode === 'folder' && Boolean(settings.backgroundFolderPath.trim());

  // Fetch folder playlist when folder mode or path/options change
  useEffect(() => {
    if (!isFolderMode) {
      setPlaylist([]);
      setIndex(0);
      return;
    }
    let cancelled = false;
    api
      .listBackgroundFolderImages()
      .then((res) => {
        if (cancelled) return;
        const ordered = settings.slideshowShuffle ? shuffleItems(res.items) : res.items;
        setPlaylist(ordered);
        setIndex(0);
      })
      .catch(() => {
        if (!cancelled) setPlaylist([]);
      });
    return () => {
      cancelled = true;
    };
  }, [
    isFolderMode,
    settings.backgroundFolderPath,
    settings.slideshowIncludeSubfolders,
    settings.slideshowShuffle,
  ]);

  const targetUrl = (() => {
    if (isFolderMode && playlist.length > 0) {
      const safeIdx = ((index % playlist.length) + playlist.length) % playlist.length;
      return `/api/settings/background/folder/image?file=${encodeURIComponent(playlist[safeIdx].id)}`;
    }
    if (settings.backgroundMode === 'custom' && settings.hasCustomBackground) {
      return `/api/settings/background/custom?v=${settings.customBackgroundVersion || 1}`;
    }
    return '/bg-crimson-fantasy.jpg';
  })();

  // Preload & smoothly crossfade to targetUrl
  useEffect(() => {
    if (!targetUrl || targetUrl === currentUrlRef.current) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      currentUrlRef.current = targetUrl;
      setActiveLayer((prevLayer) => {
        const nextLayer: 0 | 1 = prevLayer === 0 ? 1 : 0;
        setLayers((prevUrls) => {
          const copy: [string, string] = [...prevUrls];
          copy[nextLayer] = targetUrl;
          return copy;
        });
        return nextLayer;
      });
    };
    img.src = targetUrl;
    return () => {
      cancelled = true;
    };
  }, [targetUrl]);

  const nextSlide = useCallback(() => {
    setIndex((prev) => (playlist.length > 0 ? (prev + 1) % playlist.length : 0));
  }, [playlist.length]);

  const prevSlide = useCallback(() => {
    setIndex((prev) => (playlist.length > 0 ? (prev - 1 + playlist.length) % playlist.length : 0));
  }, [playlist.length]);

  const togglePause = useCallback(() => {
    setPaused((p) => !p);
  }, []);

  // Auto-advance timer
  useEffect(() => {
    if (!isFolderMode || playlist.length <= 1 || paused) return;
    const intervalMs = Math.max(3, settings.slideshowIntervalSeconds || 30) * 1000;
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % playlist.length);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [isFolderMode, playlist.length, paused, settings.slideshowIntervalSeconds]);

  // Publish live controls up to Layout topbar
  useEffect(() => {
    if (!onControlsReady) return;
    const safeIdx = playlist.length > 0 ? ((index % playlist.length) + playlist.length) % playlist.length : 0;
    onControlsReady({
      active: isFolderMode && playlist.length > 0,
      total: playlist.length,
      currentIndex: safeIdx,
      currentName: playlist[safeIdx]?.name || '',
      paused,
      next: nextSlide,
      prev: prevSlide,
      togglePause,
    });
  }, [onControlsReady, isFolderMode, playlist, index, paused, nextSlide, prevSlide, togglePause]);

  const isContain = settings.backgroundFit === 'contain';

  return (
    <>
      {layers.map((url, layerIdx) => {
        if (!url) return null;
        const visible = activeLayer === layerIdx;
        return (
          <React.Fragment key={layerIdx}>
            {/* Blurred ambient fill when using 'contain' so portrait images look seamless */}
            {isContain && (
              <div
                className="fixed inset-0 z-0 bg-cover bg-center pointer-events-none transition-opacity duration-[1200ms] ease-in-out"
                style={{
                  backgroundImage: `url("${url}")`,
                  opacity: visible ? settings.backgroundOpacity * 0.45 : 0,
                  filter: 'blur(26px)',
                  transform: 'scale(1.08)',
                }}
              />
            )}
            <div
              className={`fixed inset-0 z-0 bg-no-repeat bg-center pointer-events-none transition-opacity duration-[1200ms] ease-in-out ${
                isContain ? 'bg-contain' : 'bg-cover'
              }`}
              style={{
                backgroundImage: `url("${url}")`,
                opacity: visible ? settings.backgroundOpacity : 0,
                filter: `blur(${settings.backgroundBlur}px)`,
                transform: isContain ? 'none' : 'scale(1.03)',
              }}
            />
          </React.Fragment>
        );
      })}
      {/* Soft obsidian-crimson readability scrim */}
      <div
        className="fixed inset-0 z-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(110deg, rgba(11, 5, 7, 0.86) 0%, rgba(16, 6, 10, 0.58) 55%, rgba(28, 6, 14, 0.42) 100%)',
        }}
      />
    </>
  );
};

