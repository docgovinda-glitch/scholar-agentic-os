import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { UserProfile, PaperProject, PROFILE_STATE_PREFIX, PROFILES_LIST_KEY, OnboardingStep } from '../types';
import { hashPassword, verifyPassword } from '../utils/crypto';

interface AuthContextProps {
  user: string | null;
  project: PaperProject | null;
  loading: boolean;
  onboardingStep: OnboardingStep;
  setOnboardingStep: (step: OnboardingStep) => void;
  login: (username: string, password: string) => Promise<void>;
  loginDirectly: (username: string, project: PaperProject) => void;
  logout: () => void;
  signup: (partial: Partial<UserProfile>) => Promise<void>;
  activate: (activationKey: string) => Promise<void>;
  setProject: React.Dispatch<React.SetStateAction<PaperProject | null>>;
}

export const AuthContext = createContext<AuthContextProps | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<string | null>(null);
  const [project, setProject] = useState<PaperProject | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [onboardingStep, setOnboardingStepState] = useState<OnboardingStep>("login");

  // Persist onboardingStep to localStorage whenever it changes
  const setOnboardingStep = useCallback((step: OnboardingStep) => {
    setOnboardingStepState(step);
    // Persist into the user's profile if a user is active
    const currentUser = user || localStorage.getItem('phd_active_session_username');
    if (currentUser) {
      try {
        const key = `${PROFILE_STATE_PREFIX}${currentUser}`;
        const raw = localStorage.getItem(key);
        if (raw) {
          const profile = JSON.parse(raw);
          profile.onboardingStep = step;
          localStorage.setItem(key, JSON.stringify(profile));
        }
      } catch (e) {
        console.error('[OnboardingWizard] Failed to persist onboardingStep:', e);
      }
    }
  }, [user]);

  // Resolve the onboarding step for a loaded profile (migration for existing users)
  const resolveOnboardingStep = (profile: UserProfile): OnboardingStep => {
    // If explicitly stored, use it
    if (profile.onboardingStep) return profile.onboardingStep;
    // Migration: existing users who already have AI settings and projects → skip to workshop
    if (profile.projectState?.aiSettings && profile.status === 'approved') {
      return "workshop";
    }
    // Otherwise start at ai-setup (login just completed)
    return "ai-setup";
  };

  // Initialize from localStorage if available
  useEffect(() => {
    const storedUser = localStorage.getItem('phd_active_session_username');
    if (storedUser) {
      const stateStr = localStorage.getItem(`phd_profile_state_${storedUser}`);
      if (stateStr) {
        try {
          const profile = JSON.parse(stateStr) as UserProfile;
          setUser(storedUser);
          setProject(profile.projectState);
          setOnboardingStepState(resolveOnboardingStep(profile));
        } catch (e) {
          console.error('Failed to parse stored profile', e);
        }
      }
    }
  }, []);

  const login = async (username: string, password: string) => {
    setLoading(true);
    const key = `${PROFILE_STATE_PREFIX}${username}`;
    const saved = localStorage.getItem(key);
    if (!saved) throw new Error('User not found');
    const profile = JSON.parse(saved) as UserProfile;
    const isValid = await verifyPassword(password, profile.passcodeHash || "");
    if (!isValid) throw new Error('Incorrect password');
    if (profile.status === 'pending') throw new Error('Profile pending activation');
    setUser(username);
    setProject(profile.projectState);
    
    // Always start at ai-setup after login
    setOnboardingStepState("ai-setup");
    profile.onboardingStep = "ai-setup";
    localStorage.setItem(key, JSON.stringify(profile));
    
    localStorage.setItem('phd_active_session_username', username);
    setLoading(false);
  };

  // Bug fix (2026-07-30): this used to only clear this app's own local
  // session key — it never called Supabase's signOut(), so the real
  // Supabase auth session (persisted independently by supabase-js) stayed
  // alive after "logout". Fire-and-forget: clearing local state must not
  // block on network, and failing to reach Supabase shouldn't prevent the
  // user from being logged out of this app locally. Dynamically imported
  // rather than a top-level import — authContext.tsx is eagerly loaded
  // (AuthProvider wraps the whole app), and a static import here would pull
  // @supabase/supabase-js into the main bundle chunk just for this one
  // fire-and-forget call.
  const logout = () => {
    setUser(null);
    setProject(null);
    setOnboardingStepState("login");
    localStorage.removeItem('phd_active_session_username');
    import('../services/supabaseClient').then(({ getSupabaseClient, isSupabaseConfigured }) => {
      if (isSupabaseConfigured()) {
        getSupabaseClient().auth.signOut().catch((err) => {
          console.warn('[Auth] Supabase signOut failed:', err);
        });
      }
    });
  };

  const signup = async (partial: Partial<UserProfile>) => {
    const username = partial.username?.trim();
    if (!username) throw new Error('Username required');
    const key = `${PROFILE_STATE_PREFIX}${username}`;
    
    // Hash the password before storing (PBKDF2-SHA256)
    const hashedPassword = partial.passcodeHash ? await hashPassword(partial.passcodeHash) : "";
    
    const pending: UserProfile = {
      username,
      passcodeHash: hashedPassword,
      projectState: partial.projectState as PaperProject,
      fullName: partial.fullName || '',
      email: partial.email || '',
      phone: partial.phone || '',
      affiliation: partial.affiliation || '',
      authenticId: partial.authenticId || '',
      status: 'pending',
      activationKeyHash: '',
      onboardingStep: 'ai-setup'
    } as UserProfile;
    localStorage.setItem(key, JSON.stringify(pending));
    const listStr = localStorage.getItem(PROFILES_LIST_KEY);
    let list: string[] = [];
    if (listStr) {
      try { list = JSON.parse(listStr).profilesList || []; } catch (_) {}
    }
    if (!list.includes(username)) {
      list.push(username);
      localStorage.setItem(PROFILES_LIST_KEY, JSON.stringify({ profilesList: list }));
    }
  };

  const activate = async (activationKey: string) => {
    if (!user) throw new Error('No active user');
    const key = `${PROFILE_STATE_PREFIX}${user}`;
    const saved = localStorage.getItem(key);
    if (!saved) throw new Error('Profile not found');
    const profile = JSON.parse(saved) as UserProfile;
    profile.status = 'approved';
    localStorage.setItem(key, JSON.stringify(profile));
    setProject(profile.projectState);
  };

  const loginDirectly = (username: string, projectState: PaperProject) => {
    setUser(username);
    setProject(projectState);
    setOnboardingStepState("ai-setup");
    try {
      const raw = localStorage.getItem(`${PROFILE_STATE_PREFIX}${username}`);
      if (raw) {
        const profile = JSON.parse(raw) as UserProfile;
        profile.onboardingStep = "ai-setup";
        localStorage.setItem(`${PROFILE_STATE_PREFIX}${username}`, JSON.stringify(profile));
      }
    } catch (e) {
      console.error(e);
    }
    localStorage.setItem('phd_active_session_username', username);
  };


  return (
    <AuthContext.Provider value={{
      user,
      project,
      loading,
      onboardingStep,
      setOnboardingStep,
      login,
      loginDirectly,
      logout,
      signup,
      activate,
      setProject
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextProps => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};