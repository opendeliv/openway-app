import React, { useEffect, useState } from 'react';
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
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
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

// Only 2 documents: Aadhaar (everyone) and Driving License (motor vehicles)
type CaptainDocType = 'AADHAAR' | 'DRIVING_LICENSE';

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

/* =========================================================
   OPTIONS
   ========================================================= */

const STEPS = [
  { n: 1, label: 'Personal details' },
  { n: 2, label: 'Vehicle' },
  { n: 3, label: 'Work & documents' },
];

const SERVICE_OPTIONS: {
  id: ServiceType;
  title: string;
  sub: string;
  emoji: string;
}[] = [
  {
    id: 'ALL',
    title: 'All work',
    sub: 'Rides, parcels and goods (based on your vehicle)',
    emoji: '🚀',
  },
  {
    id: 'PARCEL_ONLY',
    title: 'Parcel only',
    sub: 'I will only deliver parcels',
    emoji: '📦',
  },
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
    { id: 'mini', label: 'Mini' },
    { id: 'sedan', label: 'Sedan' },
    { id: 'suv', label: 'SUV' },
  ],
  AUTO: [
    { id: 'auto', label: 'Auto' },
    { id: 'e_rickshaw', label: 'E-Auto' },
    { id: 'shared_auto', label: 'Shared Auto' },
  ],
  GOODS_VEHICLE: [
    { id: 'tata_ace', label: 'Tata Ace' },
    { id: 'pickup', label: 'Pickup' },
  ],
};

/* =========================================================
   DOCUMENT CONFIG
   (keep in sync with backend DOCUMENTS_BY_VEHICLE)
   ========================================================= */

type DocMeta = {
  label: string;
  emoji: string;
  numberLabel: string;
  numberPlaceholder: string;
  numberError: string;
  numberMaxLength: number;
  numericOnly?: boolean;
  validate: (value: string) => boolean;
};

const DOC_META: Record<CaptainDocType, DocMeta> = {
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
  DRIVING_LICENSE: {
    label: 'Driving License',
    emoji: '🚘',
    numberLabel: 'License number',
    numberPlaceholder: 'e.g. MP0420210012345',
    numberError: 'Enter a valid license number',
    numberMaxLength: 20,
    validate: (v) => /^[A-Z0-9]{8,20}$/.test(v),
  },
};

const DOCUMENTS_BY_VEHICLE: Record<
  VehicleType,
  { required: CaptainDocType[]; optional: CaptainDocType[] }
> = {
  WALK: { required: ['AADHAAR'], optional: [] },
  CYCLE: { required: ['AADHAAR'], optional: [] },
  BIKE: { required: ['AADHAAR', 'DRIVING_LICENSE'], optional: [] },
  AUTO: { required: ['AADHAAR', 'DRIVING_LICENSE'], optional: [] },
  CAB: { required: ['AADHAAR', 'DRIVING_LICENSE'], optional: [] },
  GOODS_VEHICLE: { required: ['AADHAAR', 'DRIVING_LICENSE'], optional: [] },
};

type DocItem = {
  uri: string;
  mime?: string;
  name?: string;
  number: string;
  uploaded?: boolean;
};

type DocsState = Partial<Record<CaptainDocType, DocItem>>;

const isOnFoot = (v: VehicleType | null) => v === 'WALK' || v === 'CYCLE';

const normalizeNumber = (type: CaptainDocType, value: string) =>
  type === 'AADHAAR'
    ? value.replace(/\D/g, '')
    : value.replace(/\s/g, '').toUpperCase();

/* =========================================================
   SCREEN
   ========================================================= */

export default function CaptainRegisterScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

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
  const [serviceType, setServiceType] = useState<ServiceType | null>(null);
  const [docs, setDocs] = useState<DocsState>({});
  const [submitted3, setSubmitted3] = useState(false);

  // Captain created but documents pending: do not create again
  const [captainCreated, setCaptainCreated] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState('');

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

  // Prefill name, phone and email from the user profile
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const profile = await profileApi.getProfile();

        setName(profile.name ?? '');
        setEmail(profile.email ?? '');

        const digits = (profile.phone ?? '').replace(/\D/g, '');
        setPhone(digits.slice(-10));
      } catch (error: any) {
        Alert.alert('Error', error?.message || 'Could not load your profile');
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [navigation]);

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
  };
  const isValid1 = Object.values(errors1).every((e) => !e);

  const onPrivacyPress = () => {
    // TODO: open Privacy Policy page / link
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
      setServiceType('PARCEL_ONLY');
      setVehicleNumber('');
      setVehicleModel('');
      setVehicleColor('');
    } else if (serviceType === 'PARCEL_ONLY' && isOnFoot(vehicleType)) {
      // Switching from walk/cycle to a motor vehicle: let the user choose again
      setServiceType(null);
    }

    // Remove documents that the new vehicle does not need
    const allowed = [
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

  /* ---------- Step 3: work type + documents ---------- */

  const onSelectService = (id: ServiceType) => {
    if (captainCreated) return;
    if (onFoot && id === 'ALL') return;
    setServiceType(id);
  };

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
      const res: ImagePickerResponse =
        source === 'camera'
          ? await launchCamera({
              ...base,
              cameraType: 'back',
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

  const errors3 = {
    serviceType: !serviceType ? 'Select the type of work' : '',
  };
  const docsValid = docList.every((d) => !docError(d.type, d.required));
  const isValid3 = Object.values(errors3).every((e) => !e) && docsValid;

  /* ---------- Submit ---------- */

  const onSubmit = async () => {
    if (saving) return;

    setSubmitted3(true);
    if (!isValid3 || !serviceType || !vehicleType) return;

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

        await captainsApi.createCaptain(payload);
        created = true;
        setCaptainCreated(true);
      }

      // Upload only the documents that are not uploaded yet
      const pending = docList.filter(
        (d) => docs[d.type]?.uri && !docs[d.type]?.uploaded,
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
          type,
          fileUrl,
          documentNumber: numberFor(type),
        });

        setDocs((prev) => ({
          ...prev,
          [type]: { ...(prev[type] as DocItem), uploaded: true },
        }));
        done += 1;
      }

      Alert.alert(
        'Request Submitted',
        'Your captain request and documents have been sent. You can take rides after verification.',
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

  const renderDoc = (type: CaptainDocType, required: boolean) => {
    const meta = DOC_META[type];
    const item = docs[type];
    const err = submitted3 ? docError(type, required) : '';

    return (
      <View key={type} style={[styles.docCard, !!err && styles.docCardError]}>
        <View style={styles.docHead}>
          <Text style={styles.docEmoji}>{meta.emoji}</Text>
          <View style={styles.flex}>
            <Text style={styles.docTitle}>{meta.label}</Text>
            <Text style={styles.docTag}>{required ? 'Required' : 'Optional'}</Text>
          </View>
          {item?.uploaded && <Text style={styles.verified}>Uploaded ✓</Text>}
        </View>

        {item?.uri ? (
          <View style={styles.previewRow}>
            <Image source={{ uri: item.uri }} style={styles.thumb} />
            <View style={styles.previewActions}>
              <TouchableOpacity
                onPress={() => pickImage(type, 'gallery')}
                disabled={saving || item.uploaded}
              >
                <Text style={styles.linkBtn}>Change</Text>
              </TouchableOpacity>
              {!item.uploaded && (
                <TouchableOpacity onPress={() => removeDoc(type)} disabled={saving}>
                  <Text style={[styles.linkBtn, styles.linkRed]}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.uploadRow}>
            <TouchableOpacity
              style={styles.uploadBtn}
              activeOpacity={0.85}
              onPress={() => pickImage(type, 'gallery')}
              disabled={saving}
            >
              <Text style={styles.uploadBtnText}>🖼️ Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.uploadBtn}
              activeOpacity={0.85}
              onPress={() => pickImage(type, 'camera')}
              disabled={saving}
            >
              <Text style={styles.uploadBtnText}>📷 Camera</Text>
            </TouchableOpacity>
          </View>
        )}

        {!!meta.numberLabel && !!item?.uri && (
          <>
            <Text style={[styles.label, styles.labelGap]}>{meta.numberLabel}</Text>
            <TextInput
              style={[styles.input, !!err && styles.inputError]}
              placeholder={meta.numberPlaceholder}
              placeholderTextColor="#94A3B8"
              value={item.number}
              onChangeText={(t) => setDocNumber(type, t)}
              maxLength={meta.numberMaxLength}
              keyboardType={meta.numericOnly ? 'number-pad' : 'default'}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!item.uploaded && !saving}
            />
          </>
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
          {step === 1 && (
            <>
              <View style={styles.intro}>
                <Text style={styles.introEmoji}>🏍️</Text>
                <Text style={styles.introTitle}>Register to become a captain</Text>
                <Text style={styles.introSub}>
                  First check your details, then add your vehicle and documents
                </Text>
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Personal details</Text>

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
                      placeholder="e.g. Splendor Plus"
                      placeholderTextColor="#94A3B8"
                      value={vehicleModel}
                      onChangeText={setVehicleModel}
                      editable={!captainCreated}
                    />

                    <Text style={[styles.label, styles.labelGap]}>Color (optional)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. Black"
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
              {/* Work type */}
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>What work will you do?</Text>

                {SERVICE_OPTIONS.map((s) => {
                  const selected = serviceType === s.id;
                  const locked = (onFoot && s.id === 'ALL') || (captainCreated && !selected);
                  return (
                    <TouchableOpacity
                      key={s.id}
                      style={[
                        styles.optionRow,
                        selected && styles.optionRowOn,
                        locked && styles.optionRowLocked,
                      ]}
                      activeOpacity={0.85}
                      disabled={locked}
                      onPress={() => onSelectService(s.id)}
                    >
                      <Text style={styles.optionEmoji}>{s.emoji}</Text>
                      <View style={styles.flex}>
                        <Text style={styles.optionTitle}>{s.title}</Text>
                        <Text style={styles.optionSub}>{s.sub}</Text>
                      </View>
                      <View style={[styles.radio, selected && styles.radioOn]}>
                        {selected && <View style={styles.radioDot} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}

                {onFoot && (
                  <Text style={styles.hintText}>
                    Walk and cycle captains can only deliver parcels over short distances.
                  </Text>
                )}
                {submitted3 && !!errors3.serviceType && (
                  <Text style={styles.error}>{errors3.serviceType}</Text>
                )}
              </View>

              {/* Documents */}
              {!!vehicleType && (
                <View style={[styles.card, styles.cardGap]}>
                  <Text style={styles.sectionTitle}>Documents</Text>
                  <Text style={styles.docIntro}>
                    You need Aadhaar and, for a motor vehicle, a Driving License. Take a clear photo and enter the number.
                  </Text>
                  {docList.map((d) => renderDoc(d.type, d.required))}
                </View>
              )}

              <Text style={styles.note}>
                Note: You can take rides only after your documents are verified.
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
              {step === 3 ? (captainCreated ? 'Retry upload' : 'Submit') : 'Next'}
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

  // service options
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: BG,
    marginBottom: 10,
  },
  optionRowOn: { borderColor: BLUE, backgroundColor: BLUE_LIGHT },
  optionRowLocked: { opacity: 0.4 },
  optionEmoji: { fontSize: 26, marginRight: 12 },
  optionTitle: { fontSize: 15, fontWeight: '800', color: BLACK },
  optionSub: { fontSize: 12, color: GREY, marginTop: 2 },
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
  hintText: { fontSize: 12, color: GREY, marginTop: 2, lineHeight: 18 },

  // documents
  docIntro: { fontSize: 12.5, color: GREY, marginTop: -6, marginBottom: 12 },
  docCard: {
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    backgroundColor: BG,
  },
  docCardError: { borderColor: RED },
  docHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  docEmoji: { fontSize: 24, marginRight: 10 },
  docTitle: { fontSize: 14, fontWeight: '800', color: BLACK },
  docTag: { fontSize: 11.5, color: GREY, marginTop: 1 },
  uploadRow: { flexDirection: 'row' },
  uploadBtn: {
    flex: 1,
    marginHorizontal: 4,
    height: 46,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BLUE,
    borderStyle: 'dashed',
    backgroundColor: BLUE_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadBtnText: { color: BLUE, fontWeight: '700', fontSize: 13.5 },
  previewRow: { flexDirection: 'row', alignItems: 'center' },
  thumb: { width: 84, height: 60, borderRadius: 10, backgroundColor: BORDER },
  previewActions: { marginLeft: 14 },
  linkBtn: { color: BLUE, fontWeight: '700', fontSize: 13.5, paddingVertical: 4 },
  linkRed: { color: RED },

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