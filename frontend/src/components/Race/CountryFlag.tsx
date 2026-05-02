import React from 'react';

const getBackendBaseUrl = () => {
  const apiUrl = (import.meta as any).env?.VITE_API_URL;
  if (apiUrl) return apiUrl.replace(/\/api$/, '');
  return 'http://localhost:4000';
};
const API_BASE = getBackendBaseUrl();

const LOCAL_FLAGS: Record<string, string> = {
  AL: 'Albania',
  CO: 'Colombia',
  FR: 'France',
  DE: 'Germany',
  IS: 'Iceland',
  IN: 'India',
  IL: 'Israel',
  IT: 'Italy',
  JP: 'Japan',
  MX: 'Mexico',
  RO: 'Romania',
  GB: 'United_Kingdom',
  US: 'United_States',
};

export function CountryFlag({
  iso, height = 12, className,
}: {
  iso: string | null | undefined;
  height?: number;
  className?: string;
}) {
  if (!iso) return null;
  const code = iso.trim().toUpperCase();
  if (code.length !== 2 || !/^[A-Z]{2}$/.test(code)) return null;

  const localName = LOCAL_FLAGS[code];
  const src = localName
    ? `${API_BASE}/horses/flags/Flag_of_${localName}.svg`
    : `https://flagcdn.com/w${Math.round(height * 1.5)}/${code.toLowerCase()}.png`;

  return (
    <img
      className={className ? `hr-flag-img ${className}` : 'hr-flag-img'}
      src={src}
      height={height}
      alt={code}
      title={code}
      loading="lazy"
    />
  );
}
