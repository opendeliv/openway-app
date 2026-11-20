import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Linking,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline } from 'react-native-maps';
import Ionicons from 'react-native-vector-icons/Ionicons';
import FindingCaptain from './FindingCaptain';
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
const VIOLET = '#7C3AED';
const VIOLET_LIGHT = '#EDE9FE';

const POLL_MS = 4000;

// Sheet snap points, as a share of the screen body height.
// Default: map 36% / details 64%.  Pulled down: map 50% / details 50%.
const MAP_RATIO_DEFAULT = 0.36;
const MAP_RATIO_HALF = 0.5;

// All debug logs carry the [TRACK] tag. Filter Metro / logcat by "TRACK".
const log = (...args: any[]) => console.log('[TRACK]', ...args);

type RideStatus =
  | 'REQUESTED'
  | 'ACCEPTED'
  | 'ARRIVING'
  | 'ARRIVED'
  | 'STARTED'
  | 'COMPLETED'
  | 'CANCELLED';

type PayStage = 'PICKUP' | 'DROP';

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
  payAt?: PayStage | string | null; // what the customer chose: pay at pickup / drop
  paymentStage?: PayStage | string | null; // when the payment was actually taken
  pickupPaymentDone?: boolean | null;
  paidAt?: string | null;
  captainRating?: number | null;
  acceptedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string;
  captain?: {
    name?: string | null;
    phone?: string | number | null;
    profilePhoto?: string | null;
  } | null;
  otp?: string | number | null; // pickup OTP (captain enters it to start)
  deliveryOtp?: string | number | null; // delivery OTP (captain enters it at drop)
  senderName?: string | null;
  senderPhone?: string | null;
  receiverName?: string | null;
  receiverPhone?: string | null;
  parcelSize?: string | null;
  parcelWeight?: string | number | null;
  parcelDescription?: string | null;
  isFragile?: boolean | null;
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

// Safe string, whatever type the backend sends (number / null / undefined)
const str = (v: unknown): string => (v == null ? '' : String(v).trim());

// Safe number (coordinates can arrive as strings)
const num = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const toStage = (v: unknown): PayStage | null => {
  const s = str(v).toUpperCase();
  return s === 'PICKUP' || s === 'DROP' ? (s as PayStage) : null;
};

// Backend vehicleType -> label shown to the user (same names as the booking screen)
const VEHICLE_LABELS: Record<string, string> = {
  lite: 'Lite Bike',
  bike: 'Super Bike',
  scooty: 'Scooty',
  mini: 'Mini',
  sedan: 'Sedan',
  suv: 'SUV',
  auto: 'Auto',
  e_rickshaw: 'E-Auto',
  shared_auto: 'Shared Auto',
  walk: 'Walk',
  cycle: 'Cycle',
  tata_ace: 'Tata Ace',
  pickup: 'Pickup',
  mini_van: 'Mini Van',
  utility_van: 'Utility Van',
  eicher: 'Eicher',
  mahindra_furio: 'Mahindra Furio',
};

const CATEGORY_LABELS: Record<string, string> = {
  BIKE: 'Bike ride',
  CAB: 'Cab ride',
  PARCEL: 'Parcel delivery',
  GOODS: 'Goods delivery',
};

const RATING_TEXT: Record<number, string> = {
  1: 'Very bad',
  2: 'Poor',
  3: 'Okay',
  4: 'Good',
  5: 'Excellent',
};

const vehicleLabel = (id?: string | null) => {
  const k = str(id);
  if (!k) return '--';
  return VEHICLE_LABELS[k] ?? k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

const prettyText = (v?: string | null) => {
  const s = str(v).replace(/_/g, ' ').toLowerCase();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
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

const formatTime = (iso?: string | null) => {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatDay = (iso?: string | null) => {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString([], {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

/* =========================================================
   ERROR BOUNDARY
   If anything inside the sheet crashes, show the error
   instead of a blank sheet (and log it).
   ========================================================= */

class SheetBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(e: any) {
    return { error: String(e?.message ?? e) };
  }

  componentDidCatch(e: any, info: any) {
    log('SHEET RENDER ERROR:', e?.message ?? e);
    log('ERROR STACK:', e?.stack);
    log('COMPONENT STACK:', info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={{ padding: 20 }}>
          <Text style={{ color: RED, fontWeight: '800', marginBottom: 6 }}>Render error</Text>
          <Text style={{ color: BLACK }}>{this.state.error}</Text>
        </View>
      );
    }
    return this.props.children as any;
  }
}

/* =========================================================
   SMALL PIECES
   ========================================================= */


// One "label : value" line
const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue} numberOfLines={2}>
      {value}
    </Text>
  </View>
);

const CaptainCard = ({ ride, showCall = true }: { ride: RideData; showCall?: boolean }) => {
  const c = ride.captain;
  const name = str(c?.name) || 'Captain';
  const phone = str(c?.phone);
  const photo = str(c?.profilePhoto);
  const vehicleModel = str(ride.captainVehicleModel);
  const vehicleNumber = str(ride.captainVehicleNumber);

  const callCaptain = () => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`).catch(() =>
      Alert.alert('Unable to place call', 'The phone app could not be opened.'),
    );
  };

  return (
    <View style={styles.captainCard}>
      <Text style={styles.cardEyebrow}>YOUR CAPTAIN</Text>

      <View style={styles.captainRow}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarLetter}>{name.charAt(0).toUpperCase()}</Text>
          </View>
        )}

        <View style={styles.flex}>
          <Text style={styles.captainName} numberOfLines={1}>
            {name}
          </Text>
          {!!vehicleModel && <Text style={styles.captainSub}>{vehicleModel}</Text>}
          {!!phone && (
            <View style={styles.phoneRow}>
              <Ionicons name="call-outline" size={13} color={GREY} />
              <Text style={styles.captainPhone}>{phone}</Text>
            </View>
          )}
        </View>

        {showCall && !!phone && (
          <TouchableOpacity style={styles.callBtn} activeOpacity={0.8} onPress={callCaptain}>
            <Ionicons name="call" size={16} color="#fff" />
            <Text style={styles.callText}>Call</Text>
          </TouchableOpacity>
        )}
      </View>

      {!!vehicleNumber && (
        <View style={styles.plateRow}>
          <Text style={styles.plateLabel}>Vehicle number</Text>
          <View style={styles.plate}>
            <Text style={styles.plateText} numberOfLines={1}>
              {vehicleNumber}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
};

// Payment card shown while the order is active: tells the customer WHEN to pay
const PayNowCard = ({ ride }: { ride: RideData }) => {
  const choice: PayStage = toStage(ride.payAt) ?? 'DROP';
  const fare = ride.fare != null ? `₹${ride.fare}` : 'the fare';
  const paidAtPickup = !!ride.pickupPaymentDone || toStage(ride.paymentStage) === 'PICKUP';
  const status = ride.status;

  let title = '';
  let sub = '';
  let icon: string = 'flag';
  let done = false;

  if (paidAtPickup) {
    title = 'Paid at pickup';
    sub = 'Your payment was received by the captain at the pickup location.';
    icon = 'checkmark-circle';
    done = true;
  } else if (choice === 'PICKUP') {
    if (status === 'STARTED') {
      title = 'Pay at drop';
      sub = `Payment was not made at pickup. Please pay ${fare} to the captain when you reach the drop.`;
      icon = 'flag';
    } else if (status === 'ARRIVED') {
      title = 'Pay at pickup';
      sub = `Captain has arrived. Please pay ${fare} to the captain now.`;
      icon = 'location';
    } else {
      title = 'Pay at pickup';
      sub = `You will pay ${fare} to the captain at the pickup location.`;
      icon = 'location';
    }
  } else if (status === 'STARTED') {
    title = 'Pay at drop';
    sub = `Please pay ${fare} to the captain when you reach the drop.`;
    icon = 'flag';
  } else {
    title = 'Pay at drop';
    sub = `You will pay ${fare} to the captain at the drop location.`;
    icon = 'flag';
  }

  return (
    <View style={[styles.card, styles.payNowCard, done && styles.payNowCardDone]}>
      <Text style={styles.cardEyebrow}>PAYMENT</Text>
      <View style={styles.captainRow}>
        <View style={[styles.avatar, styles.avatarFallback, done && styles.avatarDone]}>
          <Ionicons name={icon} size={22} color={done ? GREEN : BLUE} />
        </View>
        <View style={styles.flex}>
          <Text style={[styles.captainName, done && { color: GREEN }]}>{title}</Text>
          <Text style={styles.captainSub}>{sub}</Text>
        </View>
      </View>
    </View>
  );
};

// Captain on the way: highlighted banner with pulsing dot + big ETA
const OnTheWayBanner = ({ eta, name }: { eta: number | null | undefined; name: string }) => {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1300,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const ring = {
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }],
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
  };

  return (
    <View style={styles.onWayBanner}>
      <View style={styles.onWayDotWrap}>
        <Animated.View style={[styles.onWayRing, ring]} />
        <View style={styles.onWayDot} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.onWayTitle}>Captain is on the way</Text>
        <Text style={styles.onWaySub} numberOfLines={2}>
          {name} aapke pickup location par aa raha hai
        </Text>
      </View>
      <View style={styles.onWayEta}>
        <Text style={styles.onWayEtaValue}>{eta != null ? eta : '--'}</Text>
        <Text style={styles.onWayEtaUnit}>min</Text>
      </View>
    </View>
  );
};

type StepState = 'done' | 'current' | 'locked' | 'later';

const StepDot = ({ state, index }: { state: StepState; index: number }) => (
  <View
    style={[
      styles.stepDot,
      state === 'done' && styles.stepDotDone,
      state === 'current' && styles.stepDotCurrent,
      state === 'later' && styles.stepDotLater,
    ]}
  >
    {state === 'done' ? (
      <Ionicons name="checkmark" size={15} color="#fff" />
    ) : state === 'later' ? (
      <Ionicons name="time-outline" size={15} color={BLUE} />
    ) : (
      <Text style={[styles.stepDotText, state === 'current' && { color: '#fff' }]}>{index + 1}</Text>
    )}
  </View>
);

// ARRIVED: 1) give product  2) pickup payment  3) pickup OTP
const PickupSteps = ({
  ride,
  productGiven,
  onProductGiven,
}: {
  ride: RideData;
  productGiven: boolean;
  onProductGiven: () => void;
}) => {
  const cat = str(ride.category).toUpperCase();
  const parcelLike = cat === 'PARCEL' || cat === 'GOODS';
  const payAtPickup = (toStage(ride.payAt) ?? 'DROP') === 'PICKUP';
  const fare = ride.fare != null ? `₹${ride.fare}` : 'the fare';
  const method = ride.paymentMethod === 'UPI' ? 'UPI' : 'Cash';

  const paidAtPickup = !!ride.pickupPaymentDone || toStage(ride.paymentStage) === 'PICKUP';
  // Captain ne payment le li => product bhi ja chuka hai
  const productDone = !parcelLike || productGiven || paidAtPickup;
const otpReady = productDone;

  const otpDigits = (str(ride.otp) || '----').split('');

  const steps: { key: 'product' | 'pay' | 'otp'; title: string; sub?: string; state: StepState }[] = [];

  if (parcelLike) {
    steps.push({
      key: 'product',
      title: 'Give your product to captain',
      sub: productDone ? 'Product handed over' : undefined,
      state: productDone ? 'done' : 'current',
    });
  }

steps.push({
  key: 'pay',
  title: !payAtPickup
    ? 'Payment at drop'
    : paidAtPickup
    ? 'Pickup payment received'
    : 'Pay your pickup payment',
  sub: !payAtPickup
    ? `You will pay ${fare} at the drop location`
    : paidAtPickup
    ? `Captain confirmed ${fare} (${method}) received`
    : undefined,
  state: !payAtPickup ? 'later' : paidAtPickup ? 'done' : productDone ? 'current' : 'locked',
});

  steps.push({
    key: 'otp',
    title: 'Share OTP with captain',
    state: otpReady ? 'current' : 'locked',
  });

  return (
    <View style={styles.stepsPanel}>
      <Text style={styles.cardEyebrow}>PICKUP STEPS</Text>

      {steps.map((s, i) => (
        <View key={s.key}>
          <View style={styles.stepRow}>
            <StepDot state={s.state} index={i} />
            <View style={styles.flex}>
              <Text style={[styles.stepTitle, s.state === 'locked' && styles.stepTitleLocked]}>
                {s.title}
              </Text>
              {!!s.sub && <Text style={styles.stepSub}>{s.sub}</Text>}
            </View>
          </View>

          {/* Body only for the step that is active right now */}
          {s.state === 'current' && s.key === 'product' && (
            <View style={styles.stepBody}>
              <View style={styles.otpNote}>
                <Ionicons name="camera-outline" size={15} color="#B45309" />
                <Text style={styles.otpNoteText}>
                  Product dene se pehle uski photo / video le lo.
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.btn, styles.stepBtn]}
                activeOpacity={0.85}
                onPress={onProductGiven}
              >
                <Text style={styles.btnText}>Maine product de diya</Text>
              </TouchableOpacity>
            </View>
          )}

          {s.state === 'current' && s.key === 'pay' && (
            <View style={styles.stepBody}>
              <View style={styles.payBox}>
                <Text style={styles.payBoxLabel}>Pay to captain ({method})</Text>
                <Text style={styles.payBoxAmount}>{fare}</Text>
              </View>
              <View style={styles.waitRow}>
                <ActivityIndicator size="small" color={BLUE} />
                <Text style={styles.waitText}>
                  Captain "Payment received" dabayega to ye step apne aap complete ho jayega.
                </Text>
              </View>
            </View>
          )}

          {s.state === 'current' && s.key === 'otp' && (
            <View style={styles.stepBody}>
              <Text style={styles.otpPanelTitle}>Pickup OTP</Text>
              <View style={styles.otpDigitsRow}>
                {otpDigits.map((d, idx) => (
                  <View key={idx} style={styles.otpDigitBox}>
                    <Text style={styles.otpDigit}>{d}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.otpPanelHint}>Delivery starts once the captain enters this OTP.</Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
};
// STARTED: receiver OTP. Violet theme so it looks different from the pickup OTP
const ReceiverOtpPanel = ({ ride }: { ride: RideData }) => {
  const digits = (str(ride.deliveryOtp) || '----').split('');
  const name = str(ride.receiverName);
  const phone = str(ride.receiverPhone);

  return (
    <View style={styles.rcvPanel}>
      <View style={styles.rcvBadge}>
        <Ionicons name="person" size={12} color="#fff" />
        <Text style={styles.rcvBadgeText}>RECEIVER OTP</Text>
      </View>

      <Text style={styles.rcvTitle}>Ye OTP receiver ko batao</Text>
      <Text style={styles.rcvWho}>
        {name ? name : 'Receiver'}
        {phone ? `  •  ${phone}` : ''}
      </Text>

      <View style={styles.rcvDigitsRow}>
        {digits.map((d, i) => (
          <View key={i} style={styles.rcvDigitBox}>
            <Text style={styles.rcvDigit}>{d}</Text>
          </View>
        ))}
      </View>

      <View style={styles.rcvNote}>
        <Ionicons name="shield-checkmark-outline" size={15} color="#5B21B6" />
        <Text style={styles.rcvNoteText}>
          Ye OTP tabhi do jab receiver ko product mil jaye. Captain delivery par receiver se ye OTP
          maangega.
        </Text>
      </View>
    </View>
  );
};

// Trip details = dropdown (tap the header to open / close)
const TripDetails = ({
  ride,
  onCancelPress,
  defaultOpen = false,
}: {
  ride: RideData;
  onCancelPress?: () => void;
  defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const [menuOpen, setMenuOpen] = useState(false);
  const cat = str(ride.category).toUpperCase();
  const iconName =
    cat === 'CAB' ? 'car-sport-outline' : cat === 'BIKE' ? 'bicycle-outline' : 'cube-outline';

  const summary = `${vehicleLabel(ride.vehicleType)}${ride.fare != null ? `  •  ₹${ride.fare}` : ''}`;

  return (
    <View style={styles.card}>
      {/* Header: tap to open / close */}
      <View style={styles.cardHeadRow}>
        <TouchableOpacity
          style={[styles.flex, styles.tripHeadTap]}
          activeOpacity={0.7}
          onPress={() => setOpen((v) => !v)}
        >
          <View style={styles.flex}>
            <Text style={[styles.cardTitle, styles.noMargin]}>Trip details</Text>
            {!open && (
              <Text style={styles.tripSummary} numberOfLines={1}>
                {summary}
              </Text>
            )}
          </View>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={22} color={GREY} />
        </TouchableOpacity>

        {!!onCancelPress && (
          <TouchableOpacity
            style={styles.menuBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={() => setMenuOpen(true)}
          >
            <Ionicons name="ellipsis-vertical" size={20} color={GREY} />
          </TouchableOpacity>
        )}
      </View>

      {open && (
        <View style={styles.tripBody}>
          {/* Vehicle chosen at booking time */}
          <View style={styles.vehicleRow}>
            <View style={styles.vehicleIcon}>
              <Ionicons name={iconName} size={20} color={BLUE} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.tripLabel}>Vehicle</Text>
              <Text style={styles.vehicleName}>{vehicleLabel(ride.vehicleType)}</Text>
            </View>
            {!!CATEGORY_LABELS[cat] && (
              <View style={styles.catChip}>
                <Text style={styles.catChipText}>{CATEGORY_LABELS[cat]}</Text>
              </View>
            )}
          </View>

          {/* Quick stats: distance / duration / fare */}
          <View style={styles.miniStatsRow}>
            <View style={styles.miniStat}>
              <Ionicons name="navigate-outline" size={16} color={BLUE} />
              <View style={styles.miniStatCol}>
                <Text style={styles.miniStatValue}>
                  {ride.distance != null ? `${ride.distance} km` : '--'}
                </Text>
                <Text style={styles.miniStatLabel}>Distance</Text>
              </View>
            </View>

            <View style={styles.miniStat}>
              <Ionicons name="time-outline" size={16} color={BLUE} />
              <View style={styles.miniStatCol}>
                <Text style={styles.miniStatValue}>
                  {ride.duration != null ? `${ride.duration} min` : '--'}
                </Text>
                <Text style={styles.miniStatLabel}>Duration</Text>
              </View>
            </View>

            <View style={styles.miniStat}>
              <Ionicons name="cash-outline" size={16} color={BLUE} />
              <View style={styles.miniStatCol}>
                <Text style={styles.miniStatValue}>
                  {ride.fare != null ? `₹${ride.fare}` : '--'}
                </Text>
                <Text style={styles.miniStatLabel}>Fare</Text>
              </View>
            </View>
          </View>

          <View style={styles.tripRow}>
            <View style={styles.pickupDot} />
            <View style={styles.flex}>
              <Text style={styles.tripLabel}>Pickup</Text>
              <Text style={styles.tripValue} numberOfLines={2}>
                {str(ride.pickupAddress)}
              </Text>
            </View>
          </View>

          <View style={styles.tripRow}>
            <View style={styles.dropSquare} />
            <View style={styles.flex}>
              <Text style={styles.tripLabel}>Drop</Text>
              <Text style={styles.tripValue} numberOfLines={2}>
                {str(ride.dropAddress)}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* 3-dot menu: cancel lives here so it is not one tap away */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <TouchableOpacity
          style={styles.menuBackdrop}
          activeOpacity={1}
          onPress={() => setMenuOpen(false)}
        >
          <View style={styles.menuSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.menuHandle} />
            <Text style={styles.menuTitle}>Order options</Text>

            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => {
                setMenuOpen(false);
                setTimeout(() => onCancelPress && onCancelPress(), 250);
              }}
            >
              <Ionicons name="close-circle-outline" size={24} color={RED} />
              <View style={[styles.flex, styles.menuItemText]}>
                <Text style={styles.menuItemTitle}>Cancel order</Text>
                <Text style={styles.menuItemSub}>Stop this order</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuClose}
              activeOpacity={0.8}
              onPress={() => setMenuOpen(false)}
            >
              <Text style={styles.menuCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

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

  // Pickup steps (customer side)
  const [productGiven, setProductGiven] = useState(false);

  const mapRef = useRef<MapView>(null);

  /* ---------- Draggable sheet (map <-> details) ---------- */

  const [bodyH, setBodyH] = useState(0);
  const mapH = useRef(new Animated.Value(280)).current;
  const mapHVal = useRef(280);
  const dragStart = useRef(280);
  const expandedRef = useRef(false);
  const snaps = useRef({ def: 280, half: 360 });
  const fitMapRef = useRef<() => void>(() => {});

  snaps.current = {
    def: bodyH ? bodyH * MAP_RATIO_DEFAULT : 280,
    half: bodyH ? bodyH * MAP_RATIO_HALF : 360,
  };

  useEffect(() => {
    const id = mapH.addListener(({ value }) => {
      mapHVal.current = value;
    });
    return () => mapH.removeListener(id);
  }, [mapH]);

  // Once the real body height is known, place the map at the right snap point
  useEffect(() => {
    if (!bodyH) return;
    const target = expandedRef.current ? snaps.current.half : snaps.current.def;
    mapH.setValue(target);
    log('BODY height', bodyH, 'map height ->', target);
    setTimeout(() => fitMapRef.current(), 150);
  }, [bodyH, mapH]);

  const snapTo = useCallback(
    (half: boolean) => {
      expandedRef.current = half;
      log('SNAP ->', half ? 'half / half' : 'default');
      Animated.spring(mapH, {
        toValue: half ? snaps.current.half : snaps.current.def,
        useNativeDriver: false, // height cannot use the native driver
        speed: 14,
        bounciness: 4,
      }).start(() => fitMapRef.current());
    },
    [mapH],
  );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
      onPanResponderGrant: () => {
        mapH.stopAnimation();
        dragStart.current = mapHVal.current;
      },
      onPanResponderMove: (_, g) => {
        const { def, half } = snaps.current;
        mapH.setValue(clamp(dragStart.current + g.dy, def, half));
      },
      onPanResponderRelease: (_, g) => {
        const { def, half } = snaps.current;

        // A simple tap on the handle toggles between the two states
        if (Math.abs(g.dx) < 4 && Math.abs(g.dy) < 4) {
          snapTo(!expandedRef.current);
          return;
        }

        const mid = (def + half) / 2;
        const toHalf = g.vy > 0.5 ? true : g.vy < -0.5 ? false : mapHVal.current > mid;
        snapTo(toHalf);
      },
      onPanResponderTerminate: () => {
        const { def, half } = snaps.current;
        snapTo(mapHVal.current > (def + half) / 2);
      },
    }),
  ).current;

  /* ---------- Refresh the ride every few seconds ---------- */

  const fetchRide = useCallback(async () => {
    try {
      const data = (await ridesApi.getRide(rideId)) as RideData;
      log('RIDE:', JSON.stringify(data));
      setRide(data);
      setLoadError(false);
      return data;
    } catch (e: any) {
      log('RIDE ERROR:', e?.message ?? e);
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

  // Green tick animation (plays when the order is completed)
  const tickScale = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (status !== 'COMPLETED') return;
    tickScale.setValue(0);
    Animated.spring(tickScale, {
      toValue: 1,
      friction: 5,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [status, tickScale]);

  // Log the ride shape + value types whenever the status changes
  useEffect(() => {
    if (!ride) {
      log('ride = null (not loaded yet)');
      return;
    }
    log('STATUS ->', ride.status);
    log('TYPES:', {
      otp: `${typeof ride.otp} = ${String(ride.otp)}`,
      captain: ride.captain == null ? 'null' : JSON.stringify(ride.captain),
      captainPhoneType: typeof ride.captain?.phone,
      captainEtaMinutes: typeof ride.captainEtaMinutes,
      captainLat: `${typeof ride.captainLatitude} = ${String(ride.captainLatitude)}`,
      captainLng: `${typeof ride.captainLongitude} = ${String(ride.captainLongitude)}`,
      vehicleNumber: String(ride.captainVehicleNumber),
      vehicleModel: String(ride.captainVehicleModel),
      pickupLat: `${typeof ride.pickupLatitude} = ${String(ride.pickupLatitude)}`,
      dropLat: `${typeof ride.dropLatitude} = ${String(ride.dropLatitude)}`,
      fare: `${typeof ride.fare} = ${String(ride.fare)}`,
      payAt: String(ride.payAt),
      paymentStage: String(ride.paymentStage),
      pickupPaymentDone: String(ride.pickupPaymentDone),
      paidAt: String(ride.paidAt),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ride?.status]);

  // Coordinates, made safe
  const pickupLat = num(ride?.pickupLatitude);
  const pickupLng = num(ride?.pickupLongitude);
  const dropLat = num(ride?.dropLatitude);
  const dropLng = num(ride?.dropLongitude);
  const capLat = num(ride?.captainLatitude);
  const capLng = num(ride?.captainLongitude);

  /* ---------- Route line on the map ---------- */

  useEffect(() => {
    if (!ride || route) return;
    if (pickupLat == null || pickupLng == null || dropLat == null || dropLng == null) return;

    mapsApi
      .route(
        { address: ride.pickupAddress, latitude: pickupLat, longitude: pickupLng },
        { address: ride.dropAddress, latitude: dropLat, longitude: dropLng },
        ride.category === 'BIKE' ? 'TWO_WHEELER' : 'DRIVE',
      )
      .then(setRoute)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ride?.id]);

  const routeCoords = useMemo(
    () => (route?.encodedPolyline ? decodePolyline(route.encodedPolyline) : []),
    [route],
  );

  // Fit the map around pickup / drop / captain
  const fitMap = () => {
    if (pickupLat == null || pickupLng == null || dropLat == null || dropLng == null) return;

    const pts = [
      { latitude: pickupLat, longitude: pickupLng },
      { latitude: dropLat, longitude: dropLng },
    ];
    if (capLat != null && capLng != null) {
      pts.push({ latitude: capLat, longitude: capLng });
    }
    mapRef.current?.fitToCoordinates(pts, {
      edgePadding: { top: 70, right: 60, bottom: 50, left: 60 },
      animated: true,
    });
  };
  fitMapRef.current = fitMap;

  useEffect(() => {
    fitMap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, capLat, capLng, routeCoords.length]);

  /* ---------- Actions ---------- */

  const onCancel = () => {
    Alert.alert('Cancel order?', 'Are you sure you want to cancel this order?', [
      { text: 'Keep order', style: 'cancel' },
      {
        text: 'Yes, cancel',
        style: 'destructive',
        onPress: async () => {
          try {
            setBusy(true);
            await ridesApi.cancelRide(rideId);
            await fetchRide();
          } catch (e: any) {
            Alert.alert('Unable to cancel', e?.message || 'Please try again.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const onSubmitRating = async () => {
    if (rating < 1) {
      Alert.alert('Rating required', 'Please select a star rating.');
      return;
    }
    try {
      setBusy(true);
      await ridesApi.rateCaptain(rideId, { rating, comment: comment.trim() || undefined });
      setRatingSent(true);
    } catch (e: any) {
      Alert.alert('Unable to submit rating', e?.message || 'Please try again.');
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
              <Text style={styles.bigTitle}>Unable to load your order</Text>
              <Text style={styles.bigSub}>Please check your connection and try again.</Text>
              <TouchableOpacity style={[styles.btn, styles.btnTop]} onPress={fetchRide}>
                <Text style={styles.btnText}>Try again</Text>
              </TouchableOpacity>
            </>
          ) : (
            <ActivityIndicator size="large" color={BLUE} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  /* ---------- Searching for a captain ---------- */
  if (status === 'REQUESTED') {
    return <FindingCaptain ride={ride} onCancel={onCancel} cancelling={busy} />;
  }

  /* ---------- Cancelled ---------- */
  if (status === 'CANCELLED') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <View style={[styles.bigCircle, { backgroundColor: '#FEE2E2' }]}>
            <Ionicons name="close" size={48} color={RED} />
          </View>
          <Text style={styles.bigTitle}>Order cancelled</Text>
          <Text style={styles.bigSub}>You can place a new order anytime.</Text>
        </View>
        <View style={styles.footer}>
          <TouchableOpacity style={styles.btn} onPress={onClose}>
            <Text style={styles.btnText}>Back to home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  /* ---------- Completed ---------- */
  if (status === 'COMPLETED') {
    const alreadyRated = ride.captainRating != null || ratingSent;
    const paymentLabel =
      ride.paymentMethod === 'CASH' ? 'Cash' : ride.paymentMethod === 'UPI' ? 'UPI' : '';

    const cat = str(ride.category).toUpperCase();
    const isParcelLike = cat === 'PARCEL' || cat === 'GOODS';

    const paid = !!ride.paidAt || !!ride.paymentMethod;
    // When did the payment happen: backend value > pickup flag > default DROP
    const payStage: PayStage | null = !paid
      ? null
      : toStage(ride.paymentStage) ?? (ride.pickupPaymentDone ? 'PICKUP' : 'DROP');
    const choice = toStage(ride.payAt);
    const stageText = payStage === 'PICKUP' ? '📍 At pickup' : payStage === 'DROP' ? '🏁 At drop' : '-';
    const payTimeText = ride.paidAt ? `${formatDay(ride.paidAt)}, ${formatTime(ride.paidAt)}` : '-';

    const skipRating = () => {
      Alert.alert('Skip rating?', 'You are leaving without rating the captain.', [
        { text: 'I will rate', style: 'cancel' },
        { text: 'Skip', style: 'destructive', onPress: onClose },
      ]);
    };

    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Success: animated green tick + fare + when it was paid */}
          <View style={styles.successCard}>
            <Animated.View style={[styles.tickCircle, { transform: [{ scale: tickScale }] }]}>
              <Text style={styles.tick}>✓</Text>
            </Animated.View>
            <Text style={styles.successTitle}>
              {paid ? 'Payment Successful' : 'Delivery completed'}
            </Text>
            <Text style={styles.successAmount}>{ride.fare != null ? `₹ ${ride.fare}` : '--'}</Text>
            {!!paymentLabel && <Text style={styles.successSub}>Paid via {paymentLabel}</Text>}
            {!!payStage && (
              <View style={[styles.stageBadge, styles.stageBadgeCenter]}>
                <Text style={styles.stageBadgeText}>
                  {payStage === 'PICKUP' ? '📍 You paid at pickup' : '🏁 You paid at drop'}
                </Text>
              </View>
            )}
            {!!ride.completedAt && (
              <Text style={styles.successTime}>{formatDate(ride.completedAt)}</Text>
            )}
          </View>

          {/* Payment details */}
          {paid && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Payment details</Text>
              <View style={styles.infoBlock}>
                <InfoRow label="Amount" value={ride.fare != null ? `₹${ride.fare}` : '-'} />
                <InfoRow label="Paid at" value={stageText} />
                <InfoRow label="Method" value={paymentLabel || '-'} />
                <InfoRow label="Payment time" value={payTimeText} />
                {!!choice && (
                  <InfoRow
                    label="Your choice"
                    value={choice === 'PICKUP' ? 'Pay at Pickup' : 'Pay at Drop'}
                  />
                )}
                {!!choice && !!payStage && choice !== payStage && (
                  <InfoRow
                    label="Note"
                    value={
                      payStage === 'DROP'
                        ? 'Not paid at pickup, paid at drop'
                        : 'Paid at pickup, before the drop'
                    }
                  />
                )}
                <InfoRow label="Status" value="Paid" />
              </View>
            </View>
          )}

          <CaptainCard ride={ride} showCall={false} />
          <TripDetails ride={ride} defaultOpen />

          {/* Order details + timeline */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Order details</Text>
            <View style={styles.infoBlock}>
              <InfoRow label="Order ID" value={`#${String(ride.id).slice(0, 8).toUpperCase()}`} />
              <InfoRow label="Date" value={formatDay(ride.completedAt ?? ride.createdAt)} />
              <InfoRow label="Type" value={CATEGORY_LABELS[cat] ?? '-'} />
              <InfoRow label="Vehicle" value={vehicleLabel(ride.vehicleType)} />
            </View>

            <View style={styles.infoBlock}>
              <InfoRow label="Order accepted" value={formatTime(ride.acceptedAt)} />
              <InfoRow label="Pickup done" value={formatTime(ride.startedAt)} />
              <InfoRow label="Delivered" value={formatTime(ride.completedAt)} />
              {paid && (
                <InfoRow
                  label={`Payment (${payStage === 'PICKUP' ? 'Pickup' : 'Drop'})`}
                  value={formatTime(ride.paidAt)}
                />
              )}
            </View>
          </View>

          {/* Sender / receiver / parcel (parcel and goods orders only) */}
          {isParcelLike && (
            <View style={styles.card}>
              {(!!str(ride.senderName) || !!str(ride.senderPhone)) && (
                <>
                  <Text style={styles.cardTitle}>Sender</Text>
                  <View style={styles.infoBlock}>
                    <InfoRow label="Name" value={str(ride.senderName) || '-'} />
                    <InfoRow label="Phone" value={str(ride.senderPhone) || '-'} />
                  </View>
                </>
              )}

              <Text style={[styles.cardTitle, styles.cardTitleGap]}>Receiver</Text>
              <View style={styles.infoBlock}>
                <InfoRow label="Name" value={str(ride.receiverName) || '-'} />
                <InfoRow label="Phone" value={str(ride.receiverPhone) || '-'} />
              </View>

              <Text style={[styles.cardTitle, styles.cardTitleGap]}>Parcel</Text>
              <View style={styles.infoBlock}>
                {!!str(ride.parcelSize) && (
                  <InfoRow label="Size" value={prettyText(ride.parcelSize)} />
                )}
                {!!str(ride.parcelWeight) && (
                  <InfoRow label="Weight" value={`${str(ride.parcelWeight)} kg`} />
                )}
                {!!ride.isFragile && <InfoRow label="Fragile" value="Yes" />}
                <InfoRow label="Description" value={str(ride.parcelDescription) || '-'} />
              </View>
            </View>
          )}

          <View style={styles.card}>
            {alreadyRated ? (
              <Text style={styles.thanks}>Thanks for your feedback!</Text>
            ) : (
              <>
                <Text style={styles.cardTitle}>Rate the captain</Text>
                <View style={styles.starRow}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <TouchableOpacity key={n} onPress={() => setRating(n)} activeOpacity={0.8}>
                      <Ionicons
                        name={n <= rating ? 'star' : 'star-outline'}
                        size={38}
                        color={n <= rating ? STAR : '#CBD5E1'}
                        style={styles.star}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
                {rating > 0 && <Text style={styles.ratingText}>{RATING_TEXT[rating]}</Text>}
                <TextInput
                  style={styles.commentInput}
                  placeholder="Share more about your experience (optional)"
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
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.btnText}>Submit rating</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={styles.skipBtn} onPress={skipRating} disabled={busy}>
                  <Text style={styles.skipText}>Skip</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>

        {alreadyRated && (
          <View style={styles.footer}>
            <TouchableOpacity style={styles.btn} onPress={onClose}>
              <Text style={styles.btnText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    );
  }

  /* ---------- Captain accepted / on the way / arrived / trip in progress ---------- */
  const started = status === 'STARTED';
  const arrived = status === 'ARRIVED';
  const onTheWay = status === 'ARRIVING';

  // ACCEPTED   -> Captain accepted your order
  // ARRIVING   -> Captain is on the way
  // ARRIVED    -> Captain has arrived (product -> payment -> OTP)
  // STARTED    -> Delivery in progress (receiver OTP)
  const headline = started
    ? 'Delivery in progress'
    : arrived
    ? 'Captain has arrived'
    : onTheWay
    ? 'Captain is on the way'
    : 'Captain accepted your order';

  const pillText = started
    ? 'On trip'
    : arrived
    ? 'Arrived'
    : onTheWay
    ? ride.captainEtaMinutes != null
      ? `${ride.captainEtaMinutes} min`
      : '-- min'
    : 'Accepted';

  log('RENDER main branch', { status, started, arrived, onTheWay, headline, pillText });

  return (
    <SafeAreaView
      style={styles.container}
      edges={['top', 'bottom']}
      onLayout={(e) => log('LAYOUT container', e.nativeEvent.layout)}
    >
      <View style={styles.body} onLayout={(e) => setBodyH(e.nativeEvent.layout.height)}>
        {/* Map */}
        <Animated.View
          style={[styles.mapWrap, { height: mapH }]}
          onLayout={(e) => log('LAYOUT map', e.nativeEvent.layout)}
        >
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            initialRegion={{
              latitude: pickupLat ?? 23.2599,
              longitude: pickupLng ?? 77.4126,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }}
            toolbarEnabled={false}
            onMapReady={() => log('MAP ready')}
            onMapLoaded={() => log('MAP loaded (tiles received)')}
          >
            {pickupLat != null && pickupLng != null && (
              <Marker
                coordinate={{ latitude: pickupLat, longitude: pickupLng }}
                pinColor="green"
                title="Pickup"
              />
            )}
            {dropLat != null && dropLng != null && (
              <Marker
                coordinate={{ latitude: dropLat, longitude: dropLng }}
                pinColor="red"
                title="Drop"
              />
            )}
            {capLat != null && capLng != null && (
              <Marker
                coordinate={{ latitude: capLat, longitude: capLng }}
                title="Captain"
                pinColor="blue"
              />
            )}
            {routeCoords.length > 0 && (
              <Polyline coordinates={routeCoords} strokeColor={BLUE} strokeWidth={5} />
            )}
          </MapView>
        </Animated.View>

        {/* Bottom sheet */}
        <View style={styles.sheet} onLayout={(e) => log('LAYOUT sheet', e.nativeEvent.layout)}>
          {/* Drag zone: handle + status. Pull down = map and details 50/50 */}
          <View {...panResponder.panHandlers} style={styles.dragZone}>
            <View style={styles.sheetHandle} />

            <View style={styles.statusRow}>
              <Text style={styles.statusTitle} numberOfLines={1}>
                {headline}
              </Text>
              <View
                style={[
                  styles.etaPill,
                  arrived && styles.etaPillGreen,
                  onTheWay && styles.etaPillBlue,
                ]}
              >
                <Text
                  style={[
                    styles.etaPillText,
                    arrived && styles.etaPillTextGreen,
                    onTheWay && styles.etaPillTextWhite,
                  ]}
                >
                  {pillText}
                </Text>
              </View>
            </View>
          </View>

          <SheetBoundary>
            <ScrollView
              style={styles.flex}
              contentContainerStyle={styles.sheetScroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              onLayout={(e) => log('LAYOUT scrollview', e.nativeEvent.layout)}
              onContentSizeChange={(w, h) => log('SCROLL content size', { w, h })}
            >
              {/* Captain on the way: highlighted */}
              {onTheWay && (
                <OnTheWayBanner
                  eta={ride.captainEtaMinutes}
                  name={str(ride.captain?.name) || 'Captain'}
                />
              )}

              {/* Captain arrived: give product -> pickup payment -> OTP */}
          {arrived && (
  <PickupSteps
    ride={ride}
    productGiven={productGiven}
    onProductGiven={() => setProductGiven(true)}
  />
)}

              {/* Trip started: receiver OTP (different look from the pickup OTP) */}
              {started && !!str(ride.deliveryOtp) && <ReceiverOtpPanel ride={ride} />}

              {/* PickupSteps already shows the payment status while ARRIVED */}
              {!arrived && <PayNowCard ride={ride} />}

              <CaptainCard ride={ride} />
              <TripDetails ride={ride} onCancelPress={!started ? onCancel : undefined} />
            </ScrollView>
          </SheetBoundary>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: BG },
  body: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  fullWidth: { alignSelf: 'stretch', marginTop: 28 },
  gap: { height: 10 },

  bigTitle: { fontSize: 20, fontWeight: '800', color: BLACK, textAlign: 'center', marginTop: 18 },
  bigSub: { fontSize: 13.5, color: GREY, textAlign: 'center', marginTop: 6, lineHeight: 19 },

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

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: BLACK, marginBottom: 10 },
  cardTitleGap: { marginTop: 16 },
  cardEyebrow: {
    fontSize: 10.5,
    fontWeight: '700',
    color: GREY,
    letterSpacing: 0.8,
    marginBottom: 10,
  },

  // payment card (active order)
  payNowCard: { borderWidth: 1.5, borderColor: BLUE_LIGHT },
  payNowCardDone: { borderColor: GREEN, backgroundColor: '#F0FDF4' },
  avatarDone: { backgroundColor: GREEN_LIGHT },

  // paid-at badge + info rows
  stageBadge: {
    alignSelf: 'flex-start',
    backgroundColor: GREEN_LIGHT,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 10,
  },
  stageBadgeText: { color: GREEN, fontSize: 12.5, fontWeight: '800' },
  infoBlock: {
    backgroundColor: BG,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 4,
    marginBottom: 8,
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

  // captain
  captainCard: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 12 },
  captainRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 48, height: 48, borderRadius: 24, marginRight: 12, backgroundColor: BORDER },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: BLUE_LIGHT },
  avatarLetter: { fontSize: 20, fontWeight: '800', color: BLUE },
  captainName: { fontSize: 16, fontWeight: '800', color: BLACK },
  captainSub: { fontSize: 12.5, color: GREY, marginTop: 2, lineHeight: 18 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  captainPhone: { fontSize: 13, color: GREY, fontWeight: '600', marginLeft: 5 },
  callBtn: {
    backgroundColor: GREEN,
    borderRadius: 22,
    paddingVertical: 9,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  callText: { color: '#fff', fontSize: 14, fontWeight: '800', marginLeft: 6 },
  plateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: BORDER,
    marginTop: 10,
    paddingTop: 10,
  },
  plateLabel: { fontSize: 12, color: GREY },
  plate: {
    backgroundColor: '#FEF9C3',
    borderWidth: 1,
    borderColor: BLACK,
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 7,
    maxWidth: '55%',
  },
  plateText: { fontSize: 11.5, fontWeight: '800', color: BLACK, letterSpacing: 0.5 },

  // trip
  tripRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  pickupDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: GREEN,
    borderWidth: 3,
    borderColor: '#BBF7D0',
    marginRight: 12,
    marginTop: 4,
  },
  dropSquare: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: RED,
    marginRight: 12,
    marginTop: 4,
  },
  tripLabel: { fontSize: 12, color: GREY },
  tripValue: { fontSize: 14.5, fontWeight: '600', color: BLACK, marginTop: 2 },
  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 10,
    marginTop: 2,
  },
  stat: { flex: 1 },
  statValue: { fontSize: 15, fontWeight: '700', color: BLACK, marginTop: 2 },

  // trip details: dropdown header, body, vehicle row, 3-dot menu
  cardHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tripHeadTap: { flexDirection: 'row', alignItems: 'center', paddingVertical: 2 },
  tripSummary: { fontSize: 12, color: GREY, marginTop: 2 },
  tripBody: { marginTop: 12 },
  noMargin: { marginBottom: 0 },
  menuBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
    marginRight: -6,
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BG,
    borderRadius: 12,
    padding: 10,
    marginBottom: 14,
  },
  vehicleIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: BLUE_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  vehicleName: { fontSize: 15, fontWeight: '800', color: BLACK, marginTop: 1 },
  catChip: {
    backgroundColor: '#fff',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  catChipText: { fontSize: 11.5, fontWeight: '700', color: GREY },

  miniStatsRow: { flexDirection: 'row', marginHorizontal: -3, marginBottom: 14 },
  miniStat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 6,
    marginHorizontal: 3,
  },
  miniStatCol: { marginLeft: 6 },
  miniStatValue: { fontSize: 12.5, fontWeight: '800', color: BLACK },
  miniStatLabel: { fontSize: 10, color: GREY, marginTop: 1 },

  menuBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  menuSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 16,
    paddingBottom: 24,
  },
  menuHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    marginBottom: 12,
  },
  menuTitle: { fontSize: 16, fontWeight: '800', color: BLACK, marginBottom: 6 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  menuItemText: { marginLeft: 12 },
  menuItemTitle: { fontSize: 15, fontWeight: '700', color: RED },
  menuItemSub: { fontSize: 12, color: GREY, marginTop: 2 },
  menuClose: {
    height: 48,
    borderRadius: 12,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  menuCloseText: { fontSize: 15, fontWeight: '700', color: BLACK },

  // completed
  successWrap: { alignItems: 'center', marginVertical: 16 },
  successCard: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingVertical: 24,
    paddingHorizontal: 16,
    marginBottom: 12,
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
  successTime: { fontSize: 12.5, color: GREY, marginTop: 8 },
  stageBadgeCenter: { alignSelf: 'center', marginTop: 12 },
  ratingText: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
    color: BLACK,
    marginBottom: 10,
  },
  skipBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  skipText: { color: GREY, fontSize: 14, fontWeight: '700' },
  bigCircle: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  fareBig: { fontSize: 32, fontWeight: '800', color: BLACK, marginTop: 4 },

  // rating
  starRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 14 },
  star: { marginHorizontal: 4 },
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

  // ---- map + sheet layout ----
  mapWrap: { backgroundColor: '#DCE8F8', overflow: 'hidden' },
  sheet: {
    flex: 1,
    backgroundColor: BG,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  dragZone: { paddingBottom: 4 },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
    marginTop: 10,
    marginBottom: 10,
  },
  sheetScroll: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 28 },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  statusTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: BLACK, marginRight: 10 },
  etaPill: {
    backgroundColor: BLUE_LIGHT,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  etaPillGreen: { backgroundColor: GREEN_LIGHT },
  etaPillBlue: { backgroundColor: BLUE },
  etaPillText: { fontSize: 13.5, fontWeight: '800', color: BLUE },
  etaPillTextGreen: { color: GREEN },
  etaPillTextWhite: { color: '#fff' },

  // captain on the way banner
  onWayBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BLUE,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  onWayDotWrap: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  onWayRing: { position: 'absolute', width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  onWayDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#fff' },
  onWayTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  onWaySub: { fontSize: 12, color: '#DBEAFE', marginTop: 2 },
  onWayEta: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginLeft: 10,
  },
  onWayEtaValue: { fontSize: 20, fontWeight: '800', color: BLUE },
  onWayEtaUnit: { fontSize: 10.5, fontWeight: '700', color: GREY },

  // pickup steps (ARRIVED)
  stepsPanel: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: GREEN,
  },
  stepRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  stepDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: BG,
    borderWidth: 1.5,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stepDotDone: { backgroundColor: GREEN, borderColor: GREEN },
  stepDotCurrent: { backgroundColor: BLUE, borderColor: BLUE },
  stepDotLater: { backgroundColor: BLUE_LIGHT, borderColor: BLUE_LIGHT },
  stepDotText: { fontSize: 12, fontWeight: '800', color: GREY },
  stepTitle: { fontSize: 14.5, fontWeight: '800', color: BLACK },
  stepTitleLocked: { color: '#94A3B8' },
  stepSub: { fontSize: 12, color: GREY, marginTop: 2 },
  stepBody: { marginTop: 6, marginBottom: 10 },
  stepBtn: { marginTop: 10, height: 46 },
  payBox: { backgroundColor: BG, borderRadius: 12, alignItems: 'center', paddingVertical: 12 },
  payBoxLabel: { fontSize: 12, fontWeight: '700', color: GREY },
  payBoxAmount: { fontSize: 28, fontWeight: '800', color: BLACK, marginTop: 2 },
  waitRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  waitText: { flex: 1, marginLeft: 10, fontSize: 12, color: GREY, lineHeight: 17 },
  linkText: { fontSize: 12, fontWeight: '700', color: BLUE, marginTop: 10, textAlign: 'center' },

  // receiver OTP (violet, clearly different from the pickup OTP)
  rcvPanel: {
    backgroundColor: '#F5F3FF',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: VIOLET,
    padding: 14,
    marginBottom: 12,
  },
  rcvBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: VIOLET,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  rcvBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginLeft: 5 },
  rcvTitle: { fontSize: 15, fontWeight: '800', color: BLACK, marginTop: 10 },
  rcvWho: { fontSize: 12.5, color: GREY, marginTop: 2 },
  rcvDigitsRow: { flexDirection: 'row', justifyContent: 'center', marginVertical: 12 },
  rcvDigitBox: {
    width: 48,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: VIOLET,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 5,
  },
  rcvDigit: { fontSize: 28, fontWeight: '800', color: VIOLET },
  rcvNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: VIOLET_LIGHT,
    borderRadius: 10,
    padding: 8,
  },
  rcvNoteText: { flex: 1, marginLeft: 6, fontSize: 11.5, fontWeight: '600', color: '#5B21B6' },

  // OTP (extra compact)
  otpPanel: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: BORDER,
  },
  otpPanelGreen: { borderColor: GREEN, backgroundColor: '#F0FDF4' },
  otpHead: { alignItems: 'center' },
  otpPanelTitle: { fontSize: 12.5, fontWeight: '700', color: BLACK, textAlign: 'center' },
  otpDigitsRow: { flexDirection: 'row', justifyContent: 'center', marginVertical: 6 },
  otpDigitBox: {
    width: 36,
    height: 40,
    borderRadius: 9,
    backgroundColor: BLUE_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
  },
  otpDigit: { fontSize: 20, fontWeight: '800', color: BLUE },
  otpPanelHint: { fontSize: 11, color: GREY, textAlign: 'center' },

  // OTP safety note (photo / video before handing over the product)
  otpNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    paddingVertical: 5,
    paddingHorizontal: 9,
    marginTop: 6,
  },
  otpNoteText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: '#92400E',
    marginLeft: 6,
  },

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
  btnTop: { marginTop: 20, alignSelf: 'stretch' },
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