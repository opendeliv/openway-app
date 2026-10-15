import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { launchImageLibrary } from 'react-native-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Wahi api jo CaptainRideScreen me hai (token wali)
import api from './services/CaptainaRideApi';

const BLUE = '#1F6FE5';
const BLUE_LIGHT = '#EAF2FF';
const BG = '#F4F7FB';
const BLACK = '#0F172A';
const GREY = '#64748B';
const BORDER = '#E2E8F0';
const GREEN = '#16A34A';
const GREEN_LIGHT = '#DCFCE7';
const RED = '#DC2626';
const GOLD = '#F59E0B';

// Captain ka UPI QR phone me save rehta hai (gallery se chuna hua)
const QR_STORAGE_KEY = 'captain_upi_qr_uri';

type PayMethod = 'CASH' | 'UPI';

type CaptainRideDetail = {
  id: string;
  status: string;
  earning: number | null;
  acceptedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  ride: Record<string, any>;
};

const CATEGORY_LABEL: Record<string, string> = {
  CAB: '🚕 Cab',
  BIKE: '🏍️ Bike Ride',
  PARCEL: '📦 Parcel',
  GOODS: '🚚 Goods',
};

const RATING_TEXT: Record<number, string> = {
  1: 'Bahut kharab',
  2: 'Theek nahi',
  3: 'Theek-thaak',
  4: 'Achha',
  5: 'Bahut badhiya',
};

const getErrorMessage = (e: any, fallback: string) => {
  const msg = e?.response?.data?.message;
  return Array.isArray(msg) ? msg.join('\n') : msg || e?.message || fallback;
};

const prettyVehicle = (v?: string | null) => {
  if (!v) return '-';
  const s = v.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const formatTime = (iso?: string | null) => {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatDate = (iso?: string | null) => {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString([], {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const tripMinutes = (start?: string | null, end?: string | null) => {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  return Math.max(1, Math.round(ms / 60000));
};

// Label : value ki ek line
const Row = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue} numberOfLines={2}>
      {value}
    </Text>
  </View>
);

export default function RideSummaryScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const captainRideId: string = route.params?.captainRideId;

  const [data, setData] = useState<CaptainRideDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [captainName, setCaptainName] = useState('');

  // payment
  const [qrMode, setQrMode] = useState(false);
  const [qrUri, setQrUri] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  // rating
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [ratedLocal, setRatedLocal] = useState(false);

  // tick animation
  const tickScale = useRef(new Animated.Value(0)).current;

  const ride = data?.ride ?? {};
  const fare = Number(ride.fare ?? data?.earning ?? 0).toFixed(0);

  const paid = !!ride.paidAt;
  const paidMethod: PayMethod | null = ride.paymentMethod ?? null;
  const rated = ratedLocal || ride.userRating != null;

  // Payment + rating se pehle hardware back band
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    try {
      navigation.setOptions({ gestureEnabled: false });
    } catch {}
    return () => sub.remove();
  }, [navigation]);

  // Save kiya hua QR laao
  useEffect(() => {
    AsyncStorage.getItem(QR_STORAGE_KEY)
      .then((v) => v && setQrUri(v))
      .catch(() => {});
  }, []);

  // Captain ka apna naam (agar backend /captains/me me bheje)
  useEffect(() => {
    api
      .get('/captains/me')
      .then((res) => {
        const d: any = res.data;
        setCaptainName(d?.name ?? d?.user?.name ?? d?.fullName ?? '');
      })
      .catch(() => {});
  }, []);

  const fetchRide = useCallback(async () => {
    try {
      const res = await api.get<CaptainRideDetail>(`/captain-rides/${captainRideId}`);
      setData(res.data);
    } catch (e: any) {
      console.log('summary fetch error', e?.message);
    } finally {
      setLoading(false);
    }
  }, [captainRideId]);

  useEffect(() => {
    fetchRide();
  }, [fetchRide]);

  // Payment hote hi tick ka animation
  useEffect(() => {
    if (!paid) return;
    tickScale.setValue(0);
    Animated.spring(tickScale, {
      toValue: 1,
      friction: 5,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [paid, tickScale]);

  const finish = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  /* ---------- QR gallery se ---------- */
  const pickQr = async () => {
    try {
      const res = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1 });
      if (res.didCancel) return;

      if (res.errorCode) {
        Alert.alert('Gallery', res.errorMessage || 'Gallery nahi khul paayi');
        return;
      }

      const uri = res.assets?.[0]?.uri;
      if (!uri) return;

      setQrUri(uri);
      await AsyncStorage.setItem(QR_STORAGE_KEY, uri);
    } catch (e: any) {
      Alert.alert('Gallery', e?.message || 'QR nahi chun paaye');
    }
  };

  /* ---------- payment save ---------- */
  const savePayment = async (method: PayMethod) => {
    try {
      setPaying(true);
      await api.patch(`/captain-rides/${captainRideId}/payment`, { method });
      await fetchRide();
    } catch (e: any) {
      Alert.alert('Payment save nahi hui', getErrorMessage(e, 'Dobara try karo'));
    } finally {
      setPaying(false);
    }
  };

  const onCashPress = () => {
    if (paying) return;
    Alert.alert('Cash payment', `Kya aapko ₹${fare} cash mil gaye?`, [
      { text: 'Nahi', style: 'cancel' },
      { text: 'Haan, mil gaye', onPress: () => savePayment('CASH') },
    ]);
  };

  const onQrReceived = () => {
    if (paying) return;
    Alert.alert('UPI payment', `Kya customer ne ₹${fare} UPI se pay kar diye?`, [
      { text: 'Nahi', style: 'cancel' },
      { text: 'Haan, aa gaye', onPress: () => savePayment('UPI') },
    ]);
  };

  /* ---------- rating ---------- */
  const submitRating = async () => {
    if (rating < 1) {
      Alert.alert('Rating chahiye', 'Customer ko 1 se 5 star do');
      return;
    }

    try {
      setSubmitting(true);
      await api.post(`/captain-rides/${captainRideId}/rate`, {
        rating,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      });
      setRatedLocal(true);
      Alert.alert('Dhanyavaad 🙏', 'Aapki rating save ho gayi');
      finish();
    } catch (e: any) {
      Alert.alert('Rating save nahi hui', getErrorMessage(e, 'Dobara try karo'));
    } finally {
      setSubmitting(false);
    }
  };

  const skipRating = () => {
    Alert.alert('Rating skip karein?', 'Aap customer ko rate kiye bina wapas ja rahe ho.', [
      { text: 'Rating dunga', style: 'cancel' },
      { text: 'Skip karo', style: 'destructive', onPress: finish },
    ]);
  };

  /* ---------- UI ---------- */
  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={BLUE} />
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.center}>
          <Text style={styles.muted}>Ride ki details load nahi ho paayi</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchRide}>
            <Text style={styles.retryText}>Dobara try karo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipBtn} onPress={finish}>
            <Text style={styles.skipText}>Wapas jao</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const mins = tripMinutes(data.startedAt, data.completedAt);
  const customerName =
    ride.user?.name ?? ride.userName ?? ride.passengerName ?? ride.riderName;
  const customerPhone =
    ride.user?.phone ?? ride.userPhone ?? ride.passengerPhone ?? ride.riderPhone;
  const isParcelLike = ride.category === 'PARCEL' || ride.category === 'GOODS';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ================= PAYMENT (pehle) ================= */}
        {!paid ? (
          <>
            <Text style={styles.done}>Ride complete 🎉</Text>
            <Text style={styles.doneSub}>Ab customer se payment lo</Text>

            <View style={styles.amountCard}>
              <Text style={styles.amountLabel}>Total fare</Text>
              <Text style={styles.amountValue}>₹ {fare}</Text>
              <Text style={styles.amountSub}>
                {ride.distance != null ? `${Number(ride.distance).toFixed(1)} km` : ''}
                {ride.distance != null && mins != null ? '  •  ' : ''}
                {mins != null ? `${mins} min` : ''}
              </Text>
            </View>

            {!qrMode ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Payment kaise mili?</Text>

                <TouchableOpacity
                  style={[styles.payBtn, paying && styles.btnDisabled]}
                  activeOpacity={0.85}
                  disabled={paying}
                  onPress={onCashPress}
                >
                  {paying ? (
                    <ActivityIndicator color={BLUE} />
                  ) : (
                    <>
                      <Text style={styles.payEmoji}>💵</Text>
                      <View style={styles.flex}>
                        <Text style={styles.payTitle}>Cash</Text>
                        <Text style={styles.paySub}>Customer ne cash diya</Text>
                      </View>
                      <Text style={styles.payArrow}>›</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.payBtn}
                  activeOpacity={0.85}
                  disabled={paying}
                  onPress={() => setQrMode(true)}
                >
                  <Text style={styles.payEmoji}>📲</Text>
                  <View style={styles.flex}>
                    <Text style={styles.payTitle}>Use my own QR</Text>
                    <Text style={styles.paySub}>Apna UPI QR dikhao, customer scan karega</Text>
                  </View>
                  <Text style={styles.payArrow}>›</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>Apna UPI QR</Text>
                  <TouchableOpacity onPress={() => setQrMode(false)}>
                    <Text style={styles.link}>← Wapas</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.qrBox}>
                  {qrUri ? (
                    <>
                      <Image
                        source={{ uri: qrUri }}
                        style={styles.qrImage}
                        resizeMode="contain"
                      />
                      <Text style={styles.qrHint}>
                        Customer ye QR scan karke ₹{fare} pay kare
                      </Text>
                      <TouchableOpacity onPress={pickQr}>
                        <Text style={styles.link}>QR badlo</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <Text style={styles.qrEmpty}>
                        Abhi koi QR add nahi hai.{'\n'}Apna UPI QR gallery se chuno.
                      </Text>
                      <TouchableOpacity style={styles.qrAddBtn} onPress={pickQr}>
                        <Text style={styles.qrAddText}>🖼️ Gallery se QR add karo</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>

                <TouchableOpacity
                  style={[styles.primaryBtn, paying && styles.btnDisabled]}
                  disabled={paying}
                  onPress={onQrReceived}
                >
                  {paying ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryText}>Payment aa gayi ✅</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </>
        ) : (
          <>
            {/* ================= SUCCESS ================= */}
            <View style={styles.successWrap}>
              <Animated.View
                style={[styles.tickCircle, { transform: [{ scale: tickScale }] }]}
              >
                <Text style={styles.tick}>✓</Text>
              </Animated.View>
              <Text style={styles.successTitle}>Payment Successful</Text>
              <Text style={styles.successAmount}>₹ {fare}</Text>
              <Text style={styles.successSub}>
                {paidMethod === 'CASH' ? '💵 Cash' : '📲 UPI QR'} se mil gaye
              </Text>
            </View>

            {/* ================= COMPLETE DETAILS ================= */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Ride ki details</Text>

              <View style={styles.infoBlock}>
                <Row label="Ride ID" value={`#${String(ride.id ?? data.id).slice(0, 8).toUpperCase()}`} />
                <Row label="Date" value={formatDate(data.completedAt)} />
                <Row label="Type" value={CATEGORY_LABEL[ride.category] ?? '-'} />
                <Row label="Vehicle" value={prettyVehicle(ride.vehicleType)} />
              </View>

              <View style={styles.placeRow}>
                <View style={[styles.dot, { backgroundColor: GREEN }]} />
                <View style={styles.flex}>
                  <Text style={styles.placeLabel}>Pickup</Text>
                  <Text style={styles.placeText}>{ride.pickupAddress || '—'}</Text>
                </View>
              </View>
              <View style={styles.placeRow}>
                <View style={[styles.dot, { backgroundColor: RED }]} />
                <View style={styles.flex}>
                  <Text style={styles.placeLabel}>Drop</Text>
                  <Text style={styles.placeText}>{ride.dropAddress || '—'}</Text>
                </View>
              </View>

              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>
                    {ride.distance != null ? `${Number(ride.distance).toFixed(1)} km` : '-'}
                  </Text>
                  <Text style={styles.statLabel}>Doori</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{mins != null ? `${mins} min` : '-'}</Text>
                  <Text style={styles.statLabel}>Samay</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>₹ {fare}</Text>
                  <Text style={styles.statLabel}>Fare</Text>
                </View>
              </View>

              <View style={styles.infoBlock}>
                <Row label="Ride accept" value={formatTime(data.acceptedAt)} />
                <Row label="Ride start" value={formatTime(data.startedAt)} />
                <Row label="Ride complete" value={formatTime(data.completedAt)} />
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Customer</Text>
              <View style={styles.infoBlock}>
                <Row label="Naam" value={customerName || '-'} />
                <Row label="Phone" value={customerPhone || '-'} />
              </View>

              {isParcelLike && (
                <View style={styles.infoBlock}>
                  <Row label="Sender" value={ride.senderName || '-'} />
                  <Row label="Receiver" value={ride.receiverName || '-'} />
                  {!!ride.parcelDescription && (
                    <Row label="Parcel" value={ride.parcelDescription} />
                  )}
                </View>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Captain (aap)</Text>
              <View style={styles.infoBlock}>
                {!!captainName && <Row label="Naam" value={captainName} />}
                <Row label="Kamai" value={`₹ ${Number(data.earning ?? ride.fare ?? 0).toFixed(0)}`} />
                <Row
                  label="Payment"
                  value={`${paidMethod === 'CASH' ? 'Cash' : 'UPI QR'}  •  ${formatTime(ride.paidAt)}`}
                />
                <Row label="Status" value="Paid ✅" />
              </View>
            </View>

            {/* ================= RATING ================= */}
            {!rated ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Customer ko rate karo</Text>

                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <TouchableOpacity key={n} onPress={() => setRating(n)} activeOpacity={0.7}>
                      <Text style={[styles.star, { color: n <= rating ? GOLD : '#CBD5E1' }]}>
                        ★
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {rating > 0 && <Text style={styles.ratingText}>{RATING_TEXT[rating]}</Text>}

                <TextInput
                  style={styles.input}
                  placeholder="Kuch likhna ho to likho (optional)"
                  placeholderTextColor={GREY}
                  value={comment}
                  onChangeText={setComment}
                  multiline
                  maxLength={300}
                />

                <TouchableOpacity
                  style={[styles.primaryBtn, (rating < 1 || submitting) && styles.btnDisabled]}
                  disabled={rating < 1 || submitting}
                  onPress={submitRating}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryText}>Rating bhejo</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity style={styles.skipBtn} onPress={skipRating}>
                  <Text style={styles.skipText}>Skip karo</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.ratedBox}>
                  <Text style={styles.ratedText}>⭐ Rating de di gayi</Text>
                </View>
                <TouchableOpacity style={styles.primaryBtn} onPress={finish}>
                  <Text style={styles.primaryText}>Done</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, paddingBottom: 32 },
  muted: { fontSize: 13, color: GREY },
  btnDisabled: { opacity: 0.5 },

  done: { fontSize: 24, fontWeight: '800', color: BLACK, marginTop: 6 },
  doneSub: { fontSize: 14, color: GREY, marginTop: 2, marginBottom: 14 },

  retryBtn: {
    marginTop: 12,
    backgroundColor: BLUE_LIGHT,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryText: { color: BLUE, fontWeight: '800' },

  amountCard: {
    backgroundColor: BLUE,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    marginBottom: 14,
  },
  amountLabel: { color: '#DCE8FF', fontSize: 13 },
  amountValue: { color: '#fff', fontSize: 42, fontWeight: '800', marginTop: 2 },
  amountSub: { color: '#DCE8FF', fontSize: 13, marginTop: 4 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: BLACK },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },

  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 16,
    padding: 14,
    marginTop: 12,
    minHeight: 64,
  },
  payEmoji: { fontSize: 28, marginRight: 12 },
  payTitle: { fontSize: 15, fontWeight: '800', color: BLACK },
  paySub: { fontSize: 12, color: GREY, marginTop: 2 },
  payArrow: { fontSize: 26, color: GREY, marginLeft: 8 },

  qrBox: {
    alignItems: 'center',
    backgroundColor: BG,
    borderRadius: 14,
    padding: 14,
    marginVertical: 12,
  },
  qrImage: { width: 240, height: 240, borderRadius: 12, backgroundColor: '#fff' },
  qrHint: { fontSize: 13, fontWeight: '700', color: BLACK, marginTop: 10, textAlign: 'center' },
  qrEmpty: { fontSize: 13, color: GREY, textAlign: 'center', lineHeight: 19 },
  qrAddBtn: {
    backgroundColor: BLUE_LIGHT,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 12,
  },
  qrAddText: { color: BLUE, fontWeight: '800', fontSize: 13 },
  link: { color: BLUE, fontWeight: '700', fontSize: 13, marginTop: 8 },

  // success
  successWrap: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingVertical: 24,
    marginBottom: 14,
  },
  tickCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tick: { color: '#fff', fontSize: 48, fontWeight: '800', marginTop: -4 },
  successTitle: { fontSize: 20, fontWeight: '800', color: GREEN, marginTop: 14 },
  successAmount: { fontSize: 34, fontWeight: '800', color: BLACK, marginTop: 4 },
  successSub: { fontSize: 14, color: GREY, marginTop: 4 },

  // details
  infoBlock: {
    backgroundColor: BG,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 7,
  },
  infoLabel: { fontSize: 13, color: GREY, marginRight: 12 },
  infoValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '700',
    color: BLACK,
  },

  placeRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 14 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 5, marginRight: 10 },
  placeLabel: { fontSize: 12, color: GREY },
  placeText: { fontSize: 14, color: BLACK, fontWeight: '600', marginTop: 1 },

  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 12,
    marginTop: 14,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 15, fontWeight: '800', color: BLACK },
  statLabel: { fontSize: 12, color: GREY, marginTop: 2 },

  // rating
  starsRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 12 },
  star: { fontSize: 42, marginHorizontal: 4 },
  ratingText: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
    color: BLACK,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 12,
    minHeight: 70,
    textAlignVertical: 'top',
    color: BLACK,
    marginTop: 14,
    marginBottom: 14,
  },
  ratedBox: {
    backgroundColor: GREEN_LIGHT,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    marginBottom: 14,
  },
  ratedText: { color: GREEN, fontWeight: '800', fontSize: 14 },

  primaryBtn: {
    backgroundColor: BLUE,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  skipBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  skipText: { color: GREY, fontSize: 14, fontWeight: '700' },
});