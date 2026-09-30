import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type DashboardProps = {
  onMyCourses: () => void;
  onBack: () => void;
};

export default function Dashboard({
  onMyCourses,
  onBack,
}: DashboardProps) {
  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>

        <Pressable
          style={styles.profileCircle}
          onPress={onBack}
        >
          <Text style={styles.profileEmoji}>
            👤
          </Text>
        </Pressable>

        <View style={styles.headerText}>
          <Text style={styles.greeting}>
            Hello 👋
          </Text>

          <Text style={styles.subtitle}>
            Keep learning, keep growing.
          </Text>
        </View>

        <View style={styles.notification}>
          <Text style={styles.notificationIcon}>
            🔔
          </Text>

          <View style={styles.notificationDot} />
        </View>

      </View>

      {/* Search */}
      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>
          ⌕
        </Text>

        <Text style={styles.searchText}>
          Search courses, topics...
        </Text>
      </View>

      {/* Feature Grid */}
      <View style={styles.grid}>

        <Pressable
          style={[styles.card, styles.green]}
          onPress={onMyCourses}
        >
          <View style={styles.iconBox}>
            <Text style={styles.icon}>
              📖
            </Text>
          </View>

          <Text style={styles.cardTitle}>
            My Courses
          </Text>

          <Text style={styles.cardSubtitle}>
            Download & learn offline
          </Text>
        </Pressable>

        <Pressable
          style={[styles.card, styles.blue]}
        >
          <View style={styles.iconBox}>
            <Text style={styles.icon}>
              🤖
            </Text>
          </View>

          <Text style={styles.cardTitle}>
            AI Doubt Assistant
          </Text>

          <Text style={styles.cardSubtitle}>
            Ask in Hindi or English
          </Text>
        </Pressable>

        <Pressable
          style={[styles.card, styles.yellow]}
        >
          <View style={styles.iconBox}>
            <Text style={styles.icon}>
              🎓
            </Text>
          </View>

          <Text style={styles.cardTitle}>
            Scholarships
          </Text>

          <Text style={styles.cardSubtitle}>
            Find opportunities
          </Text>
        </Pressable>

        <Pressable
          style={[styles.card, styles.purple]}
        >
          <View style={styles.iconBox}>
            <Text style={styles.icon}>
              📊
            </Text>
          </View>

          <Text style={styles.cardTitle}>
            Career Guidance
          </Text>

          <Text style={styles.cardSubtitle}>
            Plan your future
          </Text>
        </Pressable>

      </View>

      {/* Continue Learning */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          Continue Learning
        </Text>

        <Pressable onPress={onMyCourses}>
          <Text style={styles.seeAll}>
            See all
          </Text>
        </Pressable>
      </View>

      <Pressable
        style={styles.learningCard}
        onPress={onMyCourses}
      >

        <View style={styles.learningIcon}>
          <Text style={styles.learningEmoji}>
            🎁
          </Text>
        </View>

        <View style={styles.learningContent}>
          <Text style={styles.learningTitle}>
            Starter Bundle
          </Text>

          <Text style={styles.learningSubtitle}>
            Explore sample courses and lessons
          </Text>

          <View style={styles.progressBackground}>
            <View style={styles.progressFill} />
          </View>
        </View>

        <View style={styles.playButton}>
          <Text style={styles.playText}>
            ▶
          </Text>
        </View>

      </Pressable>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>

        <View style={styles.navItem}>
          <Text style={styles.activeIcon}>
            ⌂
          </Text>
          <Text style={styles.activeText}>
            Home
          </Text>
        </View>

        <Pressable
          style={styles.navItem}
          onPress={onMyCourses}
        >
          <Text style={styles.navIcon}>
            ▣
          </Text>
          <Text style={styles.navText}>
            Courses
          </Text>
        </Pressable>

        <View style={styles.navItem}>
          <Text style={styles.navIcon}>
            ◉
          </Text>
          <Text style={styles.navText}>
            AI
          </Text>
        </View>

        <View style={styles.navItem}>
          <Text style={styles.navIcon}>
            🎓
          </Text>
          <Text style={styles.navText}>
            Scholarships
          </Text>
        </View>

        <View style={styles.navItem}>
          <Text style={styles.navIcon}>
            ◯
          </Text>
          <Text style={styles.navText}>
            Profile
          </Text>
        </View>

      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F6F0',
    paddingHorizontal: 18,
    paddingTop: 42,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  profileCircle: {
    width: 47,
    height: 47,
    borderRadius: 24,
    backgroundColor: '#E4EFE3',
    alignItems: 'center',
    justifyContent: 'center',
  },

  profileEmoji: {
    fontSize: 23,
  },

  headerText: {
    flex: 1,
    marginLeft: 11,
  },

  greeting: {
    fontSize: 20,
    fontWeight: '700',
    color: '#173C31',
  },

  subtitle: {
    marginTop: 3,
    fontSize: 10,
    color: '#7A837D',
  },

  notification: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  notificationIcon: {
    fontSize: 18,
  },

  notificationDot: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#D94C4C',
    top: 7,
    right: 8,
  },

  searchBox: {
    height: 43,
    marginTop: 15,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E6E1',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
  },

  searchIcon: {
    fontSize: 22,
    color: '#738078',
  },

  searchText: {
    marginLeft: 8,
    fontSize: 11,
    color: '#9AA19C',
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 14,
  },

  card: {
    width: '48.5%',
    minHeight: 105,
    borderRadius: 15,
    padding: 11,
    marginBottom: 9,
  },

  green: {
    backgroundColor: '#DDF1E3',
  },

  blue: {
    backgroundColor: '#E2EEFC',
  },

  yellow: {
    backgroundColor: '#FFF0D0',
  },

  purple: {
    backgroundColor: '#EEE5FC',
  },

  iconBox: {
    width: 35,
    height: 35,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  icon: {
    fontSize: 19,
  },

  cardTitle: {
    marginTop: 7,
    fontSize: 12,
    fontWeight: '700',
    color: '#26382C',
  },

  cardSubtitle: {
    marginTop: 2,
    fontSize: 8.5,
    color: '#6E7972',
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 7,
    marginBottom: 8,
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#243A2C',
  },

  seeAll: {
    fontSize: 10,
    fontWeight: '600',
    color: '#4C8059',
  },

  learningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#E1E5E0',
    padding: 11,
  },

  learningIcon: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: '#E5F1E4',
    alignItems: 'center',
    justifyContent: 'center',
  },

  learningEmoji: {
    fontSize: 25,
  },

  learningContent: {
    flex: 1,
    marginLeft: 10,
  },

  learningTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#26382C',
  },

  learningSubtitle: {
    marginTop: 3,
    fontSize: 9,
    color: '#7B857E',
  },

  progressBackground: {
    height: 5,
    marginTop: 7,
    borderRadius: 3,
    backgroundColor: '#E5EAE5',
  },

  progressFill: {
    width: '0%',
    height: 5,
    borderRadius: 3,
    backgroundColor: '#4D9562',
  },

  playButton: {
    width: 35,
    height: 35,
    borderRadius: 18,
    backgroundColor: '#4D9562',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },

  playText: {
    color: '#FFFFFF',
    fontSize: 12,
  },

  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 68,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E4E7E3',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },

  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 65,
  },

  navIcon: {
    fontSize: 18,
    color: '#7D8780',
  },

  activeIcon: {
    fontSize: 20,
    color: '#3F8A59',
  },

  activeText: {
    marginTop: 3,
    fontSize: 8,
    fontWeight: '700',
    color: '#3F8A59',
  },

  navText: {
    marginTop: 3,
    fontSize: 8,
    color: '#7D8780',
  },
});