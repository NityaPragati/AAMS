import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Animated,
  Dimensions,
  TouchableOpacity,
  StatusBar
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import TextField from '../components/TextField';
import PrimaryButton from '../components/PrimaryButton';

const { width } = Dimensions.get('window');

export default function LoginScreen({ onLogin, busy }) {
  const [email, setEmail] = useState('student1@lpu.edu');
  const [password, setPassword] = useState('student123');
  const [showPassword, setShowPassword] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 650,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 650,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 650,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim, scaleAnim]);

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      <LinearGradient
        colors={['#081120', '#0B1220', '#0F172A', '#1D4ED8', '#0891B2']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bg}
      >
        {/* Background orbs */}
        <View style={[styles.orb, styles.orbA]} />
        <View style={[styles.orb, styles.orbB]} />
        <View style={[styles.orb, styles.orbC]} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.flex}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Animated.View
              style={[
                styles.cardContainer,
                {
                  opacity: fadeAnim,
                  transform: [
                    { translateY: slideAnim },
                    { scale: scaleAnim },
                  ],
                },
              ]}
            >
              <View style={styles.card}>
                {/* Card glow effect */}
                <View style={styles.cardGlow} />

                {/* Card background gradient */}
                <LinearGradient
                  colors={['rgba(255,255,255,0.98)', 'rgba(248,250,252,0.94)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.cardGradient}
                />

                {/* Content */}
                <View style={styles.cardContent}>
                  {/* Top section */}
                  <View style={styles.topSection}>
                    <View style={styles.iconBadge}>
                      <Text style={styles.iconText}>🔐</Text>
                    </View>

                    <View style={styles.badgeContainer}>
                      <Text style={styles.badge}>Student Portal</Text>
                    </View>
                  </View>

                  {/* Title section */}
                  <View style={styles.titleSection}>
                    <Text style={styles.title}>Welcome Back</Text>
                    <Text style={styles.subtitle}>
                      Sign in to scan QR codes and mark your attendance instantly.
                    </Text>
                  </View>

                  {/* Form section */}
                  <View style={styles.form}>
                    <View style={styles.formGroup}>
                      <Text style={styles.label}>Email Address</Text>
                      <TextField
                        autoCapitalize="none"
                        keyboardType="email-address"
                        value={email}
                        onChangeText={setEmail}
                        editable={!busy}
                        placeholder="student@lpu.edu"
                        placeholderTextColor="#94a3b8"
                      />
                    </View>

                    <View style={styles.formGroup}>
                      <Text style={styles.label}>Password</Text>
                      <View style={styles.passwordWrapper}>
                        <TextField
                          label=""
                          secureTextEntry={!showPassword}
                          value={password}
                          onChangeText={setPassword}
                          editable={!busy}
                          placeholder="••••••••"
                          placeholderTextColor="#94a3b8"
                          style={styles.passwordInput}
                        />
                        <TouchableOpacity
                          onPress={() => setShowPassword(!showPassword)}
                          style={styles.eyeButton}
                          disabled={busy}
                        >
                          <Text style={styles.eyeIcon}>{showPassword ? '👁️' : '👁️‍🗨️'}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Remember & Forgot */}
                    <View style={styles.optionsRow}>
                      <TouchableOpacity style={styles.rememberCheck} disabled={busy}>
                        <View style={styles.checkbox} />
                        <Text style={styles.rememberText}>Remember me</Text>
                      </TouchableOpacity>
                      <TouchableOpacity disabled={busy}>
                        <Text style={styles.forgotLink}>Forgot password?</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Submit button */}
                    <PrimaryButton
                      onPress={() => onLogin(email.trim(), password)}
                      disabled={busy}
                      style={styles.submitButton}
                    >
                      {busy ? (
                        <View style={styles.buttonContent}>
                          <ActivityIndicator color="#ffffff" size={20} style={{ marginRight: 8 }} />
                          <Text style={styles.buttonText}>Signing in...</Text>
                        </View>
                      ) : (
                        <Text style={styles.buttonText}>Continue</Text>
                      )}
                    </PrimaryButton>
                  </View>

                  {/* Footer note */}
                  <View style={styles.footer}>
                    <Text style={styles.footerText}>
                      Protected by{' '}
                      <Text style={styles.footerHighlight}>role-based authentication</Text>
                    </Text>
                  </View>
                </View>
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: '#0f172a',
  },

  flex: {
    flex: 1,
  },

  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 40,
  },

  /* Background orbs */
  orb: {
    position: 'absolute',
    borderRadius: 9999,
    opacity: 0.6,
  },

  orbA: {
    width: 240,
    height: 240,
    top: '15%',
    right: '-10%',
    backgroundColor: 'rgba(96, 165, 250, 0.15)',
  },

  orbB: {
    width: 280,
    height: 280,
    bottom: '-15%',
    left: '-8%',
    backgroundColor: 'rgba(34, 211, 238, 0.12)',
  },

  orbC: {
    width: 180,
    height: 180,
    bottom: '25%',
    right: '8%',
    backgroundColor: 'rgba(124, 58, 237, 0.10)',
  },

  /* Card container */
  cardContainer: {
    marginVertical: 'auto',
  },

  card: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    borderRadius: 32,
    elevation: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.15,
    shadowRadius: 40,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
  },

  cardGlow: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 9999,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    top: '-40%',
    right: '-10%',
  },

  cardGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },

  cardContent: {
    padding: 32,
    gap: 24,
    position: 'relative',
    zIndex: 1,
  },

  /* Top section */
  topSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  iconBadge: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
  },

  iconText: {
    fontSize: 24,
  },

  badgeContainer: {
    backgroundColor: '#dbeafe',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },

  badge: {
    color: '#1d4ed8',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  /* Title section */
  titleSection: {
    gap: 8,
  },

  title: {
    color: '#0f172a',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.8,
    lineHeight: 40,
  },

  subtitle: {
    color: '#475569',
    fontSize: 15,
    lineHeight: 24,
    fontWeight: '500',
  },

  /* Form */
  form: {
    gap: 18,
    marginVertical: 8,
  },

  formGroup: {
    gap: 8,
  },

  label: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  /* Password wrapper */
  passwordWrapper: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },

  passwordInput: {
    flex: 1,
    paddingRight: 50,
  },

  eyeButton: {
    position: 'absolute',
    right: 16,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
  },

  eyeIcon: {
    fontSize: 18,
  },

  /* Options row */
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },

  rememberCheck: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#dbeafe',
    backgroundColor: '#eff6ff',
  },

  rememberText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '700',
  },

  forgotLink: {
    color: '#1d4ed8',
    fontSize: 13,
    fontWeight: '800',
    textDecorationLine: 'none',
  },

  /* Submit button */
  submitButton: {
    marginTop: 8,
    borderRadius: 16,
    paddingVertical: 16,
    backgroundColor: '#2563eb',
    elevation: 8,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },

  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.4,
  },

  /* Footer */
  footer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(226, 232, 240, 0.6)',
    paddingTop: 16,
    alignItems: 'center',
  },

  footerText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },

  footerHighlight: {
    color: '#1d4ed8',
    fontWeight: '800',
  },
});