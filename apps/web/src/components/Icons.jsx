// Small inline icons. They use currentColor, so they follow the button's text color.

const iconProps = /** @type {const} */ ({
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
});

export function SendIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  );
}

export function StopIcon() {
  return (
    <svg {...iconProps}>
      <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg {...iconProps} width={18} height={18}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function MenuIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg {...iconProps} width={18} height={18}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export function PencilIcon() {
  return (
    <svg {...iconProps} width={16} height={16}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg {...iconProps} width={16} height={16}>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg {...iconProps} width={16} height={16}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function LogOutIcon() {
  return (
    <svg {...iconProps} width={18} height={18}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export function ChevronIcon() {
  return (
    <svg {...iconProps} width={16} height={16}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function CopyIcon() {
  return (
    <svg {...iconProps} width={16} height={16}>
      <rect x="9" y="9" width="12" height="12" rx="2.5" />
      <path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5" />
    </svg>
  );
}

export function ArrowDownIcon() {
  return (
    <svg {...iconProps} width={18} height={18}>
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
    </svg>
  );
}

export function ChatIcon() {
  return (
    <svg {...iconProps} width={16} height={16}>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
    </svg>
  );
}

export function LightbulbIcon() {
  return (
    <svg {...iconProps}>
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V17h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2Z" />
    </svg>
  );
}

export function BookIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
      <path d="M9 7h7" />
    </svg>
  );
}

export function CodeIcon() {
  return (
    <svg {...iconProps}>
      <path d="m16 18 6-6-6-6" />
      <path d="m8 6-6 6 6 6" />
    </svg>
  );
}

export function FeatherIcon() {
  return (
    <svg {...iconProps}>
      <path d="M20.2 12.2a6 6 0 0 0-8.5-8.5L5 10.5V19h8.5Z" />
      <path d="M16 8 2 22" />
      <path d="M17.5 15H9" />
    </svg>
  );
}

export function BoltIcon() {
  return (
    <svg {...iconProps} width={18} height={18}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7Z" />
    </svg>
  );
}

export function ShieldIcon() {
  return (
    <svg {...iconProps} width={18} height={18}>
      <path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function FlagIcon() {
  return (
    <svg {...iconProps} width={18} height={18}>
      <path d="M4 22V4" />
      <path d="M4 4h13l-2 4 2 4H4" />
    </svg>
  );
}

/** Google "G" for the sign-in button (brand colors). */
export function GoogleIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
