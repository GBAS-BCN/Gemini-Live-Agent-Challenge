// MetaModule.swift
// Expo Native Module – Meta Smart Glasses Bridge (Remote Hands)
//
// This module interfaces with the Meta Device Access Toolkit (DAT) to:
//   • Connect / disconnect the glasses over Bluetooth LE
//   • Capture 720p video frames and emit them as base64 JPEG events
//   • Route incoming PCM audio buffers to the glasses' open-ear speakers
//
// The Meta DAT SDK is represented here by protocol stubs so the module
// compiles and can be tested in the simulator; replace the stub
// implementations with real Meta SDK calls once the SDK is available.

import ExpoModulesCore
import AVFoundation
import CoreBluetooth

// ─── Meta SDK stubs ──────────────────────────────────────────────────────────
// Replace these protocol/class stubs with imports from the real Meta DAT SDK.

protocol MetaDATSessionDelegate: AnyObject {
    func session(_ session: MetaDATSession, didChangeConnectionState connected: Bool)
    func session(_ session: MetaDATSession, didReceiveVideoFrame sampleBuffer: CMSampleBuffer)
    func sessionDidFinishAudioPlayback(_ session: MetaDATSession)
}

class MetaDATSession {
    weak var delegate: MetaDATSessionDelegate?

    func connect() throws {
        // Stub: real implementation calls Meta DAT SDK connect()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            guard let self else { return }
            self.delegate?.session(self, didChangeConnectionState: true)
        }
    }

    func disconnect() {
        delegate?.session(self, didChangeConnectionState: false)
    }

    func startVideoCapture() throws {
        // Stub: real implementation starts the DAT video pipeline
    }

    func stopVideoCapture() {
        // Stub: real implementation stops the DAT video pipeline
    }

    /// Play raw PCM data through the glasses' open-ear speakers.
    /// - Parameters:
    ///   - pcmData: Raw PCM 16-bit LE, 24 kHz, mono
    func playAudio(_ pcmData: Data) throws {
        // Stub: real implementation writes to the DAT audio output stream
        DispatchQueue.main.asyncAfter(deadline: .now() + Double(pcmData.count) / (24000.0 * 2.0)) {
            [weak self] in
            guard let self else { return }
            self.delegate?.sessionDidFinishAudioPlayback(self)
        }
    }

    func cancelAudio() {
        // Stub: real implementation cancels the current DAT audio playback
        delegate?.sessionDidFinishAudioPlayback(self)
    }
}

// ─── Expo Module ──────────────────────────────────────────────────────────────

public class MetaWearables: Module, MetaDATSessionDelegate {

    private var datSession: MetaDATSession?

    // MARK: - Module definition

    public func definition() -> ModuleDefinition {
        Name("MetaWearables")

        // Events surfaced to JavaScript
        Events("onVideoFrame", "onConnectionChange", "onAudioPlaybackDone")

        // ── connect() ────────────────────────────────────────────────────────
        AsyncFunction("connect") { [weak self] (promise: Promise) in
            guard let self else { return }
            let session = MetaDATSession()
            session.delegate = self
            self.datSession = session
            do {
                try session.connect()
                promise.resolve(nil)
            } catch {
                promise.reject("ERR_META_CONNECT", error.localizedDescription)
            }
        }

        // ── disconnect() ─────────────────────────────────────────────────────
        AsyncFunction("disconnect") { [weak self] (promise: Promise) in
            self?.datSession?.disconnect()
            self?.datSession = nil
            promise.resolve(nil)
        }

        // ── startVideoCapture() ──────────────────────────────────────────────
        AsyncFunction("startVideoCapture") { [weak self] (promise: Promise) in
            guard let session = self?.datSession else {
                promise.reject("ERR_META_NOT_CONNECTED", "Glasses are not connected")
                return
            }
            do {
                try session.startVideoCapture()
                promise.resolve(nil)
            } catch {
                promise.reject("ERR_META_VIDEO", error.localizedDescription)
            }
        }

        // ── stopVideoCapture() ───────────────────────────────────────────────
        AsyncFunction("stopVideoCapture") { [weak self] (promise: Promise) in
            self?.datSession?.stopVideoCapture()
            promise.resolve(nil)
        }

        // ── playAudioBuffer(base64Audio) ─────────────────────────────────────
        AsyncFunction("playAudioBuffer") { [weak self] (base64Audio: String, promise: Promise) in
            guard let session = self?.datSession else {
                promise.reject("ERR_META_NOT_CONNECTED", "Glasses are not connected")
                return
            }
            guard let pcmData = Data(base64Encoded: base64Audio) else {
                promise.reject("ERR_META_AUDIO_DECODE", "Invalid base64 audio data")
                return
            }
            do {
                try session.playAudio(pcmData)
                promise.resolve(nil)
            } catch {
                promise.reject("ERR_META_AUDIO", error.localizedDescription)
            }
        }

        // ── cancelAudioPlayback() ────────────────────────────────────────────
        AsyncFunction("cancelAudioPlayback") { [weak self] (promise: Promise) in
            self?.datSession?.cancelAudio()
            promise.resolve(nil)
        }
    }

    // MARK: - MetaDATSessionDelegate

    public func session(_ session: MetaDATSession, didChangeConnectionState connected: Bool) {
        sendEvent("onConnectionChange", ["connected": connected])
    }

    public func session(_ session: MetaDATSession, didReceiveVideoFrame sampleBuffer: CMSampleBuffer) {
        // Convert CMSampleBuffer → UIImage → JPEG → base64
        guard let imageBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }

        let ciImage = CIImage(cvImageBuffer: imageBuffer)
        let context = CIContext()
        guard let cgImage = context.createCGImage(ciImage, from: ciImage.extent) else { return }
        let uiImage = UIImage(cgImage: cgImage)

        // Compress to JPEG at 0.6 quality to keep frame size manageable
        guard let jpegData = uiImage.jpegData(compressionQuality: 0.6) else { return }
        let base64Frame = jpegData.base64EncodedString()

        sendEvent("onVideoFrame", ["data": base64Frame])
    }

    public func sessionDidFinishAudioPlayback(_ session: MetaDATSession) {
        sendEvent("onAudioPlaybackDone", [:])
    }
}
