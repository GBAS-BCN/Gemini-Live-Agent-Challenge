/**
 * App.js – Remote Hands
 *
 * Dark-mode UI with:
 *   • "Connect Glasses & Start" button
 *   • Visual state indicators (Disconnected / Connecting / Listening / Speaking / Error)
 *   • Robust error handling with alerts for dropped connections
 */

import React, { useEffect, useRef } from "react";
import {
  Alert,
  Animated,
  Easing,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import useRemoteHands, { ConnectionState } from "./hooks/useRemoteHands";

// ─── Theme ────────────────────────────────────────────────────────────────────

const theme = {
  bg: "#0d0d0d",
  surface: "#1a1a1a",
  border: "#2a2a2a",
  primary: "#4f8ef7",
  error: "#e05555",
  success: "#4caf7d",
  speaking: "#f7a64f",
  textPrimary: "#f0f0f0",
  textSecondary: "#888888",
};

// ─── State config ─────────────────────────────────────────────────────────────

const STATE_CONFIG = {
  [ConnectionState.DISCONNECTED]: {
    label: "Disconnected",
    color: theme.textSecondary,
    dot: theme.textSecondary,
    pulse: false,
  },
  [ConnectionState.CONNECTING]: {
    label: "Connecting…",
    color: theme.primary,
    dot: theme.primary,
    pulse: true,
  },
  [ConnectionState.LISTENING]: {
    label: "Listening",
    color: theme.success,
    dot: theme.success,
    pulse: true,
  },
  [ConnectionState.SPEAKING]: {
    label: "Speaking",
    color: theme.speaking,
    dot: theme.speaking,
    pulse: true,
  },
  [ConnectionState.ERROR]: {
    label: "Error",
    color: theme.error,
    dot: theme.error,
    pulse: false,
  },
};

// ─── Pulsing dot component ────────────────────────────────────────────────────

function PulseDot({ color, active }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let animation;
    if (active) {
      animation = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(scale, {
              toValue: 1.6,
              duration: 700,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: 700,
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(scale, {
              toValue: 1,
              duration: 0,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 1,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
        ])
      );
      animation.start();
    } else {
      scale.setValue(1);
      opacity.setValue(1);
    }
    return () => animation?.stop();
  }, [active, scale, opacity]);

  return (
    <View style={styles.dotContainer}>
      <Animated.View
        style={[
          styles.dotRing,
          { borderColor: color, transform: [{ scale }], opacity },
        ]}
      />
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const { state, errorMessage, connect, disconnect } = useRemoteHands();
  const config = STATE_CONFIG[state] ?? STATE_CONFIG[ConnectionState.DISCONNECTED];

  const isActive =
    state === ConnectionState.LISTENING ||
    state === ConnectionState.SPEAKING ||
    state === ConnectionState.CONNECTING;

  // Show alert when an error occurs
  useEffect(() => {
    if (state === ConnectionState.ERROR && errorMessage) {
      Alert.alert(
        "Remote Hands – Connection Error",
        errorMessage,
        [
          {
            text: "Retry",
            onPress: connect,
          },
          {
            text: "Dismiss",
            style: "cancel",
          },
        ],
        { cancelable: true }
      );
    }
  }, [state, errorMessage, connect]);

  function handleMainButton() {
    if (isActive) {
      disconnect();
    } else {
      connect();
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={theme.bg} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Remote Hands</Text>
        <Text style={styles.headerSubtitle}>AI Repair Assistant</Text>
      </View>

      {/* Status indicator */}
      <View style={styles.statusCard}>
        <PulseDot color={config.dot} active={config.pulse} />
        <Text style={[styles.statusLabel, { color: config.color }]}>
          {config.label}
        </Text>
        {errorMessage && state === ConnectionState.ERROR && (
          <Text style={styles.errorMessage} numberOfLines={3}>
            {errorMessage}
          </Text>
        )}
      </View>

      {/* Waveform placeholder (visual feedback while listening / speaking) */}
      {isActive && (
        <View style={styles.waveformContainer}>
          {Array.from({ length: 12 }).map((_, i) => (
            <WaveBar key={i} index={i} active={isActive} state={state} />
          ))}
        </View>
      )}

      {/* Spacer */}
      <View style={{ flex: 1 }} />

      {/* Instructions */}
      {!isActive && state !== ConnectionState.ERROR && (
        <Text style={styles.instructions}>
          Put on your Meta glasses and tap the button below to begin a hands-free repair session.
        </Text>
      )}

      {/* Main CTA button */}
      <TouchableOpacity
        style={[
          styles.button,
          isActive && styles.buttonActive,
          state === ConnectionState.ERROR && styles.buttonError,
          state === ConnectionState.CONNECTING && styles.buttonDisabled,
        ]}
        onPress={handleMainButton}
        disabled={state === ConnectionState.CONNECTING}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={isActive ? "Disconnect" : "Connect Glasses & Start"}
      >
        <Text style={styles.buttonText}>
          {state === ConnectionState.CONNECTING
            ? "Connecting…"
            : isActive
            ? "Disconnect"
            : "Connect Glasses & Start"}
        </Text>
      </TouchableOpacity>

      <Text style={styles.footer}>Powered by Gemini Multimodal Live API</Text>
    </SafeAreaView>
  );
}

// ─── Animated wave bar ────────────────────────────────────────────────────────

function WaveBar({ index, active, state }) {
  const height = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    let animation;
    if (active) {
      const baseHeight = state === ConnectionState.SPEAKING ? 36 : 20;
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(height, {
            toValue: 8 + Math.random() * baseHeight,
            duration: 250 + index * 40,
            easing: Easing.inOut(Easing.sine),
            useNativeDriver: false,
          }),
          Animated.timing(height, {
            toValue: 8,
            duration: 250 + index * 40,
            easing: Easing.inOut(Easing.sine),
            useNativeDriver: false,
          }),
        ])
      );
      animation.start();
    } else {
      height.setValue(8);
    }
    return () => animation?.stop();
  }, [active, state, index, height]);

  const barColor =
    state === ConnectionState.SPEAKING ? theme.speaking : theme.success;

  return (
    <Animated.View
      style={[styles.waveBar, { height, backgroundColor: barColor }]}
    />
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.bg,
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  header: {
    marginTop: 48,
    marginBottom: 32,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: "800",
    color: theme.textPrimary,
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: theme.textSecondary,
    marginTop: 4,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  statusCard: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 12,
  },
  dotContainer: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    position: "absolute",
  },
  dotRing: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    position: "absolute",
  },
  statusLabel: {
    fontSize: 20,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  errorMessage: {
    fontSize: 13,
    color: theme.error,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 18,
  },
  waveformContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 5,
    marginTop: 40,
    height: 60,
  },
  waveBar: {
    width: 5,
    borderRadius: 3,
    minHeight: 8,
  },
  instructions: {
    textAlign: "center",
    color: theme.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 32,
  },
  button: {
    backgroundColor: theme.primary,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: "center",
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  buttonActive: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    shadowOpacity: 0,
  },
  buttonError: {
    backgroundColor: theme.error,
    shadowColor: theme.error,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: theme.textPrimary,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  footer: {
    textAlign: "center",
    color: theme.textSecondary,
    fontSize: 12,
    marginTop: 20,
    letterSpacing: 0.5,
  },
});
