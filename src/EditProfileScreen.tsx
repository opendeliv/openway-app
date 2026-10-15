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

import { profileApi, ProfileUser } from './services/api';
import { RootStackParamList } from './types/navigation';

const BLUE = '#1F6FE5';
const BLACK = '#0F172A';
const GREY = '#64748B';
const BORDER = '#E2E8F0';
const BG = '#F4F7FB';

export default function EditProfileScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [profile, setProfile] = useState<ProfileUser | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const data = await profileApi.getProfile();

      setProfile(data);
      setName(data.name ?? '');
      setEmail(data.email ?? '');
      setGender(data.gender ?? '');
      setDateOfBirth(
        data.dateOfBirth
          ? data.dateOfBirth.slice(0, 10)
          : '',
      );
    } catch (error: any) {
      Alert.alert(
        'Error',
        error?.message || 'Profile load nahi ho paayi',
      );
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const saveProfile = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Name enter karo');
      return;
    }

    if (email.trim() && !email.includes('@')) {
      Alert.alert('Invalid Email', 'Valid email enter karo');
      return;
    }

    try {
      setSaving(true);

      const updated = await profileApi.updateProfile({
        name: name.trim(),
        email: email.trim() || undefined,
        gender: gender || undefined,
        dateOfBirth: dateOfBirth.trim() || undefined,
      });

      setProfile(updated);

      Alert.alert(
        'Profile Updated',
        'Profile successfully update ho gayi.',
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ],
      );
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
        <Text style={styles.loadingText}>
          Profile load ho rahi hai...
        </Text>
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

          <Text style={styles.headerTitle}>
            Edit Profile
          </Text>

          <View style={styles.headerSpace} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Profile Photo */}
          <View style={styles.photoSection}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {name
                  ? name.charAt(0).toUpperCase()
                  : 'U'}
              </Text>
            </View>

            <TouchableOpacity>
              <Text style={styles.changePhoto}>
                Change Profile Photo
              </Text>
            </TouchableOpacity>
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

          {/* Phone */}
          <View style={styles.field}>
            <Text style={styles.label}>Phone</Text>

            <View style={styles.disabledInput}>
              <Text style={styles.disabledText}>
                {profile?.phone || ''}
              </Text>

              <Text style={styles.verified}>
                Verified
              </Text>
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
                    gender === item &&
                      styles.genderButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.genderText,
                      gender === item &&
                        styles.genderTextActive,
                    ]}
                  >
                    {item.charAt(0).toUpperCase() +
                      item.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Date of Birth */}
          <View style={styles.field}>
            <Text style={styles.label}>
              Date of Birth
            </Text>

            <TextInput
              value={dateOfBirth}
              onChangeText={setDateOfBirth}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#94A3B8"
              style={styles.input}
              keyboardType="numbers-and-punctuation"
            />

            <Text style={styles.hint}>
              Example: 1998-05-21
            </Text>
          </View>

          {/* Joined */}
          <View style={styles.field}>
            <Text style={styles.label}>Joined</Text>

            <View style={styles.disabledInput}>
              <Text style={styles.disabledText}>
                {profile?.joined
                  ? new Date(
                      profile.joined,
                    ).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })
                  : ''}
              </Text>
            </View>
          </View>

          {/* Save */}
          <TouchableOpacity
            style={[
              styles.saveButton,
              saving && styles.saveButtonDisabled,
            ]}
            onPress={saveProfile}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.saveText}>
                Save Changes
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BG,
  },

  flex: {
    flex: 1,
  },

  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BG,
  },

  loadingText: {
    marginTop: 12,
    color: GREY,
    fontSize: 14,
  },

  header: {
    height: 60,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },

  backButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },

  backText: {
    fontSize: 38,
    lineHeight: 40,
    color: BLACK,
    fontWeight: '300',
  },

  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 19,
    fontWeight: '700',
    color: BLACK,
  },

  headerSpace: {
    width: 42,
  },

  content: {
    padding: 20,
    paddingBottom: 40,
  },

  photoSection: {
    alignItems: 'center',
    marginBottom: 28,
  },

  avatar: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: '#EAF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#D6E6FF',
  },

  avatarText: {
    fontSize: 34,
    fontWeight: '800',
    color: BLUE,
  },

  changePhoto: {
    marginTop: 12,
    color: BLUE,
    fontSize: 14,
    fontWeight: '700',
  },

  field: {
    marginBottom: 20,
  },

  label: {
    fontSize: 14,
    fontWeight: '700',
    color: BLACK,
    marginBottom: 8,
  },

  input: {
    height: 52,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 15,
    color: BLACK,
    fontSize: 15,
  },

  disabledInput: {
    minHeight: 52,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  disabledText: {
    color: GREY,
    fontSize: 15,
  },

  verified: {
    color: '#16A34A',
    fontSize: 12,
    fontWeight: '700',
  },

  genderRow: {
    flexDirection: 'row',
    gap: 10,
  },

  genderButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  genderButtonActive: {
    backgroundColor: '#EAF2FF',
    borderColor: BLUE,
  },

  genderText: {
    color: GREY,
    fontSize: 14,
    fontWeight: '600',
  },

  genderTextActive: {
    color: BLUE,
    fontWeight: '700',
  },

  hint: {
    marginTop: 6,
    fontSize: 12,
    color: '#94A3B8',
  },

  saveButton: {
    height: 54,
    borderRadius: 14,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },

  saveButtonDisabled: {
    opacity: 0.7,
  },

  saveText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});