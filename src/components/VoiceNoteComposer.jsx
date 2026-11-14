import { useEffect, useRef, useState } from "react";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MAX_RECORDING_SECONDS = 900;
const SUPPORTED_AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/aac"
]);

function formatDuration(value) {
  const totalSeconds = Math.max(0, Math.floor(value || 0));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

export function VoiceNotePlayer({ src, duration, label = "Voice note" }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(duration || 0);
  const [error, setError] = useState("");
  const totalDuration = mediaDuration || duration || 0;
  const progress = totalDuration ? Math.min(100, (currentTime / totalDuration) * 100) : 0;

  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setMediaDuration(duration || 0);
    setError("");
  }, [src, duration]);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    setError("");
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setError("This recording could not be played in your browser.");
      }
    } else {
      audio.pause();
    }
  };

  const seek = (event) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = Number(event.target.value);
    setCurrentTime(audio.currentTime);
  };

  return (
    <div className="bible-voice-player">
      <button type="button" className="bible-voice-play" onClick={() => void togglePlayback()} aria-label={playing ? "Pause voice note" : currentTime > 0 ? "Resume voice note" : "Play voice note"}>
        {playing ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z" /></svg>}
      </button>
      <div className="bible-voice-track">
        <input type="range" min="0" max={totalDuration || 1} step="0.1" value={Math.min(currentTime, totalDuration || 1)} onChange={seek} aria-label={`Seek in ${label.toLowerCase()}`} style={{ "--audio-progress": `${progress}%` }} />
        <div className="bible-voice-times"><span>{formatDuration(currentTime)}</span><span>{formatDuration(totalDuration)}</span></div>
      </div>
      <audio
        ref={audioRef}
        src={src || undefined}
        preload="metadata"
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setMediaDuration(event.currentTarget.duration || duration || 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrentTime(0); }}
        onError={() => setError("This recording could not be loaded. Try again in a moment.")}
      />
      {error ? <span className="bible-voice-error" role="status">{error}</span> : null}
    </div>
  );
}

export function VoiceNoteComposer({ value, onChange, onRecordingChange, disabled = false, label = "Voice note" }) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [waveform, setWaveform] = useState(() => Array(24).fill(0.12));
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const startedAtRef = useRef(0);
  const recordingUrl = useRef("");
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const analysisFrameRef = useRef(0);
  const lastWaveformUpdateRef = useRef(0);
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    if (!value?.file) {
      setPreviewUrl("");
      return undefined;
    }
    const url = URL.createObjectURL(value.file);
    recordingUrl.current = url;
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
      if (recordingUrl.current === url) recordingUrl.current = "";
    };
  }, [value?.file]);

  useEffect(() => {
    if (!recording) return undefined;
    const timer = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsed(seconds);
      if (seconds >= MAX_RECORDING_SECONDS) stopRecording();
    }, 500);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => () => {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.stop();
    }
    window.cancelAnimationFrame(analysisFrameRef.current);
    void audioContextRef.current?.close().catch(() => {});
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const validateFile = (file) => {
    const mimeType = (file.type || "").split(";")[0].toLowerCase();
    if (!SUPPORTED_AUDIO_TYPES.has(mimeType)) return "Choose a supported audio recording.";
    if (!file.size || file.size > MAX_AUDIO_BYTES) return "Audio must be under 25 MB.";
    return "";
  };

  const beginRecording = async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError("Voice recording is not supported in this browser. Try a current version of Chrome, Safari, or Firefox.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const preferredTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
      const mimeType = preferredTypes.find((type) => window.MediaRecorder.isTypeSupported?.(type));
      const recorder = new window.MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        try {
          const context = new AudioContext();
          const analyser = context.createAnalyser();
          analyser.fftSize = 128;
          context.createMediaStreamSource(stream).connect(analyser);
          audioContextRef.current = context;
          analyserRef.current = analyser;
        } catch {
          audioContextRef.current = null;
          analyserRef.current = null;
        }
      }
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const recordingType = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: recordingType });
        const durationSeconds = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        window.cancelAnimationFrame(analysisFrameRef.current);
        analyserRef.current = null;
        void audioContextRef.current?.close().catch(() => {});
        audioContextRef.current = null;
        setWaveform(Array(24).fill(0.12));
        setRecording(false);
        onRecordingChange?.(false);
        if (!blob.size || blob.size > MAX_AUDIO_BYTES) {
          setError(blob.size ? "That recording is over 25 MB. Please record a shorter voice note." : "No audio was captured. Please try recording again.");
          return;
        }
        const extension = recordingType.includes("mp4") ? "m4a" : recordingType.includes("ogg") ? "ogg" : "webm";
        const file = new File([blob], `voice-note-${Date.now()}.${extension}`, { type: recordingType });
        onChange(file, durationSeconds);
      };
      recorderRef.current = recorder;
      chunksRef.current = [];
      startedAtRef.current = Date.now();
      setElapsed(0);
      recorder.start();
      setRecording(true);
      onRecordingChange?.(true);
      const analyser = analyserRef.current;
      if (analyser) {
        const frequencies = new Uint8Array(analyser.frequencyBinCount);
        const updateWaveform = () => {
          if (recorder.state !== "recording") return;
          analyser.getByteFrequencyData(frequencies);
          const now = Date.now();
          if (now - lastWaveformUpdateRef.current > 75) {
            const bars = Array.from({ length: 24 }, (_, index) => {
              const bin = frequencies[Math.min(frequencies.length - 1, Math.floor((index / 24) * frequencies.length))] || 0;
              return Math.max(0.12, Math.min(1, bin / 180));
            });
            setWaveform(bars);
            lastWaveformUpdateRef.current = now;
          }
          analysisFrameRef.current = window.requestAnimationFrame(updateWaveform);
        };
        analysisFrameRef.current = window.requestAnimationFrame(updateWaveform);
      }
    } catch {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      window.cancelAnimationFrame(analysisFrameRef.current);
      void audioContextRef.current?.close().catch(() => {});
      audioContextRef.current = null;
      analyserRef.current = null;
      setRecording(false);
      onRecordingChange?.(false);
      setError("Microphone access was not available. Check your browser permission and try again.");
    }
  };

  function stopRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  const removeAudio = () => {
    setError("");
    onChange(null, null);
  };

  return (
    <div className="bible-voice-composer">
      <div className="bible-voice-composer-actions">
        {recording ? <button type="button" className="bible-voice-recording-stop" onClick={stopRecording} disabled={disabled}>Stop recording <span>{formatDuration(elapsed)}</span></button> : <button type="button" className="bible-audio-attach" onClick={() => void beginRecording()} disabled={disabled}>Record voice note</button>}
        {value?.file ? <button type="button" className="bible-audio-remove" onClick={removeAudio} disabled={disabled}>Remove recording</button> : null}
      </div>
      {recording ? <div className="bible-voice-live" role="status" aria-label={`Recording ${label.toLowerCase()}, ${formatDuration(elapsed)} elapsed`}>
        <span className="bible-voice-live-indicator" aria-hidden="true" />
        <span>Recording {label.toLowerCase()} · {formatDuration(elapsed)} / 15:00</span>
        <span className="bible-voice-waveform" aria-hidden="true">{waveform.map((level, index) => <i key={index} style={{ "--wave-level": level }} />)}</span>
      </div> : null}
      {previewUrl ? <VoiceNotePlayer src={previewUrl} duration={value?.duration} label={`${label} preview`} /> : null}
      {error ? <p className="bible-audio-error" role="alert">{error}</p> : null}
    </div>
  );
}
