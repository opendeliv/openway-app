import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Text,
  StyleSheet,
  View,
  ScrollView,
  Switch,
  StatusBar,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  PermissionsAndroid,
  Platform,
  Animated,
  Easing,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';

// Map for picking a location (npm i react-native-maps)
import MapView, { Marker } from 'react-native-maps';

// GPS: npm i @react-native-community/geolocation
import Geolocation from '@react-native-community/geolocation';

// Pick QR from gallery: npm i react-native-image-picker @react-native-async-storage/async-storage
import { launchImageLibrary } from 'react-native-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Your axios instance / api helper (with token header)
import api from '../services/CaptainaRideApi';

// Shared RAPTOR brand (same as user Home)
import { RAPTR_LOGO } from '../image/logoBase64';

// Active ride card (separate file)
import CaptainRideCard, {
  CaptainRide,
  CaptainRideStatus,
  RideCategory,
  CATEGORY_LABEL,
  NEXT_ACTION,
  prettyLabel,
} from '../components/CaptainRideCard'; // adjust path to your folder

const BLUE = '#1F6FE5';
const BLUE_DARK = '#1553B3';
const BLUE_LIGHT = '#EAF2FF';
const BG = '#F4F7FB';
const BLACK = '#0F172A';
const GREY = '#64748B';
const BORDER = '#E2E8F0';
const GREEN = '#16A34A';
const RED = '#DC2626';

// While online, the live location is pushed to the backend every N ms
const LOCATION_PUSH_MS = 10000;

// If the captain is farther than this (meters) from the drop, show a warning on complete
const DROP_NEAR_METERS = 300;

type Coords = { latitude: number; longitude: number };

// Backend: GET /maps/autocomplete
type PlaceSuggestion = { placeId: string; title: string; subtitle: string };

// Address of a location from backend: GET /maps/reverse?lat=&lng=
const reverseGeocode = async (c: Coords): Promise<string> => {
  try {
    const res = await api.get<{ address: string }>('/maps/reverse', {
      params: { lat: c.latitude, lng: c.longitude },
    });
    return res.data?.address ?? '';
  } catch (e: any) {
    console.log('reverse geocode failed:', e?.message);
    return '';
  }
};

// Backend: GET /captains/me
type CaptainMe = {
  isOnline: boolean;
  pickupRangeKm: number | null;
  acceptedRideTypes: string[] | null;
};

// Request available to the captain (backend: GET /captain-rides/available)
type AvailableRide = {
  id: string;
  category: RideCategory;
  vehicleType: string;
  pickupAddress: string;
  dropAddress: string;
  fare: number | null;
  distance: number | null;
  duration: number | null;
  pickupDistanceKm: number | null;
  senderName: string | null;
  senderPhone: string | null;
  receiverName: string | null;
  receiverPhone: string | null;
  parcelSize: string | null;
  parcelDescription: string | null;
};

const ACTIVE_STATUSES: CaptainRideStatus[] = [
  'ASSIGNED',
  'ACCEPTED',
  'ARRIVING',
  'ARRIVED',
  'STARTED',
];

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// ---------- helpers ----------
const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

// Monday (00:00) of this week
const startOfWeek = (d: Date) => {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7; // Mon=0 ... Sun=6
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
};

const getErrorMessage = (e: any, fallback: string) => {
  const msg = e?.response?.data?.message;
  return Array.isArray(msg) ? msg.join('\n') : msg || e?.message || fallback;
};

// Distance between two coordinates (meters)
const distanceM = (a: Coords, b: Coords) => {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) *
      Math.cos(toRad(b.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// Before completing a ride, confirm the captain reached the drop location.
// far = current distance from drop (meters); if known, a warning is shown
const confirmComplete = (onYes: () => void, far?: number | null) => {
  const message =
    far != null && far > DROP_NEAR_METERS
      ? `You are about ${Math.round(far)} m away from the drop location.\nDo you still want to complete the ride?`
      : "Have you reached the customer's drop location?";

  Alert.alert('Drop location check', message, [
    { text: 'No', style: 'cancel' },
    { text: 'Yes, Complete', onPress: onYes },
  ]);
};

// ---------- GPS helpers ----------
const ensureLocationPermission = async (): Promise<boolean> => {
  if (Platform.OS === 'android') {
    const res = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    return res === PermissionsAndroid.RESULTS.GRANTED;
  }

  // iOS: permission popup
  return new Promise<boolean>((resolve) => {
    try {
      Geolocation.requestAuthorization(
        () => resolve(true),
        () => resolve(false),
      );
    } catch {
      resolve(true);
    }
  });
};

const getPositionOnce = (options: {
  enableHighAccuracy: boolean;
  timeout: number;
  maximumAge: number;
}) =>
  new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }),
      (err) => reject(err),
      options,
    );
  });

// Try high accuracy (GPS) first; if that fails, fall back to low accuracy (WiFi / network).
const getCurrentCoords = async () => {
  try {
    return await getPositionOnce({
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 10000,
    });
  } catch (firstErr) {
    console.log('GPS high accuracy failed', firstErr);
    return getPositionOnce({
      enableHighAccuracy: false,
      timeout: 20000,
      maximumAge: 60000,
    });
  }
};

// Turn the real error that happened while going online into a readable message
const getOnlineErrorMessage = (e: any) => {
  const backendMsg = e?.response?.data?.message;
  if (backendMsg) {
    return Array.isArray(backendMsg) ? backendMsg.join('\n') : backendMsg;
  }

  // The request never reached the server
  if (e?.request || e?.message === 'Network Error') {
    return 'Could not connect to the server. Check your internet connection and API URL.';
  }

  // Geolocation errors: 1 = permission, 2 = position unavailable, 3 = timeout
  if (e?.code === 1) {
    return 'Location permission is off. Enable location permission for the app in phone Settings.';
  }
  if (e?.code === 2) {
    return 'Phone location (GPS) is off or unavailable. Please turn on location.';
  }
  if (e?.code === 3) {
    return 'Getting your location took too long. Move to an open area or set a location in the emulator.';
  }

  return e?.message || 'Something went wrong, please try again';
};

// ================= RIDE SUMMARY (payment + details + rating) =================
// After a ride completes, a popup opens here:
// payment (Cash / Use my own QR) -> success tick + full details -> rating

// The summary popup opens automatically only within this time after completion
const SUMMARY_WINDOW_MS = 10 * 60 * 1000;

// IDs of rides whose popup was closed (or payment + rating done), saved on the phone
const DISMISSED_KEY = 'captain_dismissed_summaries';

// Captain's UPI QR saved on the phone (picked from gallery)
const QR_STORAGE_KEY = 'captain_upi_qr_uri';

const GREEN_LIGHT = '#DCFCE7';
const GOLD = '#F59E0B';

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

function RideSummaryModal({
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
            <TouchableOpacity style={sm.skipBtn} onPress={onClose}>
              <Text style={sm.skipText}>Go back</Text>
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
                {/* ============ PAYMENT ============ */}
                <TouchableOpacity style={sm.closeLink} onPress={onClose}>
                  <Text style={sm.closeText}>✕ Later</Text>
                </TouchableOpacity>
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
                          <View style={styles.flex}>
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
                      <View style={styles.flex}>
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
                      style={[styles.primaryBtn, paying && sm.btnDisabled]}
                      disabled={paying}
                      onPress={onQrReceived}
                    >
                      {paying ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.primaryBtnText}>Payment received</Text>
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
                    <View style={[styles.dot, { backgroundColor: GREEN }]} />
                    <View style={styles.flex}>
                      <Text style={styles.placeLabel}>Pickup</Text>
                      <Text style={styles.placeText}>{ride.pickupAddress || '—'}</Text>
                    </View>
                  </View>
                  <View style={sm.placeRow}>
                    <View style={[styles.dot, { backgroundColor: RED }]} />
                    <View style={styles.flex}>
                      <Text style={styles.placeLabel}>Drop</Text>
                      <Text style={styles.placeText}>{ride.dropAddress || '—'}</Text>
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
                      style={[
                        styles.primaryBtn,
                        (rating < 1 || submitting) && sm.btnDisabled,
                      ]}
                      disabled={rating < 1 || submitting}
                      onPress={submitRating}
                    >
                      {submitting ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.primaryBtnText}>Submit rating</Text>
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
                    <TouchableOpacity style={styles.primaryBtn} onPress={onClose}>
                      <Text style={styles.primaryBtnText}>Done</Text>
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
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, paddingBottom: 32 },
  muted: { fontSize: 13, color: GREY },
  btnDisabled: { opacity: 0.5 },

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

// Emoji + tint for a request card (category / vehicle based)
const vehicleLook = (category?: string | null, vehicleType?: string | null) => {
  const cat = (category ?? '').toUpperCase();
  const veh = (vehicleType ?? '').toLowerCase();

  if (cat === 'PARCEL') return { emoji: '📦', tint: '#FFE4D6' };
  if (cat === 'GOODS') return { emoji: '🚚', tint: '#EADFFB' };
  if (veh.includes('bike') || veh.includes('scooty') || veh === 'lite') {
    return { emoji: '🏍️', tint: '#DDF5E6' };
  }
  if (veh.includes('auto') || veh.includes('rickshaw')) {
    return { emoji: '🛺', tint: '#FFF3C4' };
  }
  return { emoji: '🚕', tint: '#FFF3C4' };
};

// Online + waiting: two pulsing rings around a center icon
function RadarPulse() {
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const make = (v: Animated.Value) =>
      Animated.loop(
        Animated.timing(v, {
          toValue: 1,
          duration: 2000,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      );

    const loopA = make(a);
    const loopB = make(b);
    loopA.start();
    const t = setTimeout(() => loopB.start(), 1000);

    return () => {
      clearTimeout(t);
      loopA.stop();
      loopB.stop();
    };
  }, [a, b]);

  const ring = (v: Animated.Value) => ({
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
    transform: [
      { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.25] }) },
    ],
  });

  return (
    <View style={styles.radarWrap}>
      <Animated.View style={[styles.radarRing, ring(a)]} />
      <Animated.View style={[styles.radarRing, ring(b)]} />
      <View style={styles.radarCore}>
        <Ionicons name="navigate" size={28} color="#fff" />
      </View>
    </View>
  );
}

export default function CaptainHomeScreen() {
  const navigation = useNavigation<any>();

  // Synced with backend (PATCH /captains/me/online)
  const [online, setOnline] = useState(false);
  const [togglingOnline, setTogglingOnline] = useState(false);

  // Captain's chosen range / ride types (GET /captains/me)
  const [pickupRangeKm, setPickupRangeKm] = useState<number | null>(null);
  const [selectedTypesCount, setSelectedTypesCount] = useState(0);

  const [rides, setRides] = useState<CaptainRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState(false);

  // new requests
  const [availableRides, setAvailableRides] = useState<AvailableRide[]>([]);
  const [availableError, setAvailableError] = useState('');
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  // cancel modal
  const [cancelVisible, setCancelVisible] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // start-ride OTP modal (customer tells the 4 digit OTP)
  const [otpVisible, setOtpVisible] = useState(false);
  const [otpValue, setOtpValue] = useState('');

  // prevent overlapping location pushes
  const pushingLocation = useRef(false);

  // Status of the captain's live location
  const [locationOk, setLocationOk] = useState(true);

  // Captain's current location + whether it was picked manually
  const [myLocation, setMyLocation] = useState<Coords | null>(null);
  const [myAddress, setMyAddress] = useState('');
  const [manualLocation, setManualLocation] = useState(false);
  // If a manual location is chosen, it is sent every 10 sec instead of GPS
  const manualRef = useRef<Coords | null>(null);

  // Map modal
  const [mapVisible, setMapVisible] = useState(false);
  const [pickedCoords, setPickedCoords] = useState<Coords | null>(null);
  const [savingLocation, setSavingLocation] = useState(false);
  const mapRef = useRef<MapView>(null);

  // Place search inside the map modal
  const [searchText, setSearchText] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);

  // Place suggestions from the backend while typing (400ms debounce)
  useEffect(() => {
    if (!mapVisible) return;

    const q = searchText.trim();
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }

    const t = setTimeout(async () => {
      try {
        const res = await api.get<PlaceSuggestion[]>('/maps/autocomplete', {
          params: {
            q,
            lat: pickedCoords?.latitude,
            lng: pickedCoords?.longitude,
          },
        });
        setSuggestions(res.data);
      } catch {
        setSuggestions([]);
      }
    }, 400);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText, mapVisible]);

  // Fetch the address even if the app opens already online (or the location arrives later)
  const triedAddress = useRef(false);
  useEffect(() => {
    if (!online) {
      triedAddress.current = false;
      return;
    }
    if (myLocation && !myAddress && !triedAddress.current) {
      triedAddress.current = true;
      reverseGeocode(myLocation).then((a) => {
        if (a) setMyAddress(a);
      });
    }
  }, [online, myLocation, myAddress]);

  const showLocation = async (c: Coords) => {
    setMyLocation(c);
    setMyAddress(await reverseGeocode(c));
  };

  // Get the current location and send it to the backend.
  const pushLocation = useCallback(async () => {
    if (pushingLocation.current) return;
    pushingLocation.current = true;
    try {
      const coords = manualRef.current ?? (await getCurrentCoords());
      await api.patch('/captains/me/location', coords);
      setMyLocation(coords);
      setLocationOk(true);
    } catch (e: any) {
      setLocationOk(false);
      console.log('location push error', e?.response?.data || e?.message);
    } finally {
      pushingLocation.current = false;
    }
  }, []);

  // ---------- fetchers ----------
  const fetchCaptain = useCallback(async () => {
    try {
      const res = await api.get<CaptainMe>('/captains/me');
      setOnline(!!res.data.isOnline);
      setPickupRangeKm(
        res.data.pickupRangeKm != null ? Number(res.data.pickupRangeKm) : null,
      );
      setSelectedTypesCount((res.data.acceptedRideTypes ?? []).length);
    } catch (e: any) {
      console.log('fetch captain error', e?.response?.data || e?.message);
    }
  }, []);

  const fetchRides = useCallback(async () => {
    try {
      const res = await api.get<CaptainRide[]>('/captain-rides/my');
      setRides(res.data);
    } catch (e: any) {
      console.log('fetch rides error', e?.response?.data || e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchAvailable = useCallback(async () => {
    try {
      const res = await api.get<AvailableRide[]>('/captain-rides/available');
      setAvailableRides(res.data);
      setAvailableError('');
    } catch (e: any) {
      setAvailableError(getErrorMessage(e, 'Could not load requests'));
    }
  }, []);

  useEffect(() => {
    fetchRides();
  }, [fetchRides]);

  // Fresh captain data when the screen is focused (and when returning from Profile)
  useFocusEffect(
    useCallback(() => {
      fetchCaptain();
      fetchRides();
    }, [fetchCaptain, fetchRides]),
  );

  const activeRide = useMemo(
    () => rides.find((r) => ACTIVE_STATUSES.includes(r.status)) ?? null,
    [rides],
  );
  const hasActiveRide = !!activeRide;

  // After a ride completes, the summary popup opens while payment or rating is pending
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [dismissLoaded, setDismissLoaded] = useState(false);

  // Load previously dismissed popups from the phone (so they do not come back after reopening the app)
  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_KEY)
      .then((v) => {
        if (v) setDismissedIds(JSON.parse(v));
      })
      .catch(() => {})
      .finally(() => setDismissLoaded(true));
  }, []);

  const summaryRide = useMemo(
    () =>
      !dismissLoaded
        ? null
        : rides.find(
            (r) =>
              r.status === 'COMPLETED' &&
              !!r.completedAt &&
              Date.now() - new Date(r.completedAt).getTime() < SUMMARY_WINDOW_MS &&
              (!r.ride?.paidAt || r.ride?.userRating == null) &&
              !dismissedIds.includes(r.id),
          ) ?? null,
    [rides, dismissedIds, dismissLoaded],
  );

  const closeSummary = () => {
    if (summaryRide) {
      const next = [...dismissedIds, summaryRide.id].slice(-50);
      setDismissedIds(next);
      AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify(next)).catch(() => {});
    }
    fetchRides();
  };

  // While online, send the live location to the backend every 10 sec
  useEffect(() => {
    if (!online) return;

    pushLocation();
    const t = setInterval(pushLocation, LOCATION_PUSH_MS);

    return () => clearInterval(t);
  }, [online, pushLocation]);

  // While online or on an active ride, refresh rides every 10 sec
  useEffect(() => {
    if (!online && !hasActiveRide) return;
    const t = setInterval(fetchRides, 10000);
    return () => clearInterval(t);
  }, [online, hasActiveRide, fetchRides]);

  // While online with no active ride, fetch new requests every 8 sec
  useEffect(() => {
    if (!online || hasActiveRide) {
      setAvailableRides([]);
      setAvailableError('');
      return;
    }

    fetchAvailable();
    const t = setInterval(fetchAvailable, 8000);
    return () => clearInterval(t);
  }, [online, hasActiveRide, fetchAvailable]);

  // ---------- stats ----------
  const stats = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now);
    const todayIdx = (now.getDay() + 6) % 7;

    const completed = rides.filter(
      (r) => r.status === 'COMPLETED' && r.completedAt,
    );

    const todayCompleted = completed.filter((r) =>
      isSameDay(new Date(r.completedAt!), now),
    );

    const todayCancelled = rides.filter(
      (r) =>
        r.status === 'CANCELLED' &&
        r.cancelledAt &&
        isSameDay(new Date(r.cancelledAt), now),
    );

    const todayEarning = todayCompleted.reduce(
      (s, r) => s + Number(r.earning ?? 0),
      0,
    );

    const week = DAY_LABELS.map((day, i) => {
      const amount = completed
        .filter((r) => {
          const d = new Date(r.completedAt!);
          const dayStart = new Date(weekStart);
          dayStart.setDate(weekStart.getDate() + i);
          return isSameDay(d, dayStart);
        })
        .reduce((s, r) => s + Number(r.earning ?? 0), 0);
      return { id: `d${i}`, day, amount, isToday: i === todayIdx };
    });

    return {
      todayEarning,
      todayTrips: todayCompleted.length,
      todayCancelled: todayCancelled.length,
      totalTrips: completed.length,
      week,
      weekTotal: week.reduce((s, w) => s + w.amount, 0),
    };
  }, [rides]);

  const maxAmount = Math.max(...stats.week.map((w) => w.amount), 1);

  const TODAY = [
    { id: 'trips', value: String(stats.todayTrips), label: 'Trips Today' },
    { id: 'cancel', value: String(stats.todayCancelled), label: 'Cancelled' },
    { id: 'total', value: String(stats.totalTrips), label: 'Total Trips' },
  ];

  // ---------- actions ----------
  // Online / offline: saved on the backend (GPS location is required to go online)
  const onToggleOnline = async (value: boolean) => {
    if (togglingOnline) return;

    try {
      setTogglingOnline(true);

      if (value) {
        // If no ride type is selected, remind the captain first
        if (selectedTypesCount === 0) {
          const goAnyway = await new Promise<boolean>((resolve) => {
            Alert.alert(
              'No ride types selected',
              'Go to Profile > Ride Preferences and choose which rides you want to accept (e.g. Lite bike, Mini, Auto, Parcel).',
              [
                { text: 'OK', style: 'cancel', onPress: () => resolve(false) },
                { text: 'Go online anyway', onPress: () => resolve(true) },
              ],
              { cancelable: false },
            );
          });
          if (!goAnyway) return;
        }

        const granted = await ensureLocationPermission();
        if (!granted) {
          Alert.alert(
            'Location required',
            'Turn on location permission to receive ride requests',
          );
          return;
        }

        const coords = manualRef.current ?? (await getCurrentCoords());
        await api.patch('/captains/me/online', {
          isOnline: true,
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
        setOnline(true);
        showLocation(coords);
      } else {
        await api.patch('/captains/me/online', { isOnline: false });
        setOnline(false);
        // On going offline, clear the manual location; next time starts from GPS
        manualRef.current = null;
        setManualLocation(false);
        setMyLocation(null);
        setMyAddress('');
      }
    } catch (e: any) {
      console.log('toggle online error', e?.response?.data || e);
      Alert.alert(
        value ? 'Could not go online' : 'Could not go offline',
        getOnlineErrorMessage(e),
      );
    } finally {
      setTogglingOnline(false);
    }
  };

  // Change location: manual = true if picked on the map, false for phone GPS
  const saveLocation = async (coords: Coords, manual: boolean) => {
    if (savingLocation) return;

    try {
      setSavingLocation(true);
      await api.patch('/captains/me/location', coords);

      manualRef.current = manual ? coords : null;
      setManualLocation(manual);
      setLocationOk(true);
      setMapVisible(false);
      showLocation(coords);

      if (online && !hasActiveRide) fetchAvailable();
    } catch (e: any) {
      Alert.alert('Location not saved', getOnlineErrorMessage(e));
    } finally {
      setSavingLocation(false);
    }
  };

  const onUseGps = async () => {
    try {
      setSavingLocation(true);
      const coords = await getCurrentCoords();
      setSavingLocation(false);
      await saveLocation(coords, false);
    } catch (e: any) {
      setSavingLocation(false);
      Alert.alert('Could not get GPS location', getOnlineErrorMessage(e));
    }
  };

  const openLocationPicker = () => {
    setPickedCoords(myLocation);
    setSearchText('');
    setSuggestions([]);
    setMapVisible(true);
  };

  // A place was chosen from search: get coordinates from the backend and move the map there
  const onPickSuggestion = async (s: PlaceSuggestion) => {
    try {
      const res = await api.get<{
        address: string;
        latitude: number;
        longitude: number;
      }>(`/maps/place/${s.placeId}`);

      const c = { latitude: res.data.latitude, longitude: res.data.longitude };

      setPickedCoords(c);
      setSuggestions([]);
      setSearchText('');
      mapRef.current?.animateToRegion(
        { ...c, latitudeDelta: 0.01, longitudeDelta: 0.01 },
        400,
      );
    } catch (e: any) {
      Alert.alert('Place not found', getErrorMessage(e, 'Please try again'));
    }
  };

  const acceptRide = async (rideId: string) => {
    if (acceptingId) return;

    try {
      setAcceptingId(rideId);
      // Send a fresh location before accepting
      await pushLocation();
      const res = await api.post<{ id: string }>(
        `/captain-rides/accept/${rideId}`,
      );
      setAvailableRides([]);
      await fetchRides();
      // On accept, open the map screen: customer's pickup point + route
      navigation.navigate('CaptainRide', { captainRideId: res.data.id });
    } catch (e: any) {
      Alert.alert('Could not accept', getErrorMessage(e, 'Could not accept the ride'));
      // Another captain may have taken it; reload the list
      fetchAvailable();
    } finally {
      setAcceptingId(null);
    }
  };

  const updateStatus = async (
    captainRideId: string,
    status: CaptainRideStatus,
    cancellationReason?: string,
    otp?: string,
  ): Promise<boolean> => {
    try {
      setUpdating(true);
      await api.patch(`/captain-rides/${captainRideId}/status`, {
        status,
        ...(cancellationReason ? { cancellationReason } : {}),
        ...(otp ? { otp } : {}),
      });
      await fetchRides();
      return true;
    } catch (e: any) {
      Alert.alert('Error', getErrorMessage(e, 'Status update failed'));
      return false;
    } finally {
      setUpdating(false);
    }
  };

  const nextAction = activeRide ? NEXT_ACTION[activeRide.status] : undefined;

  // On the next-action button: confirm the drop location before COMPLETED
  const onNextActionPress = () => {
    if (!activeRide || !nextAction) return;

    if (nextAction.next === 'COMPLETED') {
      const dropLat = Number(activeRide.ride?.dropLatitude);
      const dropLng = Number(activeRide.ride?.dropLongitude);
      const hasDrop =
        activeRide.ride?.dropLatitude != null &&
        activeRide.ride?.dropLongitude != null &&
        !Number.isNaN(dropLat) &&
        !Number.isNaN(dropLng);

      const far =
        myLocation && hasDrop
          ? distanceM(myLocation, { latitude: dropLat, longitude: dropLng })
          : null;

      confirmComplete(() => updateStatus(activeRide.id, 'COMPLETED'), far);
      return;
    }

    // Starting the ride needs the OTP from the customer
    if (nextAction.next === 'STARTED') {
      setOtpValue('');
      setOtpVisible(true);
      return;
    }

    updateStatus(activeRide.id, nextAction.next);
  };

  const onConfirmOtp = async () => {
    if (!activeRide) return;
    if (otpValue.length !== 4) {
      Alert.alert('OTP required', 'Enter the 4-digit OTP shown on the customer\'s phone');
      return;
    }
    const ok = await updateStatus(activeRide.id, 'STARTED', undefined, otpValue);
    if (ok) {
      setOtpVisible(false);
      setOtpValue('');
    }
  };

  const onConfirmCancel = async () => {
    if (!activeRide) return;
    if (!cancelReason.trim()) {
      Alert.alert('Reason required', 'Please enter a cancellation reason');
      return;
    }
    setCancelVisible(false);
    await updateStatus(activeRide.id, 'CANCELLED', cancelReason.trim());
    setCancelReason('');
  };

  const onRefresh = async () => {
    setRefreshing(true);
    fetchRides();
    fetchCaptain();
    if (online) {
      await pushLocation();
      if (!hasActiveRide) fetchAvailable();
    }
  };

  // Which range / ride types the incoming requests are filtered by
  const filterSummary =
    pickupRangeKm != null
      ? `${pickupRangeKm} km range  •  ${
          selectedTypesCount > 0
            ? `${selectedTypesCount} ride type${selectedTypesCount > 1 ? 's' : ''} selected`
            : 'all ride types'
        }`
      : '';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" />

      {/* Header: RAPTOR brand on the left, online toggle + notifications on the right */}
      <View style={styles.header}>
        <Image source={{ uri: RAPTR_LOGO }} style={styles.logo} resizeMode="contain" />

        <View style={styles.headerRight}>
          <View style={[styles.statusPill, online && styles.statusPillOn]}>
            <View style={[styles.statusDot, online && styles.statusDotOn]} />
            <Text style={[styles.switchText, online && styles.switchTextOn]}>
              {online ? 'ONLINE' : 'OFFLINE'}
            </Text>
            {togglingOnline ? (
              <ActivityIndicator color={BLUE} style={styles.switchLoader} />
            ) : (
              <Switch
                value={online}
                onValueChange={onToggleOnline}
                trackColor={{ false: '#CBD5E1', true: '#86EFAC' }}
                thumbColor={online ? GREEN : '#fff'}
              />
            )}
          </View>

          {/* Notifications: count of new ride requests */}
          <TouchableOpacity
            style={styles.bellBtn}
            activeOpacity={0.8}
            onPress={() =>
              Alert.alert(
                'Notifications',
                availableRides.length > 0
                  ? `${availableRides.length} new ride request${availableRides.length > 1 ? 's' : ''}`
                  : 'No new notifications',
              )
            }
          >
            <Ionicons name="notifications-outline" size={21} color={BLACK} />
            {availableRides.length > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>
                  {availableRides.length > 9 ? '9+' : availableRides.length}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />
        }
      >
        {/* Captain's current location (when online) */}
        {online && (
          <View style={styles.locCard}>
            <View style={styles.locIcon}>
              <Ionicons name="location" size={22} color={BLUE} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.locLabel}>
                YOUR LOCATION{manualLocation ? '  •  MANUAL' : '  •  LIVE'}
              </Text>
              <Text style={styles.locText} numberOfLines={2}>
                {myAddress ||
                  (myLocation
                    ? `${myLocation.latitude.toFixed(5)}, ${myLocation.longitude.toFixed(5)}`
                    : 'Fetching location...')}
              </Text>
              {locationOk ? (
                <Text style={styles.locSub}>
                  Customers will see their distance from this location
                </Text>
              ) : (
                <Text style={[styles.locSub, styles.locSubError]}>
                  Unable to fetch location. Please turn on GPS.
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.locBtn}
              activeOpacity={0.8}
              onPress={openLocationPicker}
            >
              <Text style={styles.locBtnText}>Change</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Today's earnings */}
        <View style={styles.earnCard}>
          <View style={styles.earnCircleBig} />
          <View style={styles.earnCircleSmall} />

          <View style={styles.earnTop}>
            <View>
              <Text style={styles.earnLabel}>Today's earnings</Text>
              <Text style={styles.earnValue}>₹ {stats.todayEarning.toFixed(0)}</Text>
            </View>
            <View style={styles.earnIcon}>
              <Ionicons name="wallet-outline" size={22} color="#fff" />
            </View>
          </View>

          <View style={styles.earnRow}>
            {TODAY.map((t, i) => (
              <View
                key={t.id}
                style={[styles.earnStat, i < TODAY.length - 1 && styles.earnDivider]}
              >
                <Text style={styles.earnStatValue}>{t.value}</Text>
                <Text style={styles.earnStatLabel}>{t.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Active ride / Requests / Status */}
        {loading ? (
          <View style={styles.statusCard}>
            <ActivityIndicator color={BLUE} />
          </View>
        ) : activeRide ? (
          <CaptainRideCard
            ride={activeRide}
            updating={updating}
            nextActionLabel={nextAction?.label}
            onNextAction={onNextActionPress}
            onOpenMap={() =>
              navigation.navigate('CaptainRide', { captainRideId: activeRide.id })
            }
            onCancel={() => setCancelVisible(true)}
          />
        ) : online && availableRides.length > 0 ? (
          <View>
            <View style={styles.requestsHead}>
              <Text style={styles.requestsTitle}>New requests</Text>
              <View style={styles.requestsCount}>
                <Text style={styles.requestsCountText}>{availableRides.length}</Text>
              </View>
            </View>
            {!!filterSummary && (
              <Text style={styles.filterText}>{filterSummary}</Text>
            )}

            {availableRides.map((r) => {
              const accepting = acceptingId === r.id;
              const parcelLike = r.category === 'PARCEL' || r.category === 'GOODS';
              const hasSender = !!r.senderName || !!r.senderPhone;
              const look = vehicleLook(r.category, r.vehicleType);

              // Summary strip: only show values that exist
              const reqStats: { id: string; value: string; label: string }[] = [];
              if (r.distance != null) {
                reqStats.push({
                  id: 'dist',
                  value: `${Number(r.distance).toFixed(1)} km`,
                  label: 'Distance',
                });
              }
              if (r.duration != null) {
                reqStats.push({
                  id: 'dur',
                  value: `${Math.round(Number(r.duration))} min`,
                  label: 'Duration',
                });
              }
              if (parcelLike && !!r.parcelSize) {
                reqStats.push({
                  id: 'size',
                  value: prettyLabel(r.parcelSize),
                  label: 'Package size',
                });
              }

              return (
                <View key={r.id} style={styles.reqCard}>
                  {/* Header: vehicle tile + type, fare */}
                  <View style={styles.reqHeader}>
                    <View style={[styles.reqVehicleTile, { backgroundColor: look.tint }]}>
                      <Text style={styles.reqVehicleEmoji}>{look.emoji}</Text>
                    </View>
                    <View style={styles.flex}>
                      <View style={styles.reqTypePill}>
                        <Text style={styles.reqTypePillText}>
                          {CATEGORY_LABEL[r.category]}
                        </Text>
                      </View>
                      {!!r.vehicleType && (
                        <Text style={styles.reqVehicle}>{prettyLabel(r.vehicleType)}</Text>
                      )}
                    </View>
                    <View style={styles.reqFareWrap}>
                      <Text style={styles.reqFare}>
                        ₹{Number(r.fare ?? 0).toFixed(0)}
                      </Text>
                      <Text style={styles.reqFareLabel}>Offered fare</Text>
                    </View>
                  </View>

                  {/* Route */}
                  <View style={styles.reqRoute}>
                    <View style={[styles.reqStopRow, styles.reqStopRowFirst]}>
                      <View style={styles.reqDotCol}>
                        <View style={[styles.reqDot, { backgroundColor: GREEN }]} />
                        <View style={styles.reqLine} />
                      </View>
                      <View style={styles.flex}>
                        <View style={styles.reqStopTop}>
                          <Text style={styles.reqStopLabel}>PICKUP</Text>
                          {r.pickupDistanceKm != null && (
                            <View style={styles.awayPill}>
                              <Ionicons name="navigate" size={11} color={BLUE} />
                              <Text style={styles.reqAway}>
                                {Number(r.pickupDistanceKm).toFixed(1)} km away
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.reqAddress}>{r.pickupAddress}</Text>
                      </View>
                    </View>

                    <View style={styles.reqStopRow}>
                      <View style={styles.reqDotCol}>
                        <View style={[styles.reqDot, styles.reqDotSquare, { backgroundColor: RED }]} />
                      </View>
                      <View style={styles.flex}>
                        <Text style={styles.reqStopLabel}>DROP</Text>
                        <Text style={styles.reqAddress}>{r.dropAddress}</Text>
                      </View>
                    </View>
                  </View>

                  {/* Distance / duration / size */}
                  {reqStats.length > 0 && (
                    <View style={styles.reqStatsRow}>
                      {reqStats.map((st, i) => (
                        <View
                          key={st.id}
                          style={[
                            styles.reqStat,
                            i < reqStats.length - 1 && styles.reqStatDivider,
                          ]}
                        >
                          <Text style={styles.reqStatValue}>{st.value}</Text>
                          <Text style={styles.reqStatLabel}>{st.label}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Parcel / goods: package + contacts */}
                  {parcelLike && (
                    <View style={styles.reqParcelBox}>
                      {!!r.parcelDescription && (
                        <View style={styles.reqParcelRow}>
                          <Ionicons name="cube-outline" size={18} color={BLUE} style={styles.reqParcelIcon} />
                          <View style={styles.flex}>
                            <Text style={styles.reqSectionLabel}>PACKAGE</Text>
                            <Text style={styles.reqParcelDesc}>{r.parcelDescription}</Text>
                          </View>
                        </View>
                      )}

                      <View
                        style={[
                          styles.reqContactRow,
                          !!r.parcelDescription && styles.reqContactRowSpaced,
                        ]}
                      >
                        <Ionicons name="person-outline" size={18} color={BLUE} style={styles.reqParcelIcon} />
                        <View style={styles.flex}>
                          <Text style={styles.reqSectionLabel}>RECEIVER</Text>
                          <Text style={styles.reqContactName}>{r.receiverName || '-'}</Text>
                        </View>
                        {!!r.receiverPhone && (
                          <Text style={styles.reqContactPhone}>{r.receiverPhone}</Text>
                        )}
                      </View>

                      {hasSender && (
                        <View style={[styles.reqContactRow, styles.reqContactRowSpaced]}>
                          <Ionicons name="send-outline" size={18} color={BLUE} style={styles.reqParcelIcon} />
                          <View style={styles.flex}>
                            <Text style={styles.reqSectionLabel}>SENDER</Text>
                            <Text style={styles.reqContactName}>{r.senderName || '-'}</Text>
                          </View>
                          {!!r.senderPhone && (
                            <Text style={styles.reqContactPhone}>{r.senderPhone}</Text>
                          )}
                        </View>
                      )}
                    </View>
                  )}

                  <TouchableOpacity
                    style={[styles.reqAcceptBtn, !!acceptingId && styles.reqAcceptBtnDisabled]}
                    activeOpacity={0.85}
                    disabled={!!acceptingId}
                    onPress={() => acceptRide(r.id)}
                  >
                    {accepting ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={20} color="#fff" />
                        <Text style={styles.reqAcceptText}>Accept Request</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        ) : online ? (
          // Online, waiting: radar animation
          <View style={styles.statusCard}>
            <RadarPulse />
            <Text style={styles.statusTitle}>Looking for requests...</Text>
            <Text style={styles.statusSub}>
              {availableError ||
                'Requests matching your ride types and range will appear here'}
            </Text>
            {!!filterSummary && !availableError && (
              <Text style={styles.statusFilter}>{filterSummary}</Text>
            )}
          </View>
        ) : (
          // Offline: big power illustration + go online button
          <View style={styles.statusCard}>
            <View style={styles.offlineArt}>
              <View style={styles.offlineRingOuter} />
              <View style={styles.offlineRingInner} />
              <View style={styles.offlineCore}>
                <Ionicons name="power" size={34} color="#fff" />
              </View>
            </View>
            <Text style={styles.statusTitle}>You're offline</Text>
            <Text style={styles.statusSub}>Go online to start receiving ride requests</Text>
            <TouchableOpacity
              style={[styles.goOnlineBtn, togglingOnline && styles.btnDisabled]}
              activeOpacity={0.85}
              disabled={togglingOnline}
              onPress={() => onToggleOnline(true)}
            >
              {togglingOnline ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="flash" size={18} color="#fff" />
                  <Text style={styles.goOnlineText}>Go Online</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Weekly earnings */}
        <View style={styles.weekCard}>
          <View style={styles.weekHeader}>
            <View>
              <Text style={styles.weekTitle}>Weekly earnings</Text>
              <Text style={styles.weekSub}>Mon – Sun</Text>
            </View>
            <Text style={styles.weekTotal}>₹ {stats.weekTotal.toFixed(0)}</Text>
          </View>

          <View style={styles.chart}>
            {stats.week.map((w) => (
              <View key={w.id} style={styles.barCol}>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.bar,
                      w.isToday && styles.barToday,
                      { height: `${Math.max((w.amount / maxAmount) * 100, 6)}%` },
                    ]}
                  />
                </View>
                <Text style={[styles.barDay, w.isToday && styles.barDayToday]}>
                  {w.day}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Change location: tap on the map or drag the marker */}
      <Modal
        visible={mapVisible}
        animationType="slide"
        onRequestClose={() => setMapVisible(false)}
      >
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <View style={styles.mapHeader}>
            <Text style={styles.mapTitle}>Choose your location</Text>
            <TouchableOpacity style={styles.mapCloseBtn} onPress={() => setMapVisible(false)}>
              <Ionicons name="close" size={20} color={BLACK} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={GREY} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search a place (e.g. MP Nagar)"
              placeholderTextColor={GREY}
              value={searchText}
              onChangeText={setSearchText}
            />
          </View>

          {suggestions.length > 0 && (
            <ScrollView
              style={styles.suggestBox}
              keyboardShouldPersistTaps="handled"
            >
              {suggestions.map((s) => (
                <TouchableOpacity
                  key={s.placeId}
                  style={styles.suggestRow}
                  onPress={() => onPickSuggestion(s)}
                >
                  <Ionicons name="location-outline" size={18} color={GREY} style={styles.suggestIcon} />
                  <View style={styles.flex}>
                    <Text style={styles.suggestTitle}>{s.title}</Text>
                    {!!s.subtitle && (
                      <Text style={styles.suggestSub} numberOfLines={1}>
                        {s.subtitle}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <Text style={styles.mapHint}>
            Or tap on the map / drag the marker
          </Text>

          {pickedCoords && (
            <MapView
              ref={mapRef}
              style={styles.flex}
              initialRegion={{
                latitude: pickedCoords.latitude,
                longitude: pickedCoords.longitude,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
              }}
              onPress={(e) => setPickedCoords(e.nativeEvent.coordinate)}
            >
              <Marker
                coordinate={pickedCoords}
                draggable
                onDragEnd={(e) => setPickedCoords(e.nativeEvent.coordinate)}
              />
            </MapView>
          )}

          <View style={styles.mapFooter}>
            <TouchableOpacity
              style={[styles.primaryBtn, savingLocation && styles.btnDisabled]}
              disabled={savingLocation || !pickedCoords}
              onPress={() => pickedCoords && saveLocation(pickedCoords, true)}
            >
              {savingLocation ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Set this location</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelBtn}
              disabled={savingLocation}
              onPress={onUseGps}
            >
              <Ionicons name="locate" size={16} color={BLUE} />
              <Text style={styles.gpsBtnText}>Use phone GPS location</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* After ride completion: payment + details + rating */}
      {summaryRide && (
        <RideSummaryModal
          key={summaryRide.id}
          captainRideId={summaryRide.id}
          onClose={closeSummary}
        />
      )}

      {/* Start ride: OTP from the customer */}
      <Modal
        visible={otpVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setOtpVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <Ionicons name="shield-checkmark" size={26} color={BLUE} />
            </View>
            <Text style={styles.modalTitleCenter}>Enter pickup OTP</Text>
            <Text style={styles.otpHint}>
              Ask the customer for the 4-digit OTP shown on their phone, then start the trip to the drop location.
            </Text>
            <TextInput
              style={styles.otpInput}
              placeholder="----"
              placeholderTextColor={GREY}
              value={otpValue}
              onChangeText={(t) => setOtpValue(t.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
              maxLength={4}
              autoFocus
            />
            <View style={styles.modalRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnGhost]}
                disabled={updating}
                onPress={() => setOtpVisible(false)}
              >
                <Text style={styles.modalBtnGhostText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  { backgroundColor: BLUE },
                  (otpValue.length !== 4 || updating) && styles.btnDisabled,
                ]}
                disabled={otpValue.length !== 4 || updating}
                onPress={onConfirmOtp}
              >
                {updating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalBtnText}>Start Trip to Drop</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Cancel reason modal */}
      <Modal
        visible={cancelVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCancelVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={[styles.modalIcon, styles.modalIconRed]}>
              <Ionicons name="close-circle" size={28} color={RED} />
            </View>
            <Text style={styles.modalTitleCenter}>Cancel this ride?</Text>
            <Text style={styles.otpHint}>Please tell us why you are cancelling.</Text>
            <TextInput
              style={styles.input}
              placeholder="Write a reason..."
              placeholderTextColor={GREY}
              value={cancelReason}
              onChangeText={setCancelReason}
              multiline
            />
            <View style={styles.modalRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={() => setCancelVisible(false)}
              >
                <Text style={styles.modalBtnGhostText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: RED }]}
                onPress={onConfirmCancel}
              >
                <Text style={styles.modalBtnText}>Cancel Ride</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: BG },
  scroll: { padding: 14, paddingBottom: 28 },

  // header: brand left, toggle + bell right
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    elevation: 3,
    shadowColor: BLACK,
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BG,
    borderRadius: 999,
    paddingLeft: 10,
    paddingRight: 2,
  },
 logo: { width: 148, height: 52, marginLeft: -34 },
  statusPillOn: { backgroundColor: GREEN_LIGHT },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#94A3B8',
    marginRight: 6,
  },
  statusDotOn: { backgroundColor: GREEN },
  switchText: { fontSize: 11, fontWeight: '800', color: GREY, marginRight: 2 },
  switchTextOn: { color: GREEN },
  switchLoader: { width: 51, height: 31 },
  bellBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  bellBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  bellBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  // location card
  locCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 12,
    marginBottom: 12,
    elevation: 2,
    shadowColor: BLACK,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  locIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: BLUE_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  locLabel: { fontSize: 10, fontWeight: '800', color: GREY, letterSpacing: 0.8 },
  locText: { fontSize: 14, fontWeight: '700', color: BLACK, marginTop: 3 },
  locSub: { fontSize: 11, color: GREY, marginTop: 3 },
  locSubError: { color: RED, fontWeight: '700' },
  locBtn: {
    backgroundColor: BLUE_LIGHT,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginLeft: 10,
  },
  locBtnText: { color: BLUE, fontWeight: '800', fontSize: 12 },

  // location picker modal
  mapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  mapTitle: { fontSize: 18, fontWeight: '800', color: BLACK },
  mapCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapHint: { fontSize: 12, color: GREY, paddingHorizontal: 16, paddingVertical: 10 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 11, color: BLACK, fontSize: 14 },
  suggestBox: {
    maxHeight: 220,
    marginHorizontal: 16,
    marginTop: 6,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  suggestIcon: { marginRight: 10 },
  suggestTitle: { fontSize: 14, fontWeight: '700', color: BLACK },
  suggestSub: { fontSize: 12, color: GREY, marginTop: 2 },
  mapFooter: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    elevation: 10,
  },
  gpsBtnText: { color: BLUE, fontSize: 14, fontWeight: '700', marginLeft: 6 },

  // today's earnings
  earnCard: {
    backgroundColor: BLUE,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    marginBottom: 14,
    overflow: 'hidden',
  },
  earnCircleBig: {
    position: 'absolute',
    right: -40,
    top: -50,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: BLUE_DARK,
    opacity: 0.5,
  },
  earnCircleSmall: {
    position: 'absolute',
    right: 60,
    top: 40,
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#fff',
    opacity: 0.08,
  },
  earnTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  earnIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  earnLabel: { color: '#DCE8FF', fontSize: 12, fontWeight: '600' },
  earnValue: { color: '#fff', fontSize: 32, fontWeight: '800', marginTop: 2 },
  earnRow: {
    flexDirection: 'row',
    backgroundColor: BLUE_DARK,
    borderRadius: 14,
    paddingVertical: 10,
    marginTop: 12,
  },
  earnStat: { flex: 1, alignItems: 'center' },
  earnDivider: { borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.2)' },
  earnStatValue: { color: '#fff', fontSize: 16, fontWeight: '800' },
  earnStatLabel: { color: '#DCE8FF', fontSize: 11, marginTop: 1 },

  // waiting / offline status card
  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    elevation: 2,
    shadowColor: BLACK,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  statusTitle: { fontSize: 17, fontWeight: '800', color: BLACK, textAlign: 'center', marginTop: 4 },
  statusSub: { fontSize: 13, color: GREY, textAlign: 'center', marginTop: 6, lineHeight: 19 },
  statusFilter: {
    fontSize: 12,
    fontWeight: '700',
    color: BLUE,
    backgroundColor: BLUE_LIGHT,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: 12,
    overflow: 'hidden',
  },

  // radar (online, waiting)
  radarWrap: {
    width: 150,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  radarRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: BLUE,
  },
  radarCore: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: BLUE,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },

  // offline illustration
  offlineArt: {
    width: 130,
    height: 130,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  offlineRingOuter: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: '#EEF2F7',
  },
  offlineRingInner: {
    position: 'absolute',
    width: 98,
    height: 98,
    borderRadius: 49,
    backgroundColor: '#E2E8F0',
  },
  offlineCore: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goOnlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 28,
    marginTop: 16,
    minWidth: 160,
  },
  goOnlineText: { color: '#fff', fontSize: 15, fontWeight: '800', marginLeft: 6 },

  // new requests
  requestsHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  requestsTitle: { fontSize: 18, fontWeight: '800', color: BLACK },
  requestsCount: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  requestsCountText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  filterText: { fontSize: 12, color: GREY, marginBottom: 12 },
  reqCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    elevation: 3,
    shadowColor: BLACK,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  reqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  reqVehicleTile: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  reqVehicleEmoji: { fontSize: 26 },
  reqTypePill: {
    alignSelf: 'flex-start',
    backgroundColor: BLUE_LIGHT,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  reqTypePillText: { color: BLUE, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  reqVehicle: { fontSize: 16, fontWeight: '800', color: BLACK, marginTop: 4 },
  reqFareWrap: { alignItems: 'flex-end', marginLeft: 10 },
  reqFare: { fontSize: 26, fontWeight: '800', color: BLACK },
  reqFareLabel: { fontSize: 11, color: GREY, marginTop: 1 },

  reqRoute: { marginBottom: 14 },
  reqStopRow: { flexDirection: 'row' },
  reqStopRowFirst: { paddingBottom: 14 },
  reqDotCol: { width: 12, alignItems: 'center', marginRight: 12 },
  reqDot: { width: 12, height: 12, borderRadius: 6, marginTop: 3 },
  reqDotSquare: { borderRadius: 3 },
  reqLine: {
    position: 'absolute',
    top: 18,
    bottom: -4,
    width: 2,
    backgroundColor: BORDER,
  },
  reqStopTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reqStopLabel: { fontSize: 10, fontWeight: '800', color: GREY, letterSpacing: 0.8 },
  awayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BLUE_LIGHT,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  reqAway: { fontSize: 11, fontWeight: '800', color: BLUE, marginLeft: 3 },
  reqAddress: {
    fontSize: 14,
    fontWeight: '600',
    color: BLACK,
    marginTop: 2,
    lineHeight: 20,
  },

  reqStatsRow: {
    flexDirection: 'row',
    backgroundColor: BG,
    borderRadius: 14,
    paddingVertical: 11,
    marginBottom: 14,
  },
  reqStat: { flex: 1, alignItems: 'center' },
  reqStatDivider: { borderRightWidth: 1, borderRightColor: BORDER },
  reqStatValue: { fontSize: 14, fontWeight: '800', color: BLACK },
  reqStatLabel: { fontSize: 11, color: GREY, marginTop: 2 },

  reqParcelBox: {
    backgroundColor: BG,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  reqParcelRow: { flexDirection: 'row', alignItems: 'center' },
  reqParcelIcon: { marginRight: 10 },
  reqSectionLabel: { fontSize: 10, fontWeight: '800', color: GREY, letterSpacing: 0.8 },
  reqParcelDesc: { fontSize: 14, fontWeight: '700', color: BLACK, marginTop: 2 },
  reqContactRow: { flexDirection: 'row', alignItems: 'center' },
  reqContactRowSpaced: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  reqContactName: { fontSize: 14, fontWeight: '700', color: BLACK, marginTop: 2 },
  reqContactPhone: { fontSize: 13, fontWeight: '700', color: BLUE, marginLeft: 10 },

  reqAcceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 14,
  },
  reqAcceptBtnDisabled: { opacity: 0.6 },
  reqAcceptText: { color: '#fff', fontSize: 15, fontWeight: '800', marginLeft: 8 },

  // shared bits (request cards + summary popup)
  rideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  rideTitle: { fontSize: 16, fontWeight: '800', color: BLACK },
  placeRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 5, marginRight: 10 },
  placeLabel: { fontSize: 12, color: GREY },
  placeText: { fontSize: 14, color: BLACK, fontWeight: '600', marginTop: 1 },
  primaryBtn: {
    backgroundColor: BLUE,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  btnDisabled: { opacity: 0.6 },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 6,
  },

  // weekly earnings
  weekCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    marginTop: 14,
    elevation: 2,
    shadowColor: BLACK,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  weekTitle: { fontSize: 15, fontWeight: '800', color: BLACK },
  weekSub: { fontSize: 11, color: GREY, marginTop: 1 },
  weekTotal: { fontSize: 20, fontWeight: '800', color: BLACK },
  chart: { flexDirection: 'row', justifyContent: 'space-between', height: 84 },
  barCol: { flex: 1, alignItems: 'center' },
  barTrack: {
    flex: 1,
    width: 16,
    justifyContent: 'flex-end',
    backgroundColor: BLUE_LIGHT,
    borderRadius: 8,
    overflow: 'hidden',
  },
  bar: { width: '100%', backgroundColor: '#9DBFF5', borderRadius: 8 },
  barToday: { backgroundColor: BLUE },
  barDay: { fontSize: 11, color: GREY, marginTop: 5, fontWeight: '600' },
  barDayToday: { color: BLUE, fontWeight: '800' },

  // modals
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: { backgroundColor: '#fff', borderRadius: 22, padding: 20 },
  modalIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: BLUE_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 10,
  },
  modalIconRed: { backgroundColor: '#FEE2E2' },
  modalTitleCenter: {
    fontSize: 18,
    fontWeight: '800',
    color: BLACK,
    textAlign: 'center',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 12,
    minHeight: 80,
    textAlignVertical: 'top',
    color: BLACK,
    backgroundColor: BG,
  },
  modalRow: { flexDirection: 'row', marginTop: 16 },
  modalBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  modalBtnGhost: { backgroundColor: BG },
  modalBtnGhostText: { color: BLACK, fontWeight: '700' },
  modalBtnText: { color: '#fff', fontWeight: '800' },

  // start OTP
  otpHint: {
    fontSize: 13,
    color: GREY,
    marginBottom: 14,
    lineHeight: 19,
    textAlign: 'center',
  },
  otpInput: {
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 14,
    paddingVertical: 12,
    textAlign: 'center',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 12,
    color: BLACK,
    backgroundColor: BG,
  },
});