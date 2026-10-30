import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
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
import { adminApi } from '../services/api'; // path adjust
import {
  Avatar,
  BLUE,
  BORDER,
  Captain,
  GREEN,
  GREY,
  NAVY,
  RED,
  statusStyle,
} from './AdminHomeScreen'; // path adjust

type CaptainDoc = {
  id: string;
  type: string;
  fileUrl: string;
  documentNumber: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason: string | null;
};

// AADHAAR_FRONT -> "Aadhaar Front"
function docLabel(t: string) {
  return t
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const isPdf = (u: string) => /\.pdf($|\?)/i.test(u);

export default function CaptainDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const c: Captain = route.params.captain;

  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [acting, setActing] = useState(false);

  const [docs, setDocs] = useState<CaptainDoc[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docsError, setDocsError] = useState(false);
  const [preview, setPreview] = useState<CaptainDoc | null>(null);

  // Captain ke documents server se laao
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const full = await adminApi.captain(c.id);
        if (alive) setDocs(full?.documents ?? []);
      } catch {
        if (alive) setDocsError(true);
      } finally {
        if (alive) setDocsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [c.id]);

  const st = statusStyle(c.verificationStatus);
  const isApproved = c.verificationStatus === 'APPROVED' || c.verificationStatus === 'VERIFIED';
  const isRejected = c.verificationStatus === 'REJECTED';

  const onApprove = () => {
    Alert.alert('Approve captain', `${c.name} ko approve karna hai?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Approve',
        onPress: async () => {
          setActing(true);
          try {
            await adminApi.approve(c.id);
            navigation.goBack(); // dashboard focus par khud refresh hoga
          } catch (e: any) {
            Alert.alert('Error', e.message);
            setActing(false);
          }
        },
      },
    ]);
  };

  const onConfirmReject = async () => {
    if (reason.trim().length < 5) {
      Alert.alert('Reason chahiye', 'Kam se kam 5 akshar me wajah likho');
      return;
    }
    setActing(true);
    try {
      await adminApi.reject(c.id, reason.trim());
      setRejectOpen(false);
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Error', e.message);
      setActing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F7FB" />

      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Captain details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile hero */}
        <View style={styles.hero}>
          <Avatar name={c.name} uri={c.profilePhoto} size={84} />
          <Text style={styles.heroName}>{c.name}</Text>
          <View style={[styles.badge, { backgroundColor: st.bg }]}>
            <Text style={[styles.badgeText, { color: st.fg }]}>{st.text}</Text>
          </View>

          <View style={styles.quickRow}>
            <TouchableOpacity style={styles.quickBtn} onPress={() => Linking.openURL(`tel:${c.phone}`)}>
              <Text style={styles.quickIcon}>📞</Text>
              <Text style={styles.quickText}>Call</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickBtn}
              onPress={() => Linking.openURL(`sms:${c.phone}`)}
            >
              <Text style={styles.quickIcon}>💬</Text>
              <Text style={styles.quickText}>Message</Text>
            </TouchableOpacity>
            {!!c.email && (
              <TouchableOpacity style={styles.quickBtn} onPress={() => Linking.openURL(`mailto:${c.email}`)}>
                <Text style={styles.quickIcon}>✉️</Text>
                <Text style={styles.quickText}>Email</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {isRejected && !!c.rejectionReason && (
          <View style={styles.reasonBox}>
            <Text style={styles.reasonLabel}>Reject ki wajah</Text>
            <Text style={styles.reasonText}>{c.rejectionReason}</Text>
          </View>
        )}

        <Section title="Personal information">
          <Row k="Name" v={c.name} />
          <Row k="Phone" v={c.phone} />
          <Row k="Email" v={c.email ?? '-'} />
          <Row k="Gender" v={c.gender ?? '-'} />
          <Row k="Date of birth" v={c.dateOfBirth ? c.dateOfBirth.slice(0, 10) : '-'} last />
        </Section>

        <Section title="Service">
          <Row k="Service type" v={c.serviceType} />
          <Row k="Pickup range" v={`${c.pickupRangeKm} km`} />
          <Row k="Account status" v={c.status ?? '-'} last />
        </Section>

        <Section title="Vehicle">
          <Row k="Vehicle type" v={c.vehicleType} />
          <Row k="Vehicle number" v={c.vehicleNumber ?? '-'} />
          <Row k="Vehicle model" v={c.vehicleModel ?? '-'} />
          <Row k="Vehicle color" v={c.vehicleColor ?? '-'} last />
        </Section>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Documents {docs.length ? `(${docs.length})` : ''}</Text>
          {docsLoading ? (
            <ActivityIndicator color={BLUE} style={{ marginVertical: 20 }} />
          ) : docsError ? (
            <View style={styles.docEmpty}>
              <Text style={styles.docEmptyText}>Documents load nahi ho paye</Text>
            </View>
          ) : docs.length === 0 ? (
            <View style={styles.docEmpty}>
              <Text style={styles.docEmptyIcon}>📄</Text>
              <Text style={styles.docEmptyText}>Captain ne abhi koi document upload nahi kiya</Text>
            </View>
          ) : (
            <View style={styles.docGrid}>
              {docs.map((d) => {
                const ds = statusStyle(d.status);
                return (
                  <TouchableOpacity
                    key={d.id}
                    style={styles.docCard}
                    activeOpacity={0.85}
                    onPress={() => (isPdf(d.fileUrl) ? Linking.openURL(d.fileUrl) : setPreview(d))}
                  >
                    {isPdf(d.fileUrl) ? (
                      <View style={[styles.docThumb, styles.docPdf]}>
                        <Text style={{ fontSize: 34 }}>📑</Text>
                        <Text style={styles.docPdfText}>PDF</Text>
                      </View>
                    ) : (
                      <Image source={{ uri: d.fileUrl }} style={styles.docThumb} resizeMode="cover" />
                    )}
                    <View style={styles.docInfo}>
                      <Text style={styles.docName} numberOfLines={1}>
                        {docLabel(d.type)}
                      </Text>
                      {!!d.documentNumber && (
                        <Text style={styles.docNum} numberOfLines={1}>
                          {d.documentNumber}
                        </Text>
                      )}
                      <View style={[styles.badge, { backgroundColor: ds.bg, alignSelf: 'flex-start', marginTop: 6 }]}>
                        <Text style={[styles.badgeText, { color: ds.fg }]}>{ds.text}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        <Section title="Registration">
          <Row k="Registered on" v={c.createdAt.slice(0, 10)} />
          <Row k="Verification" v={st.text} last />
        </Section>
      </ScrollView>

      {/* Bottom actions */}
      {!isApproved && (
        <View style={styles.actions}>
          {!isRejected && (
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: '#FEE2E2' }]}
              onPress={() => setRejectOpen(true)}
              disabled={acting}
            >
              <Text style={[styles.btnText, { color: RED }]}>Reject</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: GREEN }]}
            onPress={onApprove}
            disabled={acting}
          >
            {acting ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Approve</Text>}
          </TouchableOpacity>
        </View>
      )}

      {/* Document full screen preview */}
      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <View style={styles.previewBackdrop}>
          <SafeAreaView style={{ flex: 1 }}>
            <View style={styles.previewTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.previewTitle}>{preview ? docLabel(preview.type) : ''}</Text>
                {!!preview?.documentNumber && <Text style={styles.previewSub}>{preview.documentNumber}</Text>}
              </View>
              <TouchableOpacity style={styles.previewClose} onPress={() => setPreview(null)}>
                <Text style={styles.previewCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            {!!preview && (
              <Image source={{ uri: preview.fileUrl }} style={styles.previewImg} resizeMode="contain" />
            )}
            {preview?.status === 'REJECTED' && !!preview.rejectionReason && (
              <Text style={styles.previewReject}>Reject wajah: {preview.rejectionReason}</Text>
            )}
          </SafeAreaView>
        </View>
      </Modal>

      {/* Reject reason */}
      <Modal visible={rejectOpen} transparent animationType="slide" onRequestClose={() => setRejectOpen(false)}>
        <KeyboardAvoidingView
          style={styles.backdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Reject captain</Text>
            <Text style={styles.sheetSub}>{c.name} ko reject karne ki wajah likho</Text>
            <TextInput
              style={styles.reasonInput}
              placeholder="Jaise: Vehicle number galat hai"
              placeholderTextColor="#9CA3AF"
              value={reason}
              onChangeText={setReason}
              multiline
              autoFocus
            />
            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: '#F1F5F9' }]}
                onPress={() => {
                  setRejectOpen(false);
                  setReason('');
                }}
                disabled={acting}
              >
                <Text style={[styles.btnText, { color: NAVY }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: RED }]}
                onPress={onConfirmReject}
                disabled={acting}
              >
                {acting ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Confirm reject</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function Row({ k, v, last }: { k: string; v: string; last?: boolean }) {
  return (
    <View style={[styles.row, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.rowKey}>{k}</Text>
      <Text style={styles.rowVal}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FB' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: { fontSize: 28, color: NAVY, marginTop: -3 },
  topTitle: { fontSize: 17, fontWeight: '800', color: NAVY },
  content: { padding: 18, paddingBottom: 30 },

  hero: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER,
  },
  heroName: { fontSize: 20, fontWeight: '900', color: NAVY, marginTop: 12, marginBottom: 8 },
  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 12, fontWeight: '800' },
  quickRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  quickBtn: {
    backgroundColor: '#EEF3FF',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: 'center',
    minWidth: 78,
  },
  quickIcon: { fontSize: 18 },
  quickText: { fontSize: 12, fontWeight: '700', color: BLUE, marginTop: 2 },

  reasonBox: { backgroundColor: '#FEF2F2', borderRadius: 14, padding: 14, marginTop: 14 },
  reasonLabel: { fontSize: 12, color: GREY, fontWeight: '700', marginBottom: 4 },
  reasonText: { fontSize: 14, color: RED, fontWeight: '600' },

  section: { marginTop: 18 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: GREY, marginBottom: 8, marginLeft: 4, textTransform: 'uppercase' },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: BORDER,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  rowKey: { fontSize: 13, color: GREY, fontWeight: '600' },
  rowVal: { fontSize: 14, color: NAVY, fontWeight: '700', maxWidth: '62%', textAlign: 'right' },

  docGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  docCard: {
    width: '48.5%',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 10,
    overflow: 'hidden',
  },
  docThumb: { width: '100%', height: 110, backgroundColor: '#E2E8F0' },
  docPdf: { alignItems: 'center', justifyContent: 'center' },
  docPdfText: { fontSize: 11, fontWeight: '800', color: GREY },
  docInfo: { padding: 10 },
  docName: { fontSize: 13, fontWeight: '800', color: NAVY },
  docNum: { fontSize: 11.5, color: GREY, marginTop: 2 },
  docEmpty: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 24,
    alignItems: 'center',
  },
  docEmptyIcon: { fontSize: 30, marginBottom: 6 },
  docEmptyText: { fontSize: 13, color: GREY, textAlign: 'center' },

  previewBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' },
  previewTop: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  previewTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  previewSub: { color: '#94A3B8', fontSize: 13, marginTop: 2 },
  previewClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCloseText: { color: '#fff', fontSize: 18 },
  previewImg: { flex: 1, width: '100%' },
  previewReject: { color: '#FCA5A5', fontSize: 13, padding: 16, textAlign: 'center' },

  actions: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  btn: { flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  sheetTitle: { fontSize: 20, fontWeight: '900', color: NAVY },
  sheetSub: { fontSize: 13, color: GREY, marginTop: 2, marginBottom: 12 },
  reasonInput: {
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 12,
    minHeight: 80,
    fontSize: 14,
    color: NAVY,
    textAlignVertical: 'top',
  },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
});