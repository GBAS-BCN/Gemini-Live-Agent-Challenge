/**
 * MetaWearables – Expo Local Native Module (JS index)
 *
 * Exposes the Swift MetaModule as a JavaScript interface.
 * All heavy lifting (BLE, video capture, audio routing) lives in MetaModule.swift.
 *
 * Usage:
 *   import MetaWearables from '../modules/MetaWearables';
 *
 *   await MetaWearables.connect();
 *   MetaWearables.addVideoFrameListener((event) => { ... });
 *   await MetaWearables.startVideoCapture();
 *   await MetaWearables.playAudioBuffer(base64pcm);
 *   await MetaWearables.disconnect();
 */

import { NativeModulesProxy, EventEmitter } from "expo-modules-core";

const MetaWearablesModule = NativeModulesProxy.MetaWearables;

const emitter = new EventEmitter(MetaWearablesModule);

/** Events emitted by the native module */
export const MetaWearablesEvents = {
  /** Fired for each captured video frame.  payload: { data: string (base64 JPEG) } */
  VIDEO_FRAME: "onVideoFrame",
  /** Fired when glasses BLE connection state changes. payload: { connected: boolean } */
  CONNECTION_CHANGE: "onConnectionChange",
  /** Fired when audio playback finishes. payload: {} */
  AUDIO_PLAYBACK_DONE: "onAudioPlaybackDone",
};

const MetaWearables = {
  /**
   * Connect to the Meta smart glasses over Bluetooth.
   * Resolves when the connection is established.
   */
  async connect() {
    return MetaWearablesModule.connect();
  },

  /**
   * Disconnect from the Meta smart glasses.
   */
  async disconnect() {
    return MetaWearablesModule.disconnect();
  },

  /**
   * Start capturing the 720p video stream from the glasses' camera.
   * Video frames are emitted as VIDEO_FRAME events.
   */
  async startVideoCapture() {
    return MetaWearablesModule.startVideoCapture();
  },

  /**
   * Stop capturing the video stream.
   */
  async stopVideoCapture() {
    return MetaWearablesModule.stopVideoCapture();
  },

  /**
   * Route a base64-encoded PCM audio buffer to the glasses' open-ear speakers.
   * @param {string} base64Audio  Base64-encoded PCM 24 kHz mono 16-bit LE data.
   */
  async playAudioBuffer(base64Audio) {
    return MetaWearablesModule.playAudioBuffer(base64Audio);
  },

  /**
   * Interrupt / cancel any audio currently playing on the glasses speakers.
   */
  async cancelAudioPlayback() {
    return MetaWearablesModule.cancelAudioPlayback();
  },

  /**
   * Subscribe to video frame events.
   * @param {function} listener  Called with { data: string } for each frame.
   * @returns {object} Subscription object with .remove() method.
   */
  addVideoFrameListener(listener) {
    return emitter.addListener(MetaWearablesEvents.VIDEO_FRAME, listener);
  },

  /**
   * Subscribe to connection state change events.
   * @param {function} listener  Called with { connected: boolean }.
   * @returns {object} Subscription object with .remove() method.
   */
  addConnectionChangeListener(listener) {
    return emitter.addListener(MetaWearablesEvents.CONNECTION_CHANGE, listener);
  },

  /**
   * Subscribe to audio playback completion events.
   * @param {function} listener  Called with no payload.
   * @returns {object} Subscription object with .remove() method.
   */
  addAudioPlaybackDoneListener(listener) {
    return emitter.addListener(MetaWearablesEvents.AUDIO_PLAYBACK_DONE, listener);
  },
};

export default MetaWearables;
