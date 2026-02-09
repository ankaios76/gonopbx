import React, { useRef, useState, useEffect } from 'react';
import './VoicemailPlayer.css';

interface Voicemail {
  id: number;
  mailbox: string;
  caller_id: string;
  duration: number;
  date: string;
  is_read: boolean;
  file_path: string;
}

interface VoicemailPlayerProps {
  voicemail: Voicemail;
  onDelete: () => void;
}

const VoicemailPlayer: React.FC<VoicemailPlayerProps> = ({ voicemail, onDelete }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDurationChange = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newTime = parseFloat(e.target.value);
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleSpeedChange = (speed: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.playbackRate = speed;
    setPlaybackRate(speed);
  };

  const skip = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + seconds));
  };

  const formatTime = (time: number): string => {
    if (isNaN(time)) return '0:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const audioUrl = `/api/voicemail/${voicemail.id}/audio`;

  return (
    <div className="voicemail-player" onClick={(e) => e.stopPropagation()}>
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      <div className="player-controls">
        <button
          className="control-btn skip-btn"
          onClick={() => skip(-10)}
          title="10 Sekunden zurück"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
          <span className="skip-label">10</span>
        </button>

        <button
          className="control-btn play-btn"
          onClick={togglePlay}
          title={isPlaying ? 'Pause' : 'Abspielen'}
        >
          {isPlaying ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <button
          className="control-btn skip-btn"
          onClick={() => skip(10)}
          title="10 Sekunden vor"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
          <span className="skip-label">10</span>
        </button>
      </div>

      <div className="player-timeline">
        <span className="time-label">{formatTime(currentTime)}</span>
        <input
          type="range"
          className="timeline-slider"
          min="0"
          max={duration || 0}
          value={currentTime}
          onChange={handleSeek}
          step="0.1"
        />
        <span className="time-label">{formatTime(duration)}</span>
      </div>

      <div className="player-actions">
        <div className="speed-control">
          <span className="speed-label">Geschwindigkeit:</span>
          <div className="speed-buttons">
            {[0.75, 1, 1.25, 1.5, 2].map(speed => (
              <button
                key={speed}
                className={`speed-btn ${playbackRate === speed ? 'active' : ''}`}
                onClick={() => handleSpeedChange(speed)}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>

        <button
          className="delete-btn"
          onClick={onDelete}
          title="Voicemail löschen"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
          Löschen
        </button>
      </div>
    </div>
  );
};

export default VoicemailPlayer;
