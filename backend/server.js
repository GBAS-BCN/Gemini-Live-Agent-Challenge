/**
 * server.js – Remote Hands Backend
 *
 * Secure WebSocket proxy between the React Native mobile client and
 * the Gemini Multimodal Live API.
 *
 * Message protocol (JSON unless noted):
 *   Client → Server:
 *     { type: "video_frame", data: "<base64 JPEG>" }
 *     { type: "audio_chunk", data: "<base64 PCM 16-bit LE 16 kHz mono>" }
 *     { type: "end_of_turn" }
 *
 *   Server → Client:
 *     { type: "audio_chunk", data: "<base64 PCM 24 kHz mono>" }
 *     { type: "turn_complete" }
 *     { type: "error", message: "<string>" }
 */

"use strict";

require("dotenv").config();

const http = require("http");
const express = require("express");
const { WebSocketServer, WebSocket } = require("ws");
const { GoogleGenAI, Modality } = require("@google/genai");

// ─── Config ──────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || "8080", 10);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash-live-001";

if (!GEMINI_API_KEY) {
  console.error("FATAL: GEMINI_API_KEY environment variable is not set.");
  process.exit(1);
}

const SYSTEM_INSTRUCTION = `You are "Remote Hands", a friendly and concise AI repair assistant.
The user is wearing smart glasses and is looking at a broken object.
You receive video frames and audio from the user's glasses.
Your job is to guide the user step-by-step through diagnosing and repairing the object they are looking at.
Keep your spoken instructions short, clear, and actionable.
If you see something dangerous, warn the user immediately.
Speak naturally – you are a voice assistant, not a text assistant.`;

// ─── Express (health check) ───────────────────────────────────────────────────

const app = express();

app.get("/health", (_req, res) => {
  res.json({ status: "ok", model: GEMINI_MODEL });
});

const server = http.createServer(app);

// ─── Google AI client ────────────────────────────────────────────────────────

const genai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// ─── WebSocket server ─────────────────────────────────────────────────────────

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", async (clientWs, req) => {
  const clientId = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
  console.log(`[${clientId}] Client connected`);

  let geminiSession = null;
  let closed = false;

  // Helper: send a JSON message to the mobile client (if still open)
  function sendToClient(payload) {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify(payload));
    }
  }

  // ── Open Gemini Live session ────────────────────────────────────────────────
  try {
    geminiSession = await genai.live.connect({
      model: GEMINI_MODEL,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: SYSTEM_INSTRUCTION,
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Aoede" },
          },
        },
        // Input audio: PCM 16-bit LE @ 16 kHz mono (from glasses microphone)
        realtimeInputConfig: {
          mediaChunkSize: 3200, // 100 ms at 16 kHz
        },
      },
      // ── Callbacks from Gemini → mobile client ───────────────────────────────
      callbacks: {
        onmessage(message) {
          if (closed) return;

          // Audio response from Gemini
          if (message.serverContent?.modelTurn?.parts) {
            for (const part of message.serverContent.modelTurn.parts) {
              if (part.inlineData?.mimeType?.startsWith("audio/")) {
                sendToClient({
                  type: "audio_chunk",
                  data: part.inlineData.data,
                  mimeType: part.inlineData.mimeType,
                });
              }
            }
          }

          // Turn complete signal
          if (message.serverContent?.turnComplete) {
            sendToClient({ type: "turn_complete" });
          }

          // Interrupted signal (barge-in detected server-side)
          if (message.serverContent?.interrupted) {
            sendToClient({ type: "interrupted" });
          }
        },
        onerror(err) {
          console.error(`[${clientId}] Gemini error:`, err);
          sendToClient({ type: "error", message: "Gemini API error" });
        },
        onclose() {
          console.log(`[${clientId}] Gemini session closed`);
          if (!closed) {
            closed = true;
            clientWs.close();
          }
        },
      },
    });

    console.log(`[${clientId}] Gemini session established`);
  } catch (err) {
    console.error(`[${clientId}] Failed to open Gemini session:`, err);
    sendToClient({ type: "error", message: "Failed to connect to Gemini API" });
    clientWs.close();
    return;
  }

  // ── Messages from mobile client → Gemini ────────────────────────────────────
  clientWs.on("message", async (raw) => {
    if (closed || !geminiSession) return;

    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      console.warn(`[${clientId}] Non-JSON message received, ignoring`);
      return;
    }

    try {
      switch (msg.type) {
        case "video_frame":
          // Inline image (JPEG base64) sent as a realtime media chunk
          await geminiSession.sendRealtimeInput({
            media: {
              mimeType: "image/jpeg",
              data: msg.data,
            },
          });
          break;

        case "audio_chunk":
          // Raw PCM audio from the glasses microphone
          await geminiSession.sendRealtimeInput({
            media: {
              mimeType: "audio/pcm;rate=16000",
              data: msg.data,
            },
          });
          break;

        case "end_of_turn":
          await geminiSession.sendRealtimeInput({ endOfTurn: true });
          break;

        default:
          console.warn(`[${clientId}] Unknown message type: ${msg.type}`);
      }
    } catch (err) {
      console.error(`[${clientId}] Error forwarding to Gemini:`, err);
      sendToClient({ type: "error", message: "Failed to forward data to AI" });
    }
  });

  // ── Client disconnects ───────────────────────────────────────────────────────
  clientWs.on("close", () => {
    console.log(`[${clientId}] Client disconnected`);
    closed = true;
    if (geminiSession) {
      try {
        geminiSession.close();
      } catch (_) {
        // ignore
      }
    }
  });

  clientWs.on("error", (err) => {
    console.error(`[${clientId}] Client WebSocket error:`, err);
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`Remote Hands backend listening on port ${PORT}`);
  console.log(`Model: ${GEMINI_MODEL}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received – shutting down");
  server.close(() => process.exit(0));
});
