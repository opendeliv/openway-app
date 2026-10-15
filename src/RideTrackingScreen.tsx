import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { ridesApi } from './services/ridesApi';
import { mapsApi, decodePolyline, RouteInfo } from './services/mapsApi';

const BLUE = '#1F6FE5';
const BLUE_LIGHT = '#EAF2FF';
const BG = '#F4F7FB';
const BLACK = '#0F172A';
const GREY = '#64748B';
const BORDER = '#E2E8F0';
const RED = '#DC2626';
const GREEN = '#16A34A';
const GREEN_LIGHT = '#DCFCE7';
const STAR = '#F59E0B';

const POLL_MS = 4000;
const NEAR_DROP_METERS = 150;

type RideStatus =
  | 'REQUESTED'
  | 'ACCEPTED'
  | 'ARRIVING'
  | 'STARTED'
  | 'COMPLETED'
  | 'CANCELLED';

// Backend ke Ride entity se match. Optional fields abhi backend me nahi hain (neeche notes dekho)
type RideData = {
  id: string;
  status: RideStatus;
  category: string;
  vehicleType: string;
  pickupAddress: string;
  pickupLatitude: number;
  pickupLongitude: number;
  dropAddress: string;
  dropLatitude: number;
  dropLongitude: number;
  fare: number | null;
  distance: number | null;
  duration: number | null;
  paymentMethod?: 'CASH' | 'UPI' | null;
  captainRating?: number | null;
  completedAt?: string | null;
  createdAt?: string;
  captain?: {
    name?: string | null;
    phone?: string | null;
    profilePhoto?: string | null;
  } | null;
  // OPTIONAL (backend me add karna hai)
  otp?: string | null;
  captainEtaMinutes?: number | null;
  captainLatitude?: number | null;
  captainLongitude?: number | null;
  captainVehicleNumber?: string | null;
  captainVehicleModel?: string | null;
};

type Props = {
  rideId: string;
  onClose: () => void;
};

const metersBetween = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

const formatDate = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
};

/* =========================================================
   SMALL PIECES
   ========================================================= */

// "Captain dhoond rahe hain" wala pulse
const SearchingPulse = () => {
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(scale, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [scale]);

  const ringStyle = {
    transform: [{ scale: scale.interpolate({ inputRange: [0, 1], outputRange: [0.5, 2.2] }) }],
    opacity: scale.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
  };

  return (
    <View style={styles.pulseWrap}>
      <Animated.View style={[styles.pulseRing, ringStyle]} />
      <View style={styles.pulseCore}>
        <Text style={styles.pulseEmoji}>🏍️</Text>
      </View>
    </View>
  );
};

const CaptainCard = ({ ride, showCall = true }: { ride: RideData; showCall?: boolean }) => {
  const c = ride.captain;
  const name = c?.name?.trim() || 'Captain';
  const phone = (c?.phone ?? '').trim();
  const vehicleModel = ride.captainVehicleModel?.trim();
  const vehicleNumber = ride.captainVehicleNumber?.trim();

  const callCaptain = () => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`).catch(() =>
      Alert.alert('Call nahi lag paayi', 'Phone app khul nahi paayi'),
    );
  };

  return (
    <View style={styles.captainCard}>
      <View style={styles.captainRow}>
        {c?.profilePhoto ? (
          <Image source={{ uri: c.profilePhoto }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarLetter}>{name.charAt(0).toUpperCase()}</Text>
          </View>
        )}

        <View style={styles.flex}>
          <Text style={styles.captainName}>{name}</Text>
          {!!vehicleModel && <Text style={styles.captainSub}>{vehicleModel}</Text>}
          {!!phone && <Text style={styles.captainPhone}>📱 {phone}</Text>}
        </View>

        {showCall && !!phone && (
          <TouchableOpacity style={styles.callBtn} activeOpacity={0.8} onPress={callCaptain}>
            <Text style={styles.callIcon}>📞</Text>
            <Text style={styles.callText}>Call</Text>
          </TouchableOpacity>
        )}
      </View>

      {!!vehicleNumber && (
        <View style={styles.plateRow}>
          <Text style={styles.plateLabel}>Vehicle number</Text>
          <View style={styles.plate}>
            <Text style={styles.plateText}>{vehicleNumber}</Text>
          </View>
        </View>
      )}
    </View>
  );
};

const TripDetails = ({ ride }: { ride: RideData }) => (
  <View style={styles.card}>
    <Text style={styles.cardTitle}>Trip details</Text>

    <View style={styles.tripRow}>
      <Text style={styles.tripDot}>🔵</Text>
      <View style={styles.flex}>
        <Text style={styles.tripLabel}>Pickup</Text>
        <Text style={styles.tripValue}>{ride.pickupAddress}</Text>
      </View>
    </View>

    <View style={styles.tripRow}>
      <Text style={styles.tripDot}>📍</Text>
      <View style={styles.flex}>
        <Text style={styles.tripLabel}>Drop</Text>
        <Text style={styles.tripValue}>{ride.dropAddress}</Text>
      </View>
    </View>

    <View style={styles.statsRow}>
      <View style={styles.stat}>
        <Text style={styles.tripLabel}>Distance</Text>
        <Text style={styles.statValue}>{ride.distance != null ? `${ride.distance} km` : '--'}</Text>
      </View>
      <View style={styles.stat}>
        <Text style={styles.tripLabel}>Time</Text>
        <Text style={styles.statValue}>{ride.duration != null ? `${ride.duration} min` : '--'}</Text>
      </View>
      <View style={styles.stat}>
        <Text style={styles.tripLabel}>Fare</Text>
        <Text style={styles.statValue}>{ride.fare != null ? `₹${ride.fare}` : '--'}</Text>
      </View>
    </View>
  </View>
);

/* =========================================================
   SCREEN
   ========================================================= */

export default function RideTrackingScreen({ rideId, onClose }: Props) {
  const [ride, setRide] = useState<RideData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [busy, setBusy] = useState(false);

  // Rating
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [ratingSent, setRatingSent] = useState(false);

  const mapRef = useRef<MapView>(null);
  const askedArrivalRef = useRef(false); // "pahunch gaye?" alert baar baar na aaye
  const askingRef = useRef(false);

  /* ---------- Ride ko har kuch second me refresh karo ---------- */

  const fetchRide = useCallback(async () => {
    try {
      const data = (await ridesApi.getRide(rideId)) as RideData;
      setRide(data);
      setLoadError(false);
      return data;
    } catch {
      setLoadError(true);
      return null;
    }
  }, [rideId]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      const data = await fetchRide();
      if (stopped) return;
      // Complete / cancel ke baad polling band
      if (data && (data.status === 'COMPLETED' || data.status === 'CANCELLED')) return;
      timer = setTimeout(tick, POLL_MS);
    };

    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [fetchRide]);

  const status = ride?.status;

  /* ---------- Route (map par line) ---------- */

  useEffect(() => {
    if (!ride || route) return;
    mapsApi
      .route(
        { address: ride.pickupAddress, latitude: ride.pickupLatitude, longitude: ride.pickupLongitude },
        { address: ride.dropAddress, latitude: ride.dropLatitude, longitude: ride.dropLongitude },
        ride.category === 'BIKE' ? 'TWO_WHEELER' : 'DRIVE',
      )
      .then(setRoute)
      .catch(() => {});
    // sirf ride pehli baar aane par
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ride?.id]);

  const routeCoords = useMemo(
    () => (route?.encodedPolyline ? decodePolyline(route.encodedPolyline) : []),
    [route],
  );

  // Map ko markers ke hisaab se fit karo
  useEffect(() => {
    if (!ride) return;
    const pts = [
      { latitude: ride.pickupLatitude, longitude: ride.pickupLongitude },
      { latitude: ride.dropLatitude, longitude: ride.dropLongitude },
    ];
    if (ride.captainLatitude != null && ride.captainLongitude != null) {
      pts.push({ latitude: ride.captainLatitude, longitude: ride.captainLongitude });
    }
    mapRef.current?.fitToCoordinates(pts, {
      edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
      animated: true,
    });
  }, [ride?.status, ride?.captainLatitude, ride?.captainLongitude, routeCoords.length]); // eslint-disable-line

  /* ---------- Actions ---------- */

  const onCancel = () => {
    Alert.alert('Ride cancel karni hai?', 'Kya aap sach me ride cancel karna chahte ho?', [
      { text: 'Nahi', style: 'cancel' },
      {
        text: 'Haan, cancel karo',
        style: 'destructive',
        onPress: async () => {
          try {
            setBusy(true);
            await ridesApi.cancelRide(rideId);
            await fetchRide();
          } catch (e: any) {
            Alert.alert('Cancel nahi hui', e?.message || 'Dobara try karo');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  // "Kya aap destination pe pahunch gaye?"
  const askReached = useCallback(() => {
    if (askingRef.current) return;
    askingRef.current = true;

    Alert.alert(
      'Destination aa gaya?',
      'Kya aap apni drop location par pahunch gaye ho?',
      [
        {
          text: 'Nahi',
          style: 'cancel',
          onPress: () => {
            askingRef.current = false; // ride chalti rahegi
          },
        },
        {
          text: 'Haan',
          onPress: async () => {
            try {
              setBusy(true);
              await ridesApi.confirmArrival(rideId);
              await fetchRide();
            } catch (e: any) {
              Alert.alert('Ride band nahi hui', e?.message || 'Dobara try karo');
            } finally {
              setBusy(false);
              askingRef.current = false;
            }
          },
        },
      ],
      { cancelable: false },
    );
  }, [rideId, fetchRide]);

  // Captain ki location drop ke paas aate hi ek baar apne aap poochho
  useEffect(() => {
    if (status !== 'STARTED' || askedArrivalRef.current) return;
    if (ride?.captainLatitude == null || ride?.captainLongitude == null) return;

    const d = metersBetween(
      ride.captainLatitude,
      ride.captainLongitude,
      ride.dropLatitude,
      ride.dropLongitude,
    );
    if (d <= NEAR_DROP_METERS) {
      askedArrivalRef.current = true;
      askReached();
    }
  }, [status, ride?.captainLatitude, ride?.captainLongitude, askReached]); // eslint-disable-line

  const onSubmitRating = async () => {
    if (rating < 1) {
      Alert.alert('Rating', 'Pehle stars chuno');
      return;
    }
    try {
      setBusy(true);
      await ridesApi.rateCaptain(rideId, { rating, comment: comment.trim() || undefined });
      setRatingSent(true);
    } catch (e: any) {
      Alert.alert('Rating nahi gayi', e?.message || 'Dobara try karo');
    } finally {
      setBusy(false);
    }
  };

  /* =========================================================
     RENDER
     ========================================================= */

  if (!ride) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.center}>
          {loadError ? (
            <>
              <Text style={styles.bigTitle}>Ride load nahi hui</Text>
              <TouchableOpacity style={styles.btn} onPress={fetchRide}>
                <Text style={styles.btnText}>Dobara try karo</Text>
              </TouchableOpacity>
            </>
          ) : (
            <ActivityIndicator size="large" color={BLUE} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  /* ---------- 1) Captain dhoond rahe hain ---------- */
  if (status === 'REQUESTED') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <SearchingPulse />
          <Text style={styles.bigTitle}>Aapke liye captain dhoond rahe hain</Text>
          <Text style={styles.bigSub}>Bas thoda wait karo, ek second...</Text>

          <View style={[styles.card, styles.fullWidth]}>
            <Text style={styles.tripLabel}>Pickup</Text>
            <Text style={styles.tripValue} numberOfLines={1}>{ride.pickupAddress}</Text>
            <View style={styles.gap} />
            <Text style={styles.tripLabel}>Drop</Text>
            <Text style={styles.tripValue} numberOfLines={1}>{ride.dropAddress}</Text>
            <View style={styles.gap} />
            <Text style={styles.tripLabel}>Aapka offer</Text>
            <Text style={styles.tripValue}>{ride.fare != null ? `₹${ride.fare}` : '--'}</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.btnOutline, busy && styles.btnDisabled]}
            onPress={onCancel}
            disabled={busy}
          >
            <Text style={styles.btnOutlineText}>Ride cancel karo</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  /* ---------- Cancelled ---------- */
  if (status === 'CANCELLED') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <View style={[styles.bigCircle, { backgroundColor: '#FEE2E2' }]}>
            <Text style={[styles.bigCircleText, { color: RED }]}>✕</Text>
          </View>
          <Text style={styles.bigTitle}>Ride cancel ho gayi</Text>
          <Text style={styles.bigSub}>Aap chaho to nayi ride book kar sakte ho.</Text>
        </View>
        <View style={styles.footer}>
          <TouchableOpacity style={styles.btn} onPress={onClose}>
            <Text style={styles.btnText}>Home par jao</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  /* ---------- 4) Ride complete: poori detail + tick + rating ---------- */
  if (status === 'COMPLETED') {
    const alreadyRated = ride.captainRating != null || ratingSent;

    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.successWrap}>
            <View style={[styles.bigCircle, { backgroundColor: GREEN_LIGHT }]}>
              <Text style={[styles.bigCircleText, { color: GREEN }]}>✓</Text>
            </View>
            <Text style={styles.bigTitle}>Ride complete ho gayi</Text>
            {!!ride.completedAt && (
              <Text style={styles.bigSub}>{formatDate(ride.completedAt)}</Text>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.tripLabel}>Total fare</Text>
            <Text style={styles.fareBig}>{ride.fare != null ? `₹${ride.fare}` : '--'}</Text>
            {!!ride.paymentMethod && (
              <Text style={styles.captainSub}>Payment: {ride.paymentMethod}</Text>
            )}
          </View>

          <CaptainCard ride={ride} showCall={false} />
          <TripDetails ride={ride} />

          {/* Rating */}
          <View style={styles.card}>
            {alreadyRated ? (
              <Text style={styles.thanks}>Rating ke liye shukriya! 🙏</Text>
            ) : (
              <>
                <Text style={styles.cardTitle}>Captain ka experience kaisa tha?</Text>
                <View style={styles.starRow}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <TouchableOpacity key={n} onPress={() => setRating(n)} activeOpacity={0.8}>
                      <Text style={[styles.star, n <= rating && styles.starOn]}>★</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={styles.commentInput}
                  placeholder="Kuch likhna chahte ho? (optional)"
                  placeholderTextColor="#94A3B8"
                  value={comment}
                  onChangeText={setComment}
                  multiline
                />
                <TouchableOpacity
                  style={[styles.btn, busy && styles.btnDisabled]}
                  onPress={onSubmitRating}
                  disabled={busy}
                >
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Rating bhejo</Text>}
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={alreadyRated ? styles.btn : styles.btnOutline} onPress={onClose}>
            <Text style={alreadyRated ? styles.btnText : styles.btnOutlineText}>
              {alreadyRated ? 'Done' : 'Skip'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  /* ---------- 2) Captain aa raha hai  /  3) Ride chal rahi hai (Rapido style) ---------- */
  const started = status === 'STARTED';
  const arriving = status === 'ARRIVING';

  const headline = started
    ? 'Ride chal rahi hai'
    : arriving
    ? 'Captain pahunch gaya hai'
    : 'Captain aapko lene aa raha hai';

  const pillText = arriving
    ? 'Bahar aa jao'
    : ride.captainEtaMinutes != null
    ? `${ride.captainEtaMinutes} min`
    : '...';

  const otpDigits = (ride.otp ?? '----').split('');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Map (upar) */}
      <View style={styles.mapTop}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={{
            latitude: ride.pickupLatitude,
            longitude: ride.pickupLongitude,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
          toolbarEnabled={false}
        >
          <Marker
            coordinate={{ latitude: ride.pickupLatitude, longitude: ride.pickupLongitude }}
            pinColor="green"
            title="Pickup"
          />
          <Marker
            coordinate={{ latitude: ride.dropLatitude, longitude: ride.dropLongitude }}
            pinColor="red"
            title="Drop"
          />
          {ride.captainLatitude != null && ride.captainLongitude != null && (
            <Marker
              coordinate={{ latitude: ride.captainLatitude, longitude: ride.captainLongitude }}
              title="Captain"
              pinColor="blue"
            />
          )}
          {routeCoords.length > 0 && (
            <Polyline coordinates={routeCoords} strokeColor={BLUE} strokeWidth={5} />
          )}
        </MapView>
      </View>

      {/* Neeche sheet */}
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />

        <ScrollView
          contentContainerStyle={styles.sheetScroll}
          showsVerticalScrollIndicator={false}
        >
          {/* Status + ETA */}
          <View style={styles.statusRow}>
            <Text style={styles.statusTitle}>{headline}</Text>
            <View style={[styles.etaPill, arriving && styles.etaPillGreen]}>
              <Text style={[styles.etaPillText, arriving && styles.etaPillTextGreen]}>
                {pillText}
              </Text>
            </View>
          </View>

          {/* Start OTP: user ye captain ko batayega, captain apni screen me daalega */}
          {!started && (
            <View style={[styles.otpPanel, arriving && styles.otpPanelGreen]}>
              <Text style={styles.otpPanelTitle}>
                {arriving ? 'Captain aa gaya! Ye OTP unhe batao' : 'Start OTP'}
              </Text>
              <View style={styles.otpDigitsRow}>
                {otpDigits.map((d, i) => (
                  <View key={i} style={styles.otpDigitBox}>
                    <Text style={styles.otpDigit}>{d}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.otpPanelHint}>
                Captain ye OTP apni screen me daalega, tab hi ride start hogi.
              </Text>
            </View>
          )}

          {/* Captain: naam, photo, gaadi number, phone + call */}
          <CaptainCard ride={ride} />

          {/* Trip details */}
          <TripDetails ride={ride} />
        </ScrollView>

        {/* Bottom button */}
        <View style={styles.footer}>
          {started ? (
            <TouchableOpacity
              style={[styles.btn, busy && styles.btnDisabled]}
              onPress={askReached}
              disabled={busy}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Destination aa gaya?</Text>}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.btnOutline, busy && styles.btnDisabled]}
              onPress={onCancel}
              disabled={busy}
            >
              <Text style={styles.btnOutlineText}>Ride cancel karo</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: BG },
  scroll: { padding: 16, paddingBottom: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  fullWidth: { alignSelf: 'stretch', marginTop: 28 },
  gap: { height: 10 },

  header: { paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: BLACK },

  bigTitle: { fontSize: 20, fontWeight: '800', color: BLACK, textAlign: 'center', marginTop: 18 },
  bigSub: { fontSize: 13.5, color: GREY, textAlign: 'center', marginTop: 6 },

  // searching pulse
  pulseWrap: { width: 140, height: 140, alignItems: 'center', justifyContent: 'center' },
  pulseRing: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: BLUE,
  },
  pulseCore: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: BLUE_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: BLUE,
  },
  pulseEmoji: { fontSize: 36 },

  map: { height: 220, borderRadius: 16, overflow: 'hidden', backgroundColor: '#DCE8F8', marginBottom: 14 },

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 14 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: BLACK, marginBottom: 12 },

  // OTP
  otpCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
  },
  etaText: { fontSize: 20, fontWeight: '800', color: BLACK, marginTop: 2 },
  otpBox: {
    backgroundColor: BLUE_LIGHT,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  otpLabel: { fontSize: 11, color: GREY, fontWeight: '700' },
  otpValue: { fontSize: 24, fontWeight: '800', color: BLUE, letterSpacing: 4 },
  otpHint: { fontSize: 12, color: GREY, marginTop: 8, marginBottom: 14 },

  // captain
  captainRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 56, height: 56, borderRadius: 28, marginRight: 12, backgroundColor: BORDER },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: BLUE_LIGHT },
  avatarLetter: { fontSize: 22, fontWeight: '800', color: BLUE },
  captainName: { fontSize: 16, fontWeight: '800', color: BLACK },
  captainSub: { fontSize: 12.5, color: GREY, marginTop: 2 },

  // trip
  tripRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  tripDot: { fontSize: 14, marginRight: 10, marginTop: 2 },
  tripLabel: { fontSize: 12, color: GREY },
  tripValue: { fontSize: 14.5, fontWeight: '600', color: BLACK, marginTop: 2 },
  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 12,
    marginTop: 4,
  },
  stat: { flex: 1 },
  statValue: { fontSize: 15, fontWeight: '700', color: BLACK, marginTop: 2 },

  // complete
  successWrap: { alignItems: 'center', marginVertical: 16 },
  bigCircle: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  bigCircleText: { fontSize: 44, fontWeight: '800' },
  fareBig: { fontSize: 32, fontWeight: '800', color: BLACK, marginTop: 4 },

  // rating
  starRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 14 },
  star: { fontSize: 40, color: BORDER, marginHorizontal: 4 },
  starOn: { color: STAR },
  commentInput: {
    height: 80,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: BLACK,
    backgroundColor: BG,
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  thanks: { fontSize: 15, fontWeight: '700', color: GREEN, textAlign: 'center', paddingVertical: 6 },

  // ---- Rapido style layout ----
  mapTop: { height: 270, backgroundColor: '#DCE8F8' },
  sheet: {
    flex: 1,
    backgroundColor: BG,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -24,
    overflow: 'hidden',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: BORDER,
    marginTop: 10,
    marginBottom: 6,
  },
  sheetScroll: { padding: 16, paddingBottom: 24 },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  statusTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: BLACK, marginRight: 10 },
  etaPill: {
    backgroundColor: BLUE_LIGHT,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  etaPillGreen: { backgroundColor: GREEN_LIGHT },
  etaPillText: { fontSize: 14, fontWeight: '800', color: BLUE },
  etaPillTextGreen: { color: GREEN },

  otpPanel: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
  },
  otpPanelGreen: { borderColor: GREEN, backgroundColor: '#F0FDF4' },
  otpPanelTitle: { fontSize: 14, fontWeight: '700', color: BLACK, textAlign: 'center' },
  otpDigitsRow: { flexDirection: 'row', justifyContent: 'center', marginVertical: 12 },
  otpDigitBox: {
    width: 52,
    height: 58,
    borderRadius: 12,
    backgroundColor: BLUE_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 5,
  },
  otpDigit: { fontSize: 28, fontWeight: '800', color: BLUE },
  otpPanelHint: { fontSize: 12, color: GREY, textAlign: 'center' },

  captainCard: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 14 },
  captainPhone: { fontSize: 13, color: BLACK, fontWeight: '600', marginTop: 4 },
  callBtn: {
    backgroundColor: GREEN,
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  callIcon: { fontSize: 15, marginRight: 6 },
  callText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  plateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: BORDER,
    marginTop: 12,
    paddingTop: 12,
  },
  plateLabel: { fontSize: 12, color: GREY },
  plate: {
    backgroundColor: '#FEF9C3',
    borderWidth: 1.5,
    borderColor: BLACK,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  plateText: { fontSize: 15, fontWeight: '800', color: BLACK, letterSpacing: 1 },

  // buttons
  footer: { padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: BORDER },
  btn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnOutline: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOutlineText: { color: RED, fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
});