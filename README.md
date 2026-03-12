# Remote Hands 🛠️

> **A hands-free DIY repair assistant powered by Meta smart glasses and the Gemini Multimodal Live API.**

The user wears Meta smart glasses and looks at a broken object. The glasses stream video and audio to a React Native app, which proxies the data to a Google Cloud backend, which in turn communicates with the Gemini Multimodal Live API in real time. Gemini provides step-by-step voice guidance through the glasses' open-ear speakers.

---

## Architecture

```
Meta Smart Glasses  ──BLE──►  React Native (Expo)  ──WSS──►  Cloud Run (Node.js)  ──WSS──►  Gemini Live API
       ▲                              │                                                            │
       └──────── audio playback ──────┴───────────────── audio response ────────────────────────────┘
```

---

## Monorepo Structure

```
.
├── package.json              # Root workspace manifest
├── .gitignore
│
├── backend/                  # Node.js WebSocket proxy
│   ├── package.json
│   ├── server.js             # Express + ws + @google/genai
│   ├── Dockerfile
│   ├── cloudbuild.yaml       # Cloud Build → Cloud Run CI/CD
│   └── .env.example
│
└── mobile/                   # React Native (Expo) app
    ├── package.json
    ├── app.json              # iOS permissions, URL schemes
    ├── App.js                # Dark-mode UI
    ├── hooks/
    │   └── useRemoteHands.js # Data pipeline hook (WebSocket + glasses)
    └── modules/
        └── MetaWearables/    # Local Expo native module
            ├── index.js      # JS interface
            ├── MetaModule.swift  # Swift bridge (Meta DAT SDK)
            └── MetaWearables.podspec
```

---

## Quick Start

### Prerequisites

- Node.js 20+
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- Xcode 15+ (for iOS builds)
- A Google Cloud project with the Gemini API enabled

### 1. Backend

```bash
cd backend
cp .env.example .env
# Fill in GEMINI_API_KEY in .env
npm install
npm run dev
```

The server starts on `http://localhost:8080`.
WebSocket endpoint: `ws://localhost:8080/ws`
Health check: `http://localhost:8080/health`

### 2. Mobile App

```bash
cd mobile
npm install
# Edit app.json → expo.extra.backendWsUrl to point at your backend
npm run ios
```

### 3. Deploy Backend to Google Cloud Run

```bash
# From the repo root
gcloud builds submit --config=backend/cloudbuild.yaml .
```

Set the `GEMINI_API_KEY` secret via Cloud Secret Manager and reference it in the Cloud Run service (see comments in `cloudbuild.yaml`).

---

## Backend Message Protocol

**Client → Server (JSON)**

| `type`        | Description                                              |
|---------------|----------------------------------------------------------|
| `video_frame` | Base64-encoded JPEG frame from the glasses camera        |
| `audio_chunk` | Base64-encoded PCM 16-bit LE 16 kHz mono audio           |
| `end_of_turn` | Signal that the user's turn is complete                  |

**Server → Client (JSON)**

| `type`          | Description                                            |
|-----------------|--------------------------------------------------------|
| `audio_chunk`   | Base64-encoded PCM audio response from Gemini          |
| `turn_complete` | Gemini has finished its response turn                  |
| `interrupted`   | Gemini detected a barge-in from the user               |
| `error`         | Error message string                                   |

---

## Meta Wearables Native Module

The `mobile/modules/MetaWearables/` folder contains a local Expo native module.

The Swift file (`MetaModule.swift`) includes protocol stubs that stand in for the real [Meta Device Access Toolkit (DAT)](https://developers.facebook.com/docs/wearables-device-access-toolkit/). To integrate the real SDK:

1. Add `MetaDAT` to your `Podfile`.
2. Replace the stub `MetaDATSession` class in `MetaModule.swift` with real SDK calls.

### Exposed JS functions

| Function | Description |
|---|---|
| `MetaWearables.connect()` | Connect to glasses over BLE |
| `MetaWearables.disconnect()` | Disconnect |
| `MetaWearables.startVideoCapture()` | Begin emitting `onVideoFrame` events |
| `MetaWearables.stopVideoCapture()` | Stop video stream |
| `MetaWearables.playAudioBuffer(base64)` | Play PCM audio on glasses speakers |
| `MetaWearables.cancelAudioPlayback()` | Interrupt current audio playback |

---

## License

MIT