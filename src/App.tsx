import React, { useEffect, useState } from 'react';
import { AppShell } from './components/layout/AppShell';
import { LessonPlayer } from './components/lesson/LessonPlayer';
import { AnalyticsView } from './components/views/AnalyticsView';
import { AuthView } from './components/views/AuthView';
import { EnglishHubView } from './components/views/EnglishHubView';
import { EnglishIpaView } from './components/views/EnglishIpaView';
import { EnglishReadingView } from './components/views/EnglishReadingView';
import { HomeDashboardView } from './components/views/HomeDashboardView';
import { JapaneseHubView } from './components/views/JapaneseHubView';
import { JapanesePronunciationView } from './components/views/JapanesePronunciationView';
import { JapaneseReadingView } from './components/views/JapaneseReadingView';
import { NotesAndAIView } from './components/views/NotesAndAIView';
import { PracticeHubView } from './components/views/PracticeHubView';
import { RoadmapView } from './components/views/RoadmapView';
import { SettingsView } from './components/views/SettingsView';
import { VocabularyView } from './components/views/VocabularyView';
import { LearningProvider, useLearning } from './context/LearningContext';
import { SyncStatus } from './components/common/SyncStatus';
import { Language, LessonData, NavSection } from './types';
import { AuthUserSession, getAuthSession, logoutAuthSession } from './utils/auth';

function MainApp({ session, onLogout }: { session: AuthUserSession; onLogout: () => Promise<void> }) {
  const { flushProgress } = useLearning();
  const [activeLanguage, setActiveLanguage] = useState<Language>(session.preferredLanguage);
  const [activeNav, setActiveNav] = useState<NavSection>('home');
  const [jpSubTab, setJpSubTab] = useState<string>('kana');
  const [activeLesson, setActiveLesson] = useState<LessonData | null>(null);
  const handleLogout = async () => { await flushProgress(); await onLogout(); };

  const handleSwitchLanguage = (lang: Language) => {
    setActiveLanguage(lang);
    setActiveLesson(null);
    // If user is on language-specific hub of the other language, redirect cleanly to matching hub
    if (
      lang === 'en' &&
      (activeNav === 'japanese' ||
        activeNav === 'japanese_pronunciation' ||
        activeNav === 'japanese_reading')
    ) {
      setActiveNav('english');
    } else if (
      lang === 'jp' &&
      (activeNav === 'english' || activeNav === 'english_reading' || activeNav === 'english_ipa')
    ) {
      setActiveNav('japanese');
    }
  };

  const handleNavigate = (nav: NavSection, subTab?: string) => {
    setActiveLesson(null);
    if (nav === 'english' || nav === 'english_reading' || nav === 'english_ipa') {
      setActiveLanguage('en');
    }
    if (nav === 'japanese' || nav === 'japanese_pronunciation' || nav === 'japanese_reading') {
      setActiveLanguage('jp');
      if (nav === 'japanese' && subTab) setJpSubTab(subTab);
    }
    setActiveNav(nav);
  };

  const handleStartLesson = (lesson: LessonData) => {
    setActiveLanguage(lesson.language);
    setActiveLesson(lesson);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <AppShell
      activeLanguage={activeLanguage}
      onSwitchLanguage={handleSwitchLanguage}
      activeNav={activeNav}
      onNavigate={handleNavigate}
      onStartLesson={handleStartLesson}
      authUser={session}
      onLogout={handleLogout}
    >
      <SyncStatus />
      {activeLesson ? (
        <LessonPlayer
          lesson={activeLesson}
          onExit={() => {
            setActiveLanguage(activeLesson.language);
            setActiveLesson(null);
            setActiveNav('roadmap');
          }}
          onOpenVocabulary={() => {
            setActiveLanguage(activeLesson.language);
            setActiveLesson(null);
            setActiveNav('vocabulary');
          }}
        />
      ) : (
        <>
          {activeNav === 'home' && (
            <HomeDashboardView
              activeLanguage={activeLanguage}
              onSwitchLanguage={handleSwitchLanguage}
              onNavigate={handleNavigate}
              onStartLesson={handleStartLesson}
            />
          )}
          {activeNav === 'roadmap' && (
            <RoadmapView
              activeLanguage={activeLanguage}
              onStartLesson={handleStartLesson}
              onNavigate={handleNavigate}
            />
          )}
          {activeNav === 'english' && <EnglishHubView onStartLesson={handleStartLesson} />}
          {activeNav === 'english_ipa' && <EnglishIpaView />}
          {activeNav === 'english_reading' && <EnglishReadingView />}
          {activeNav === 'japanese' && (
            <JapaneseHubView
              key={jpSubTab}
              initialSubTab={jpSubTab}
              onStartLesson={handleStartLesson}
            />
          )}
          {activeNav === 'japanese_pronunciation' && <JapanesePronunciationView />}
          {activeNav === 'japanese_reading' && <JapaneseReadingView />}
          {activeNav === 'vocabulary' && <VocabularyView activeLanguage={activeLanguage} />}
          {activeNav === 'practice' && <PracticeHubView activeLanguage={activeLanguage} />}
          {activeNav === 'analytics' && (
            <AnalyticsView activeLanguage={activeLanguage} onStartLesson={handleStartLesson} />
          )}
          {activeNav === 'notes' && <NotesAndAIView activeLanguage={activeLanguage} />}
          {activeNav === 'settings' && <SettingsView />}
        </>
      )}
    </AppShell>
  );
}

export function App() {
  const [session, setSession] = useState<AuthUserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const restoreSession = async () => {
    setLoading(true);
    try { setSession(await getAuthSession()); setAuthError(''); }
    catch { setAuthError('Không kiểm tra được phiên đăng nhập. Vui lòng thử lại.'); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    void restoreSession();
    const expired = () => { setSession(null); setAuthError('Phiên đăng nhập đã hết hạn. Tiến độ chưa lưu vẫn còn trên thiết bị.'); };
    window.addEventListener('manabi:session-expired', expired);
    return () => window.removeEventListener('manabi:session-expired', expired);
  }, []);
  const logout = async () => {
    try { await logoutAuthSession(session?.isGuest); setSession(null); setAuthError(''); }
    catch { setAuthError('Đăng xuất chưa thành công. Vui lòng thử lại khi có kết nối.'); }
  };
  if (loading) return <div className="min-h-screen grid place-items-center bg-[#F6F6F4]" role="status">Đang kiểm tra đăng nhập…</div>;
  return <>
    {authError && <div role="alert" className="bg-amber-100 p-3 text-sm">{authError} <button className="underline" onClick={() => void restoreSession()}>Thử lại</button></div>}
    {session ? <LearningProvider key={session.userId} session={session} onLogout={() => void logout()}>
      <MainApp session={session} onLogout={logout} />
    </LearningProvider> : <AuthView onAuthenticated={next => { setSession(next); setAuthError(''); }} />}
  </>;
}

export default App;
