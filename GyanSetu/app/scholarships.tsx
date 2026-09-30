import React, { useMemo, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type ScholarshipCategory = 'Government' | 'State' | 'Private';

type Scholarship = {
  id: string;
  name: string;
  description: string;
  provider: string;
  category: ScholarshipCategory;
  deadline: string;
  icon: string;
};

type ScholarshipsProps = {
  onBack: () => void;
};

const scholarships: Scholarship[] = [
  {
    id: '1',
    name: 'National Scholarship Portal',
    description: 'For UG/PG Students',
    provider: 'Government of India',
    category: 'Government',
    deadline: '30 Nov 2026',
    icon: '🎓',
  },
  {
    id: '2',
    name: 'State Merit Scholarship',
    description: 'For eligible students',
    provider: 'State Government',
    category: 'State',
    deadline: '15 Dec 2026',
    icon: '🏛️',
  },
  {
    id: '3',
    name: 'ST/SC Scholarship',
    description: 'For eligible students',
    provider: 'Government Scheme',
    category: 'Government',
    deadline: '20 Dec 2026',
    icon: '📚',
  },
  {
    id: '4',
    name: 'Girl Student Scholarship',
    description: 'For higher education',
    provider: 'Education Foundation',
    category: 'Private',
    deadline: '31 Dec 2026',
    icon: '🌸',
  },
  {
    id: '5',
    name: 'Merit Excellence Scholarship',
    description: 'For meritorious students',
    provider: 'Private Foundation',
    category: 'Private',
    deadline: '10 Jan 2027',
    icon: '🏆',
  },
];

export default function Scholarships({
  onBack,
}: ScholarshipsProps) {
  const [activeTab, setActiveTab] = useState('All');
  const [search, setSearch] = useState('');

  const filteredScholarships = useMemo(() => {
    return scholarships.filter((item) => {
      const matchesTab =
        activeTab === 'All' ||
        item.category === activeTab;

      const searchText = search.toLowerCase();

      const matchesSearch =
        item.name.toLowerCase().includes(searchText) ||
        item.description.toLowerCase().includes(searchText) ||
        item.provider.toLowerCase().includes(searchText);

      return matchesTab && matchesSearch;
    });
  }, [activeTab, search]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>

        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={onBack}
            style={styles.backButton}
            hitSlop={10}
          >
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>

          <Text style={styles.headerTitle}>
            Scholarships
          </Text>

          <Pressable style={styles.notificationButton}>
            <Text style={styles.notificationIcon}>🔔</Text>
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >

          {/* Intro */}
          <View style={styles.intro}>
            <Text style={styles.title}>
              Find Scholarships
            </Text>

            <Text style={styles.subtitle}>
              Discover scholarships that match your education goals.
            </Text>
          </View>

          {/* Search */}
          <View style={styles.searchContainer}>
            <Text style={styles.searchIcon}>⌕</Text>

            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search scholarships..."
              placeholderTextColor="#8B928B"
              style={styles.searchInput}
              returnKeyType="search"
            />

            {search.length > 0 && (
              <Pressable
                onPress={() => setSearch('')}
                style={styles.clearButton}
              >
                <Text style={styles.clearText}>×</Text>
              </Pressable>
            )}
          </View>

          {/* Tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsContainer}
          >
            {['All', 'Government', 'State', 'Private'].map(
              (tab) => {
                const isActive = activeTab === tab;

                return (
                  <Pressable
                    key={tab}
                    onPress={() => setActiveTab(tab)}
                    style={[
                      styles.tab,
                      isActive && styles.activeTab,
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        isActive && styles.activeTabText,
                      ]}
                    >
                      {tab}
                    </Text>
                  </Pressable>
                );
              }
            )}
          </ScrollView>

          {/* Results count */}
          <View style={styles.resultHeader}>
            <Text style={styles.resultTitle}>
              Scholarships for you
            </Text>

            <Text style={styles.resultCount}>
              {filteredScholarships.length}
            </Text>
          </View>

          {/* Scholarship Cards */}
          {filteredScholarships.map((scholarship) => (
            <View
              key={scholarship.id}
              style={styles.card}
            >
              <View style={styles.cardTop}>

                <View style={styles.iconBox}>
                  <Text style={styles.cardIcon}>
                    {scholarship.icon}
                  </Text>
                </View>

                <View style={styles.cardTitleArea}>
                  <Text
                    style={styles.cardTitle}
                    numberOfLines={2}
                  >
                    {scholarship.name}
                  </Text>

                  <Text style={styles.cardDescription}>
                    {scholarship.description}
                  </Text>
                </View>

              </View>

              {/* Provider + Category */}
              <View style={styles.metaRow}>
                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryText}>
                    {scholarship.category}
                  </Text>
                </View>

                <Text
                  style={styles.provider}
                  numberOfLines={1}
                >
                  {scholarship.provider}
                </Text>
              </View>

              {/* Bottom */}
              <View style={styles.cardBottom}>

                <View>
                  <Text style={styles.deadlineLabel}>
                    Deadline
                  </Text>

                  <Text style={styles.deadline}>
                    {scholarship.deadline}
                  </Text>
                </View>

                <Pressable
                  onPress={() => {
                    console.log(
                      'Apply pressed:',
                      scholarship.name
                    );
                  }}
                  style={({ pressed }) => [
                    styles.applyButton,
                    pressed && styles.applyButtonPressed,
                  ]}
                >
                  <Text style={styles.applyText}>
                    Apply
                  </Text>
                </Pressable>

              </View>
            </View>
          ))}

          {/* Empty State */}
          {filteredScholarships.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🔎</Text>

              <Text style={styles.emptyTitle}>
                No scholarships found
              </Text>

              <Text style={styles.emptyText}>
                Try a different search or category.
              </Text>
            </View>
          )}

          {/* Info */}
          <View style={styles.infoBox}>
            <Text style={styles.infoIcon}>ⓘ</Text>

            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>
                Scholarship information
              </Text>

              <Text style={styles.infoText}>
                Eligibility and deadlines may change.
                Always verify the details on the official
                scholarship website before applying.
              </Text>
            </View>
          </View>

        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8F6F0',
  },

  container: {
    flex: 1,
    backgroundColor: '#F8F6F0',
  },

  header: {
    height: 64,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7E2',
  },

  backButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },

  backIcon: {
    fontSize: 36,
    lineHeight: 40,
    color: '#26352A',
    fontWeight: '300',
  },

  headerTitle: {
    flex: 1,
    marginLeft: 4,
    fontSize: 21,
    fontWeight: '700',
    color: '#26352A',
  },

  notificationButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },

  notificationIcon: {
    fontSize: 20,
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 30,
  },

  intro: {
    marginBottom: 18,
  },

  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#26352A',
    marginBottom: 5,
  },

  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: '#70786F',
  },

  searchContainer: {
    height: 50,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E5DF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginBottom: 16,
  },

  searchIcon: {
    fontSize: 25,
    color: '#6F796F',
    marginRight: 8,
  },

  searchInput: {
    flex: 1,
    height: '100%',
    fontSize: 14,
    color: '#26352A',
    paddingVertical: 0,
  },

  clearButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF1EC',
  },

  clearText: {
    fontSize: 20,
    lineHeight: 22,
    color: '#687168',
  },

  tabsContainer: {
    gap: 9,
    paddingBottom: 21,
  },

  tab: {
    paddingHorizontal: 18,
    height: 38,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E5DE',
  },

  activeTab: {
    backgroundColor: '#2F6B3D',
    borderColor: '#2F6B3D',
  },

  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#626B63',
  },

  activeTabText: {
    color: '#FFFFFF',
  },

  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },

  resultTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#26352A',
  },

  resultCount: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 7,
    borderRadius: 14,
    textAlign: 'center',
    textAlignVertical: 'center',
    backgroundColor: '#E3EEE4',
    color: '#2F6B3D',
    fontSize: 12,
    fontWeight: '700',
    overflow: 'hidden',
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 13,
    borderWidth: 1,
    borderColor: '#E5E8E3',
  },

  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#EEF4ED',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  cardIcon: {
    fontSize: 23,
  },

  cardTitleArea: {
    flex: 1,
    paddingTop: 1,
  },

  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#26352A',
    lineHeight: 21,
  },

  cardDescription: {
    fontSize: 13,
    color: '#777F78',
    marginTop: 4,
  },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
  },

  categoryBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#F0F4EE',
  },

  categoryText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3C6846',
  },

  provider: {
    flex: 1,
    marginLeft: 9,
    fontSize: 12,
    color: '#858C85',
  },

  cardBottom: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 15,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: '#EEF0ED',
  },

  deadlineLabel: {
    fontSize: 11,
    color: '#8A918B',
    marginBottom: 2,
  },

  deadline: {
    fontSize: 13,
    fontWeight: '600',
    color: '#37443A',
  },

  applyButton: {
    minWidth: 78,
    height: 38,
    paddingHorizontal: 16,
    borderRadius: 11,
    backgroundColor: '#2F6B3D',
    alignItems: 'center',
    justifyContent: 'center',
  },

  applyButtonPressed: {
    opacity: 0.75,
  },

  applyText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },

  emptyIcon: {
    fontSize: 35,
    marginBottom: 10,
  },

  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#344038',
  },

  emptyText: {
    fontSize: 13,
    color: '#818881',
    marginTop: 5,
  },

  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#EEF4EE',
    borderRadius: 15,
    padding: 14,
    marginTop: 5,
  },

  infoIcon: {
    fontSize: 18,
    color: '#3C6846',
    marginRight: 10,
  },

  infoContent: {
    flex: 1,
  },

  infoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#35523B',
    marginBottom: 4,
  },

  infoText: {
    fontSize: 11.5,
    lineHeight: 17,
    color: '#637065',
  },
});