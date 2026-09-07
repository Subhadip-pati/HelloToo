import React from 'react';
import hellotoLogo from './assets/helloto-logo.svg';
import { initials } from './utils';

/**
 * BrandMark component displays the HelloToo logo
 * Used in header/navigation areas
 */
export function BrandMark() {
  return (
    <div className="waMark" aria-label="HelloToo logo">
      <img className="waMarkImage" src={hellotoLogo} alt="HelloToo logo" />
    </div>
  );
}

interface AvatarProps {
  /** User or group name */
  name: string;
  /** Optional avatar image URL */
  avatarUrl?: string | null;
  /** Size in pixels (24-96) */
  size?: number;
  /** Whether this is a group avatar */
  group?: boolean;
}

/**
 * Avatar component displays a user or group profile picture
 * Falls back to initials if no image is available
 * @param name - Display name for initials fallback
 * @param avatarUrl - Optional image URL
 * @param size - Avatar size in pixels (default: 46)
 * @param group - Whether this is a group avatar (shows "GR" instead of initials)
 */
export function Avatar({ name, avatarUrl, size = 46, group = false }: AvatarProps) {
  const sizeClass = `avatarSize${Math.max(24, Math.min(96, size))}`;
  const baseClass = group ? 'avatar groupAvatar' : 'avatar';
  if (avatarUrl) {
    return <img className={`${baseClass} ${sizeClass}`} src={avatarUrl} alt={name} />;
  }
  return <div className={`${baseClass} avatarFallback ${sizeClass}`}>{group ? 'GR' : initials(name)}</div>;
}

export type { AvatarProps };
