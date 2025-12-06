/**
 * Design system constants for consistent styling
 */

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
    accent: 'text-zinc-500',
  },
  border: {
    default: 'border-white/5',
    hover: 'border-white/20',
    active: 'border-white/30',
  },
  button: {
    primary: 'bg-white hover:bg-zinc-200 text-black',
    secondary: 'border-white/20 bg-transparent text-white hover:bg-white/10',
    ghost: 'text-zinc-400 hover:text-white',
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
