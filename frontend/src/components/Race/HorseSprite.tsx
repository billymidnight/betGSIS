import React from 'react';

/** Side-profile horse, running rightward. Body / mane / legs are a fixed
 *  bay-brown for every horse; only the saddle blanket and the post-number
 *  text recolor per runner. Lifted from HorseRacing.tsx so Cheltenham can
 *  reuse the exact same sprite without depending on that page. */
export function HorseSprite({
  silksColor, postNumber, racing, imageUrl,
}: {
  silksColor: string;
  postNumber: number;
  racing: boolean;
  imageUrl?: string;
}) {
  if (imageUrl) {
    return (
      <svg
        viewBox="0 0 120 75"
        className={`hr-svg-horse hr-svg-horse-png ${racing ? 'is-racing' : ''}`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label={`Post ${postNumber}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <image href={imageUrl} x="0" y="0" width="120" height="75" preserveAspectRatio="xMidYMid meet" />
        <rect className="hr-svg-saddle" x="42" y="22" width="28" height="9.5" rx="2.2" fill={silksColor} opacity="0.92" />
        <rect x="42" y="22" width="28" height="9.5" rx="2.2" fill="none" stroke="#1a1208" strokeWidth="0.7" />
        <ellipse cx="44.5" cy="22" rx="1.4" ry="1.1" fill="#1a1208" />
        <ellipse cx="68" cy="22" rx="1.1" ry="0.9" fill="#1a1208" />
        <text className="hr-svg-num" x="56" y="29.5" fontSize="8.5" fontWeight={900} fill="#1a1208" textAnchor="middle" fontFamily="Inter, Arial, sans-serif">
          {postNumber}
        </text>
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 130 80"
      className={`hr-svg-horse ${racing ? 'is-racing' : ''}`}
      xmlns="http://www.w3.org/2000/svg"
      aria-label={`Post ${postNumber}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id={`hr-body-${postNumber}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#6f4528" />
          <stop offset="55%"  stopColor="#5a3820" />
          <stop offset="100%" stopColor="#3f2716" />
        </linearGradient>
      </defs>

      <g className="hr-svg-legs hr-svg-legs-rear">
        <path d="M 32,42 Q 30,50 28,60 L 26,72 L 30,73 L 33,72 Q 34,62 35,52 L 37,42 Z" fill="#22150a" />
        <path d="M 86,44 Q 89,52 91,62 L 92,73 L 88,73 L 85,72 Q 84,62 83,52 L 82,44 Z" fill="#22150a" />
      </g>

      <path className="hr-svg-tail"
        d="M 24,32 Q 12,28 4,34 Q 1,42 5,48 Q 10,46 16,42 Q 22,38 26,34 Q 28,32 26,30 Z"
        fill="#1a1006" />
      <path d="M 6,42 Q 1,42 1,48 Q 5,49 8,45 Z" fill="#1a1006" opacity="0.7" />
      <path d="M 12,38 Q 6,38 5,44 Q 9,44 13,41 Z" fill="#1a1006" opacity="0.55" />

      <ellipse cx="34" cy="32" rx="13" ry="13" fill="#5a3820" />

      <path
        d="M 26,30 Q 22,24 32,21 L 60,20 Q 80,20 86,22 Q 92,25 94,30 Q 95,36 90,40 Q 60,42 38,42 Q 28,40 26,30 Z"
        fill={`url(#hr-body-${postNumber})`}
        stroke="#22150a" strokeWidth="0.4"
      />

      <path d="M 80,21 Q 84,17 88,20 Q 88,22 86,22 Q 82,22 80,22 Z" fill="#5a3820" />
      <ellipse cx="91" cy="34" rx="9" ry="11" fill="#5a3820" />
      <ellipse cx="58" cy="40" rx="22" ry="3" fill="#7a4f30" opacity="0.4" />

      <g className="hr-svg-legs hr-svg-legs-front">
        <path d="M 40,42 Q 42,52 44,62 L 46,73 L 42,74 L 38,72 Q 37,62 37,52 L 35,42 Z" fill="#3a2412" />
        <path d="M 92,44 Q 94,52 96,62 L 96,73 L 92,74 L 88,72 Q 88,62 89,52 L 88,44 Z" fill="#3a2412" />
      </g>

      <rect className="hr-svg-saddle" x="46" y="22" width="30" height="10" rx="2.4" fill={silksColor} />
      <rect x="46" y="22" width="30" height="10" rx="2.4" fill="none" stroke="#1a1208" strokeWidth="0.7" />
      <ellipse cx="48.5" cy="22" rx="1.4" ry="1.1" fill="#1a1208" />
      <ellipse cx="73" cy="22" rx="1.1" ry="0.9" fill="#1a1208" />

      <text className="hr-svg-num" x="61" y="29.5" fontSize="8.8" fontWeight={900} fill="#1a1208" textAnchor="middle" fontFamily="Inter, Arial, sans-serif">
        {postNumber}
      </text>

      <path d="M 86,22 Q 96,12 110,7 L 116,8 Q 118,12 116,17 L 110,18 Q 102,24 95,30 L 86,30 Z" fill="#5a3820" stroke="#22150a" strokeWidth="0.4" />
      <path d="M 84,20 Q 96,8 112,3 L 110,0.5 Q 96,4 80,18 Q 81,19 84,20 Z" fill="#1a1006" />
      <path d="M 86,18 Q 84,14 86,10 Q 89,14 89,18 Z" fill="#1a1006" opacity="0.85" />
      <path d="M 113,4 Q 116,2 119,4 L 117,7 Q 115,6 113,7 Z" fill="#1a1006" />
      <path d="M 113,6 Q 122,7 124,12 L 124,17 Q 122,20 117,20 Q 113,15 113,6 Z" fill="#5a3820" stroke="#22150a" strokeWidth="0.4" />
      <path d="M 115,3 L 116,1 L 118,3 Z" fill="#22150a" />
      <path d="M 119,2 L 120.5,1 L 122,2 Z" fill="#22150a" />
      <circle cx="119" cy="12" r="0.7" fill="#0d0805" />
      <circle cx="119.2" cy="11.8" r="0.22" fill="#a37a52" />
      <ellipse cx="123" cy="15" rx="0.6" ry="0.4" fill="#0d0805" />
      <path d="M 121,18 Q 123,18.5 124,17.5" stroke="#1a1208" strokeWidth="0.4" fill="none" strokeLinecap="round" />
      <ellipse cx="122" cy="17" rx="2" ry="1.3" fill="#7a4f30" opacity="0.35" />
    </svg>
  );
}
