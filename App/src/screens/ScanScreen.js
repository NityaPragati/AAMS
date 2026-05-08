import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  Alert,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Animated,
  Dimensions,
  StatusBar
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import PrimaryButton from '../components/PrimaryButton';

const { width, height } = Dimensions.get('window');

export default function ScanScreen({ user, onLogout, onScan }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);
  const [result, setResult] = useState(null);
  const [lastScan, setLastScan] = useState(null);
  const [scannedHistory, setScannedHistory] = useState([]);
  const [showSummary, setShowSummary] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const resultScaleAnim = useRef(new Animated.Value(0.95)).current;
  const resultFadeAnim = useRef(new Animated.Value(0)).current;
  const cornerAnim = useRef(new Animated.Value(0)).current;
  const summaryFadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(function () {
    if (!permission || permission.granted) return;
    requestPermission();
  }, [permission, requestPermission]);

  useEffect(function () {
    if (!locked && !showSummary) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.08,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [locked, pulseAnim, showSummary]);

  useEffect(function () {
    if (result) {
      Animated.parallel([
        Animated.timing(resultFadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(resultScaleAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();

      Animated.sequence([
        Animated.timing(cornerAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [result, resultFadeAnim, resultScaleAnim, cornerAnim]);

  useEffect(function () {
    if (showSummary) {
      Animated.timing(summaryFadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
    } else {
      summaryFadeAnim.setValue(0);
    }
  }, [showSummary, summaryFadeAnim]);

  const resultStyle = useMemo(function () {
    if (!result) return styles.idle;
    return result.kind === 'success' ? styles.success : styles.error;
  }, [result]);

  async function handleBarcodeScanned(event) {
    if (locked || !event?.data || showSummary) return;
    setLocked(true);
    setResult({
      kind: 'processing',
      title: 'Marking attendance...',
      subtitle: 'Please wait'
    });

    try {
      const data = await onScan(event.data);
      const className = `${data.class_name} - ${data.section}`;
      const subtitle = data.already_scanned_session
        ? 'Already scanned this QR window'
        : 'Attendance marked present';
      const payloadResult = {
        kind: 'success',
        title: className,
        subtitle,
        timestamp: new Date().toLocaleTimeString()
      };
      setResult(payloadResult);
      setLastScan(payloadResult);
      setScannedHistory(prev => [payloadResult, ...prev]);
      Alert.alert('Attendance marked', `${className}\n${subtitle}`);
    } catch (error) {
      const message =
        error?.response?.data?.error || error.message || 'QR scan failed';
      const payloadResult = {
        kind: 'error',
        title: 'Scan failed',
        subtitle: message
      };
      setResult(payloadResult);
      setLastScan(payloadResult);
      Alert.alert('Scan failed', message);
    } finally {
      setTimeout(function () {
        setLocked(false);
        Animated.timing(resultFadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start();
      }, 1400);
    }
  }

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#2563eb" size={42} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <LinearGradient
        colors={['#081120', '#0B1220', '#0F172A', '#1D4ED8', '#0891B2']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bg}
      >
        <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

        <View style={styles.permissionContainer}>
          <View style={styles.permissionCard}>
            <LinearGradient
              colors={['rgba(255,255,255,0.98)', 'rgba(248,250,252,0.94)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.permissionCardGradient}
            />

            <View style={styles.permissionContent}>
              <View style={styles.permissionIconBox}>
                <Text style={styles.permissionIcon}>📷</Text>
              </View>

              <Text style={styles.permissionTitle}>Camera Access Required</Text>

              <Text style={styles.permissionText}>
                The app needs camera permission to scan the teacher's QR code and mark your attendance automatically.
              </Text>

              <PrimaryButton onPress={requestPermission} style={styles.permissionButton}>
                <Text style={styles.permissionButtonText}>Grant Camera Access</Text>
              </PrimaryButton>

              <Text style={styles.permissionNote}>
                Your privacy is protected. Camera is only used during scanning.
              </Text>
            </View>
          </View>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={['#f8fafc', '#eff6ff', '#ecfeff', '#f0f9ff']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.bg}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />

      {/* Background orbs */}
      <View style={[styles.orb, styles.orbA]} />
      <View style={[styles.orb, styles.orbB]} />
      <View style={[styles.orb, styles.orbC]} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.userInfo}>
          <Text style={styles.eyebrow}>Signed in as</Text>
          <Text style={styles.name}>{user.full_name}</Text>
          <Text style={styles.meta}>{user.student_id || user.email}</Text>
        </View>

        <Pressable
          onPress={onLogout}
          style={({ pressed }) => [
            styles.logoutBtn,
            pressed && styles.logoutBtnPressed
          ]}
        >
          <Text style={styles.logoutText}>Logout</Text>
        </Pressable>
      </View>

      {!showSummary ? (
        <>
          {/* Hero Card */}
          <View style={styles.heroCard}>
            <LinearGradient
              colors={['rgba(255,255,255,0.96)', 'rgba(248,250,252,0.92)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroCardGradient}
            />

            <View style={styles.heroContent}>
              <View style={styles.heroIconBox}>
                <Text style={styles.heroIcon}>🎯</Text>
              </View>

              <View style={styles.titleRow}>
                <Text style={styles.heroTitle}>Scan the rotating QR code</Text>
                <Pressable
                  onPress={() => setShowSummary(true)}
                  style={({ pressed }) => [styles.doneBtn, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.doneBtnText}>Done</Text>
                </Pressable>
              </View>

              <Text style={styles.heroSubtitle}>
                Point the camera at the QR shown by your teacher. Attendance will be marked automatically.
              </Text>

              <View style={styles.heroTips}>
                <View style={styles.heroTip}>
                  <Text style={styles.heroTipDot}>•</Text>
                  <Text style={styles.heroTipText}>Keep QR code within the frame</Text>
                </View>
                <View style={styles.heroTip}>
                  <Text style={styles.heroTipDot}>•</Text>
                  <Text style={styles.heroTipText}>Good lighting helps scanning</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Camera Shell */}
          <View style={styles.cameraContainer}>
            <View style={styles.cameraShell}>
              <CameraView
                style={styles.camera}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={locked ? null : handleBarcodeScanned}
              />

              {/* Overlay corners with animation */}
              <View style={styles.overlay}>
                <Animated.View
                  style={[
                    styles.corner,
                    styles.cornerTopLeft,
                    {
                      transform: [
                        {
                          scale: cornerAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.8, 1],
                          }),
                        },
                      ],
                      opacity: cornerAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.6, 1],
                      }),
                    },
                  ]}
                />

                <Animated.View
                  style={[
                    styles.corner,
                    styles.cornerTopRight,
                    {
                      transform: [
                        {
                          scale: cornerAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.8, 1],
                          }),
                        },
                      ],
                      opacity: cornerAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.6, 1],
                      }),
                    },
                  ]}
                />

                <Animated.View
                  style={[
                    styles.corner,
                    styles.cornerBottomLeft,
                    {
                      transform: [
                        {
                          scale: cornerAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.8, 1],
                          }),
                        },
                      ],
                      opacity: cornerAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.6, 1],
                      }),
                    },
                  ]}
                />

                <Animated.View
                  style={[
                    styles.corner,
                    styles.cornerBottomRight,
                    {
                      transform: [
                        {
                          scale: cornerAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.8, 1],
                          }),
                        },
                      ],
                      opacity: cornerAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.6, 1],
                      }),
                    },
                  ]}
                />
              </View>

              {/* Animated pulse ring */}
              {!locked && (
                <Animated.View
                  style={[
                    styles.pulseRing,
                    {
                      transform: [{ scale: pulseAnim }],
                    },
                  ]}
                />
              )}

              {/* Scan label */}
              <View style={styles.scanLabel}>
                <View style={styles.scanLabelDot} />
                <Text style={styles.scanLabelText}>
                  {locked ? 'Processing...' : 'Scanner ready'}
                </Text>
              </View>
            </View>
          </View>

          {/* Result Card */}
          <Animated.View
            style={[
              styles.resultCard,
              resultStyle,
              {
                opacity: resultFadeAnim,
                transform: [{ scale: resultScaleAnim }],
              },
            ]}
          >
            <LinearGradient
              colors={
                result?.kind === 'success'
                  ? ['rgba(220, 252, 231, 0.8)', 'rgba(209, 250, 229, 0.8)']
                  : result?.kind === 'error'
                    ? ['rgba(254, 242, 242, 0.8)', 'rgba(254, 226, 226, 0.8)']
                    : ['rgba(255,255,255,0.92)', 'rgba(248,250,252,0.86)']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.resultCardGradient}
            />

            <View style={styles.resultContent}>
              {result && (
                <View style={styles.resultIcon}>
                  <Text style={styles.resultIconText}>
                    {result.kind === 'success'
                      ? '✓'
                      : result.kind === 'error'
                        ? '✕'
                        : '⏳'}
                  </Text>
                </View>
              )}

              <Text style={[
                styles.resultTitle,
                result?.kind === 'success' && styles.resultTitleSuccess,
                result?.kind === 'error' && styles.resultTitleError,
              ]}>
                {result ? result.title : 'Waiting for QR code'}
              </Text>

              <Text style={[
                styles.resultText,
                result?.kind === 'success' && styles.resultTextSuccess,
                result?.kind === 'error' && styles.resultTextError,
              ]}>
                {result
                  ? result.subtitle
                  : 'Hold the QR inside the frame to mark attendance.'}
              </Text>

              {lastScan && result && (
                <Text style={styles.timestamp}>
                  Last scan: {new Date().toLocaleTimeString()}
                </Text>
              )}
            </View>
          </Animated.View>
        </>
      ) : (
        <Animated.View style={[styles.summaryContainer, { opacity: summaryFadeAnim }]}>
          <View style={styles.summaryCard}>
            <LinearGradient
              colors={['rgba(255,255,255,0.98)', 'rgba(248,250,252,0.94)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.summaryCardGradient}
            />

            <View style={styles.summaryHeader}>
              <View style={styles.summaryIconBox}>
                <Text style={styles.summaryIcon}>📋</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.summaryTitle}>Attendance Summary</Text>
                <Text style={styles.summarySubtitle}>{scannedHistory.length} sessions marked today</Text>
              </View>
              <Pressable
                onPress={() => setShowSummary(false)}
                style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.backBtnText}>Scanner</Text>
              </Pressable>
            </View>

            <View style={styles.historyList}>
              {scannedHistory.length === 0 ? (
                <View style={styles.emptyHistory}>
                  <Text style={styles.emptyHistoryText}>No attendance marked in this session.</Text>
                </View>
              ) : (
                scannedHistory.map((item, index) => (
                  <View key={index} style={styles.historyItem}>
                    <View style={styles.historyItemDot} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.historyItemTitle}>{item.title}</Text>
                      <Text style={styles.historyItemTime}>{item.timestamp}</Text>
                    </View>
                    <View style={styles.historyBadge}>
                      <Text style={styles.historyBadgeText}>Present</Text>
                    </View>
                  </View>
                ))
              )}
            </View>

            <PrimaryButton
              onPress={() => setShowSummary(false)}
              style={styles.returnButton}
            >
              <Text style={styles.returnButtonText}>Return to Scanner</Text>
            </PrimaryButton>
          </View>
        </Animated.View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 18,
    gap: 16,
    position: 'relative',
  },

  /* Background orbs */
  orb: {
    position: 'absolute',
    borderRadius: 9999,
  },

  orbA: {
    width: 200,
    height: 200,
    top: '-10%',
    right: '-8%',
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
  },

  orbB: {
    width: 240,
    height: 240,
    bottom: '5%',
    left: '-12%',
    backgroundColor: 'rgba(6, 182, 212, 0.06)',
  },

  orbC: {
    width: 160,
    height: 160,
    bottom: '35%',
    right: '10%',
    backgroundColor: 'rgba(124, 58, 237, 0.05)',
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingTop: 12,
    paddingBottom: 8,
  },

  userInfo: {
    flex: 1,
  },

  eyebrow: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },

  name: {
    color: '#0f172a',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 6,
    letterSpacing: -0.5,
  },

  meta: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 3,
    fontWeight: '600',
  },

  logoutBtn: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.92)',
    elevation: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },

  logoutBtnPressed: {
    opacity: 0.75,
  },

  logoutText: {
    color: '#0f172a',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.3,
  },

  /* Hero Card */
  heroCard: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.92)',
    elevation: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
  },

  heroCardGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },

  heroContent: {
    position: 'relative',
    zIndex: 1,
    gap: 12,
  },

  heroIconBox: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
  },

  heroIcon: {
    fontSize: 24,
  },

  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  heroTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: -0.5,
    flex: 1,
  },

  doneBtn: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    marginLeft: 12,
  },

  doneBtnText: {
    color: 'white',
    fontWeight: '800',
    fontSize: 13,
  },

  heroSubtitle: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '500',
  },

  heroTips: {
    marginTop: 8,
    gap: 8,
  },

  heroTip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  heroTipDot: {
    color: '#2563eb',
    fontWeight: '800',
    fontSize: 14,
  },

  heroTipText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
  },

  /* Camera */
  cameraContainer: {
    flex: 1,
    minHeight: 320,
    overflow: 'hidden',
    borderRadius: 28,
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
  },

  cameraShell: {
    flex: 1,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.22)',
    position: 'relative',
  },

  camera: {
    flex: 1,
  },

  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },

  corner: {
    position: 'absolute',
    width: 48,
    height: 48,
  },

  cornerTopLeft: {
    left: 20,
    top: 20,
    borderLeftWidth: 4,
    borderTopWidth: 4,
    borderColor: '#ffffff',
    borderTopLeftRadius: 18,
  },

  cornerTopRight: {
    right: 20,
    top: 20,
    borderRightWidth: 4,
    borderTopWidth: 4,
    borderColor: '#ffffff',
    borderTopRightRadius: 18,
  },

  cornerBottomLeft: {
    left: 20,
    bottom: 20,
    borderLeftWidth: 4,
    borderBottomWidth: 4,
    borderColor: '#ffffff',
    borderBottomLeftRadius: 18,
  },

  cornerBottomRight: {
    right: 20,
    bottom: 20,
    borderRightWidth: 4,
    borderBottomWidth: 4,
    borderColor: '#ffffff',
    borderBottomRightRadius: 18,
  },

  pulseRing: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 9999,
    left: '50%',
    top: '50%',
    marginLeft: -100,
    marginTop: -100,
    borderWidth: 3,
    borderColor: 'rgba(37, 99, 235, 0.4)',
  },

  scanLabel: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(15,23,42,0.84)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  scanLabelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    elevation: 4,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
  },

  scanLabelText: {
    color: 'white',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.3,
  },

  /* Result Card */
  resultCard: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderWidth: 1,
    elevation: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },

  resultCardGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },

  resultContent: {
    position: 'relative',
    zIndex: 1,
    gap: 10,
    alignItems: 'center',
  },

  resultIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },

  resultIconText: {
    fontSize: 24,
    fontWeight: '900',
  },

  resultTitle: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.3,
  },

  resultTitleSuccess: {
    color: '#047857',
  },

  resultTitleError: {
    color: '#991B1B',
  },

  resultText: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    fontWeight: '600',
  },

  resultTextSuccess: {
    color: '#065F46',
  },

  resultTextError: {
    color: '#7F1D1D',
  },

  timestamp: {
    marginTop: 8,
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  idle: {
    borderColor: 'rgba(226,232,240,0.92)',
    backgroundColor: 'rgba(255,255,255,0.92)',
  },

  success: {
    borderColor: 'rgba(16,185,129,0.28)',
  },

  error: {
    borderColor: 'rgba(220,38,38,0.28)',
  },

  /* Summary View */
  summaryContainer: {
    flex: 1,
  },

  summaryCard: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    borderRadius: 32,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    elevation: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    height: '100%',
  },

  summaryCardGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },

  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 24,
    position: 'relative',
    zIndex: 1,
  },

  summaryIconBox: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },

  summaryIcon: {
    fontSize: 26,
  },

  summaryTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: -0.5,
  },

  summarySubtitle: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600',
  },

  backBtn: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dbeafe',
  },

  backBtnText: {
    color: '#2563eb',
    fontWeight: '800',
    fontSize: 12,
  },

  historyList: {
    flex: 1,
    gap: 12,
    position: 'relative',
    zIndex: 1,
  },

  emptyHistory: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },

  emptyHistoryText: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '600',
  },

  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    gap: 14,
  },

  historyItemDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22c55e',
  },

  historyItemTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.3,
  },

  historyItemTime: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '700',
    marginTop: 2,
  },

  historyBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },

  historyBadgeText: {
    color: '#16a34a',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },

  returnButton: {
    marginTop: 20,
    borderRadius: 16,
    paddingVertical: 16,
    position: 'relative',
    zIndex: 1,
  },

  returnButtonText: {
    color: 'white',
    fontWeight: '800',
    fontSize: 15,
  },

  /* Permission */
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },

  permissionCard: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    borderRadius: 32,
    paddingHorizontal: 24,
    paddingVertical: 32,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    elevation: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
  },

  permissionCardGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },

  permissionContent: {
    position: 'relative',
    zIndex: 1,
    gap: 16,
    alignItems: 'center',
  },

  permissionIconBox: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 14,
  },

  permissionIcon: {
    fontSize: 32,
  },

  permissionTitle: {
    color: '#0f172a',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.5,
  },

  permissionText: {
    color: '#475569',
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
    fontWeight: '500',
  },

  permissionButton: {
    marginVertical: 8,
    borderRadius: 16,
    paddingVertical: 14,
  },

  permissionButtonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 0.3,
  },

  permissionNote: {
    color: '#64748b',
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '700',
    marginTop: 8,
  },

  flex: {
    flex: 1,
  },
});
