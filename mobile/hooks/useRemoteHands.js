/**
 * useRemoteHands.js
 *
 * Custom React hook that orchestrates the full data pipeline for the
 * Remote Hands experience:
 *
 *   Meta Glasses  ←────────────────────────────────────────────┐
 *       │  video frames (base64 JPEG)                          │
 *       │  audio chunks (base64 PCM 16 kHz)                    │ audio playback
 *       ▼                                                       │
 *   WebSocket ──► Backend proxy ──► Gemini Live API            │
 *                                        │                     │
 *                                        └─ audio response ────┘
 *
 * Barge-in: if the user starts speaking while Gemini is playing audio,
 * we immediately cancel glasses audio playback and resume streaming input.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Constants from "expo-constants";
import MetaWearables from "../modules/MetaWearables";

// ─── Connection states ────────────────────────────────────────────────────────

export const ConnectionState = {
  DISCONNECTED: "DISCONNECTED",
  CONNECTING: "CONNECTING",
  LISTENING: "LISTENING",
  SPEAKING: "SPEAKING",
  ERROR: "ERROR",
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @param {object} [options]
 * @param {string} [options.backendUrl]  Override the backend WebSocket URL.
 * @returns {{
 *   state: string,
 *   errorMessage: string | null,
 *   connect: function,
 *   disconnect: function,
 * }}
 */
export default function useRemoteHands({ backendUrl } = {}) {
  const wsUrl =
    backendUrl ||
    Constants.expoConfig?.extra?.backendWsUrl ||
    "ws://localhost:8080/ws";

  const [state, setState] = useState(ConnectionState.DISCONNECTED);
  const [errorMessage, setErrorMessage] = useState(null);

  // Refs (avoid stale closures in WS handlers)
  const wsRef = useRef(null);
  const isPlayingRef = useRef(false);
  const audioQueueRef = useRef([]); // queue of base64 audio chunks to play

  // Native module subscriptions
  const videoSubRef = useRef(null);
  const audioSubRef = useRef(null);
  const connSubRef = useRef(null);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const safeSetState = useCallback((s) => setState(s), []);

  function sendWs(payload) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }

  // Play the next audio chunk from the queue through the glasses speakers.
  const playNextChunk = useCallback(async () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      safeSetState(ConnectionState.LISTENING);
      return;
    }
    isPlayingRef.current = true;
    safeSetState(ConnectionState.SPEAKING);
    const chunk = audioQueueRef.current.shift();
    try {
      await MetaWearables.playAudioBuffer(chunk);
      // onAudioPlaybackDone will trigger the next chunk via listener
    } catch (err) {
      console.warn("[useRemoteHands] playAudioBuffer error:", err);
      isPlayingRef.current = false;
      safeSetState(ConnectionState.LISTENING);
    }
  }, [safeSetState]);

  // Barge-in: user is speaking → cancel glasses playback & clear queue.
  const handleBargein = useCallback(async () => {
    if (isPlayingRef.current) {
      audioQueueRef.current = [];
      isPlayingRef.current = false;
      try {
        await MetaWearables.cancelAudioPlayback();
      } catch (_) {
        // ignore
      }
      safeSetState(ConnectionState.LISTENING);
    }
  }, [safeSetState]);

  // ── Connect ────────────────────────────────────────────────────────────────

  const connect = useCallback(async () => {
    if (wsRef.current || state === ConnectionState.CONNECTING) return;

    safeSetState(ConnectionState.CONNECTING);
    setErrorMessage(null);

    // 1. Connect glasses via BLE
    try {
      await MetaWearables.connect();
    } catch (err) {
      safeSetState(ConnectionState.ERROR);
      setErrorMessage(`Glasses connection failed: ${err.message}`);
      return;
    }

    // 2. Subscribe to glasses events
    videoSubRef.current = MetaWearables.addVideoFrameListener(({ data }) => {
      sendWs({ type: "video_frame", data });
    });

    // Barge-in: if the glasses detect mic activity while Gemini is speaking,
    // cancel audio playback immediately.  The server also sends an "interrupted"
    // message, but we pre-empt locally here for a snappier feel.
    audioSubRef.current = MetaWearables.addAudioPlaybackDoneListener(() => {
      playNextChunk();
    });

    connSubRef.current = MetaWearables.addConnectionChangeListener(
      ({ connected }) => {
        if (!connected) {
          safeSetState(ConnectionState.ERROR);
          setErrorMessage("Glasses disconnected unexpectedly");
          cleanup();
        }
      }
    );

    // 3. Open backend WebSocket
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = async () => {
      safeSetState(ConnectionState.LISTENING);
      // Start streaming video from glasses
      try {
        await MetaWearables.startVideoCapture();
      } catch (err) {
        console.warn("[useRemoteHands] startVideoCapture:", err);
      }
    };

    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      switch (msg.type) {
        case "audio_chunk":
          audioQueueRef.current.push(msg.data);
          if (!isPlayingRef.current) {
            playNextChunk();
          }
          break;

        case "interrupted":
          // Server detected a barge-in
          handleBargein();
          break;

        case "turn_complete":
          // Nothing extra needed – playNextChunk drains the queue
          break;

        case "error":
          safeSetState(ConnectionState.ERROR);
          setErrorMessage(msg.message || "Unknown backend error");
          break;

        default:
          break;
      }
    };

    ws.onerror = () => {
      safeSetState(ConnectionState.ERROR);
      setErrorMessage("WebSocket connection error");
    };

    ws.onclose = () => {
      if (state !== ConnectionState.ERROR) {
        safeSetState(ConnectionState.DISCONNECTED);
      }
      wsRef.current = null;
    };
  }, [state, wsUrl, safeSetState, playNextChunk, handleBargein]);

  // ── Disconnect ─────────────────────────────────────────────────────────────

  function cleanup() {
    videoSubRef.current?.remove();
    audioSubRef.current?.remove();
    connSubRef.current?.remove();
    videoSubRef.current = null;
    audioSubRef.current = null;
    connSubRef.current = null;

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    audioQueueRef.current = [];
    isPlayingRef.current = false;
  }

  const disconnect = useCallback(async () => {
    cleanup();
    try {
      await MetaWearables.stopVideoCapture();
      await MetaWearables.cancelAudioPlayback();
      await MetaWearables.disconnect();
    } catch (_) {
      // ignore
    }
    safeSetState(ConnectionState.DISCONNECTED);
    setErrorMessage(null);
  }, [safeSetState]);

  // Auto-cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    state,
    errorMessage,
    connect,
    disconnect,
  };
}
