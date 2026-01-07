/**
 * Design system constants for consistent styling
 * Based on NEAR Protocol Brand Guidelines
 */

// NEAR Brand Colors
export const NEAR_COLORS = {
  black: '#000000',
  white: '#FFFFFF',
  offWhite: '#f2f1e9',
  green: '#00ec97',
  red: '#ff7966',
  purple: '#9797ff',
  blue: '#17d9d4',
} as const;

export const COLORS = {
  background: {
    primary: 'bg-black',
    secondary: 'bg-zinc-950',
    tertiary: 'bg-zinc-900',
    card: 'bg-zinc-950',
  },
  text: {
    primary: 'text-white',
    secondary: 'text-zinc-400',
    tertiary: 'text-zinc-500',
    accent: 'text-near-purple',
  },
  border: {
    default: 'border-white/5',
    hover: 'border-white/20',
    active: 'border-near-green/50',
  },
  button: {
    primary: 'bg-near-green hover:bg-near-green/80 text-near-black font-semibold',
    secondary: 'border-white/20 bg-transparent text-white hover:bg-white/10 hover:border-near-green/30',
    ghost: 'text-zinc-400 hover:text-white',
  },
  // NEAR specific utility classes
  near: {
    gradient: 'from-near-green via-near-purple to-near-blue',
    glow: {
      green: 'shadow-near-green/30',
      purple: 'shadow-near-purple/30',
      blue: 'shadow-near-blue/30',
    },
  },
} as const;

export const BRANDING = {
  name: {
    part1: 'you',
    part2: 'tick',
  },
  logo: {
    primary: 'text-white',
    secondary: 'text-zinc-500',
  },
} as const;

export const ANIMATION = {
  transition: {
    default: 'transition-all',
    colors: 'transition-colors',
    transform: 'transition-transform',
    opacity: 'transition-opacity',
  },
  duration: {
    fast: 'duration-200',
    normal: 'duration-300',
    slow: 'duration-700',
  },
  hover: {
    scale: 'hover:scale-105',
    scaleSubtle: 'hover:scale-[1.02]',
    scaleImage: 'group-hover:scale-110',
  },
} as const;

export const LAYOUT = {
  container: 'container mx-auto px-4',
  section: {
    padding: 'py-32',
    paddingSmall: 'py-20',
  },
  nav: {
    height: 'h-20',
    heightSmall: 'h-16',
  },
} as const;

export const STATS = {
  ticketCapacity: 1000000,
  potentialEvents: 50000,
  fraudRate: 0,
} as const;
