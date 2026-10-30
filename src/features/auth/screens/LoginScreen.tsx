import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  View,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  BackHandler,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../../types/navigation';
import { authApi, saveToken } from '../../../services/api';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

const OTP_LENGTH = 6; // backend sends a 6-digit OTP
const RESEND_SECONDS = 30;

// Palette
const BLUE = '#1F5EFF';
const BLUE_LIGHT = '#EAF1FF';
const NAVY = '#0B1B3F';
const GREY = '#6B7280';
const BORDER = '#E2E8F0';
const RED = '#D93025';

/** Clean hero: one main service in the center, other services orbiting around it (Views only) */
function HeroIllustration() {
  return (
    <View style={ill.scene}>
      {/* orbit + glow */}
      <View style={ill.ring} />
      <View style={ill.glow} />

      {/* small decorative dots */}
      <View style={[ill.dot, { left: 58, top: 28 }]} />
      <View style={[ill.dot, { left: 246, top: 124, width: 6, height: 6 }]} />
      <View style={[ill.dot, { left: 268, top: 44, width: 5, height: 5 }]} />

      {/* center: Ride */}
      <View style={ill.hub}>
        <Text style={ill.hubIcon}>🛵</Text>
      </View>
      <Text style={[ill.label, { left: 111, width: 78, top: 124 }]}>Ride</Text>

      {/* orbiting: Parcel */}
      <View style={[ill.chip, { left: 51, top: 56 }]}>
        <Text style={ill.chipIcon}>📦</Text>
      </View>
      <Text style={[ill.label, { left: 45, width: 60, top: 108 }]}>Parcel</Text>

      {/* orbiting: Goods */}
      <View style={[ill.chip, { left: 201, top: 56 }]}>
        <Text style={ill.chipIcon}>🚚</Text>
      </View>
      <Text style={[ill.label, { left: 195, width: 60, top: 108 }]}>Goods</Text>

      {/* orbiting: location */}
      <View style={ill.chipSmall}>
        <Text style={ill.chipSmallIcon}>📍</Text>
      </View>
    </View>
  );
}

export default function LoginScreen({ navigation }: Props) {
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [phoneFocused, setPhoneFocused] = useState(true);
  const [devOtp, setDevOtp] = useState(''); // only set by backend for invited testers
  const otpInputRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  const isPhoneValid = phone.length === 10;
  const isOtpValid = otp.length === OTP_LENGTH;

  // On the OTP step, Android back button goes back to the number step
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === 'otp') {
        goToPhoneStep();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [step]);

  // resend countdown
  useEffect(() => {
    if (step !== 'otp' || seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [step, seconds]);

  const goToPhoneStep = () => {
    setOtp('');
    setDevOtp('');
    setError('');
    setStep('phone');
  };

  const onChangePhone = (text: string) => {
    setError('');
    setPhone(text.replace(/[^0-9]/g, '').slice(0, 10));
  };

  const onChangeOtp = (text: string) => {
    setError('');
    setOtp(text.replace(/[^0-9]/g, '').slice(0, OTP_LENGTH));
  };

  const onSendOtp = async () => {
    if (!isPhoneValid || loading) return;
    setLoading(true);
    setError('');
    try {
      const res: any = await authApi.sendOtp(phone);
      setDevOtp(res?.devOtp ?? '');
      setOtp('');
      setSeconds(RESEND_SECONDS);
      setStep('otp');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
const onVerify = async () => {
  if (!isOtpValid || loading) return;
  setLoading(true);
  setError('');
  try {
    const { token, user } = await authApi.verifyOtp(phone, otp);
    await saveToken(token);
    // Admin ko alag tabs, baaki sab ko normal app
    navigation.replace(user?.role === 'ADMIN' ? 'AdminTabs' : 'MainTabs');
  } catch (e: any) {
    setError(e.message);
    setOtp('');
    otpInputRef.current?.focus();
    setLoading(false);
  }
};

  const onResend = async () => {
    if (seconds > 0 || loading) return;
    setLoading(true);
    setError('');
    try {
      const res: any = await authApi.sendOtp(phone);
      setDevOtp(res?.devOtp ?? '');
      setOtp('');
      setSeconds(RESEND_SECONDS);
      otpInputRef.current?.focus();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={BLUE} />

      {/* Blue hero */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoBadgeText}>O</Text>
          </View>
          <Text style={styles.brand}>OpenDeliv</Text>
        </View>
        <Text style={styles.tagline}>Rides, parcels and goods in one app</Text>


        <View style={styles.illustration}>
          <HeroIllustration />
        </View>
      </View>

      {/* White bottom sheet */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.sheetContent}
          >
            {step === 'phone' ? (
              <>
                <Text style={styles.heading}>Log in or sign up</Text>
                <Text style={styles.sub}>
                  Enter your mobile number and we'll send you an OTP
                </Text>

                <View style={styles.phoneRow}>
                  <View style={styles.codeBox}>
                    <Text style={styles.flag}>🇮🇳</Text>
                    <Text style={styles.codeText}>+91</Text>
                  </View>
                  <TextInput
                    style={[styles.phoneInput, phoneFocused && styles.inputFocused]}
                    placeholder="Mobile number"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="number-pad"
                    maxLength={10}
                    value={phone}
                    onChangeText={onChangePhone}
                    onFocus={() => setPhoneFocused(true)}
                    onBlur={() => setPhoneFocused(false)}
                    autoFocus
                  />
                </View>

                {!!error && <Text style={styles.error}>{error}</Text>}

                <TouchableOpacity
                  style={[styles.button, (!isPhoneValid || loading) && styles.buttonDisabled]}
                  onPress={onSendOtp}
                  activeOpacity={0.85}
                  disabled={!isPhoneValid || loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={[styles.buttonText, !isPhoneValid && styles.buttonTextDisabled]}>
                      Get OTP
                    </Text>
                  )}
                </TouchableOpacity>

                <View style={styles.trustRow}>
                  <Text style={styles.trustText}>🔒 Your number is safe with us</Text>
                </View>

                <Text style={styles.terms}>
                  By continuing, you agree to our Terms of Service and Privacy Policy
                </Text>
              </>
            ) : (
              <>
                <View style={styles.otpTop}>
                  <TouchableOpacity
                    onPress={goToPhoneStep}
                    style={styles.backBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={styles.backIcon}>‹</Text>
                  </TouchableOpacity>
                  <Text style={styles.headingInline}>Verify your number</Text>
                </View>

                <Text style={styles.sub}>
                  Enter the {OTP_LENGTH}-digit OTP sent to{'\n'}
                  <Text style={styles.phoneText}>+91 {phone}</Text>
                  {'  '}
                  <Text style={styles.change} onPress={goToPhoneStep}>
                    Change
                  </Text>
                </Text>

                {!!devOtp && (
                  <Pressable style={styles.devBanner} onPress={() => setOtp(devOtp)}>
                    <Text style={styles.devBannerLabel}>Test OTP (tap to fill)</Text>
                    <Text style={styles.devBannerCode}>{devOtp}</Text>
                  </Pressable>
                )}

                {/* OTP boxes + hidden input */}
                <Pressable
                  style={styles.boxRow}
                  onPress={() => otpInputRef.current?.focus()}
                >
                  {Array.from({ length: OTP_LENGTH }).map((_, i) => {
                    const filled = i < otp.length;
                    const active = i === otp.length || (isOtpValid && i === OTP_LENGTH - 1);
                    return (
                      <View
                        key={i}
                        style={[
                          styles.box,
                          filled && styles.boxFilled,
                          active && styles.boxActive,
                          !!error && styles.boxError,
                        ]}
                      >
                        <Text style={styles.boxText}>{otp[i] ?? ''}</Text>
                      </View>
                    );
                  })}
                  <TextInput
                    ref={otpInputRef}
                    style={styles.hiddenInput}
                    value={otp}
                    onChangeText={onChangeOtp}
                    keyboardType="number-pad"
                    maxLength={OTP_LENGTH}
                    autoFocus
                    textContentType="oneTimeCode"
                    autoComplete="sms-otp"
                    caretHidden
                  />
                </Pressable>

                {!!error && <Text style={styles.error}>{error}</Text>}

                <TouchableOpacity
                  style={[styles.button, (!isOtpValid || loading) && styles.buttonDisabled]}
                  onPress={onVerify}
                  activeOpacity={0.85}
                  disabled={!isOtpValid || loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={[styles.buttonText, !isOtpValid && styles.buttonTextDisabled]}>
                      Verify & Continue
                    </Text>
                  )}
                </TouchableOpacity>

                <View style={styles.resendRow}>
                  {seconds > 0 ? (
                    <Text style={styles.resendWait}>
                      {`Didn't get the OTP? Resend in 00:${String(seconds).padStart(2, '0')}`}
                    </Text>
                  ) : (
                    <TouchableOpacity onPress={onResend} disabled={loading}>
                      <Text style={styles.resend}>Resend OTP</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const ill = StyleSheet.create({
  scene: { width: 300, height: 160, alignSelf: 'center' },

  ring: {
    position: 'absolute',
    left: 75,
    top: 5,
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.4)',
  },
  glow: {
    position: 'absolute',
    left: 95,
    top: 25,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  dot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },

  hub: {
    position: 'absolute',
    left: 111,
    top: 41,
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: NAVY,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  hubIcon: { fontSize: 38 },

  chip: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: NAVY,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  chipIcon: { fontSize: 22 },

  chipSmall: {
    position: 'absolute',
    left: 181,
    top: 6,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: NAVY,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  chipSmallIcon: { fontSize: 16 },

  label: {
    position: 'absolute',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: BLUE },

  // hero
  header: { paddingTop: 20, paddingHorizontal: 24, paddingBottom: 18, overflow: 'hidden' },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  logoBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  logoBadgeText: { color: BLUE, fontSize: 22, fontWeight: '900' },
  brand: { fontSize: 30, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.8 },
  tagline: { fontSize: 15, color: '#FFFFFF', marginTop: 10, opacity: 0.85, fontWeight: '500' },

  illustration: { marginTop: 20, marginHorizontal: -24 },

  // sheet
  sheet: {
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  sheetContent: { padding: 24, paddingBottom: 32 },

  heading: { fontSize: 22, fontWeight: '800', color: NAVY },
  headingInline: { fontSize: 22, fontWeight: '800', color: NAVY },
  sub: { fontSize: 14, color: GREY, marginTop: 6, marginBottom: 22, lineHeight: 22 },
  phoneText: { color: NAVY, fontWeight: '700' },
  change: { color: BLUE, fontWeight: '700' },

  phoneRow: { flexDirection: 'row', marginBottom: 18 },
  codeBox: {
    height: 56,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
    backgroundColor: '#F8FAFC',
  },
  flag: { fontSize: 18, marginRight: 6 },
  codeText: { fontSize: 17, fontWeight: '700', color: NAVY },
  phoneInput: {
    flex: 1,
    height: 56,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 17,
    fontWeight: '700',
    color: NAVY,
    letterSpacing: 1,
  },
  inputFocused: { borderColor: BLUE },

  // otp
  otpTop: { flexDirection: 'row', alignItems: 'center' },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: BLUE_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  backIcon: { fontSize: 26, color: BLUE, marginTop: -3, fontWeight: '600' },
  boxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  box: {
    width: 48,
    height: 58,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxFilled: { borderColor: BLUE, backgroundColor: BLUE_LIGHT },
  boxActive: { borderColor: BLUE, borderWidth: 2.5, backgroundColor: '#fff' },
  boxError: { borderColor: RED, backgroundColor: '#FEF2F2' },
  boxText: { fontSize: 24, fontWeight: '800', color: NAVY },
  hiddenInput: { position: 'absolute', width: '100%', height: '100%', opacity: 0 },

  devBanner: {
    backgroundColor: BLUE_LIGHT,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 18,
  },
  devBannerLabel: { fontSize: 12, color: GREY, fontWeight: '600' },
  devBannerCode: { fontSize: 20, color: BLUE, fontWeight: '800', letterSpacing: 4, marginTop: 2 },

  error: { color: RED, fontSize: 13, marginBottom: 12, fontWeight: '500' },

  button: {
    height: 56,
    backgroundColor: BLUE,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { backgroundColor: '#E5E7EB' },
  buttonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 17 },
  buttonTextDisabled: { color: '#9CA3AF' },

  trustRow: { alignItems: 'center', marginTop: 18 },
  trustText: { fontSize: 13, color: GREY, fontWeight: '500' },

  terms: {
    fontSize: 12,
    color: GREY,
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 18,
  },
  resendRow: { alignItems: 'center', marginTop: 22 },
  resendWait: { fontSize: 14, color: GREY },
  resend: { fontSize: 15, fontWeight: '800', color: BLUE },
});