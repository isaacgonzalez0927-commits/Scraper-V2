const PATHS: Record<string, React.ReactNode> = {
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  chevron: <path d="m9 5 7 7-7 7" />,
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></>,
  pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/></>,
  grid: <><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M8.5 7V5.5A2 2 0 0 1 10.5 3.5h3a2 2 0 0 1 2 2V7M3 12h18" /></>,
  users: <><circle cx="9.5" cy="8" r="3.2" /><path d="M3.5 20v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1M16.5 11a3 3 0 0 0 0-6M17 15h.5a4 4 0 0 1 4 4v1" /></>,
  file: <><path d="M6 3.5h7.5L18 8v12.5H6z" /><path d="M13.5 3.5V8H18M9 13h6M9 16.5h4" /></>,
  card: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3 10h18M6.5 14.5h3.5" /></>,
  calendar: <><rect x="3.5" y="5.5" width="17" height="15" rx="2.5" /><path d="M8 3.5v4M16 3.5v4M3.5 10.5h17" /></>,
  chart: <><path d="M4 20V4M4 20h16" /><path d="m7.5 15.5 3.5-4 3 2 4.5-6" /></>,
  settings: <><circle cx="12" cy="12" r="3.2" /><path d="M12 3.5v2.2M12 18.3v2.2M4.9 7.8l1.9 1.1M17.2 15.1l1.9 1.1M4.9 16.2l1.9-1.1M17.2 8.9l1.9-1.1" /></>,
  bell: <><path d="M18 15.5V11a6 6 0 1 0-12 0v4.5L4.5 18h15z" /><path d="M9.5 18a2.5 2.5 0 0 0 5 0" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  spark: <><path d="M12 3.2 13.9 9l5.8 2-5.8 2-1.9 5.8L10.1 13 4.3 11l5.8-2z" /><path d="M18.5 4v3M17 5.5h3" /></>,
  cash: <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.3" /><path d="M7 9.5h.01M17 14.5h.01" /></>,
};

/* Solid silhouettes for the selected tab, the way SF Symbols fill on iOS. */
const FILL: Record<string, React.ReactNode> = {
  grid: PATHS.grid,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M8.5 7V5.5A2 2 0 0 1 10.5 3.5h3a2 2 0 0 1 2 2V7" fill="none" stroke="currentColor" strokeWidth="1.7" /></>,
  file: <path d="M6 3.5h7.5L18 8v12.5H6z" />,
  card: <rect x="3" y="5" width="18" height="14" rx="2.5" />,
  calendar: <><rect x="3.5" y="5.5" width="17" height="15" rx="2.5" /><path d="M8 3.5v4M16 3.5v4" fill="none" stroke="currentColor" strokeWidth="1.7" /></>,
  settings: <><circle cx="12" cy="12" r="8.2" opacity="0.22" /><circle cx="12" cy="12" r="3.2" /><path d="M12 3.5v2.2M12 18.3v2.2M4.9 7.8l1.9 1.1M17.2 15.1l1.9 1.1M4.9 16.2l1.9-1.1M17.2 8.9l1.9-1.1" fill="none" stroke="currentColor" strokeWidth="1.8" /></>,
};

export function Icon({
  name,
  className = "nav-icon",
  filled,
}: {
  name: string;
  className?: string;
  filled?: boolean;
}) {
  const solid = Boolean(filled && FILL[name]);
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={solid ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={solid ? "0" : "1.7"}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {solid ? FILL[name] : PATHS[name]}
    </svg>
  );
}
