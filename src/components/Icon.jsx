const paths = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2H3ZM17 5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5v1h-3" /></>,
  flask: <><path d="M9 3h6M10 3v7l-6 8a2 2 0 0 0 1.6 3h12.8A2 2 0 0 0 20 18l-6-8V3M7 16h10" /></>,
  search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></>,
  sparkles: <><path d="m12 2 1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2ZM19 16l.7 1.3L21 18l-1.3.7L19 20l-.7-1.3L17 18l1.3-.7L19 16Z" /></>,
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  chevron: <path d="m9 18 6-6-6-6" />,
  map: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  check: <path d="m4 12 5 5L20 6" />,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m8 12 2.5 2.5L16 9" /></>,
  git: <><circle cx="6" cy="5" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="12" r="2" /><path d="M6 7v10M8 5h4a6 6 0 0 1 6 6" /></>,
  bug: <><rect x="6" y="8" width="12" height="12" rx="5" /><path d="M9 8V5l3-2 3 2v3M3 10h3M18 10h3M3 16h3M18 16h3M9 12h6" /></>,
  alert: <><path d="M12 3 2 21h20L12 3Z" /><path d="M12 9v5M12 18h.01" /></>,
  chart: <><path d="M3 20h18M6 16l4-5 4 2 4-8" /><path d="M17 5h2v2" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5" /></>,
  close: <path d="M5 5 19 19M19 5 5 19" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
};

export default function Icon({ name, size = 18, strokeWidth = 1.8, className = "" }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.grid}
    </svg>
  );
}
