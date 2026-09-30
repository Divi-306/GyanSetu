import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';

type ProfileProps = {
  name?: string;
  email?: string;
  onBack: () => void;
};

export default function Profile({
  name,
  email,
  onBack,
}: ProfileProps) {
  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={onBack}
          >
            <Text style={styles.backText}>
              ‹
            </Text>
          </TouchableOpacity>

          <Text style={styles.headerTitle}>
            Profile
          </Text>

          <View style={{ width: 42 }} />
        </View>

        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              👤
            </Text>
          </View>

          <View style={styles.profileInfo}>
            <Text style={styles.name}>
              {name || 'Student'}
            </Text>

            <Text style={styles.email}>
              {email || 'Offline learner'}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.editButton}
          >
            <Text style={styles.editText}>
              Edit
            </Text>
          </TouchableOpacity>
        </View>

        {/* Learning Overview */}
        <Text style={styles.sectionTitle}>
          Learning Overview
        </Text>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>
              0
            </Text>

            <Text style={styles.statLabel}>
              Courses
            </Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statNumber}>
              0
            </Text>

            <Text style={styles.statLabel}>
              Completed
            </Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statNumber}>
              0%
            </Text>

            <Text style={styles.statLabel}>
              Progress
            </Text>
          </View>
        </View>

        {/* Offline Learning */}
        <Text style={styles.sectionTitle}>
          Offline Learning
        </Text>

        <View style={styles.infoCard}>
          <View style={styles.infoIcon}>
            <Text>📥</Text>
          </View>

          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>
              Downloaded Learning Packs
            </Text>

            <Text style={styles.infoSubtitle}>
              Manage your offline courses and lessons
            </Text>
          </View>

          <Text style={styles.arrow}>
            ›
          </Text>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoIcon}>
            <Text>💾</Text>
          </View>

          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>
              Device Storage
            </Text>

            <Text style={styles.infoSubtitle}>
              Check storage used by GyanSetu
            </Text>
          </View>

          <Text style={styles.arrow}>
            ›
          </Text>
        </View>

        {/* Sync */}
        <Text style={styles.sectionTitle}>
          Sync & Connectivity
        </Text>

        <View style={styles.syncCard}>
          <View style={styles.syncIcon}>
            <Text>☁️</Text>
          </View>

          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>
              Sync Status
            </Text>

            <Text style={styles.syncStatus}>
              ● All changes saved locally
            </Text>

            <Text style={styles.infoSubtitle}>
              Your progress will sync when internet
              connection is available.
            </Text>
          </View>
        </View>

        {/* Preferences */}
        <Text style={styles.sectionTitle}>
          Preferences
        </Text>

        <View style={styles.infoCard}>
          <View style={styles.infoIcon}>
            <Text>🌐</Text>
          </View>

          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>
              Language
            </Text>

            <Text style={styles.infoSubtitle}>
              English
            </Text>
          </View>

          <Text style={styles.arrow}>
            ›
          </Text>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoIcon}>
            <Text>🔔</Text>
          </View>

          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>
              Notifications
            </Text>

            <Text style={styles.infoSubtitle}>
              Learning reminders and updates
            </Text>
          </View>

          <Text style={styles.arrow}>
            ›
          </Text>
        </View>

        {/* Account */}
        <Text style={styles.sectionTitle}>
          Account
        </Text>

        <TouchableOpacity
          style={styles.logoutButton}
        >
          <Text style={styles.logoutText}>
            Log Out
          </Text>
        </TouchableOpacity>

        <Text style={styles.version}>
          GyanSetu • Version 1.0.0
        </Text>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFDF8',
  },

  content: {
    padding: 20,
    paddingBottom: 40,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#F2F4EC',
    alignItems: 'center',
    justifyContent: 'center',
  },

  backText: {
    fontSize: 32,
    lineHeight: 34,
    color: '#315C43',
  },

  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#20352A',
  },

  profileCard: {
    backgroundColor: '#F3F7EF',
    borderRadius: 22,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 28,
  },

  avatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#DCE9D8',
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarText: {
    fontSize: 29,
  },

  profileInfo: {
    flex: 1,
    marginLeft: 14,
  },

  name: {
    fontSize: 18,
    fontWeight: '700',
    color: '#20352A',
    marginBottom: 4,
  },

  email: {
    fontSize: 13,
    color: '#718078',
  },

  editButton: {
    backgroundColor: '#315C43',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 12,
  },

  editText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#20352A',
    marginBottom: 12,
    marginTop: 4,
  },

  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 26,
  },

  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 17,
    paddingVertical: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8EDE4',
  },

  statNumber: {
    fontSize: 21,
    fontWeight: '700',
    color: '#315C43',
    marginBottom: 5,
  },

  statLabel: {
    fontSize: 11,
    color: '#7B857E',
  },

  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 17,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8EDE4',
    marginBottom: 11,
  },

  infoIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#F0F5EC',
    alignItems: 'center',
    justifyContent: 'center',
  },

  infoContent: {
    flex: 1,
    marginLeft: 13,
  },

  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#283B30',
    marginBottom: 4,
  },

  infoSubtitle: {
    fontSize: 11,
    lineHeight: 17,
    color: '#7A847D',
  },

  arrow: {
    fontSize: 25,
    color: '#9AA39C',
    marginLeft: 8,
  },

  syncCard: {
    backgroundColor: '#F3F7EF',
    borderRadius: 17,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 26,
  },

  syncIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#DCE9D8',
    alignItems: 'center',
    justifyContent: 'center',
  },

  syncStatus: {
    fontSize: 11,
    color: '#4D805D',
    marginBottom: 4,
  },

  logoutButton: {
    height: 50,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#D7B9B9',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },

  logoutText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#A05252',
  },

  version: {
    textAlign: 'center',
    fontSize: 11,
    color: '#A0A7A1',
    marginTop: 22,
  },
});