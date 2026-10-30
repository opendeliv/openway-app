import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Text,
  TouchableOpacity,
  StyleSheet,
  View,
  ScrollView,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { captainsApi, Captain } from '../services/captainsApi';
import { captainDocumentsApi } from '../services/Captaindocumentsapi';

// Same axios instance that the Home screen uses
import api from '../services/CaptainaRideApi';

// Scroll karne par tab bar hide karne ke liye
import { useHideTabBarOnScroll } from '../components/AppTabBar';

const BLUE = '#1F6FE5';
const BLUE_DARK = '#1553B3';
const BLUE_LIGHT = '#EAF2FF';
const BG = '#F4F7FB';
const BLACK = '#0F172A';
const GREY = '#64748B';
const BORDER = '#E2E8F0';
const GREEN = '#16A34A';
const GREEN_LIGHT = '#E8F7EE';
const ORANGE = '#D97706';
const ORANGE_LIGHT = '#FEF3C7';
const RED = '#DC2626';
const RED_LIGHT = '#FEE2E2';

type MenuItem = {
  id: string;
  label: string;
  icon: string;
  color: string;
  tint: string;
};

const MENU: MenuItem[] = [
  { id: 'rides', label: 'My Rides', icon: 'car-sport-outline', color: '#2563EB', tint: '#DBEAFE' },
  { id: 'preferences', label: 'Ride Preferences', icon: 'options-outline', color: '#EA580C', tint: '#FFEDD5' },
  { id: 'payments', label: 'Payments', icon: 'card-outline', color: '#7C3AED', tint: '#EDE9FE' },
  { id: 'documents', label: 'Documents', icon: 'document-text-outline', color: '#16A34A', tint: '#DCFCE7' },
  { id: 'safety', label: 'Safety', icon: 'shield-checkmark-outline', color: '#0891B2', tint: '#CFFAFE' },
  { id: 'help', label: 'Help & Support', icon: 'headset-outline', color: '#DB2777', tint: '#FCE7F3' },
  { id: 'settings', label: 'Settings', icon: 'settings-outline', color: '#475569', tint: '#E2E8F0' },
];

// Menu items that open inside this screen
const EXPANDABLE = ['rides', 'preferences', 'documents', 'settings'];

// Default pickup range limits (used if the backend does not send them)
const DEFAULT_MIN_RANGE = 1;
const DEFAULT_MAX_RANGE = 10;

/* =========================================================
   TYPES + LABELS
   ========================================================= */

type DocStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

type MyDocument = {
  id?: string;
  type: string;
  fileUrl: string;
  status: DocStatus;
  rejectionReason?: string | null;
  documentNumber?: string | null;
  createdAt?: string;
};

type MyDocumentsResponse = {
  vehicleType?: string;
  required: string[];
  optional: string[];
  missing: string[];
  allRequiredUploaded: boolean;
  documents: MyDocument[];
};

// Vehicle fields on the captain (used if the Captain type does not have them)
type CaptainVehicleInfo = {
  vehicleType?: string;
  vehicleSubType?: string | null;
  serviceType?: string;
  vehicleNumber?: string | null;
  vehicleModel?: string | null;
  vehicleColor?: string | null;
  isOnline?: boolean;
  pickupRangeKm?: number | string | null;
};

// Only the pickup range limits are needed from this response
type RideOptions = {
  pickupRangeKm: number;
  minRangeKm: number;
  maxRangeKm: number;
};

const DOC_LABELS: Record<string, { label: string; emoji: string }> = {
  AADHAAR: { label: 'Aadhaar Card', emoji: '🪪' },
  DRIVING_LICENSE: { label: 'Driving License', emoji: '🚘' },
  SELFIE: { label: 'Selfie', emoji: '🤳' },
  PAN: { label: 'PAN Card', emoji: '💳' },
  RC: { label: 'RC', emoji: '📄' },
  INSURANCE: { label: 'Insurance', emoji: '🛡️' },
  PERMIT: { label: 'Permit', emoji: '📑' },
  VEHICLE_PHOTO: { label: 'Vehicle photo', emoji: '📸' },
};

const VEHICLE_LABELS: Record<string, { label: string; emoji: string }> = {
  WALK: { label: 'Walk', emoji: '🚶' },
  CYCLE: { label: 'Cycle', emoji: '🚲' },
  BIKE: { label: 'Bike', emoji: '🏍️' },
  AUTO: { label: 'Auto', emoji: '🛺' },
  CAB: { label: 'Cab', emoji: '🚕' },
  GOODS_VEHICLE: { label: 'Truck', emoji: '🚚' },
};

const SUB_TYPE_LABELS: Record<string, string> = {
  lite: 'Lite Bike',
  bike: 'Super Bike',
  scooty: 'Scooty',
  mini: 'Mini',
  sedan: 'Sedan',
  suv: 'SUV',
  auto: 'Auto',
  e_rickshaw: 'E-Auto',
  shared_auto: 'Shared Auto',
  tata_ace: 'Tata Ace',
  pickup: 'Pickup',
};

// Order type = serviceType
type OrderOption = { id: string; title: string; emoji: string };

const ALL_OPTION: OrderOption = { id: 'ALL', title: 'All', emoji: '🚀' };

const WORK_OPTIONS: Record<'RIDE' | 'PARCEL' | 'GOODS', OrderOption> = {
  RIDE: { id: 'RIDE_ONLY', title: 'Ride', emoji: '🧍' },
  PARCEL: { id: 'PARCEL_ONLY', title: 'Parcel', emoji: '📦' },
  GOODS: { id: 'GOODS_ONLY', title: 'Goods', emoji: '🚚' },
};

// Every order type (used to show the saved one)
const ORDER_OPTIONS: OrderOption[] = [
  WORK_OPTIONS.RIDE,
  WORK_OPTIONS.PARCEL,
  WORK_OPTIONS.GOODS,
  ALL_OPTION,
];

// Work each vehicle can do (keep in sync with VEHICLE_ALLOWED in the backend)
const VEHICLE_WORKS: Record<string, ('RIDE' | 'PARCEL' | 'GOODS')[]> = {
  WALK: ['PARCEL'],
  CYCLE: ['PARCEL'],
  BIKE: ['RIDE', 'PARCEL'],
  AUTO: ['RIDE', 'PARCEL', 'GOODS'],
  CAB: ['RIDE', 'PARCEL'],
  GOODS_VEHICLE: ['GOODS'],
};

// Order types this vehicle can choose from ("All" only if it can do 2+ works)
const orderOptionsFor = (vehicleKey: string | undefined): OrderOption[] => {
  const works = (vehicleKey && VEHICLE_WORKS[vehicleKey]) || [];
  const list = works.map((w) => WORK_OPTIONS[w]);
  return works.length > 1 ? [...list, ALL_OPTION] : list;
};

// If the saved value is not offered for this vehicle, pick the one that fits
const normalizeService = (
  vehicleKey: string | undefined,
  serviceType: string,
): string => {
  const options = orderOptionsFor(vehicleKey);
  if (options.some((o) => o.id === serviceType)) return serviceType;
  return options[0]?.id ?? serviceType;
};

// Only these 2 documents are shown
const SHOWN_DOCS = ['AADHAAR', 'DRIVING_LICENSE'];

const docLabel = (type: string) =>
  DOC_LABELS[type] ?? { label: type, emoji: '📄' };

const orderLabel = (id: string | undefined) => {
  const option = ORDER_OPTIONS.find((o) => o.id === id);
  return option ? `${option.emoji} ${option.title}` : id || 'Not added';
};

// e_rickshaw -> E rickshaw
const prettyType = (v: string) => {
  const s = v.replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const subTypeLabel = (id: string) => SUB_TYPE_LABELS[id] ?? prettyType(id);

// Do not show the full Aadhaar number
const formatDocNumber = (type: string, value: string | null | undefined) => {
  if (!value) return '';
  if (type === 'AADHAAR' && value.length >= 4) {
    return `XXXX XXXX ${value.slice(-4)}`;
  }
  return value;
};

const getDocBadge = (status: DocStatus) => {
  if (status === 'APPROVED') {
    return { label: 'Verified', color: GREEN, bg: GREEN_LIGHT };
  }
  if (status === 'REJECTED') {
    return { label: 'Rejected', color: RED, bg: RED_LIGHT };
  }
  return { label: 'In review', color: ORANGE, bg: ORANGE_LIGHT };
};

const formatDate = (date: string | null | undefined) => {
  if (!date) return '-';

  const d = new Date(date);

  if (Number.isNaN(d.getTime())) {
    return '-';
  }

  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const capitalize = (value: string | null | undefined) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : '';

const getErrorMessage = (e: any, fallback: string) => {
  const msg = e?.response?.data?.message;
  return Array.isArray(msg) ? msg.join('\n') : msg || e?.message || fallback;
};

const getVerificationBadge = (status: string | undefined) => {
  if (status === 'PENDING') {
    return { label: 'Pending', color: ORANGE, bg: ORANGE_LIGHT };
  }

  if (status === 'REJECTED') {
    return { label: 'Rejected', color: RED, bg: RED_LIGHT };
  }

  return { label: 'Verified', color: GREEN, bg: GREEN_LIGHT };
};

// "Amit Sharma" -> "AS"
const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');

// One "icon  label ...... value" line
const InfoLine = ({
  icon,
  label,
  value,
  last,
}: {
  icon: string;
  label: string;
  value: string;
  last?: boolean;
}) => (
  <View style={[styles.infoRow, last && styles.noBorder]}>
    <Ionicons name={icon} size={17} color={GREY} style={styles.infoIcon} />
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue} numberOfLines={1}>
      {value}
    </Text>
  </View>
);

export default function BecomeCaptainScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // Scroll par tab bar hide / show
  const hideTabBar = useHideTabBarOnScroll();

  const [captain, setCaptain] = useState<Captain | null>(null);
  const [docsInfo, setDocsInfo] = useState<MyDocumentsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Ride preferences: pickup range + order type
  const [rangeLimits, setRangeLimits] = useState({
    min: DEFAULT_MIN_RANGE,
    max: DEFAULT_MAX_RANGE,
  });
  const [prefRange, setPrefRange] = useState<number>(DEFAULT_MAX_RANGE);
  const [prefService, setPrefService] = useState<string>('ALL');
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Personal details show only when "Personal Information" is tapped
  const [showInfo, setShowInfo] = useState(false);

  // Which menu option is open (My Rides / Preferences / Documents / Settings)
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  // Show the full-screen loader only the first time
  const hasLoadedOnce = useRef(false);

  const loadCaptain = async () => {
    try {
      if (!hasLoadedOnce.current) {
        setLoading(true);
      }

      // Profile should still show even if documents / ride-options fail
      const [data, docs, options] = await Promise.all([
        captainsApi.getMyCaptain(),
        captainDocumentsApi
          .getMyDocuments()
          .catch(() => null) as Promise<MyDocumentsResponse | null>,
        api
          .get<RideOptions>('/captains/me/ride-options')
          .then((res) => res.data)
          .catch(() => null),
      ]);

      setCaptain(data);
      setDocsInfo(docs);

      const min = options ? Number(options.minRangeKm) : DEFAULT_MIN_RANGE;
      const max = options ? Number(options.maxRangeKm) : DEFAULT_MAX_RANGE;
      setRangeLimits({ min, max });

      const saved = data as unknown as CaptainVehicleInfo;
      const savedRange =
        saved.pickupRangeKm != null
          ? Number(saved.pickupRangeKm)
          : options
            ? Number(options.pickupRangeKm)
            : max;

      setPrefRange(savedRange);
      setPrefService(
        normalizeService(
          saved.vehicleType ?? docs?.vehicleType,
          saved.serviceType ?? 'ALL',
        ),
      );

      hasLoadedOnce.current = true;
    } catch (error: any) {
      Alert.alert(
        'Captain Profile',
        error?.message || 'Could not load your captain profile',
      );
    } finally {
      setLoading(false);
    }
  };

  // Fresh load when coming back to this tab (also after Edit)
  useFocusEffect(
    useCallback(() => {
      loadCaptain();
    }, []),
  );

  const onEditProfile = () => {
    navigation.navigate('EditCaptain');
  };

  const onMenuPress = (id: string) => {
    // My Rides, Preferences, Documents and Settings open inside this screen
    if (EXPANDABLE.includes(id)) {
      setOpenMenu((prev) => (prev === id ? null : id));
      return;
    }

    // Other screens will be connected later
    console.log('Captain menu pressed:', id);
  };

  // Go back to the normal user Profile tab
  const onSwitchToUser = () => {
    navigation.navigate('MainTabs', { screen: 'Profile' });
  };

  // ---------- preferences actions ----------
  const changeRange = (delta: number) => {
    setPrefRange((prev) =>
      Math.min(rangeLimits.max, Math.max(rangeLimits.min, prev + delta)),
    );
  };

  const onSavePreferences = async () => {
    if (savingPrefs) return;

    try {
      setSavingPrefs(true);

      await api.patch('/captains/me/preferences', {
        pickupRangeKm: prefRange,
        serviceType: prefService,
      });
      await loadCaptain();

      Alert.alert('Saved', 'Your ride preferences have been saved');
    } catch (e: any) {
      Alert.alert('Could not save', getErrorMessage(e, 'Please try again'));
    } finally {
      setSavingPrefs(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />

        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={BLUE} />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const badge = getVerificationBadge(captain?.verificationStatus);
  const name = captain?.name || 'Captain';
  const initials = initialsOf(name) || 'C';

  const info = (captain ?? {}) as CaptainVehicleInfo;
  const vehicleKey = info.vehicleType ?? docsInfo?.vehicleType;
  const vehicle = vehicleKey ? VEHICLE_LABELS[vehicleKey] : undefined;
  const onFoot = vehicleKey === 'WALK' || vehicleKey === 'CYCLE';

  const savedRange =
    info.pickupRangeKm != null ? Number(info.pickupRangeKm) : null;

  // Only Aadhaar and Driving License are shown
  const onlyShown = (type: string) => SHOWN_DOCS.includes(type);
  const documents = (docsInfo?.documents ?? []).filter((d) => onlyShown(d.type));
  const missing = (docsInfo?.missing ?? []).filter(onlyShown);
  const requiredCount = (docsInfo?.required ?? []).filter(onlyShown).length;
  const requiredUploaded = requiredCount - missing.length;
  const hasPending = documents.some((d) => d.status === 'PENDING');
  const hasRejected = documents.some((d) => d.status === 'REJECTED');

  // When the profile is verified, hide pending / missing / notes in documents
  const isVerified = badge.label === 'Verified';

  const personalRows = [
    { id: 'email', icon: 'mail-outline', label: 'Email', value: captain?.email || 'Not added' },
    {
      id: 'gender',
      icon: 'person-outline',
      label: 'Gender',
      value: capitalize(captain?.gender) || 'Not added',
    },
    {
      id: 'dob',
      icon: 'calendar-outline',
      label: 'Date of Birth',
      value: captain?.dateOfBirth ? formatDate(captain.dateOfBirth) : 'Not added',
    },
    {
      id: 'joined',
      icon: 'time-outline',
      label: 'Joined',
      value: formatDate(captain?.createdAt),
    },
  ];

  // My Rides: only order type, vehicle type, vehicle category, pickup range
  const renderRidesContent = () => (
    <View style={styles.expandBox}>
      <Text style={styles.subTitle}>Your vehicle and work</Text>

      <InfoLine icon="briefcase-outline" label="Order type" value={orderLabel(info.serviceType)} />

      <InfoLine
        icon="car-outline"
        label="Vehicle type"
        value={
          vehicle ? `${vehicle.emoji} ${vehicle.label}` : vehicleKey || 'Not added'
        }
      />

      {!!info.vehicleSubType && (
        <InfoLine
          icon="pricetag-outline"
          label="Vehicle category"
          value={subTypeLabel(info.vehicleSubType)}
        />
      )}

      <InfoLine
        icon="navigate-outline"
        label="Pickup range"
        value={savedRange != null ? `${savedRange} km` : 'Not added'}
        last
      />
    </View>
  );

  // Ride Preferences: only pickup range and order type can be edited
  const renderPreferencesContent = () => {
    const atMin = prefRange <= rangeLimits.min;
    const atMax = prefRange >= rangeLimits.max;
    const orderOptions = orderOptionsFor(vehicleKey);

    return (
      <View style={styles.expandBox}>
        <Text style={styles.subTitle}>Pickup range</Text>
        <Text style={styles.prefHint}>
          You will get requests within this distance
        </Text>

        <View style={styles.stepperRow}>
          <TouchableOpacity
            style={[styles.stepBtn, atMin && styles.stepBtnDisabled]}
            disabled={atMin}
            activeOpacity={0.8}
            onPress={() => changeRange(-1)}
          >
            <Ionicons name="remove" size={22} color="#fff" />
          </TouchableOpacity>

          <View style={styles.stepCenter}>
            <Text style={styles.stepValue}>{prefRange}</Text>
            <Text style={styles.stepUnit}>km</Text>
          </View>

          <TouchableOpacity
            style={[styles.stepBtn, atMax && styles.stepBtnDisabled]}
            disabled={atMax}
            activeOpacity={0.8}
            onPress={() => changeRange(1)}
          >
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.prefDivider} />

        <Text style={styles.subTitle}>Order type</Text>
        <Text style={styles.prefHint}>Choose the orders you want to get</Text>

        <View style={styles.orderGrid}>
          {orderOptions.map((o) => {
            const selected = prefService === o.id;

            return (
              <TouchableOpacity
                key={o.id}
                style={[styles.orderBtn, selected && styles.orderBtnOn]}
                activeOpacity={0.85}
                onPress={() => setPrefService(o.id)}
              >
                {selected && (
                  <View style={styles.orderCheck}>
                    <Ionicons name="checkmark-circle" size={16} color={BLUE} />
                  </View>
                )}
                <Text style={styles.orderEmoji}>{o.emoji}</Text>
                <Text style={[styles.orderText, selected && styles.orderTextOn]}>
                  {o.title}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, savingPrefs && styles.btnDisabled]}
          disabled={savingPrefs}
          activeOpacity={0.9}
          onPress={onSavePreferences}
        >
          {savingPrefs ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
              <Text style={styles.saveBtnText}>Save Preferences</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  // Documents: vehicle number, model, color + uploaded documents
  const renderDocumentsContent = () => (
    <View style={styles.expandBox}>
      {!!vehicleKey && !onFoot && (
        <>
          <Text style={styles.subTitle}>Vehicle details</Text>

          <InfoLine
            icon="receipt-outline"
            label="Vehicle number"
            value={info.vehicleNumber || 'Not added'}
          />
          <InfoLine
            icon="car-sport-outline"
            label="Model"
            value={info.vehicleModel || 'Not added'}
          />
          <InfoLine
            icon="color-palette-outline"
            label="Color"
            value={info.vehicleColor || 'Not added'}
            last
          />
        </>
      )}

      <View style={[styles.sectionHead, !!vehicleKey && !onFoot && styles.sectionGap]}>
        <Text style={styles.subTitle}>Documents</Text>
        {!!docsInfo && !isVerified && (
          <View style={styles.countPill}>
            <Text style={styles.countPillText}>
              {requiredUploaded}/{requiredCount} uploaded
            </Text>
          </View>
        )}
      </View>

      {!docsInfo ? (
        <Text style={styles.emptyText}>Could not load documents</Text>
      ) : (
        <>
          {isVerified ? null : missing.length > 0 ? (
            <View style={[styles.noteBox, { backgroundColor: ORANGE_LIGHT }]}>
              <Ionicons name="alert-circle" size={18} color={ORANGE} style={styles.noteIcon} />
              <Text style={[styles.noteText, { color: ORANGE }]}>
                Some required documents are missing. You will not be verified
                until all of them are uploaded.
              </Text>
            </View>
          ) : hasRejected ? (
            <View style={[styles.noteBox, { backgroundColor: RED_LIGHT }]}>
              <Ionicons name="close-circle" size={18} color={RED} style={styles.noteIcon} />
              <Text style={[styles.noteText, { color: RED }]}>
                Some documents were rejected. Please upload them again.
              </Text>
            </View>
          ) : hasPending ? (
            <View style={[styles.noteBox, { backgroundColor: BLUE_LIGHT }]}>
              <Ionicons name="time" size={18} color={BLUE} style={styles.noteIcon} />
              <Text style={[styles.noteText, { color: BLUE }]}>
                Your documents are being verified.
              </Text>
            </View>
          ) : null}

          {documents.map((d, i) => {
            const meta = docLabel(d.type);
            const docBadge = getDocBadge(isVerified ? 'APPROVED' : d.status);
            const number = formatDocNumber(d.type, d.documentNumber);
            const isLast = i === documents.length - 1 && missing.length === 0;

            return (
              <View
                key={d.id ?? d.type}
                style={[styles.docRow, isLast && styles.noBorder]}
              >
                <Image
                  source={{ uri: d.fileUrl }}
                  style={styles.docThumb}
                  resizeMode="cover"
                />

                <View style={styles.flex}>
                  <Text style={styles.docTitle}>
                    {meta.emoji} {meta.label}
                  </Text>

                  {!!number && <Text style={styles.docNumber}>{number}</Text>}

                  {!isVerified && d.status === 'REJECTED' && !!d.rejectionReason && (
                    <Text style={styles.docReason}>Reason: {d.rejectionReason}</Text>
                  )}
                </View>

                <View style={[styles.badge, { backgroundColor: docBadge.bg }]}>
                  <Text style={[styles.badgeText, { color: docBadge.color }]}>
                    {docBadge.label}
                  </Text>
                </View>
              </View>
            );
          })}

          {missing.map((type, i) => {
            const meta = docLabel(type);

            return (
              <View
                key={type}
                style={[styles.docRow, i === missing.length - 1 && styles.noBorder]}
              >
                <View style={[styles.docThumb, styles.docThumbEmpty]}>
                  <Text style={styles.docThumbEmoji}>{meta.emoji}</Text>
                </View>

                <View style={styles.flex}>
                  <Text style={styles.docTitle}>{meta.label}</Text>
                  {!isVerified && (
                    <Text style={styles.docNumber}>Not uploaded yet</Text>
                  )}
                </View>

                <View
                  style={[
                    styles.badge,
                    { backgroundColor: isVerified ? GREEN_LIGHT : RED_LIGHT },
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      { color: isVerified ? GREEN : RED },
                    ]}
                  >
                    {isVerified ? 'Verified' : 'Missing'}
                  </Text>
                </View>
              </View>
            );
          })}

          {documents.length === 0 && missing.length === 0 && (
            <Text style={styles.emptyText}>No documents found</Text>
          )}
        </>
      )}
    </View>
  );

  // Settings: abhi sirf user profile par switch
  const renderSettingsContent = () => (
    <View style={styles.expandBox}>
      <TouchableOpacity
        style={styles.settingRow}
        activeOpacity={0.7}
        onPress={onSwitchToUser}
      >
        <View style={styles.settingIcon}>
          <Ionicons name="swap-horizontal" size={18} color={BLUE} />
        </View>
        <Text style={styles.settingLabel}>Switch to User Profile</Text>
        <Ionicons name="chevron-forward" size={18} color="#B5BCC8" />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={BLUE} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        onScroll={hideTabBar}
        scrollEventThrottle={16}
      >
        {/* Blue hero: avatar + name + status */}
        <View style={styles.hero}>
          <View style={styles.heroCircleBig} />
          <View style={styles.heroCircleSmall} />

          <Text style={styles.screenTitle}>Captain Profile</Text>

          <View style={styles.userRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>

            <View style={styles.flex}>
              <Text style={styles.name} numberOfLines={1}>
                {name}
              </Text>

              <View style={styles.phoneRow}>
                <Ionicons name="call-outline" size={13} color="#DCE8FF" />
                <Text style={styles.phone}>{captain?.phone || '-'}</Text>
              </View>

              <View style={styles.badgeRow}>
                <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                  <Text style={[styles.badgeText, { color: badge.color }]}>
                    {badge.label}
                  </Text>
                </View>

                <View
                  style={[
                    styles.badge,
                    styles.badgeGap,
                    { backgroundColor: info.isOnline ? GREEN_LIGHT : '#fff' },
                  ]}
                >
                  <View
                    style={[
                      styles.onlineDot,
                      { backgroundColor: info.isOnline ? GREEN : '#94A3B8' },
                    ]}
                  />
                  <Text
                    style={[
                      styles.badgeText,
                      { color: info.isOnline ? GREEN : GREY },
                    ]}
                  >
                    {info.isOnline ? 'Online' : 'Offline'}
                  </Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={styles.editBtn}
              activeOpacity={0.8}
              onPress={onEditProfile}
            >
              <Ionicons name="create-outline" size={15} color={BLUE} />
              <Text style={styles.editText}>Edit</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Rating / Rides / Earnings (hero ke upar overlap) */}
        <View style={styles.statsCard}>
          <View style={styles.stat}>
            <View style={[styles.statIcon, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="star" size={18} color="#F59E0B" />
            </View>
            <Text style={styles.statValue}>5.0</Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>

          <View style={[styles.stat, styles.statDivider]}>
            <View style={[styles.statIcon, { backgroundColor: BLUE_LIGHT }]}>
              <Ionicons name="car-outline" size={18} color={BLUE} />
            </View>
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statLabel}>Rides</Text>
          </View>

          <View style={styles.stat}>
            <View style={[styles.statIcon, { backgroundColor: GREEN_LIGHT }]}>
              <Ionicons name="wallet-outline" size={18} color={GREEN} />
            </View>
            <Text style={styles.statValue}>₹0</Text>
            <Text style={styles.statLabel}>My Earnings</Text>
          </View>
        </View>

        <View style={styles.body}>
          {/* Personal Information (tap karne par khulta hai) */}
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.menuRow}
              activeOpacity={0.7}
              onPress={() => setShowInfo((prev) => !prev)}
            >
              <View style={[styles.menuIcon, { backgroundColor: BLUE_LIGHT }]}>
                <Ionicons name="id-card-outline" size={19} color={BLUE} />
              </View>
              <Text style={styles.menuLabel}>Personal Information</Text>
              <Ionicons
                name={showInfo ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={GREY}
              />
            </TouchableOpacity>

            {showInfo && (
              <View style={styles.personalBody}>
                {personalRows.map((r, i) => (
                  <InfoLine
                    key={r.id}
                    icon={r.icon}
                    label={r.label}
                    value={r.value}
                    last={i === personalRows.length - 1}
                  />
                ))}
              </View>
            )}
          </View>

          {/* Menu */}
          <View style={styles.card}>
            {MENU.map((m, i) => {
              // When one option is open, hide the others
              if (openMenu && openMenu !== m.id) return null;

              const isOpen = openMenu === m.id;
              const isLast = i === MENU.length - 1;
              const expandable = EXPANDABLE.includes(m.id);

              return (
                <View key={m.id}>
                  <TouchableOpacity
                    style={[
                      styles.menuRow,
                      (isLast || isOpen) && styles.noBorder,
                    ]}
                    activeOpacity={0.7}
                    onPress={() => onMenuPress(m.id)}
                  >
                    <View style={[styles.menuIcon, { backgroundColor: m.tint }]}>
                      <Ionicons name={m.icon} size={19} color={m.color} />
                    </View>

                    <Text style={styles.menuLabel}>{m.label}</Text>

                    <Ionicons
                      name={expandable && isOpen ? 'chevron-down' : 'chevron-forward'}
                      size={20}
                      color={expandable && isOpen ? BLUE : '#B5BCC8'}
                    />
                  </TouchableOpacity>

                  {isOpen && m.id === 'rides' && renderRidesContent()}
                  {isOpen && m.id === 'preferences' && renderPreferencesContent()}
                  {isOpen && m.id === 'documents' && renderDocumentsContent()}
                  {isOpen && m.id === 'settings' && renderSettingsContent()}

                  {isOpen && !isLast && <View style={styles.menuSeparator} />}
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  // blue top (status bar area), grey body
  container: { flex: 1, backgroundColor: BLUE },
  loadingContainer: { flex: 1, backgroundColor: BG },
  scrollView: { backgroundColor: BG },
  // neeche floating tab bar ke liye extra jagah
  scroll: { paddingBottom: 110 },
  body: { paddingHorizontal: 16 },
  noBorder: { borderBottomWidth: 0 },
  btnDisabled: { opacity: 0.6 },

  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: { marginTop: 10, color: GREY, fontSize: 14 },

  // hero
  hero: {
    backgroundColor: BLUE,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 48,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    overflow: 'hidden',
  },
  heroCircleBig: {
    position: 'absolute',
    right: -50,
    top: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: BLUE_DARK,
    opacity: 0.5,
  },
  heroCircleSmall: {
    position: 'absolute',
    left: -30,
    bottom: -40,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#fff',
    opacity: 0.08,
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 16,
  },
  userRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: '#fff',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: { fontSize: 24, fontWeight: '800', color: BLUE },
  name: { fontSize: 19, fontWeight: '800', color: '#fff' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  phone: { fontSize: 13, color: '#DCE8FF', marginLeft: 5, fontWeight: '600' },
  badgeRow: { flexDirection: 'row', alignItems: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 6,
  },
  badgeGap: { marginLeft: 6 },
  badgeText: { fontSize: 11, fontWeight: '800' },
  onlineDot: { width: 6, height: 6, borderRadius: 3, marginRight: 4 },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginLeft: 8,
  },
  editText: { color: BLUE, fontWeight: '800', fontSize: 12, marginLeft: 4 },

  // stats
  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginTop: -30,
    marginBottom: 14,
    elevation: 5,
    shadowColor: BLACK,
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  stat: { flex: 1, alignItems: 'center' },
  statDivider: {
    borderLeftWidth: 1,
    borderLeftColor: BORDER,
    borderRightWidth: 1,
    borderRightColor: BORDER,
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  statValue: { fontSize: 18, fontWeight: '800', color: BLACK },
  statLabel: { fontSize: 12, color: GREY, marginTop: 2 },

  // cards
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 14,
    marginBottom: 14,
    elevation: 2,
    shadowColor: BLACK,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  personalBody: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingBottom: 4,
  },

  // info lines
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 46,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  infoIcon: { marginRight: 10 },
  infoLabel: { fontSize: 13, color: GREY },
  infoValue: {
    flex: 1,
    textAlign: 'right',
    marginLeft: 16,
    fontSize: 13,
    fontWeight: '700',
    color: BLACK,
  },

  // menu
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  menuIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '700', color: BLACK },
  menuSeparator: { height: 1, backgroundColor: BORDER },

  // content inside an open menu item
  expandBox: { paddingBottom: 14 },
  subTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: BLACK,
    paddingTop: 6,
    paddingBottom: 4,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionGap: { marginTop: 14 },
  countPill: {
    backgroundColor: BLUE_LIGHT,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 4,
  },
  countPillText: { fontSize: 11, fontWeight: '800', color: BLUE },

  // documents
  noteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 12,
    padding: 10,
    marginTop: 4,
    marginBottom: 6,
  },
  noteIcon: { marginRight: 8, marginTop: 1 },
  noteText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  docThumb: {
    width: 56,
    height: 44,
    borderRadius: 10,
    backgroundColor: BORDER,
    marginRight: 12,
  },
  docThumbEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BG,
  },
  docThumbEmoji: { fontSize: 20 },
  docTitle: { fontSize: 14, fontWeight: '700', color: BLACK },
  docNumber: { fontSize: 12, color: GREY, marginTop: 2 },
  docReason: { fontSize: 12, color: RED, marginTop: 2 },
  emptyText: { fontSize: 13, color: GREY, paddingVertical: 14 },

  // ride preferences
  prefHint: { fontSize: 12, color: GREY, lineHeight: 16, marginBottom: 6 },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: BG,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 2,
  },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnDisabled: { backgroundColor: '#B5BCC8' },
  stepCenter: { flexDirection: 'row', alignItems: 'flex-end' },
  stepValue: { fontSize: 30, fontWeight: '800', color: BLACK },
  stepUnit: { fontSize: 14, fontWeight: '700', color: GREY, marginLeft: 4, marginBottom: 5 },

  prefDivider: { height: 1, backgroundColor: BORDER, marginVertical: 12 },
  orderGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  orderBtn: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: BG,
  },
  orderBtnOn: { borderColor: BLUE, backgroundColor: BLUE_LIGHT },
  orderCheck: { position: 'absolute', top: 5, right: 6 },
  orderEmoji: { fontSize: 18, marginRight: 6 },
  orderText: { fontSize: 14, fontWeight: '700', color: GREY },
  orderTextOn: { color: BLUE, fontWeight: '800' },

  saveBtn: {
    flexDirection: 'row',
    height: 48,
    borderRadius: 14,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '800', marginLeft: 8 },

  // settings dropdown
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BG,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  settingIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: BLUE_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  settingLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: BLACK },
});