import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export type Course = {
  id: string;
  name: string;
  subtitle: string;
  lessons: number;
  size: string;
  icon: string;
};

type CoursesProps = {
  onBack: () => void;
  onCoursePress: (course: Course) => void;
};

const courses: Course[] = [
  {
    id: 'python',
    name: 'Python Basics',
    subtitle: 'For Beginners',
    lessons: 12,
    size: '180 MB',
    icon: '🐍',
  },
  {
    id: 'dbms',
    name: 'DBMS',
    subtitle: 'Semester 1',
    lessons: 18,
    size: '250 MB',
    icon: '🗄️',
  },
  {
    id: 'cn',
    name: 'Computer Networks',
    subtitle: 'Semester 2',
    lessons: 16,
    size: '320 MB',
    icon: '🌐',
  },
  {
    id: 'os',
    name: 'Operating System',
    subtitle: 'Semester 2',
    lessons: 14,
    size: '280 MB',
    icon: '⚙️',
  },
  {
    id: 'dsa',
    name: 'Data Structures & Algorithms',
    subtitle: 'Semester 2',
    lessons: 14,
    size: '300 MB',
    icon: '🧬',
  },
];

const starterBundle: Course = {
  id: 'starter-bundle',
  name: 'Starter Bundle',
  subtitle: 'Explore courses without an account',
  lessons: 20,
  size: 'Demo',
  icon: '🎁',
};

export default function Courses({
  onBack,
  onCoursePress,
}: CoursesProps) {
  const [activeTab, setActiveTab] =
    useState('All');

  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>

        <Pressable
          style={styles.backButton}
          onPress={onBack}
        >
          <Text style={styles.backArrow}>
            ‹
          </Text>
        </Pressable>

        <Text style={styles.headerTitle}>
          Courses
        </Text>

        <Text style={styles.searchIcon}>
          ⌕
        </Text>

      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >

        {/* Tabs */}
        <View style={styles.tabs}>

          {[
            'All',
            'Downloaded',
            'Available Offline',
          ].map((tab) => (
            <Pressable
              key={tab}
              style={[
                styles.tab,
                activeTab === tab &&
                  styles.activeTab,
              ]}
              onPress={() => setActiveTab(tab)}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === tab &&
                    styles.activeTabText,
                ]}
              >
                {tab}
              </Text>
            </Pressable>
          ))}

        </View>

        {/* Starter Bundle */}
        <Pressable
          style={styles.bundleCard}
          onPress={() =>
            onCoursePress(starterBundle)
          }
        >

          <View style={styles.bundleIcon}>
            <Text style={styles.bundleEmoji}>
              🎁
            </Text>
          </View>

          <View style={styles.bundleContent}>

            <Text style={styles.bundleTitle}>
              Starter Bundle
            </Text>

            <Text style={styles.bundleSubtitle}>
              Explore courses without an account
            </Text>

            <Text style={styles.bundleMeta}>
              5 sample courses • Demo lessons • Demo quizzes
            </Text>

          </View>

          <Text style={styles.arrow}>
            →
          </Text>

        </Pressable>

        {/* Course heading */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            All Courses
          </Text>

          <Text style={styles.count}>
            5 courses
          </Text>
        </View>

        {/* Course list */}
        {courses.map((course) => (
          <Pressable
            key={course.id}
            style={styles.courseCard}
            onPress={() =>
              onCoursePress(course)
            }
          >

            <View style={styles.courseIcon}>
              <Text style={styles.courseEmoji}>
                {course.icon}
              </Text>
            </View>

            <View style={styles.courseContent}>

              <Text style={styles.courseName}>
                {course.name}
              </Text>

              <Text style={styles.courseSubtitle}>
                {course.subtitle}
              </Text>

              <Text style={styles.courseMeta}>
                {course.lessons} lessons • {course.size}
              </Text>

            </View>

            <View style={styles.download}>
              <Text style={styles.downloadText}>
                ↓
              </Text>
            </View>

          </Pressable>
        ))}

        <View style={styles.bottomSpace} />

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F6F0',
  },

  header: {
    height: 78,
    paddingTop: 25,
    paddingHorizontal: 18,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E4E8E3',
  },

  backButton: {
    width: 38,
    height: 38,
    justifyContent: 'center',
  },

  backArrow: {
    fontSize: 32,
    color: '#26382C',
  },

  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: '#1E3227',
  },

  searchIcon: {
    fontSize: 25,
    color: '#34473C',
  },

  content: {
    padding: 17,
  },

  tabs: {
    flexDirection: 'row',
    backgroundColor: '#EDEFEA',
    padding: 3,
    borderRadius: 12,
    marginBottom: 14,
  },

  tab: {
    flex: 1,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },

  activeTab: {
    backgroundColor: '#239653',
  },

  tabText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#68736C',
    textAlign: 'center',
  },

  activeTabText: {
    color: '#FFFFFF',
  },

  bundleCard: {
    minHeight: 92,
    borderRadius: 17,
    backgroundColor: '#E8F4E8',
    borderWidth: 1,
    borderColor: '#CFE3CE',
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
  },

  bundleIcon: {
    width: 55,
    height: 55,
    borderRadius: 16,
    backgroundColor: '#D7EBD5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  bundleEmoji: {
    fontSize: 27,
  },

  bundleContent: {
    flex: 1,
    marginLeft: 12,
  },

  bundleTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#244B32',
  },

  bundleSubtitle: {
    marginTop: 3,
    fontSize: 10,
    color: '#607066',
  },

  bundleMeta: {
    marginTop: 5,
    fontSize: 8,
    color: '#708077',
  },

  arrow: {
    fontSize: 22,
    color: '#4C7958',
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 19,
    marginBottom: 9,
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#26382C',
  },

  count: {
    fontSize: 10,
    color: '#5D7864',
  },

  courseCard: {
    minHeight: 82,
    marginBottom: 10,
    padding: 11,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E6E1',
    flexDirection: 'row',
    alignItems: 'center',
  },

  courseIcon: {
    width: 53,
    height: 53,
    borderRadius: 15,
    backgroundColor: '#EAF4E9',
    alignItems: 'center',
    justifyContent: 'center',
  },

  courseEmoji: {
    fontSize: 27,
  },

  courseContent: {
    flex: 1,
    marginLeft: 12,
  },

  courseName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#26382C',
  },

  courseSubtitle: {
    marginTop: 3,
    fontSize: 10,
    color: '#777F7A',
  },

  courseMeta: {
    marginTop: 5,
    fontSize: 9,
    color: '#7C857F',
  },

  download: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E6F4E7',
    alignItems: 'center',
    justifyContent: 'center',
  },

  downloadText: {
    fontSize: 21,
    color: '#31925A',
  },

  bottomSpace: {
    height: 30,
  },
});