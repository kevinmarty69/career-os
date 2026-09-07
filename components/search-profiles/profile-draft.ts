'use client';

import {
  emptySearchProfile,
  type SearchProfile,
  type SearchProfileFields,
} from '@/lib/search-profile';

export function freshProfile(): SearchProfileFields {
  return structuredClone(emptySearchProfile);
}

export function fieldsFrom(profile: SearchProfile): SearchProfileFields {
  return {
    name: profile.name,
    discoverySources: structuredClone(profile.discoverySources),
    discoveryIntervalHours: profile.discoveryIntervalHours,
    alertThreshold: profile.alertThreshold,
    active: profile.active,
    hardConstraints: structuredClone(profile.hardConstraints),
    softPreferences: structuredClone(profile.softPreferences),
  };
}
