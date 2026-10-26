import type { ReactNode } from "react";

type IconName = "home" | "car" | "sparkles" | "paw" | "book" | "laptop" | "briefcase" | "truck" | "confetti" | "grid" | "search" | "pin" | "arrow" | "shield" | "menu";

const drawings: Record<IconName, ReactNode> = {
  home: <><path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9M9 20v-6h6v6"/></>,
  car: <><path d="m5 11 1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11"/><path d="M3 11h18v7H3zM6 18v2m12-2v2M6 14h.01M18 14h.01"/></>,
  sparkles: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="m19 16 .9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9L19 16Z"/></>,
  paw: <><ellipse cx="12" cy="15.5" rx="5.2" ry="4"/><ellipse cx="5.5" cy="9" rx="1.7" ry="2.4"/><ellipse cx="10" cy="6.5" rx="1.7" ry="2.4"/><ellipse cx="15" cy="6.5" rx="1.7" ry="2.4"/><ellipse cx="18.5" cy="9" rx="1.7" ry="2.4"/></>,
  book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21z"/><path d="M4 5.5v13A2.5 2.5 0 0 1 6.5 16H20M8 7h8"/></>,
  laptop: <><rect x="4" y="4" width="16" height="12" rx="1.5"/><path d="M2 20h20l-2-4H4z"/></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V4h8v3m-13 5h18m-11 0v2h4v-2"/></>,
  truck: <><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z"/><circle cx="7.5" cy="18" r="1.5"/><circle cx="18" cy="18" r="1.5"/></>,
  confetti: <><path d="M4 20 8 8l12 12zM8 8l5-5m3 2 2-2m1 8 3-1"/><path d="m12 12 2 2"/></>,
  grid: <><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></>,
  search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></>,
  pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
  arrow: <><path d="M5 12h14m-6-6 6 6-6 6"/></>,
  shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
};

export function Icon({ name, size = 22, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {drawings[name]}
    </svg>
  );
}
