import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  PermissionsAndroid,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  launchCamera,
  launchImageLibrary,
  ImagePickerResponse,
} from 'react-native-image-picker';
import { RootStackParamList } from '../types/navigation';
import { profileApi } from '../services/api';
import {
  captainsApi,
  CreateCaptainPayload,
  ServiceType,
  VehicleType,
} from '../services/captainsApi';
import { captainDocumentsApi } from '../services/Captaindocumentsapi';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Live photo is taken in step 1. Step 3 documents: Aadhaar, PAN, Driving License, Vehicle RC
type CaptainDocType = 'LIVE_PHOTO' | 'AADHAAR' | 'PAN' | 'DRIVING_LICENSE' | 'VEHICLE_RC';

const BLUE = '#1F6FE5';
const BLUE_LIGHT = '#EAF2FF';
const BG = '#F4F7FB';
const BLACK = '#0F172A';
const GREY = '#64748B';
const BORDER = '#E2E8F0';
const RED = '#DC2626';
const GREEN = '#16A34A';
const DISABLED = '#A9C4F2';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Draft is saved per phone number so filled details survive an app close
const DRAFT_KEY = 'captain_register_draft_v1';

/* =========================================================
   OPTIONS
   ========================================================= */

const STEPS = [
  { n: 1, label: 'Personal details' },
  { n: 2, label: 'Vehicle' },
  { n: 3, label: 'Documents' },
];

const VEHICLE_OPTIONS: {
  id: VehicleType;
  label: string;
  emoji: string;
}[] = [
  { id: 'WALK', label: 'Walk', emoji: '🚶' },
  { id: 'CYCLE', label: 'Cycle', emoji: '🚲' },
  { id: 'BIKE', label: 'Bike', emoji: '🏍️' },
  { id: 'AUTO', label: 'Auto', emoji: '🛺' },
  { id: 'CAB', label: 'Cab', emoji: '🚕' },
  { id: 'GOODS_VEHICLE', label: 'Truck', emoji: '🚚' },
];

// Types shown after a vehicle is selected (ids match backend vehicle type ids)
const SUB_TYPES: Partial<Record<VehicleType, { id: string; label: string }[]>> = {
  BIKE: [
    { id: 'lite', label: 'Lite Bike' },
    { id: 'bike', label: 'Super Bike' },
    { id: 'scooty', label: 'Scooty' },
  ],
  CAB: [
    { id: 'mini_van', label: 'Mini Van' },
    { id: 'suv', label: 'SUV' },
    { id: 'utility_van', label: 'Utility Van' },
  ],
  AUTO: [
    { id: 'auto', label: 'Auto' },
    { id: 'e_rickshaw', label: 'E-Auto' },
  ],
  GOODS_VEHICLE: [
    { id: 'tata_ace', label: 'Tata Ace' },
    { id: 'eicher', label: 'Eicher' },
    { id: 'pickup', label: 'Pickup' },
    { id: 'mahindra_furio', label: 'Mahindra Furio' },
  ],
};

/* =========================================================
   DOCUMENT CONFIG
   (keep in sync with backend DOCUMENTS_BY_VEHICLE)
   ========================================================= */

type DocMeta = {
  label: string;
  emoji: string;
  hint?: string;
  cameraOnly?: boolean; // gallery not allowed, only live photo
  numberLabel?: string;
  numberPlaceholder?: string;
  numberError?: string;
  numberMaxLength?: number;
  numericOnly?: boolean;
  validate?: (value: string) => boolean;
};

const DOC_META: Record<CaptainDocType, DocMeta> = {
  LIVE_PHOTO: {
    label: 'Live Photo',
    emoji: '🤳',
    hint: 'Take a clear selfie of your face',
    cameraOnly: true,
  },
  AADHAAR: {
    label: 'Aadhaar Card',
    emoji: '🪪',
    numberLabel: 'Aadhaar number',
    numberPlaceholder: '12 digit Aadhaar number',
    numberError: 'Enter a valid 12 digit Aadhaar number',
    numberMaxLength: 12,
    numericOnly: true,
    validate: (v) => /^\d{12}$/.test(v),
  },
  PAN: {
    label: 'PAN Card',
    emoji: '💳',
    numberLabel: 'PAN number',
    numberPlaceholder: 'e.g. ABCDE1234F',
    numberError: 'Enter a valid 10 character PAN number',
    numberMaxLength: 10,
    validate: (v) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v),
  },
  DRIVING_LICENSE: {
    label: 'Driving License',
    emoji: '🚘',
    numberLabel: 'License number',
    numberPlaceholder: 'e.g. MP0420210012345',
    numberError: 'Enter a valid license number',
    numberMaxLength: 20,
    validate: (v) => /^[A-Z0-9]{8,20}$/.test(v),
  },
  VEHICLE_RC: {
    label: 'Vehicle Document (RC)',
    emoji: '📄',
    hint: 'RC photo: vehicle number and owner name should be clear',
  },
};

const FOOT_DOCS: CaptainDocType[] = ['AADHAAR', 'PAN'];
const MOTOR_DOCS: CaptainDocType[] = [
  'AADHAAR',
  'PAN',
  'DRIVING_LICENSE',
  'VEHICLE_RC',
];

const DOCUMENTS_BY_VEHICLE: Record<
  VehicleType,
  { required: CaptainDocType[]; optional: CaptainDocType[] }
> = {
  WALK: { required: FOOT_DOCS, optional: [] },
  CYCLE: { required: FOOT_DOCS, optional: [] },
  BIKE: { required: MOTOR_DOCS, optional: [] },
  AUTO: { required: MOTOR_DOCS, optional: [] },
  CAB: { required: MOTOR_DOCS, optional: [] },
  GOODS_VEHICLE: { required: MOTOR_DOCS, optional: [] },
};

type DocItem = {
  uri: string;
  mime?: string;
  name?: string;
  number: string;
  uploaded?: boolean; // approved by admin, locked
  remote?: boolean; // already on the server, no need to upload again
};

type DocsState = Partial<Record<CaptainDocType, DocItem>>;

const isOnFoot = (v: VehicleType | null) => v === 'WALK' || v === 'CYCLE';

// The whole app is parcel/goods now, so the work type is not asked from the user
const serviceTypeFor = (v: VehicleType): ServiceType =>
  isOnFoot(v) ? 'PARCEL_ONLY' : 'ALL';

// Names the backend (DocumentType enum) understands
const API_DOC_TYPE = {
  LIVE_PHOTO: 'SELFIE',
  AADHAAR: 'AADHAAR',
  PAN: 'PAN',
  DRIVING_LICENSE: 'DRIVING_LICENSE',
  VEHICLE_RC: 'RC',
} as const;

// Backend DocumentType -> app type (used when editing a rejected request)
const APP_DOC_TYPE: Record<string, CaptainDocType> = {
  SELFIE: 'LIVE_PHOTO',
  AADHAAR: 'AADHAAR',
  PAN: 'PAN',
  DRIVING_LICENSE: 'DRIVING_LICENSE',
  RC: 'VEHICLE_RC',
};

const normalizeNumber = (type: CaptainDocType, value: string) =>
  type === 'AADHAAR'
    ? value.replace(/\D/g, '')
    : value.replace(/\s/g, '').toUpperCase();

/* =========================================================
   SMALL ICONS (plain Views, no icon library needed)
   ========================================================= */

const CameraIcon = ({
  color,
  bg,
  size = 16,
}: {
  color: string;
  bg: string;
  size?: number;
}) => (
  <View style={{ width: size, height: size, justifyContent: 'flex-end' }}>
    <View
      style={{
        position: 'absolute',
        top: size * 0.08,
        left: size * 0.3,
        width: size * 0.4,
        height: size * 0.22,
        backgroundColor: color,
        borderTopLeftRadius: 2,
        borderTopRightRadius: 2,
      }}
    />
    <View
      style={{
        height: size * 0.72,
        borderRadius: size * 0.18,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: size * 0.4,
          height: size * 0.4,
          borderRadius: size * 0.2,
          borderWidth: 1.5,
          borderColor: bg,
        }}
      />
    </View>
  </View>
);

const GalleryIcon = ({ color, size = 16 }: { color: string; size?: number }) => (
  <View
    style={{
      width: size,
      height: size,
      borderWidth: 1.5,
      borderColor: color,
      borderRadius: 4,
      overflow: 'hidden',
    }}
  >
    <View
      style={{
        position: 'absolute',
        top: 2,
        right: 2,
        width: size * 0.24,
        height: size * 0.24,
        borderRadius: size * 0.12,
        backgroundColor: color,
      }}
    />
    <View
      style={{
        position: 'absolute',
        bottom: 0,
        left: 1,
        width: 0,
        height: 0,
        borderLeftWidth: size * 0.3,
        borderRightWidth: size * 0.3,
        borderBottomWidth: size * 0.42,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderBottomColor: color,
      }}
    />
  </View>
);

/* =========================================================
   SCREEN
   ========================================================= */

export default function CaptainRegisterScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // resubmit = captain request was rejected, user edits and sends it again
  const route = useRoute<RouteProp<RootStackParamList, 'CaptainRegister'>>();
  const resubmit = !!route.params?.resubmit;

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [submitted1, setSubmitted1] = useState(false);

  // Step 2
  const [vehicleType, setVehicleType] = useState<VehicleType | null>(null);
  const [vehicleSubType, setVehicleSubType] = useState<string | null>(null);
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [submitted2, setSubmitted2] = useState(false);

  // Step 3
  const [docs, setDocs] = useState<DocsState>({});
  const [submitted3, setSubmitted3] = useState(false);

  // Captain created but documents pending: do not create again
  const [captainCreated, setCaptainCreated] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState('');

  // Rejected request: reason from admin
  const [rejectReason, setRejectReason] = useState('');
  const [rejectedDocs, setRejectedDocs] = useState<
    Partial<Record<CaptainDocType, string>>
  >({});

  // Draft saving
  const [draftKey, setDraftKey] = useState<string | null>(null);
  const finished = useRef(false);

  const onFoot = isOnFoot(vehicleType);
  const subTypes = vehicleType ? SUB_TYPES[vehicleType] ?? [] : [];

  const docList: { type: CaptainDocType; required: boolean }[] = vehicleType
    ? [
        ...DOCUMENTS_BY_VEHICLE[vehicleType].required.map((type) => ({
          type,
          required: true,
        })),
        ...DOCUMENTS_BY_VEHICLE[vehicleType].optional.map((type) => ({
          type,
          required: false,
        })),
      ]
    : [];

  // Rejected request: fill the form with what the captain sent earlier
  const loadExisting = async () => {
    try {
      const c: any = await captainsApi.getMyCaptain();
      if (c) {
        if (c.name) setName(c.name);
        if (c.email) setEmail(c.email);
        if (c.vehicleType && DOCUMENTS_BY_VEHICLE[c.vehicleType as VehicleType]) {
          setVehicleType(c.vehicleType);
          setVehicleSubType(c.vehicleSubType ?? null);
          setVehicleNumber(c.vehicleNumber ?? '');
          setVehicleModel(c.vehicleModel ?? '');
          setVehicleColor(c.vehicleColor ?? '');
        }
        setRejectReason(c.rejectionReason ?? c.rejectedReason ?? '');
      }

      const res: any = await captainDocumentsApi.getMyDocuments();
      const next: DocsState = {};
      const rejected: Partial<Record<CaptainDocType, string>> = {};

      (res?.documents ?? []).forEach((d: any) => {
        const type = APP_DOC_TYPE[d.type];
        if (!type) return;

        if (d.status === 'REJECTED') {
          // rejected document has to be uploaded again
          rejected[type] = d.rejectionReason ?? '';
          return;
        }

        next[type] = {
          uri: d.fileUrl,
          number: d.documentNumber ?? '',
          uploaded: d.status === 'APPROVED',
          remote: true,
        };
      });

      setDocs(next);
      setRejectedDocs(rejected);
      setAgreed(true);
    } catch {
      // form stays empty, user can fill it again
    }
  };

  // Prefill from profile, then restore the saved draft (if the app was closed midway)
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const profile = await profileApi.getProfile();
        const digits = (profile.phone ?? '').replace(/\D/g, '').slice(-10);
        const key = `${DRAFT_KEY}_${digits}`;

        setName(profile.name ?? '');
        setEmail(profile.email ?? '');
        setPhone(digits);

        if (resubmit) {
          await loadExisting();
          return; // no draft for a resubmit
        }

        try {
          const raw = await AsyncStorage.getItem(key);
          if (raw) {
            const d = JSON.parse(raw);
            if (d.name) setName(d.name);
            if (d.email) setEmail(d.email);
            if (d.agreed) setAgreed(true);
            setDocs(d.docs ?? {});

            const hasVehicle =
              !!d.vehicleType && !!DOCUMENTS_BY_VEHICLE[d.vehicleType as VehicleType];

            if (hasVehicle) {
              setVehicleType(d.vehicleType);
              setVehicleSubType(d.vehicleSubType ?? null);
              setVehicleNumber(d.vehicleNumber ?? '');
              setVehicleModel(d.vehicleModel ?? '');
              setVehicleColor(d.vehicleColor ?? '');
              setCaptainCreated(!!d.captainCreated);
            }
            setStep(d.step === 3 && hasVehicle ? 3 : d.step >= 2 ? 2 : 1);
          }
        } catch {
          // a broken draft is ignored
        }

        setDraftKey(key);
      } catch (error: any) {
        Alert.alert('Error', error?.message || 'Could not load your profile');
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [navigation, resubmit]);

  // Save the draft on every change
  useEffect(() => {
    if (!draftKey || finished.current) return;
    AsyncStorage.setItem(
      draftKey,
      JSON.stringify({
        step,
        name,
        email,
        agreed,
        vehicleType,
        vehicleSubType,
        vehicleNumber,
        vehicleModel,
        vehicleColor,
        docs,
        captainCreated,
      }),
    ).catch(() => {});
  }, [
    draftKey,
    step,
    name,
    email,
    agreed,
    vehicleType,
    vehicleSubType,
    vehicleNumber,
    vehicleModel,
    vehicleColor,
    docs,
    captainCreated,
  ]);

  /* ---------- Back handling ---------- */

  const goBackStep = () => {
    setStep((s) => (s === 3 ? 2 : 1));
  };

  const onBack = () => {
    if (saving) return;
    if (step > 1) {
      goBackStep();
      return;
    }
    navigation.goBack();
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step > 1 && !saving) {
        goBackStep();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [step, saving]);

  /* ---------- Step 1 ---------- */

  const errors1 = {
    name: name.trim().length < 3 ? 'Enter your full name (at least 3 letters)' : '',
    email: !EMAIL_REGEX.test(email.trim()) ? 'Enter a valid email' : '',
    // TODO: live photo is optional for testing. For production use:
    // photo: !docs.LIVE_PHOTO?.uri ? 'Take your live photo to continue' : '',
    photo: '',
  };
  const isValid1 = Object.values(errors1).every((e) => !e);

  const onPrivacyPress = () => {
    navigation.navigate('PrivacyPolicy');
  };

  const onNext1 = () => {
    setSubmitted1(true);
    if (!isValid1 || !agreed) return;
    setStep(2);
  };

  /* ---------- Step 2: vehicle ---------- */

  const onSelectVehicle = (id: VehicleType) => {
    if (captainCreated) return;
    if (id === vehicleType) return;

    setVehicleType(id);
    setVehicleSubType(null);

    if (isOnFoot(id)) {
      setVehicleNumber('');
      setVehicleModel('');
      setVehicleColor('');
    }

    // Remove documents that the new vehicle does not need
    const allowed: CaptainDocType[] = [
      'LIVE_PHOTO',
      ...DOCUMENTS_BY_VEHICLE[id].required,
      ...DOCUMENTS_BY_VEHICLE[id].optional,
    ];
    setDocs((prev) => {
      const next: DocsState = {};
      allowed.forEach((t) => {
        if (prev[t]) next[t] = prev[t];
      });
      return next;
    });
  };

  const onSelectSubType = (id: string) => {
    if (captainCreated) return;
    setVehicleSubType(id);
  };

  const errors2 = {
    vehicleType: !vehicleType ? 'Select a vehicle' : '',
    vehicleSubType:
      vehicleType && subTypes.length > 0 && !vehicleSubType
        ? 'Select a vehicle category'
        : '',
    vehicleNumber:
      vehicleType && !onFoot && vehicleNumber.trim().length < 6
        ? 'Enter a valid vehicle number'
        : '',
  };
  const isValid2 = Object.values(errors2).every((e) => !e);

  const onNext2 = () => {
    setSubmitted2(true);
    if (!isValid2) return;
    setStep(3);
  };

  /* ---------- Step 3: documents ---------- */

  const pickImage = async (
    type: CaptainDocType,
    source: 'camera' | 'gallery',
  ) => {
    const base = {
      mediaType: 'photo' as const,
      quality: 0.7 as const,
      maxWidth: 1280,
      maxHeight: 1280,
      selectionLimit: 1,
    };

    try {
      // Ask the camera permission at runtime (manifest alone is not enough on Android 6+)
      if (source === 'camera' && Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Camera permission',
            message: 'Camera is needed to take photos for your registration',
            buttonPositive: 'Allow',
            buttonNegative: 'Cancel',
          },
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert(
            'Camera permission needed',
            'Open phone Settings > Apps > this app > Permissions and allow Camera.',
          );
          return;
        }
      }

      const res: ImagePickerResponse =
        source === 'camera'
          ? await launchCamera({
              ...base,
              cameraType: type === 'LIVE_PHOTO' ? 'front' : 'back',
              saveToPhotos: false,
            })
          : await launchImageLibrary(base);

      if (res.didCancel) return;

      if (res.errorCode) {
        Alert.alert(
          'Error',
          res.errorMessage || `Could not get the photo (${res.errorCode})`,
        );
        return;
      }

      const asset = res.assets?.[0];
      if (!asset?.uri) return;

      setDocs((prev) => ({
        ...prev,
        [type]: {
          number: prev[type]?.number ?? '',
          uri: asset.uri as string,
          mime: asset.type,
          name: asset.fileName,
          uploaded: false,
        },
      }));
    } catch (e: any) {
      Alert.alert(
        'Could not open photo',
        (e?.message || 'Unknown error') +
          '\n\nInstall react-native-image-picker and rebuild the app (npx react-native run-android).',
      );
    }
  };

  const setDocNumber = (type: CaptainDocType, value: string) => {
    setDocs((prev) => ({
      ...prev,
      [type]: {
        uri: prev[type]?.uri ?? '',
        ...prev[type],
        number: value,
      },
    }));
  };

  const removeDoc = (type: CaptainDocType) => {
    setDocs((prev) => {
      const next = { ...prev };
      delete next[type];
      return next;
    });
  };

  const numberFor = (type: CaptainDocType): string | undefined => {
    // RC is sent with the vehicle number entered in step 2
    if (type === 'VEHICLE_RC') return vehicleNumber.trim().toUpperCase();
    if (!DOC_META[type].numberLabel) return undefined;
    return normalizeNumber(type, docs[type]?.number ?? '');
  };

  const docError = (type: CaptainDocType, required: boolean): string => {
    const meta = DOC_META[type];
    const item = docs[type];

    if (!item?.uri) return required ? 'Upload a photo' : '';

    if (meta.numberLabel && meta.validate) {
      const value = normalizeNumber(type, item.number ?? '');
      if (!meta.validate(value)) return meta.numberError ?? 'Enter a valid number';
    }
    return '';
  };

  const docsValid = docList.every((d) => !docError(d.type, d.required));
  const isValid3 = docsValid;

  /* ---------- Submit ---------- */

  const onSubmit = async () => {
    if (saving) return;

    setSubmitted3(true);
    if (!isValid3 || !vehicleType) return;

    const serviceType = serviceTypeFor(vehicleType);

    let created = captainCreated;

    try {
      setSaving(true);

      if (!created) {
        // Phone is not sent, the backend takes it from the user account
        const payload: CreateCaptainPayload = {
          name: name.trim(),
          email: email.trim(),
          serviceType,
          vehicleType,
          ...(vehicleSubType ? { vehicleSubType } : {}),
          ...(onFoot
            ? {}
            : {
                vehicleNumber: vehicleNumber.trim().toUpperCase(),
                ...(vehicleModel.trim()
                  ? { vehicleModel: vehicleModel.trim() }
                  : {}),
                ...(vehicleColor.trim()
                  ? { vehicleColor: vehicleColor.trim() }
                  : {}),
              }),
        };

        if (resubmit) {
          await captainsApi.resubmitCaptain(payload);
        } else {
          await captainsApi.createCaptain(payload);
        }
        created = true;
        setCaptainCreated(true);
      }

      // Upload only the documents that are not uploaded yet
      const pending = [{ type: 'LIVE_PHOTO' as CaptainDocType }, ...docList].filter(
        (d) => docs[d.type]?.uri && !docs[d.type]?.uploaded && !docs[d.type]?.remote,
      );

      let done = 0;
      for (const { type } of pending) {
        const item = docs[type] as DocItem;

        setProgress(
          `Uploading ${DOC_META[type].label} (${done + 1}/${pending.length})`,
        );

        const fileUrl = await captainDocumentsApi.uploadFile({
          uri: item.uri,
          name: item.name,
          type: item.mime,
        });

        await captainDocumentsApi.upload({
          type: API_DOC_TYPE[type],
          fileUrl,
          documentNumber: numberFor(type),
        });

        setDocs((prev) => ({
          ...prev,
          [type]: { ...(prev[type] as DocItem), uploaded: true },
        }));
        done += 1;
      }

      finished.current = true;
      if (draftKey) {
        AsyncStorage.removeItem(draftKey).catch(() => {});
      }

      Alert.alert(
        'Request Submitted',
        resubmit
          ? 'Your updated details have been sent again for verification.'
          : 'Your captain request and documents have been sent. You can start deliveries after verification.',
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (error: any) {
      Alert.alert(
        created ? 'Documents not uploaded' : 'Registration Failed',
        (error?.message || 'Something went wrong') +
          (created
            ? '\n\nTap the button to try again. What is already done will not be sent again.'
            : ''),
      );
    } finally {
      setSaving(false);
      setProgress('');
    }
  };

  /* =========================================================
     RENDER HELPERS
     ========================================================= */

  const renderLivePhoto = () => {
    const item = docs.LIVE_PHOTO;
    const has = !!item?.uri;
    const locked = !!item?.uploaded;
    const err = submitted1 ? errors1.photo : '';

    return (
      <View style={styles.liveRow}>
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={saving || locked}
          onPress={() => pickImage('LIVE_PHOTO', 'camera')}
          style={[styles.liveAvatar, !!err && styles.liveAvatarError]}
        >
          {has ? (
            <Image
              source={{ uri: item!.uri }}
              style={styles.liveImg}
              onError={() => {
                if (!locked) removeDoc('LIVE_PHOTO');
              }}
            />
          ) : (
            <Text style={styles.liveIcon}>🤳</Text>
          )}
        </TouchableOpacity>

        <View style={styles.flex}>
          <Text style={styles.liveTitle}>Live photo (optional)</Text>
          <Text style={styles.liveSub}>Take a clear selfie, face should be visible</Text>
          {locked ? (
            <Text style={[styles.verified, styles.liveGap]}>Uploaded ✓</Text>
          ) : (
            <TouchableOpacity
              style={styles.liveBtn}
              activeOpacity={0.85}
              onPress={() => pickImage('LIVE_PHOTO', 'camera')}
              disabled={saving}
            >
              <CameraIcon color={BLUE} bg="#fff" size={14} />
              <Text style={styles.liveBtnText}>{has ? 'Retake' : 'Take photo'}</Text>
            </TouchableOpacity>
          )}
          {!!err && <Text style={styles.error}>{err}</Text>}
        </View>
      </View>
    );
  };

  const renderDoc = (type: CaptainDocType, required: boolean) => {
    const meta = DOC_META[type];
    const item = docs[type];
    const err = submitted3 ? docError(type, required) : '';
    const hasPhoto = !!item?.uri;
    const locked = !!item?.uploaded;

    let badgeText = required ? 'Required' : 'Optional';
    let badgeStyle = required ? styles.badgeRequired : styles.badgeOptional;
    let badgeTextStyle = required ? styles.badgeTextRed : styles.badgeTextGrey;
    if (locked) {
      badgeText = 'Uploaded ✓';
      badgeStyle = styles.badgeDone;
      badgeTextStyle = styles.badgeTextGreen;
    } else if (hasPhoto) {
      badgeText = 'Added';
      badgeStyle = styles.badgeAdded;
      badgeTextStyle = styles.badgeTextBlue;
    }

    return (
      <View
        key={type}
        style={[
          styles.docCard,
          hasPhoto && !err && styles.docCardDone,
          !!err && styles.docCardError,
        ]}
      >
        <View style={styles.docHead}>
          <View style={[styles.docIconWrap, hasPhoto && styles.docIconWrapDone]}>
            <Text style={styles.docEmoji}>{meta.emoji}</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.docTitle}>{meta.label}</Text>
            {!!meta.hint && <Text style={styles.docTag}>{meta.hint}</Text>}
          </View>
          <View style={[styles.badge, badgeStyle]}>
            <Text style={[styles.badgeText, badgeTextStyle]}>{badgeText}</Text>
          </View>
        </View>

        {!hasPhoto && rejectedDocs[type] !== undefined && (
          <Text style={styles.docRejectNote}>
            Rejected{rejectedDocs[type] ? `: ${rejectedDocs[type]}` : ''}. Please upload again.
          </Text>
        )}

        {hasPhoto ? (
          <View style={styles.previewRow}>
            <Image
              source={{ uri: item!.uri }}
              style={styles.thumb}
              resizeMode="cover"
              onError={() => {
                // photo file is gone (cache cleared), user has to add it again
                if (!locked) removeDoc(type);
              }}
            />
            {!locked && (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.actionBtn}
                  activeOpacity={0.85}
                  onPress={() => pickImage(type, 'camera')}
                  disabled={saving}
                >
                  <CameraIcon color={BLUE} bg="#fff" size={14} />
                  <Text style={styles.actionBtnText}>Retake</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionBtn}
                  activeOpacity={0.85}
                  onPress={() => pickImage(type, 'gallery')}
                  disabled={saving}
                >
                  <GalleryIcon color={BLUE} size={14} />
                  <Text style={styles.actionBtnText}>Gallery</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnRed]}
                  activeOpacity={0.85}
                  onPress={() => removeDoc(type)}
                  disabled={saving}
                >
                  <Text style={[styles.actionBtnText, styles.actionBtnTextRed]}>Remove</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.uploadRow}>
            <TouchableOpacity
              style={[styles.uploadBtn, styles.uploadBtnAlt]}
              activeOpacity={0.85}
              onPress={() => pickImage(type, 'gallery')}
              disabled={saving}
            >
              <GalleryIcon color={BLUE} />
              <Text style={[styles.uploadBtnText, styles.uploadBtnAltText]}>Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.uploadBtn}
              activeOpacity={0.85}
              onPress={() => pickImage(type, 'camera')}
              disabled={saving}
            >
              <CameraIcon color="#fff" bg={BLUE} />
              <Text style={styles.uploadBtnText}>Camera</Text>
            </TouchableOpacity>
          </View>
        )}

        {!!meta.numberLabel && hasPhoto && (
          <View style={styles.numberBlock}>
            <Text style={styles.numberLabel}>{meta.numberLabel}</Text>
            <TextInput
              style={[styles.inputCompact, !!err && styles.inputError]}
              placeholder={meta.numberPlaceholder}
              placeholderTextColor="#94A3B8"
              value={item!.number}
              onChangeText={(t) => setDocNumber(type, t)}
              maxLength={meta.numberMaxLength}
              keyboardType={meta.numericOnly ? 'number-pad' : 'default'}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!locked && !saving}
            />
          </View>
        )}

        {type === 'VEHICLE_RC' && hasPhoto && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Vehicle number</Text>
            <Text style={styles.infoValue}>{vehicleNumber.trim().toUpperCase()}</Text>
          </View>
        )}

        {!!err && <Text style={styles.error}>{err}</Text>}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={BLUE} />
          <Text style={styles.loaderText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const onFooterPress = step === 1 ? onNext1 : step === 2 ? onNext2 : onSubmit;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Captain Registration</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Stepper */}
      <View style={styles.stepper}>
        {STEPS.map((s, i) => {
          const done = step > s.n;
          const active = step >= s.n;
          return (
            <React.Fragment key={s.n}>
              {i > 0 && (
                <View style={[styles.stepLine, step >= s.n && styles.stepLineOn]} />
              )}
              <View style={styles.stepItem}>
                <View style={[styles.stepDot, active && styles.stepDotOn]}>
                  <Text style={[styles.stepDotText, !active && styles.stepDotTextOff]}>
                    {done ? '✓' : s.n}
                  </Text>
                </View>
                <Text style={[styles.stepLabel, active && styles.stepLabelOn]}>
                  {s.label}
                </Text>
              </View>
            </React.Fragment>
          );
        })}
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {resubmit && (
            <View style={styles.rejectBanner}>
              <Text style={styles.rejectTitle}>Your request was rejected</Text>
              <Text style={styles.rejectText}>
                {rejectReason ? `Reason: ${rejectReason}. ` : ''}
                Correct your details and submit again.
              </Text>
            </View>
          )}

          {step === 1 && (
            <>
              <View style={styles.intro}>
                <Text style={styles.introEmoji}>📦</Text>
                <Text style={styles.introTitle}>Register to become a captain</Text>
                <Text style={styles.introSub}>
                  First check your details, then add your vehicle and documents
                </Text>
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Personal details</Text>

                {renderLivePhoto()}

                <Text style={styles.label}>Full name</Text>
                <TextInput
                  style={[styles.input, submitted1 && !!errors1.name && styles.inputError]}
                  placeholder="e.g. Rahul Sharma"
                  placeholderTextColor="#94A3B8"
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
                {submitted1 && !!errors1.name && (
                  <Text style={styles.error}>{errors1.name}</Text>
                )}

                <Text style={[styles.label, styles.labelGap]}>Mobile number</Text>
                <View style={styles.phoneRow}>
                  <Text style={styles.prefix}>+91</Text>
                  <View style={styles.prefixDivider} />
                  <Text style={styles.phoneValue}>{phone || '-'}</Text>
                  <Text style={styles.verified}>Verified</Text>
                </View>

                <Text style={[styles.label, styles.labelGap]}>Email</Text>
                <TextInput
                  style={[styles.input, submitted1 && !!errors1.email && styles.inputError]}
                  placeholder="you@example.com"
                  placeholderTextColor="#94A3B8"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {submitted1 && !!errors1.email && (
                  <Text style={styles.error}>{errors1.email}</Text>
                )}
              </View>

              <TouchableOpacity
                style={styles.agreeRow}
                activeOpacity={0.8}
                onPress={() => setAgreed((a) => !a)}
              >
                <View style={[styles.checkbox, agreed && styles.checkboxOn]}>
                  {agreed && <Text style={styles.checkMark}>✓</Text>}
                </View>
                <Text style={styles.agreeText}>
                  I have read and agree to the{' '}
                  <Text style={styles.link} onPress={onPrivacyPress}>
                    Privacy Policy
                  </Text>{' '}
                  and Captain Terms.
                </Text>
              </TouchableOpacity>
              {submitted1 && !agreed && (
                <Text style={[styles.error, styles.agreeError]}>
                  Accept the Privacy Policy to continue
                </Text>
              )}

              <Text style={styles.note}>
                Note: Your details are used only for captain verification and support.
              </Text>
            </>
          )}

          {step === 2 && (
            <>
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Which vehicle do you have?</Text>

                <View style={styles.chipsWrap}>
                  {VEHICLE_OPTIONS.map((v) => {
                    const selected = vehicleType === v.id;
                    return (
                      <TouchableOpacity
                        key={v.id}
                        style={[
                          styles.chip,
                          selected && styles.chipOn,
                          captainCreated && !selected && styles.optionRowLocked,
                        ]}
                        activeOpacity={0.85}
                        onPress={() => onSelectVehicle(v.id)}
                      >
                        <Text style={styles.chipEmoji}>{v.emoji}</Text>
                        <Text style={[styles.chipText, selected && styles.chipTextOn]}>
                          {v.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {submitted2 && !!errors2.vehicleType && (
                  <Text style={styles.error}>{errors2.vehicleType}</Text>
                )}

                {/* Category of the selected vehicle (select one) */}
                {subTypes.length > 0 && (
                  <>
                    <Text style={[styles.label, styles.labelGap]}>
                      Select your {VEHICLE_OPTIONS.find((v) => v.id === vehicleType)?.label} type
                    </Text>
                    <View style={styles.subWrap}>
                      {subTypes.map((t) => {
                        const selected = vehicleSubType === t.id;
                        return (
                          <TouchableOpacity
                            key={t.id}
                            style={[
                              styles.subChip,
                              selected && styles.subChipOn,
                              captainCreated && !selected && styles.optionRowLocked,
                            ]}
                            activeOpacity={0.85}
                            disabled={captainCreated}
                            onPress={() => onSelectSubType(t.id)}
                          >
                            <View style={[styles.radio, selected && styles.radioOn]}>
                              {selected && <View style={styles.radioDot} />}
                            </View>
                            <Text
                              style={[styles.subChipText, selected && styles.subChipTextOn]}
                            >
                              {t.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    {submitted2 && !!errors2.vehicleSubType && (
                      <Text style={styles.error}>{errors2.vehicleSubType}</Text>
                    )}
                  </>
                )}

                {/* Vehicle number, model, color */}
                {!!vehicleType && !onFoot && (
                  <>
                    <Text style={[styles.label, styles.labelGap]}>Vehicle number</Text>
                    <TextInput
                      style={[
                        styles.input,
                        submitted2 && !!errors2.vehicleNumber && styles.inputError,
                      ]}
                      placeholder="e.g. MP04AB1234"
                      placeholderTextColor="#94A3B8"
                      value={vehicleNumber}
                      onChangeText={setVehicleNumber}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      editable={!captainCreated}
                    />
                    {submitted2 && !!errors2.vehicleNumber && (
                      <Text style={styles.error}>{errors2.vehicleNumber}</Text>
                    )}

                    <Text style={[styles.label, styles.labelGap]}>Model (optional)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. Tata Ace Gold"
                      placeholderTextColor="#94A3B8"
                      value={vehicleModel}
                      onChangeText={setVehicleModel}
                      editable={!captainCreated}
                    />

                    <Text style={[styles.label, styles.labelGap]}>Color (optional)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. White"
                      placeholderTextColor="#94A3B8"
                      value={vehicleColor}
                      onChangeText={setVehicleColor}
                      editable={!captainCreated}
                    />
                  </>
                )}
              </View>
            </>
          )}

          {step === 3 && (
            <>
              {!!vehicleType && (
                <>
                  <View style={styles.card}>
                    <View style={styles.docHeaderRow}>
                      <Text style={styles.docHeaderTitle}>Upload documents</Text>
                      <Text style={styles.docProgressText}>
                        {docList.filter((d) => !!docs[d.type]?.uri).length} / {docList.length}
                      </Text>
                    </View>
                    <View style={styles.docProgressTrack}>
                      <View
                        style={[
                          styles.docProgressFill,
                          {
                            width: `${
                              (docList.filter((d) => !!docs[d.type]?.uri).length /
                                Math.max(docList.length, 1)) *
                              100
                            }%`,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.docIntro}>
                      {onFoot
                        ? 'Add your Aadhaar and PAN card.'
                        : 'Add Aadhaar, PAN, Driving License and the vehicle document (RC) showing who owns the vehicle.'}
                    </Text>
                  </View>

                  {docList.map((d) => renderDoc(d.type, d.required))}
                </>
              )}

              <Text style={styles.note}>
                Note: You can start deliveries only after your documents are verified.
              </Text>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Footer */}
      <View style={styles.footer}>
        {!!progress && <Text style={styles.progressText}>{progress}</Text>}

        <TouchableOpacity
          style={[
            styles.btn,
            ((step === 1 && !agreed) || (step === 3 && saving)) && styles.btnDisabled,
          ]}
          activeOpacity={0.9}
          onPress={onFooterPress}
          disabled={step === 3 && saving}
        >
          {step === 3 && saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>
              {step === 3
                ? captainCreated
                  ? 'Retry upload'
                  : resubmit
                    ? 'Submit again'
                    : 'Submit'
                : 'Next'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: BG },
  scroll: { padding: 16, paddingBottom: 24 },

  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loaderText: { marginTop: 10, color: GREY, fontSize: 14 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 24, color: BLUE, fontWeight: '700' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: BLACK },

  // stepper
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  stepItem: { alignItems: 'center', width: 84 },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotOn: { backgroundColor: BLUE },
  stepDotText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  stepDotTextOff: { color: GREY },
  stepLabel: { fontSize: 11, color: GREY, marginTop: 4, textAlign: 'center' },
  stepLabelOn: { color: BLUE, fontWeight: '700' },
  stepLine: { flex: 1, height: 2, backgroundColor: BORDER, marginBottom: 16 },
  stepLineOn: { backgroundColor: BLUE },

  intro: { alignItems: 'center', marginBottom: 18, marginTop: 4 },
  introEmoji: { fontSize: 48, marginBottom: 8 },
  introTitle: { fontSize: 20, fontWeight: '800', color: BLACK, textAlign: 'center' },
  introSub: { fontSize: 13.5, color: GREY, marginTop: 6, textAlign: 'center' },

  card: { backgroundColor: '#fff', borderRadius: 18, padding: 16 },
  cardGap: { marginTop: 14 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: BLACK, marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '700', color: BLACK, marginBottom: 8 },
  labelGap: { marginTop: 16 },
  input: {
    height: 50,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: BLACK,
    backgroundColor: BG,
  },
  inputError: { borderColor: RED },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: '#F1F5F9',
  },
  prefix: { fontSize: 15, fontWeight: '700', color: GREY },
  prefixDivider: { width: 1, height: 22, backgroundColor: BORDER, marginHorizontal: 12 },
  phoneValue: { flex: 1, fontSize: 15, color: GREY },
  verified: { fontSize: 12, fontWeight: '700', color: GREEN },
  error: { fontSize: 12, color: RED, marginTop: 6 },

  // vehicle chips
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  chip: {
    width: '31%',
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: BG,
  },
  chipOn: { borderColor: BLUE, backgroundColor: BLUE_LIGHT },
  chipEmoji: { fontSize: 26, marginBottom: 4 },
  chipText: { fontSize: 12.5, fontWeight: '700', color: GREY },
  chipTextOn: { color: BLUE },

  // vehicle sub types
  subWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  subChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 8,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: BG,
  },
  subChipOn: { borderColor: BLUE, backgroundColor: BLUE_LIGHT },
  subChipText: { fontSize: 13.5, fontWeight: '700', color: GREY, marginLeft: 8 },
  subChipTextOn: { color: BLUE },

  // locked option (after captain is created)
  optionRowLocked: { opacity: 0.4 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: BLUE },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: BLUE },

  // rejected request
  rejectBanner: {
    backgroundColor: '#FEF3C7',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  rejectTitle: { fontSize: 13.5, fontWeight: '800', color: '#92400E' },
  rejectText: { fontSize: 12, color: '#92400E', marginTop: 3, lineHeight: 17 },
  docRejectNote: { fontSize: 11.5, color: RED, marginBottom: 8, lineHeight: 16 },

  // live photo (step 1)
  liveRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  liveAvatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#9DBFF5',
    backgroundColor: '#F5F9FF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginRight: 14,
  },
  liveAvatarError: { borderColor: RED },
  liveImg: { width: '100%', height: '100%' },
  liveIcon: { fontSize: 30 },
  liveTitle: { fontSize: 14, fontWeight: '800', color: BLACK },
  liveSub: { fontSize: 11.5, color: GREY, marginTop: 2, lineHeight: 16 },
  liveGap: { marginTop: 8 },
  liveBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 6,
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  liveBtnText: { color: BLUE, fontWeight: '700', fontSize: 12.5 },

  // documents (compact)
  docHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  docHeaderTitle: { fontSize: 15, fontWeight: '800', color: BLACK },
  docProgressText: { fontSize: 12, fontWeight: '700', color: GREY },
  docProgressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: BORDER,
    overflow: 'hidden',
  },
  docProgressFill: { height: 5, borderRadius: 3, backgroundColor: GREEN },
  docIntro: { fontSize: 12, color: GREY, lineHeight: 17, marginTop: 10 },

  docCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 10,
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: 'transparent',
    elevation: 1,
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
  },
  docCardDone: { borderColor: '#BBF7D0' },
  docCardError: { borderColor: RED },
  docHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  docIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: BLUE_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  docIconWrapDone: { backgroundColor: '#DCFCE7' },
  docEmoji: { fontSize: 18 },
  docTitle: { fontSize: 13.5, fontWeight: '800', color: BLACK },
  docTag: { fontSize: 11, color: GREY, marginTop: 1 },

  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, marginLeft: 8 },
  badgeText: { fontSize: 10.5, fontWeight: '800' },
  badgeRequired: { backgroundColor: '#FEF3C7' },
  badgeOptional: { backgroundColor: '#F1F5F9' },
  badgeAdded: { backgroundColor: BLUE_LIGHT },
  badgeDone: { backgroundColor: '#DCFCE7' },
  badgeTextRed: { color: '#B45309' },
  badgeTextGrey: { color: GREY },
  badgeTextBlue: { color: BLUE },
  badgeTextGreen: { color: GREEN },

  uploadRow: { flexDirection: 'row', gap: 8 },
  uploadBtn: {
    flexDirection: 'row',
    gap: 6,
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 15,
    backgroundColor: BLUE,
    borderWidth: 1.5,
    borderColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  uploadBtnAlt: { backgroundColor: '#fff' },
  uploadBtnAltText: { color: BLUE },

  previewRow: { flexDirection: 'row', alignItems: 'center' },
  thumb: { width: 72, height: 52, borderRadius: 8, backgroundColor: BORDER },
  actionRow: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginLeft: 10 },
  actionBtn: {
    flexDirection: 'row',
    gap: 5,
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: { color: BLUE, fontWeight: '700', fontSize: 11 },
  actionBtnRed: { borderColor: RED },
  actionBtnTextRed: { color: RED },

  numberBlock: { marginTop: 8 },
  numberLabel: { fontSize: 12, fontWeight: '700', color: BLACK, marginBottom: 5 },
  inputCompact: {
    height: 42,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: BLACK,
    backgroundColor: BG,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: BG,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  infoLabel: { flex: 1, fontSize: 11.5, color: GREY },
  infoValue: { fontSize: 12.5, fontWeight: '800', color: BLACK },

  agreeRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 18 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: BLUE,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 1,
  },
  checkboxOn: { backgroundColor: BLUE },
  checkMark: { color: '#fff', fontSize: 14, fontWeight: '800' },
  agreeText: { flex: 1, fontSize: 13.5, color: BLACK, lineHeight: 20 },
  link: { color: BLUE, fontWeight: '700', textDecorationLine: 'underline' },
  agreeError: { marginLeft: 34 },

  note: {
    fontSize: 12,
    color: GREY,
    lineHeight: 18,
    marginTop: 16,
    backgroundColor: BLUE_LIGHT,
    borderRadius: 12,
    padding: 12,
  },

  footer: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  progressText: {
    fontSize: 12.5,
    color: GREY,
    textAlign: 'center',
    marginBottom: 8,
  },
  btn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { backgroundColor: DISABLED },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});