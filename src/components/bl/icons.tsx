// Прототиптегі сызықтық иконкалар (stroke 1.8–2, 24×24). Барлығы aria-hidden.
import type { ReactNode } from 'react';

type IconProps = { size?: number; strokeWidth?: number; className?: string };

function Svg({ size = 22, strokeWidth = 1.8, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export const TutorIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 5h16v11H9l-5 4z" />
  </Svg>
);

export const ExamIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4h6v3H9z" />
    <path d="M9 13l2 2 4-4" />
  </Svg>
);

export const GamesIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="7" width="18" height="11" rx="5.5" />
    <path d="M8 10.5v4M6 12.5h4" />
    <path d="M15.5 11.5h.01M17.5 13.5h.01" />
  </Svg>
);

export const LessonsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
    <path d="M5 17a3 3 0 0 1 3-3h11" />
  </Svg>
);

export const ProfileIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
  </Svg>
);

export const PanelIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </Svg>
);

export const ReviewIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12l5 5L20 6" />
  </Svg>
);

export const ChatIcon = TutorIcon;

export const ChildIcon = ProfileIcon;

export const SettingsIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
  </Svg>
);

export const UsersIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5" />
    <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2 .6 3.3 2.4 3.8 5.5" />
  </Svg>
);

export const BookIcon = LessonsIcon;

export const ShieldIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
  </Svg>
);

export const BackIcon = (p: IconProps) => (
  <Svg strokeWidth={2} {...p}>
    <path d="M15 6l-6 6 6 6" />
  </Svg>
);

export const CloseIcon = (p: IconProps) => (
  <Svg strokeWidth={2} {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const ChevronIcon = ({ size = 18, ...p }: IconProps) => (
  <Svg size={size} strokeWidth={2} {...p}>
    <path d="M9 6l6 6-6 6" />
  </Svg>
);

export const ChevronDownIcon = ({ size = 18, ...p }: IconProps) => (
  <Svg size={size} strokeWidth={2} {...p}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
);

export const CheckIcon = ({ size = 18, ...p }: IconProps) => (
  <Svg size={size} strokeWidth={2.4} {...p}>
    <path d="M5 12l5 5 9-10" />
  </Svg>
);

export const AlertIcon = ({ size = 20, ...p }: IconProps) => (
  <Svg size={size} strokeWidth={2} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5M12 16h.01" />
  </Svg>
);

export const CameraIcon = ({ size = 20, ...p }: IconProps) => (
  <Svg size={size} strokeWidth={2} {...p}>
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </Svg>
);

export const GalleryIcon = ({ size = 20, ...p }: IconProps) => (
  <Svg size={size} strokeWidth={2} {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="9" cy="10" r="1.5" />
    <path d="M21 16l-5-5-8 8" />
  </Svg>
);

export const RotateIcon = (p: IconProps) => (
  <Svg strokeWidth={2} {...p}>
    <path d="M20 11a8 8 0 1 0-2.3 5.7" />
    <path d="M20 4v7h-7" />
  </Svg>
);

export const SendIcon = (p: IconProps) => (
  <Svg strokeWidth={2} {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);

export const SearchIcon = ({ size = 20, ...p }: IconProps) => (
  <Svg size={size} strokeWidth={2} {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4-4" />
  </Svg>
);

export const PlusIcon = ({ size = 20, ...p }: IconProps) => (
  <Svg size={size} strokeWidth={2} {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const BellIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </Svg>
);

export const BookmarkGlyph = ({ on }: { on: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 4h12v17l-6-4-6 4z" />
  </svg>
);

export const LogoMark =({ size = 20 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
    <path d="M5 17a3 3 0 0 1 3-3h11" />
  </Svg>
);
