import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { UserProfile, PaperProject, PROFILE_STATE_PREFIX, PROFILES_LIST_KEY, DEFAULT_STATE, OnboardingStep } from '../types';
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
  socialSignIn: (name: string, email: string, provider: 'google' | 'facebook') => Promise<void>;
  sendOtp: (phone: string) => Promise<void>;
  verifyOtp: (code: string) => Promise<void>;
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

  const logout = () => {
    setUser(null);
    setProject(null);
    setOnboardingStepState("login");
    localStorage.removeItem('phd_active_session_username');
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

  const socialSignIn = async (name: string, email: string, provider: 'google' | 'facebook') => {
    const username = name.trim();
    const stateKey = `${PROFILE_STATE_PREFIX}${username}`;
    const savedStateStr = localStorage.getItem(stateKey);
    let targetProjectState: PaperProject;
    if (savedStateStr) {
      try {
        const profile = JSON.parse(savedStateStr) as UserProfile;
        targetProjectState = profile.projectState;
        
        // Force Step to 'ai-setup'
        profile.onboardingStep = "ai-setup";
        localStorage.setItem(stateKey, JSON.stringify(profile));
      }
      catch { targetProjectState = DEFAULT_STATE(username); }
    } else {
      targetProjectState = DEFAULT_STATE(username);
      targetProjectState.authorDetails = `${username}, PhD Scholar (${provider === 'google' ? 'Google' : 'Facebook'} Verified)`;
      
      // Hash social auth passcode for consistency
      const socialPasscode = `social_${provider}_auth_passcode`;
      const hashedPasscode = await hashPassword(socialPasscode);
      
      const newProfile: UserProfile = {
        username,
        passcodeHash: hashedPasscode,
        projectState: targetProjectState,
        fullName: username,
        email,
        status: 'approved',
        onboardingStep: 'ai-setup'
      } as UserProfile;
      localStorage.setItem(stateKey, JSON.stringify(newProfile));
      const savedList = localStorage.getItem(PROFILES_LIST_KEY);
      let list: string[] = [];
      if (savedList) {
        try { list = JSON.parse(savedList).profilesList || []; } catch (_) {}
      }
      if (!list.includes(username)) { list.push(username); localStorage.setItem(PROFILES_LIST_KEY, JSON.stringify({ profilesList: list })); }
    }
    setUser(username);
    setProject(targetProjectState);
    setOnboardingStepState("ai-setup");
    localStorage.setItem('phd_active_session_username', username);
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

  const sendOtp = async (phone: string) => { console.log('Sending OTP to', phone); };
  const verifyOtp = async (code: string) => { console.log('Verifying OTP code', code); };

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
      socialSignIn,
      sendOtp,
      verifyOtp,
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