import { useState, useEffect } from 'react';
import { User } from '../types';
import { googleTasksDirect } from '../services/googleTasksDirect';
import { useTranslation } from 'react-i18next';

export const useGoogleTasksSync = (addToast: (type: 'success' | 'error' | 'info', text: string) => void, loadBoard: () => Promise<void>) => {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | undefined>(undefined);
  const [isSessionPaused, setIsSessionPaused] = useState(googleTasksDirect.getIsSessionPaused());

  useEffect(() => {
    googleTasksDirect.onAuthStateChanged = (state) => {
      setIsSessionPaused(state.isPaused);
      if (!state.isConnected) {
        setUser({
          userId: 'demo-user',
          email: 'demo@kanban.local',
          name: 'Alexis (Portfolio Demo)',
          avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=AlexisPortfolio',
          isDemo: true,
        });
      }
    };
  }, []);

  useEffect(() => {
    const initApp = async () => {
      if (googleTasksDirect.isConnected()) {
        const profile = await googleTasksDirect.fetchUserProfile();
        if (profile) {
          setUser({
            userId: 'google-user',
            email: profile.email,
            name: profile.name,
            avatarUrl: profile.picture,
            isDemo: false,
          });
        }
      } else {
        googleTasksDirect.setMockMode(true);
        setUser({
          userId: 'demo-user',
          email: 'demo@kanban.local',
          name: 'Alexis (Portfolio Demo)',
          avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=AlexisPortfolio',
          isDemo: true,
        });
      }
      await loadBoard();
    };
    initApp();
  }, [loadBoard]);

  const handleLoginGoogle = async () => {
    try {
      await googleTasksDirect.requestGoogleToken();
      setIsSessionPaused(false);
      const profile = await googleTasksDirect.fetchUserProfile();
      if (profile) {
        setUser({
          userId: 'google-user',
          email: profile.email,
          name: profile.name,
          avatarUrl: profile.picture,
          isDemo: false,
        });
      }
      addToast('success', t('toasts.loginSuccess'));
      await loadBoard();
    } catch (err: any) {
      addToast('error', t('toasts.loginError', { message: err.message || 'Error al conectar con Google.' }));
    }
  };

  const handleRenewSession = async () => {
    try {
      await googleTasksDirect.requestGoogleToken();
      setIsSessionPaused(false);
      const profile = await googleTasksDirect.fetchUserProfile();
      if (profile) {
        setUser({
          userId: 'google-user',
          email: profile.email,
          name: profile.name,
          avatarUrl: profile.picture,
          isDemo: false,
        });
      }
      addToast('success', t('toasts.renewSuccess'));
      await loadBoard();
    } catch (err: any) {
      addToast('error', t('toasts.renewError', { message: err.message }));
    }
  };

  const handleLogout = () => {
    googleTasksDirect.logout();
    setIsSessionPaused(false);
    setUser({
      userId: 'demo-user',
      email: 'demo@kanban.local',
      name: 'Alexis (Portfolio Demo)',
      avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=AlexisPortfolio',
      isDemo: true,
    });
    loadBoard();
    addToast('info', t('toasts.logout'));
  };

  return {
    user,
    isSessionPaused,
    handleLoginGoogle,
    handleRenewSession,
    handleLogout
  };
};