import { useId } from 'react';
import { Box, Typography } from '@mui/material';

// Same artwork as public/logo.svg (used as the favicon), inlined so it scales and needs no request.
export function LogoMark({ size = 32 }) {
  const gradientId = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="StockFlow logo">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4f8bff" />
          <stop offset="1" stopColor="#1e5eff" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill={`url(#${gradientId})`} />
      <rect x="12" y="36" width="11" height="16" rx="2" fill="#fff" opacity="0.6" />
      <rect x="26.5" y="29" width="11" height="23" rx="2" fill="#fff" opacity="0.8" />
      <rect x="41" y="22" width="11" height="30" rx="2" fill="#fff" />
      <path d="M12 27 L46 11" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />
      <path
        d="M38.5 9.5 L48 10 L43.5 18.3"
        fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Logo({ size = 32, variant = 'h6' }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
      <LogoMark size={size} />
      <Typography variant={variant} fontWeight={700} noWrap sx={{ letterSpacing: '-0.02em' }}>
        Stock<Box component="span" sx={{ color: 'primary.main' }}>Flow</Box>
      </Typography>
    </Box>
  );
}
