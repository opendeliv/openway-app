import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { launchImageLibrary } from 'react-native-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

import api from '../services/CaptainaRideApi';
import { CATEGORY_LABEL, prettyLabel } from './CaptainRideCard';

// ================= RIDE SUMMARY (payment + details + rating) =================
// After a ride completes, a popup opens here:
// payment (Cash / Use my own QR) -> success tick + full details -> rating

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

// The summary popup opens automatically only within this time after completion
export const SUMMARY_WINDOW_MS = 10 * 60 * 1000;

// IDs of rides whose popup was closed (or payment + rating done), saved on the phone
export const DISMISSED_KEY = 'captain_dismissed_summaries';

// Captain's UPI QR saved on the phone (picked from gallery)
const QR_STORAGE_KEY = 'captain_upi_qr_uri';

type PayMethod = 'CASH' | 'UPI';

type RideDetail = {
  id: string;
  status: string;
  earning: number | null;
  acceptedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  ride: Record<string, any>;
};

const RATING_TEXT: Record<number, string> = {
  1: 'Very bad',
  2: 'Poor',
  3: 'Okay',
  4: 'Good',
  5: 'Excellent',
};

const getErrorMessage = (e: any, fallback: string) => {
  const msg = e?.response?.data?.message;
  return Array.isArray(msg) ? msg.join('\n') : msg || e?.message || fallback;
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

// One "label : value" line
const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <View style={sm.infoRow}>
    <Text style={sm.infoLabel}>{label}</Text>
    <Text style={sm.infoValue} numberOfLines={2}>
      {value}
    </Text>
  </View>
);

export default function RideSummaryModal({
  captainRideId,
  onClose,
}: {
  captainRideId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<RideDetail | null>(null);
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

  // Load the saved QR
  useEffect(() => {
    AsyncStorage.getItem(QR_STORAGE_KEY)
      .then((v) => v && setQrUri(v))
      .catch(() => {});
  }, []);

  // Captain's own name (if the backend returns it from /captains/me)
  useEffect(() => {
    api
      .get('/captains/me')
      .then((res) => {
        const d: any = res.data;
        setCaptainName(d?.name ?? d?.user?.name ?? d?.fullName ?? '');
      })
      .catch(() => {});
  }, []);

  const fetchDetail = useCallback(async () => {
    try {
      const res = await api.get<RideDetail>(`/captain-rides/${captainRideId}`);
      setData(res.data);
    } catch (e: any) {
      console.log('summary fetch error', e?.message);
    } finally {
      setLoading(false);
    }
  }, [captainRideId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // Tick animation as soon as payment is done
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

  // ---------- QR from gallery ----------
  const pickQr = async () => {
    try {
      const res = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1 });
      if (res.didCancel) return;

      if (res.errorCode) {
        Alert.alert('Gallery', res.errorMessage || 'Could not open the gallery');
        return;
      }

      const uri = res.assets?.[0]?.uri;
      if (!uri) return;

      setQrUri(uri);
      await AsyncStorage.setItem(QR_STORAGE_KEY, uri);
    } catch (e: any) {
      Alert.alert('Gallery', e?.message || 'Could not select the QR');
    }
  };

  // ---------- save payment ----------
  const savePayment = async (method: PayMethod) => {
    try {
      setPaying(true);
      await api.patch(`/captain-rides/${captainRideId}/payment`, { method });
      await fetchDetail();
    } catch (e: any) {
      Alert.alert('Payment not saved', getErrorMessage(e, 'Please try again'));
    } finally {
      setPaying(false);
    }
  };

  const onCashPress = () => {
    if (paying) return;
    Alert.alert('Cash payment', `Did you receive ₹${fare} in cash?`, [
      { text: 'No', style: 'cancel' },
      { text: 'Yes, received', onPress: () => savePayment('CASH') },
    ]);
  };

  const onQrReceived = () => {
    if (paying) return;
    Alert.alert('UPI payment', `Did the customer pay ₹${fare} via UPI?`, [
      { text: 'No', style: 'cancel' },
      { text: 'Yes, received', onPress: () => savePayment('UPI') },
    ]);
  };

  // ---------- rating ----------
  const submitRating = async () => {
    if (rating < 1) {
      Alert.alert('Rating required', 'Please rate the customer from 1 to 5 stars');
      return;
    }

    try {
      setSubmitting(true);
      await api.post(`/captain-rides/${captainRideId}/rate`, {
        rating,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      });
      setRatedLocal(true);
      Alert.alert('Thank you', 'Your rating has been saved');
      onClose();
    } catch (e: any) {
      Alert.alert('Rating not saved', getErrorMessage(e, 'Please try again'));
    } finally {
      setSubmitting(false);
    }
  };

  const skipRating = () => {
    Alert.alert('Skip rating?', 'You are leaving without rating the customer.', [
      { text: 'I will rate', style: 'cancel' },
      { text: 'Skip', style: 'destructive', onPress: onClose },
    ]);
  };

  // ---------- UI ----------
  const mins = tripMinutes(data?.startedAt, data?.completedAt);
  const customerName =
    ride.user?.name ?? ride.userName ?? ride.passengerName ?? ride.riderName;
  const customerPhone =
    ride.user?.phone ?? ride.userPhone ?? ride.passengerPhone ?? ride.riderPhone;
  const isParcelLike = ride.category === 'PARCEL' || ride.category === 'GOODS';
  const categoryLabel =
    (CATEGORY_LABEL as Record<string, string>)[ride.category] ?? '-';

  return (
    // Android back does not close the popup (before payment / rating)
    <Modal visible animationType="slide" onRequestClose={() => {}}>
      <SafeAreaView style={sm.container} edges={['top', 'bottom']}>
        {loading ? (
          <View style={sm.center}>
            <ActivityIndicator size="large" color={BLUE} />
          </View>
      ) : !data ? (
  <View style={sm.center}>
    <Text style={sm.muted}>Could not load ride details</Text>
    <TouchableOpacity style={sm.retryBtn} onPress={fetchDetail}>
      <Text style={sm.retryText}>Try again</Text>
    </TouchableOpacity>
  </View>
) : (
          <ScrollView
            contentContainerStyle={sm.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {!paid ? (
              <>
  
                <Text style={sm.done}>Ride completed</Text>
                <Text style={sm.doneSub}>Collect the payment from the customer</Text>

                <View style={sm.amountCard}>
                  <Text style={sm.amountLabel}>Total fare</Text>
                  <Text style={sm.amountValue}>₹ {fare}</Text>
                  <Text style={sm.amountSub}>
                    {ride.distance != null ? `${Number(ride.distance).toFixed(1)} km` : ''}
                    {ride.distance != null && mins != null ? '  •  ' : ''}
                    {mins != null ? `${mins} min` : ''}
                  </Text>
                </View>

                {!qrMode ? (
                  <View style={sm.card}>
                    <Text style={sm.cardTitle}>How was the payment received?</Text>

                    <TouchableOpacity
                      style={[sm.payBtn, paying && sm.btnDisabled]}
                      activeOpacity={0.85}
                      disabled={paying}
                      onPress={onCashPress}
                    >
                      {paying ? (
                        <ActivityIndicator color={BLUE} />
                      ) : (
                        <>
                          <Text style={sm.payEmoji}>💵</Text>
                          <View style={sm.flex}>
                            <Text style={sm.payTitle}>Cash</Text>
                            <Text style={sm.paySub}>Customer paid in cash</Text>
                          </View>
                          <Text style={sm.payArrow}>›</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={sm.payBtn}
                      activeOpacity={0.85}
                      disabled={paying}
                      onPress={() => setQrMode(true)}
                    >
                      <Text style={sm.payEmoji}>📲</Text>
                      <View style={sm.flex}>
                        <Text style={sm.payTitle}>Use my own QR</Text>
                        <Text style={sm.paySub}>
                          Show your UPI QR for the customer to scan
                        </Text>
                      </View>
                      <Text style={sm.payArrow}>›</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={sm.card}>
                    <View style={sm.rowBetween}>
                      <Text style={sm.cardTitle}>Your UPI QR</Text>
                      <TouchableOpacity onPress={() => setQrMode(false)}>
                        <Text style={sm.link}>← Back</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={sm.qrBox}>
                      {qrUri ? (
                        <>
                          <Image
                            source={{ uri: qrUri }}
                            style={sm.qrImage}
                            resizeMode="contain"
                          />
                          <Text style={sm.qrHint}>
                            Customer can scan this QR to pay ₹{fare}
                          </Text>
                          <TouchableOpacity onPress={pickQr}>
                            <Text style={sm.link}>Change QR</Text>
                          </TouchableOpacity>
                        </>
                      ) : (
                        <>
                          <Text style={sm.qrEmpty}>
                            No QR added yet.{'\n'}Choose your UPI QR from the gallery.
                          </Text>
                          <TouchableOpacity style={sm.qrAddBtn} onPress={pickQr}>
                            <Text style={sm.qrAddText}>Add QR from gallery</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>

                    <TouchableOpacity
                      style={[sm.primaryBtn, paying && sm.btnDisabled]}
                      disabled={paying}
                      onPress={onQrReceived}
                    >
                      {paying ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={sm.primaryBtnText}>Payment received</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </>
            ) : (
              <>
                {/* ============ SUCCESS TICK ============ */}
                <View style={sm.successWrap}>
                  <Animated.View
                    style={[sm.tickCircle, { transform: [{ scale: tickScale }] }]}
                  >
                    <Text style={sm.tick}>✓</Text>
                  </Animated.View>
                  <Text style={sm.successTitle}>Payment Successful</Text>
                  <Text style={sm.successAmount}>₹ {fare}</Text>
                  <Text style={sm.successSub}>
                    Received via {paidMethod === 'CASH' ? 'Cash' : 'UPI QR'}
                  </Text>
                </View>

                {/* ============ FULL DETAILS ============ */}
                <View style={sm.card}>
                  <Text style={sm.cardTitle}>Ride details</Text>

                  <View style={sm.infoBlock}>
                    <InfoRow
                      label="Ride ID"
                      value={`#${String(ride.id ?? data.id).slice(0, 8).toUpperCase()}`}
                    />
                    <InfoRow label="Date" value={formatDate(data.completedAt)} />
                    <InfoRow label="Type" value={categoryLabel} />
                    <InfoRow label="Vehicle" value={prettyLabel(ride.vehicleType) || '-'} />
                  </View>

                  <View style={sm.placeRow}>
                    <View style={[sm.dot, { backgroundColor: GREEN }]} />
                    <View style={sm.flex}>
                      <Text style={sm.placeLabel}>Pickup</Text>
                      <Text style={sm.placeText}>{ride.pickupAddress || '—'}</Text>
                    </View>
                  </View>
                  <View style={sm.placeRow}>
                    <View style={[sm.dot, { backgroundColor: RED }]} />
                    <View style={sm.flex}>
                      <Text style={sm.placeLabel}>Drop</Text>
                      <Text style={sm.placeText}>{ride.dropAddress || '—'}</Text>
                    </View>
                  </View>

                  <View style={sm.statsRow}>
                    <View style={sm.stat}>
                      <Text style={sm.statValue}>
                        {ride.distance != null
                          ? `${Number(ride.distance).toFixed(1)} km`
                          : '-'}
                      </Text>
                      <Text style={sm.statLabel}>Distance</Text>
                    </View>
                    <View style={sm.stat}>
                      <Text style={sm.statValue}>{mins != null ? `${mins} min` : '-'}</Text>
                      <Text style={sm.statLabel}>Duration</Text>
                    </View>
                    <View style={sm.stat}>
                      <Text style={sm.statValue}>₹ {fare}</Text>
                      <Text style={sm.statLabel}>Fare</Text>
                    </View>
                  </View>

                  <View style={sm.infoBlock}>
                    <InfoRow label="Ride accepted" value={formatTime(data.acceptedAt)} />
                    <InfoRow label="Ride started" value={formatTime(data.startedAt)} />
                    <InfoRow label="Ride completed" value={formatTime(data.completedAt)} />
                  </View>
                </View>

                <View style={sm.card}>
                  <Text style={sm.cardTitle}>Customer</Text>
                  <View style={sm.infoBlock}>
                    <InfoRow label="Name" value={customerName || '-'} />
                    <InfoRow label="Phone" value={customerPhone || '-'} />
                  </View>

                  {isParcelLike && (
                    <View style={sm.infoBlock}>
                      {!!ride.senderName && (
                        <InfoRow label="Sender" value={ride.senderName} />
                      )}
                      <InfoRow label="Receiver" value={ride.receiverName || '-'} />
                      {!!ride.receiverPhone && (
                        <InfoRow label="Receiver phone" value={ride.receiverPhone} />
                      )}
                      {!!ride.parcelDescription && (
                        <InfoRow label="Package" value={ride.parcelDescription} />
                      )}
                      {!!ride.parcelSize && (
                        <InfoRow label="Size" value={prettyLabel(ride.parcelSize)} />
                      )}
                    </View>
                  )}
                </View>

                <View style={sm.card}>
                  <Text style={sm.cardTitle}>Captain (you)</Text>
                  <View style={sm.infoBlock}>
                    {!!captainName && <InfoRow label="Name" value={captainName} />}
                    <InfoRow
                      label="Earning"
                      value={`₹ ${Number(data.earning ?? ride.fare ?? 0).toFixed(0)}`}
                    />
                    <InfoRow
                      label="Payment"
                      value={`${paidMethod === 'CASH' ? 'Cash' : 'UPI QR'}  •  ${formatTime(ride.paidAt)}`}
                    />
                    <InfoRow label="Status" value="Paid" />
                  </View>
                </View>

                {/* ============ RATING ============ */}
                {!rated ? (
                  <View style={sm.card}>
                    <Text style={sm.cardTitle}>Rate the customer</Text>

                    <View style={sm.starsRow}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <TouchableOpacity
                          key={n}
                          onPress={() => setRating(n)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[sm.star, { color: n <= rating ? GOLD : '#CBD5E1' }]}
                          >
                            ★
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {rating > 0 && <Text style={sm.ratingText}>{RATING_TEXT[rating]}</Text>}

                    <TextInput
                      style={sm.input}
                      placeholder="Write a comment (optional)"
                      placeholderTextColor={GREY}
                      value={comment}
                      onChangeText={setComment}
                      multiline
                      maxLength={300}
                    />

                    <TouchableOpacity
                      style={[sm.primaryBtn, (rating < 1 || submitting) && sm.btnDisabled]}
                      disabled={rating < 1 || submitting}
                      onPress={submitRating}
                    >
                      {submitting ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={sm.primaryBtnText}>Submit rating</Text>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity style={sm.skipBtn} onPress={skipRating}>
                      <Text style={sm.skipText}>Skip</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <View style={sm.ratedBox}>
                      <Text style={sm.ratedText}>Rating submitted</Text>
                    </View>
                    <TouchableOpacity style={sm.primaryBtn} onPress={onClose}>
                      <Text style={sm.primaryBtnText}>Done</Text>
                    </TouchableOpacity>
                  </>
                )}
              </>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const sm = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, paddingBottom: 32 },
  muted: { fontSize: 13, color: GREY },
  btnDisabled: { opacity: 0.5 },

  primaryBtn: {
    backgroundColor: BLUE,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  closeLink: { alignSelf: 'flex-end', paddingVertical: 6, paddingHorizontal: 4 },
  closeText: { color: GREY, fontSize: 13, fontWeight: '700' },
  done: { fontSize: 24, fontWeight: '800', color: BLACK, marginTop: 2 },
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
  qrHint: {
    fontSize: 13,
    fontWeight: '700',
    color: BLACK,
    marginTop: 10,
    textAlign: 'center',
  },
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

  skipBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  skipText: { color: GREY, fontSize: 14, fontWeight: '700' },
});