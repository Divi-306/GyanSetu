import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { errorMessage } from '@/lib/api';
import { useTranslation } from '@/i18n';
import { goBackOr } from '@/lib/nav';
import { EMPTY_PROFILE, getProfile, saveProfile, updateUser, type Profile } from '@/services/account';
import { useApp } from '@/stores/appStore';

type Option<T> = { value: T; label: string };

const GENDERS: Option<NonNullable<Profile['gender']>>[] = [
  { value: 'female', label: 'profileEdit.female' },
  { value: 'male', label: 'profileEdit.male' },
  { value: 'other', label: 'profileEdit.other' },
  { value: 'prefer_not', label: 'profileEdit.preferNotToSay' },
];
const CATEGORIES: Option<NonNullable<Profile['category']>>[] = ['GEN', 'OBC', 'SC', 'ST', 'EWS'].map((c) => ({
  value: c as NonNullable<Profile['category']>,
  label: c,
}));
const LEVELS: Option<NonNullable<Profile['educationLevel']>>[] = [
  { value: 'school', label: 'profileEdit.school' },
  { value: 'diploma', label: 'profileEdit.diploma' },
  { value: 'undergraduate', label: 'profileEdit.undergraduate' },
  { value: 'postgraduate', label: 'profileEdit.postgraduate' },
];
const PWD: Option<boolean>[] = [
  { value: true, label: 'profileEdit.yes' },
  { value: false, label: 'profileEdit.no' },
];

function Chips<T>({ options, value, onChange }: { options: Option<T>[]; value: T | null; onChange: (v: T | null) => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            style={[styles.chip, active && styles.chipActive]}
            // Tapping the selected chip clears it: "I'd rather not say" is always possible.
            onPress={() => onChange(active ? null : o.value)}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{t(o.label)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {hint && <Text style={styles.hint}>{hint}</Text>}
      {children}
    </View>
  );
}

const nullIfBlank = (s: string) => (s.trim() ? s.trim() : null);

export default function ProfileEdit() {
  const { t } = useTranslation();
  const user = useApp((s) => s.user);
  const [name, setName] = useState(user?.name ?? '');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [income, setIncome] = useState('');
  const [semester, setSemester] = useState('');
  const [interests, setInterests] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProfile()
      .then((p) => {
        setProfile(p);
        setIncome(p.annualFamilyIncome != null ? String(p.annualFamilyIncome) : '');
        setSemester(p.semester != null ? String(p.semester) : '');
        setInterests(p.interests.join(', '));
      })
      .catch((err) => setLoadError(errorMessage(err)));
  }, []);

  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => setProfile((p) => ({ ...(p ?? EMPTY_PROFILE), [key]: value }));

  const save = async () => {
    if (!profile) return;
    setError(null);
    if (profile.dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(profile.dateOfBirth)) {
      setError(t('profileEdit.invalidDateOfBirth'));
      return;
    }
    const incomeValue = income.trim() ? Number(income.replace(/[,\s₹]/g, '')) : null;
    if (incomeValue !== null && (!Number.isInteger(incomeValue) || incomeValue < 0)) {
      setError(t('profileEdit.invalidIncome'));
      return;
    }
    const semesterValue = semester.trim() ? Number(semester) : null;
    if (semesterValue !== null && (!Number.isInteger(semesterValue) || semesterValue < 1 || semesterValue > 12)) {
      setError(t('profileEdit.invalidSemester'));
      return;
    }

    setSaving(true);
    try {
      if (name.trim() && name.trim() !== user?.name) await updateUser({ name: name.trim() });
      await saveProfile({
        ...profile,
        dateOfBirth: nullIfBlank(profile.dateOfBirth ?? ''),
        state: nullIfBlank(profile.state ?? ''),
        institution: nullIfBlank(profile.institution ?? ''),
        currentCourse: nullIfBlank(profile.currentCourse ?? ''),
        goals: nullIfBlank(profile.goals ?? ''),
        annualFamilyIncome: incomeValue,
        semester: semesterValue,
        interests: interests.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20),
      });
      goBackOr('/profile');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => goBackOr('/profile')}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{t('profileEdit.title')}</Text>
      </View>

      {!profile ? (
        <View style={styles.center}>
          {loadError ? (
            <Text style={styles.hint}>{loadError} {t('profileEdit.onlineRequired')}</Text>
          ) : (
            <ActivityIndicator color="#315C43" />
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Field label={t('auth.fullName')}>
            <TextInput style={styles.input} value={name} onChangeText={setName} autoCapitalize="words" />
          </Field>

          <Text style={styles.section}>{t('profileEdit.education')}</Text>
          <Field label={t('profileEdit.educationLevel')}>
            <Chips options={LEVELS} value={profile.educationLevel} onChange={(v) => set('educationLevel', v)} />
          </Field>
          <Field label={t('profileEdit.institution')}>
            <TextInput style={styles.input} value={profile.institution ?? ''} onChangeText={(v) => set('institution', v)} />
          </Field>
          <Field label={t('profileEdit.courseAndSemester')}>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.flex]}
                value={profile.currentCourse ?? ''}
                onChangeText={(v) => set('currentCourse', v)}
                placeholder={t('profileEdit.coursePlaceholder')}
                placeholderTextColor="#9AA39C"
              />
              <TextInput
                style={[styles.input, styles.semester]}
                value={semester}
                onChangeText={setSemester}
                keyboardType="number-pad"
                placeholder={t('profileEdit.semesterPlaceholder')}
                placeholderTextColor="#9AA39C"
                maxLength={2}
              />
            </View>
          </Field>
          <Field label={t('profileEdit.interests')} hint={t('profileEdit.interestsHint')}>
            <TextInput style={styles.input} value={interests} onChangeText={setInterests} autoCapitalize="none" />
          </Field>

          <Text style={styles.section}>{t('profileEdit.scholarshipMatching')}</Text>
          <Field label={t('profileEdit.dateOfBirth')} hint={t('profileEdit.dateFormatHint')}>
            <TextInput
              style={styles.input}
              value={profile.dateOfBirth ?? ''}
              onChangeText={(v) => set('dateOfBirth', v)}
              placeholder={t('profileEdit.datePlaceholder')}
              placeholderTextColor="#9AA39C"
              keyboardType="numbers-and-punctuation"
              maxLength={10}
            />
          </Field>
          <Field label={t('profileEdit.gender')}>
            <Chips options={GENDERS} value={profile.gender} onChange={(v) => set('gender', v)} />
          </Field>
          <Field label={t('profileEdit.state')}>
            <TextInput style={styles.input} value={profile.state ?? ''} onChangeText={(v) => set('state', v)} placeholder={t('profileEdit.statePlaceholder')} placeholderTextColor="#9AA39C" />
          </Field>
          <Field label={t('profileEdit.category')}>
            <Chips options={CATEGORIES} value={profile.category} onChange={(v) => set('category', v)} />
          </Field>
          <Field label={t('profileEdit.familyIncome')}>
            <TextInput style={styles.input} value={income} onChangeText={setIncome} keyboardType="number-pad" placeholder={t('profileEdit.incomePlaceholder')} placeholderTextColor="#9AA39C" />
          </Field>
          <Field label={t('profileEdit.personWithDisability')}>
            <Chips options={PWD} value={profile.isPwd} onChange={(v) => set('isPwd', v)} />
          </Field>

          <View style={styles.consent}>
            <View style={styles.flex}>
              <Text style={styles.consentTitle}>{t('profileEdit.useDetailsForMatching')}</Text>
              <Text style={styles.hint}>
                {t('profileEdit.sensitiveDetailsNotice')}
              </Text>
            </View>
            <Switch value={profile.dataConsent} onValueChange={(v) => set('dataConsent', v)} trackColor={{ true: '#7FB08C' }} thumbColor={profile.dataConsent ? '#315C43' : undefined} />
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable style={[styles.saveButton, saving && styles.saving]} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>{t('common.save')}</Text>}
          </Pressable>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F6F0' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  backButton: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center',
    justifyContent: 'center', marginRight: 12, borderWidth: 1, borderColor: '#E8E3D9',
  },
  backText: { fontSize: 26, lineHeight: 28, color: '#315C43' },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#173C31' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  section: { fontSize: 16, fontWeight: '800', color: '#29392C', marginTop: 18, marginBottom: 6 },
  field: { marginTop: 12 },
  label: { fontSize: 13, fontWeight: '600', color: '#34443B', marginBottom: 6 },
  hint: { fontSize: 11, lineHeight: 16, color: '#7A817A', marginBottom: 6 },
  input: {
    height: 48, borderWidth: 1, borderColor: '#D8DDD8', borderRadius: 12, backgroundColor: '#FFFFFF',
    paddingHorizontal: 14, fontSize: 14, color: '#26352B',
  },
  row: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  semester: { width: 72 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: '#D8DDD8', backgroundColor: '#FFFFFF' },
  chipActive: { backgroundColor: '#315C43', borderColor: '#315C43' },
  chipText: { fontSize: 13, color: '#34443B' },
  chipTextActive: { color: '#FFFFFF', fontWeight: '600' },
  consent: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20, padding: 14,
    borderRadius: 14, backgroundColor: '#EEF4EE',
  },
  consentTitle: { fontSize: 13, fontWeight: '700', color: '#29392C', marginBottom: 4 },
  error: { color: '#B3261E', fontSize: 13, lineHeight: 18, marginTop: 14 },
  saveButton: { height: 52, borderRadius: 14, backgroundColor: '#315C43', alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  saving: { opacity: 0.7 },
  saveText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
