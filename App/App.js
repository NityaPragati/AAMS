import React, { useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  StatusBar,
  Text,
  View,
  StyleSheet,
  Image,
  Animated,
  Dimensions
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { LinearGradient } from 'expo-linear-gradient';
import LoginScreen from './src/screens/LoginScreen';
import ScanScreen from './src/screens/ScanScreen';
import { clearSession, loadSession, saveSession } from './src/storage';
import { login, scanAttendance } from './src/api';

const Stack = createStackNavigator();
const { width, height } = Dimensions.get('window');

export default function App() {
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState(null);

  const logoScaleAnim = useRef(new Animated.Value(0)).current;
  const logoRotateAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const textSlideAnim = useRef(new Animated.Value(20)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(function () {
    if (booting) {
      Animated.parallel([
        Animated.sequence([
          Animated.timing(logoScaleAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.delay(200),
          Animated.timing(logoRotateAnim, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.delay(400),
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.delay(400),
          Animated.timing(textSlideAnim, {
            toValue: 0,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
      ]).start();

      Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        })
      ).start();
    }
  }, [booting, logoScaleAnim, logoRotateAnim, fadeAnim, textSlideAnim, spinAnim]);

  useEffect(function () {
    const timer = setTimeout(function () {
      loadSession()
        .then(setSession)
        .finally(function () {
          setBooting(false);
        });
    }, 2400);

    return () => clearTimeout(timer);
  }, []);

  async function handleLogin(email, password) {
    setBusy(true);
    try {
      const response = await login(email, password);
      if (!response.user || response.user.role !== 'student') {
        throw new Error('Please sign in with a student account.');
      }
      const nextSession = {
        accessToken: response.access_token,
        user: response.user,
      };
      await saveSession(nextSession);
      setSession(nextSession);
    } catch (error) {
      Alert.alert(
        'Login Failed',
        error?.response?.data?.error || error.message || 'Unable to sign in',
        [{ text: 'Try Again', onPress: () => { } }],
        { cancelable: false }
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    await clearSession();
    setSession(null);
  }

  async function handleScan(payload) {
    if (!session?.accessToken) {
      throw new Error('No session token available');
    }
    return scanAttendance(session.accessToken, payload);
  }

  if (booting) {
    const spinValue = spinAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '360deg'],
    });

    const scaleValue = logoScaleAnim.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0, 1.1, 1],
    });

    const rotateValue = logoRotateAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '360deg'],
    });

    return (
      <LinearGradient
        colors={['#081120', '#0B1220', '#0F172A', '#1D4ED8', '#0891B2']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bootBg}
      >
        <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

        {/* Background orbs */}
        <View style={[styles.bootOrb, styles.bootOrbA]} />
        <View style={[styles.bootOrb, styles.bootOrbB]} />
        <View style={[styles.bootOrb, styles.bootOrbC]} />

        {/* Main container */}
        <View style={styles.bootContainer}>
          {/* Logo section */}
          <Animated.View
            style={[
              styles.bootLogoWrap,
              {
                transform: [
                  { scale: scaleValue },
                  { rotate: rotateValue },
                ],
              },
            ]}
          >
            {/* Logo glow background */}
            <Animated.View
              style={[
                styles.bootLogoGlow,
                {
                  transform: [{ rotate: spinValue }],
                },
              ]}
            />

            {/* Logo container */}
            <View style={styles.bootLogoBox}>
              <LinearGradient
                colors={['#2563EB', '#60A5FA', '#06B6D4']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.bootLogoGradient}
              >
                <Text style={styles.bootLogoText}>📱</Text>
              </LinearGradient>
            </View>
          </Animated.View>

          {/* Text section */}
          <Animated.View
            style={[
              styles.bootTextWrap,
              {
                opacity: fadeAnim,
                transform: [{ translateY: textSlideAnim }],
              },
            ]}
          >
            <Text style={styles.bootTitle}>FaceAttend</Text>
            <Text style={styles.bootSubtitle}>QR Attendance System</Text>
          </Animated.View>

          {/* Loader section */}
          <Animated.View
            style={[
              styles.bootLoaderWrap,
              {
                opacity: fadeAnim,
              },
            ]}
          >
            <View style={styles.bootLoaderOuter}>
              <View style={styles.bootLoaderInner} />
            </View>

            <Text style={styles.bootLoaderText}>Loading attendance app...</Text>
          </Animated.View>

          {/* Progress info */}
          <Animated.View
            style={[
              styles.bootProgressWrap,
              {
                opacity: fadeAnim,
              },
            ]}
          >
            <View style={styles.bootProgressDot} />
            <Text style={styles.bootProgressText}>Initializing session</Text>
          </Animated.View>
        </View>

        {/* Bottom accent */}
        <View style={styles.bootAccent} />
      </LinearGradient>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            cardStyle: { backgroundColor: '#ffffff' },
            animationEnabled: true,
            cardStyleInterpolator: ({ current }) => ({
              cardStyle: {
                opacity: current.progress,
              },
            }),
          }}
        >
          {!session ? (
            <Stack.Screen
              name="Login"
              options={{
                animationEnabled: true,
              }}
            >
              {() => <LoginScreen onLogin={handleLogin} busy={busy} />}
            </Stack.Screen>
          ) : (
            <Stack.Screen
              name="Scanner"
              options={{
                animationEnabled: true,
              }}
            >
              {() => <ScanScreen user={session.user} onLogout={handleLogout} onScan={handleScan} />}
            </Stack.Screen>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  /* Boot screen */
  bootBg: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },

  bootContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
    position: 'relative',
    zIndex: 2,
  },

  /* Background orbs */
  bootOrb: {
    position: 'absolute',
    borderRadius: 9999,
  },

  bootOrbA: {
    width: 280,
    height: 280,
    top: '-15%',
    right: '-10%',
    backgroundColor: 'rgba(96, 165, 250, 0.18)',
  },

  bootOrbB: {
    width: 320,
    height: 320,
    bottom: '-20%',
    left: '-12%',
    backgroundColor: 'rgba(34, 211, 238, 0.14)',
  },

  bootOrbC: {
    width: 200,
    height: 200,
    bottom: '30%',
    right: '5%',
    backgroundColor: 'rgba(124, 58, 237, 0.12)',
  },

  /* Logo section */
  bootLogoWrap: {
    marginBottom: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  bootLogoGlow: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(37, 99, 235, 0.2)',
  },

  bootLogoBox: {
    width: 120,
    height: 120,
    borderRadius: 36,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },

  bootLogoGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  bootLogoText: {
    fontSize: 56,
  },

  /* Text section */
  bootTextWrap: {
    alignItems: 'center',
    marginBottom: 36,
  },

  bootTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: -0.8,
    marginBottom: 6,
  },

  bootSubtitle: {
    fontSize: 16,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.8)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  /* Loader section */
  bootLoaderWrap: {
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },

  bootLoaderOuter: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderTopColor: 'rgba(255, 255, 255, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  bootLoaderInner: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0)',
    borderLeftColor: 'rgba(255, 255, 255, 0.5)',
  },

  bootLoaderText: {
    color: 'rgba(255, 255, 255, 0.88)',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  /* Progress section */
  bootProgressWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  bootProgressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    elevation: 4,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
  },

  bootProgressText: {
    color: 'rgba(255, 255, 255, 0.76)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
  },

  /* Bottom accent */
  bootAccent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 120,
    background: 'linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,0.04))',
    borderTopLeftRadius: 100,
    borderTopRightRadius: 100,
  },
});