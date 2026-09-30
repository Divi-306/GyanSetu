import React, { useState } from 'react';

import EntryHome from './app/home';
import Dashboard from './app/dashboard';
import Courses from './app/courses';
import StarterBundle from './app/starter-bundle';
import Login from './app/login';

type Screen =
  | 'entry'
  | 'dashboard'
  | 'courses'
  | 'starterBundle'
  | 'login';

export default function App() {
  const [screen, setScreen] = useState<Screen>('entry');

  // ENTRY PAGE
  if (screen === 'entry') {
    return (
      <EntryHome
        onLogin={() => setScreen('login')}
        onSignUp={() => setScreen('login')}
        onContinueOffline={() => setScreen('dashboard')}
      />
    );
  }

  // HOME DASHBOARD
  if (screen === 'dashboard') {
    return (
      <Dashboard
        onMyCourses={() => setScreen('courses')}
        onBack={() => setScreen('entry')}
      />
    );
  }

  // COURSES
  if (screen === 'courses') {
    return (
      <Courses
        onBack={() => setScreen('dashboard')}
        onCoursePress={(course) => {
          if (course.id === 'starter-bundle') {
            setScreen('starterBundle');
          }
        }}
      />
    );
  }

  // STARTER BUNDLE
  if (screen === 'starterBundle') {
    return (
      <StarterBundle
        onBack={() => setScreen('courses')}
        onCoursePress={(course) => {
          console.log('Selected course:', course);
        }}
      />
    );
  }

  // LOGIN
  return (
    <Login
      onBack={() => setScreen('entry')}
      onSignUp={() => setScreen('login')}
    />
  );
}