import { useCallback, useState } from 'react';
import { DEFAULT_USER_PROFILE, loadStoredProfile, saveStoredProfile } from '../api';
import { UserProfile } from '../types';

export function getProfileInitials(displayName: string, email: string): string {
  const cleaned = displayName.trim();
  if (cleaned) {
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return cleaned.slice(0, 2).toUpperCase();
  }
  return (email.trim().slice(0, 2) || 'CS').toUpperCase();
}

export function useProfile() {
  const [profile, setProfile] = useState<UserProfile>(() => loadStoredProfile());

  const updateProfile = useCallback(
    (updater: Partial<UserProfile> | ((prev: UserProfile) => UserProfile)) => {
      setProfile((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
        saveStoredProfile(next);
        return next;
      });
    },
    []
  );

  const resetProfile = useCallback(() => {
    setProfile(DEFAULT_USER_PROFILE);
    saveStoredProfile(DEFAULT_USER_PROFILE);
  }, []);

  return { profile, updateProfile, resetProfile };
}
