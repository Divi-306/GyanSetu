import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';

import EntryHome from './app/home';
import Dashboard from './app/dashboard';
import Courses from './app/courses';
import StarterBundle from './app/starter-bundle';
import CourseDetails from './app/course-details';
import LessonViewer from './app/lesson-viewer';
import Login from './app/login';
import AI from './app/ai';
import Scholarships from './app/scholarships';
import OfflineQuiz from './app/offline-quiz';
import Profile from './app/profile';

import { initializeDatabase } from './db/database';

type Screen =
  | 'entry'
  | 'dashboard'
  | 'courses'
  | 'starterBundle'
  | 'courseDetails'
  | 'lessonViewer'
  | 'login'
  | 'quiz'
  | 'ai'
  | 'scholarships'
  | 'profile';

type User = {
  name: string;
  email: string;
};

function ScreenWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <View style={styles.screenWrapper}>
      {children}
    </View>
  );
}

export default function App() {
  const [screen, setScreen] =
    useState<Screen>('entry');

  const [user, setUser] = useState<User | null>(
    null
  );

  const [selectedCourse, setSelectedCourse] =
    useState('DSA');

  const [selectedLesson, setSelectedLesson] =
    useState('lesson-1');

  const [selectedLessonIndex, setSelectedLessonIndex] =
    useState(0);

  const lessons = [
    'lesson-1',
    'lesson-2',
    'lesson-3',
    'lesson-4',
    'lesson-5',
  ];

  React.useEffect(() => {
    initializeDatabase();
  }, []);

  // --------------------------------------------------
  // ENTRY
  // --------------------------------------------------

  if (screen === 'entry') {
    return (
      <ScreenWrapper>
        <EntryHome
          onLogin={() =>
            setScreen('login')
          }

          onSignUp={() =>
            setScreen('login')
          }

          onContinueOffline={() =>
            setScreen('dashboard')
          }
        />
      </ScreenWrapper>
    );
  }

  // --------------------------------------------------
  // LOGIN
  // --------------------------------------------------

  if (screen === 'login') {
    return (
      <ScreenWrapper>
        <Login
          onBack={() =>
            setScreen('entry')
          }

          onSignUp={() => {}}

          onLoginSuccess={(loggedInUser) => {
            setUser(loggedInUser);
            setScreen('dashboard');
          }}
        />
      </ScreenWrapper>
    );
  }

  // --------------------------------------------------
  // DASHBOARD
  // --------------------------------------------------

  if (screen === 'dashboard') {
    return (
      <ScreenWrapper>
        <Dashboard
          userName={user?.name}

          onMyCourses={() =>
            setScreen('courses')
          }

          onTakeQuiz={() =>
            setScreen('quiz')
          }

          onAskAI={() =>
            setScreen('ai')
          }

          onScholarships={() =>
            setScreen('scholarships')
          }

          onContinueLearning={() => {
            setSelectedCourse('DSA');
            setScreen('courseDetails');
          }}

          onProfile={() =>
            setScreen('profile')
          }

          onBack={() =>
            setScreen('entry')
          }
        />
      </ScreenWrapper>
    );
  }

  // --------------------------------------------------
  // PROFILE
  // --------------------------------------------------

  if (screen === 'profile') {
    return (
      <ScreenWrapper>
        <Profile
          name={user?.name}
          email={user?.email}
          onBack={() =>
            setScreen('dashboard')
          }
        />
      </ScreenWrapper>
    );
  }

  // --------------------------------------------------
  // COURSES
  // --------------------------------------------------

  if (screen === 'courses') {
    return (
      <ScreenWrapper>
        <Courses
          onBack={() =>
            setScreen('dashboard')
          }

          onCoursePress={(course) => {
            if (
              course.id === 'starter-bundle'
            ) {
              setScreen('starterBundle');
            }
          }}
        />
      </ScreenWrapper>
    );
  }

  // --------------------------------------------------
  // STARTER BUNDLE
  // --------------------------------------------------

  if (screen === 'starterBundle') {
    return (
      <ScreenWrapper>
        <StarterBundle
          onBack={() =>
            setScreen('courses')
          }

          onCoursePress={(course) => {
            setSelectedCourse(course.name);
            setScreen('courseDetails');
          }}
        />
      </ScreenWrapper>
    );
  }

  // --------------------------------------------------
  // COURSE DETAILS
  // --------------------------------------------------

  if (screen === 'courseDetails') {
    return (
      <ScreenWrapper>
        <CourseDetails
          courseName={selectedCourse}

          onBack={() =>
            setScreen('starterBundle')
          }

          onLessonPress={(lessonId) => {
            const index =
              lessons.indexOf(lessonId);

            setSelectedLesson(lessonId);

            if (index >= 0) {
              setSelectedLessonIndex(index);
            } else {
              setSelectedLessonIndex(0);
            }

            setScreen('lessonViewer');
          }}
        />
      </ScreenWrapper>
    );
  }

  // --------------------------------------------------
  // LESSON VIEWER
  // --------------------------------------------------

  if (screen === 'lessonViewer') {
    return (
      <ScreenWrapper>
        <LessonViewer
          courseName={selectedCourse}
          lessonId={selectedLesson}

          onBack={() =>
            setScreen('courseDetails')
          }

          onPrevious={() => {
            if (selectedLessonIndex > 0) {
              const previousIndex =
                selectedLessonIndex - 1;

              setSelectedLessonIndex(
                previousIndex
              );

              setSelectedLesson(
                lessons[previousIndex]
              );
            }
          }}

          onNext={() => {
            if (
              selectedLessonIndex <
              lessons.length - 1
            ) {
              const nextIndex =
                selectedLessonIndex + 1;

              setSelectedLessonIndex(
                nextIndex
              );

              setSelectedLesson(
                lessons[nextIndex]
              );
            }
          }}

          onAskAI={() =>
            setScreen('ai')
          }
        />
      </ScreenWrapper>
    );
  }

  // --------------------------------------------------
  // AI
  // --------------------------------------------------

  if (screen === 'ai') {
    return (
      <ScreenWrapper>
        <AI
          onBack={() =>
            setScreen('dashboard')
          }
        />
      </ScreenWrapper>
    );
  }

  // --------------------------------------------------
  // QUIZ
  // --------------------------------------------------

  if (screen === 'quiz') {
    return (
      <ScreenWrapper>
        <OfflineQuiz
          onBack={() =>
            setScreen('dashboard')
          }
        />
      </ScreenWrapper>
    );
  }

  // --------------------------------------------------
  // SCHOLARSHIPS
  // --------------------------------------------------

  if (screen === 'scholarships') {
    return (
      <ScreenWrapper>
        <Scholarships
          onBack={() =>
            setScreen('dashboard')
          }
        />
      </ScreenWrapper>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
    paddingTop: 15,
    paddingBottom: 15,
  },
});