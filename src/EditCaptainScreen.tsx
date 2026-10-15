import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { RootStackParamList } from './types/navigation';
import { captainsApi, Captain } from './services/captainsApi';

const BLUE = '#1F6FE5';
const BLUE_LIGHT = '#EAF2FF';
const BLACK = '#0F172A';
const GREY = '#64748B';
const BORDER = '#E2E8F0';
const BG = '#F4F7FB';
const GREEN = '#16A34A';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOB_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export default function EditCaptainScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [captain, setCaptain] = useState<Captain | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadCaptain = async () => {
      try {
        const data = await captainsApi.getMyCaptain();

        if (!data) {
          Alert.alert('Captain', 'Captain account nahi mila');
          navigation.goBack();
          return;
        }

        setCaptain(data);
        setName(data.name ?? '');
        setEmail(data.email ?? '');
        setGender(data.gender ?? '');
        setDateOfBirth(data.dateOfBirth ? data.dateOfBirth.slice(0, 10) : '');
      } catch (error: any) {
        Alert.alert(
          'Error',
          error?.message || 'Captain profile load nahi ho paayi',
        );
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    };

    loadCaptain();
  }, [navigation]);

  const saveProfile = async () => {
    if (saving) return;

    if (name.trim().length < 3) {
      Alert.alert('Required', 'Poora naam likho (kam se kam 3 akshar)');
      return;
    }

    if (!EMAIL_REGEX.test(email.trim())) {
      Alert.alert('Invalid Email', 'Sahi email likho');
      return;
    }

    const dob = dateOfBirth.trim();

    if (dob && !DOB_REGEX.test(dob)) {
      Alert.alert('Invalid Date', 'Date YYYY-MM-DD format me daalo');
      return;
    }

    try {
      setSaving(true);

      await captainsApi.updateCaptain({
        name: name.trim(),
        email: email.trim(),
        gender: gender || undefined,
        dateOfBirth: dob || undefined,
      });

      Alert.alert('Profile Updated', 'Captain profile update ho gayi.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error: any) {
      Alert.alert(
        'Update Failed',
        error?.message || 'Profile update nahi ho paayi',
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={BLUE} />
        <Text style={styles.loadingText}>Profile load ho rahi hai...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Text style={styles.backText}>‹</Text>
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Edit Captain Profile</Text>

          <View style={styles.headerSpace} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Avatar */}
          <View style={styles.photoSection}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {name ? name.charAt(0).toUpperCase() : 'C'}
              </Text>
            </View>
          </View>

          {/* Name */}
          <View style={styles.field}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Enter your name"
              placeholderTextColor="#94A3B8"
              style={styles.input}
              autoCapitalize="words"
            />
          </View>

          {/* Phone (read only) */}
          <View style={styles.field}>
            <Text style={styles.label}>Phone</Text>
            <View style={styles.disabledInput}>
              <Text style={styles.disabledText}>{captain?.phone || ''}</Text>
              <Text style={styles.verified}>Verified</Text>
            </View>
          </View>

          {/* Email */}
          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Enter your email"
              placeholderTextColor="#94A3B8"
              style={styles.input}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Gender */}
          <View style={styles.field}>
            <Text style={styles.label}>Gender</Text>

            <View style={styles.genderRow}>
              {['male', 'female', 'other'].map((item) => (
                <TouchableOpacity
                  key={item}
                  onPress={() => setGender(item)}
                  style={[
                    styles.genderButton,
                    gender === item && styles.genderButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.genderText,
                      gender === item && styles.genderTextActive,
                    ]}
                  >
                    {item.charAt(0).toUpperCase() + item.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Date of Birth */}
          <View style={styles.field}>
            <Text style={styles.label}>Date of Birth</Text>
            <TextInput
              value={dateOfBirth}
              onChangeText={setDateOfBirth}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#94A3B8"
              style={styles.input}
              keyboardType="numbers-and-punctuation"
            />
            <Text style={styles.hint}>Example: 1998-05-21</Text>
          </View>

          {/* Save */}
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={saveProfile}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.saveText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  flex: { flex: 1 },

  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BG,
  },
  loadingText: { marginTop: 12, color: GREY, fontSize: 14 },

  header: {
    height: 56,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: { fontSize: 36, lineHeight: 38, color: BLACK, fontWeight: '300' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: BLACK,
  },
  headerSpace: { width: 40 },

  content: { padding: 16, paddingBottom: 32 },

  photoSection: { alignItems: 'center', marginBottom: 20 },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: BLUE_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#D6E6FF',
  },
  avatarText: { fontSize: 30, fontWeight: '800', color: BLUE },

  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '700', color: BLACK, marginBottom: 8 },
  input: {
    height: 50,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 14,
    color: BLACK,
    fontSize: 15,
  },
  disabledInput: {
    minHeight: 50,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  disabledText: { color: GREY, fontSize: 15 },
  verified: { color: GREEN, fontSize: 12, fontWeight: '700' },

  genderRow: { flexDirection: 'row', gap: 10 },
  genderButton: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  genderButtonActive: { backgroundColor: BLUE_LIGHT, borderColor: BLUE },
  genderText: { color: GREY, fontSize: 14, fontWeight: '600' },
  genderTextActive: { color: BLUE, fontWeight: '700' },

  hint: { marginTop: 6, fontSize: 12, color: '#94A3B8' },

  saveButton: {
    height: 52,
    borderRadius: 14,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  saveButtonDisabled: { opacity: 0.7 },
  saveText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});