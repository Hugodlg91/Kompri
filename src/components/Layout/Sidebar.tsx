import { useTranslation } from "react-i18next";
import { IcnImage, IcnVideo, IcnAudio, IcnHistory, IcnSettings } from "../ui/Icons";

export type NavSection = "image" | "video" | "audio" | "history" | "settings";

interface SidebarProps {
  active: NavSection;
  onChange: (section: NavSection) => void;
}

const navItems: {
  key: NavSection;
  Icon: React.FC<{ size?: number; color?: string; strokeWidth?: number }>;
}[] = [
  { key: "image", Icon: IcnImage },
  { key: "video", Icon: IcnVideo },
  { key: "audio", Icon: IcnAudio },
  { key: "history", Icon: IcnHistory },
  { key: "settings", Icon: IcnSettings },
];

export function Sidebar({ active, onChange }: SidebarProps) {
  const { t } = useTranslation();

  return (
    <aside className="app-sidebar">
      {/* Logo mark — Liquid Glass Gem */}
      <div
        className="sidebar-logo"
        style={{
          width: "38px",
          height: "38px",
          borderRadius: "12px",
          background: "linear-gradient(135deg, var(--accent) 0%, #6c5ce7 60%, #9d7aff 100%)",
          boxShadow: "inset 0 1px 1px rgba(255, 255, 255, 0.45), 0 4px 14px var(--accent-glow)",
          border: "1px solid rgba(255, 255, 255, 0.22)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "16px",
          flexShrink: 0,
          userSelect: "none",
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          aria-label="Kompri"
          role="img"
          style={{ filter: "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.25))" }}
        >
          <g stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.5 8V4.5h3.5M17 4.5h3.5V8M20.5 16v3.5H17M7 19.5H3.5V16" />
            <path d="M10 8.6v6.8l5.4-3.4z" fill="#ffffff" />
          </g>
        </svg>
      </div>

      <nav className="sidebar-nav">
        {navItems.map(({ key, Icon }, index) => {
          const isActive = active === key;
          const label = t("nav." + key);
          return (
            <button
              key={key}
              className="sidebar-btn"
              onClick={() => onChange(key)}
              title={label}
              aria-keyshortcuts={`Control+${index + 1}`}
              style={{
                border: isActive
                  ? "1px solid rgba(139, 122, 255, 0.3)"
                  : "1px solid transparent",
                boxShadow: isActive
                  ? "inset 0 1px 0 var(--glass-highlight), 0 4px 12px rgba(0, 0, 0, 0.14)"
                  : "none",
                cursor: "pointer",
                background: isActive ? "var(--accent-dim)" : "transparent",
                color: isActive ? "var(--accent)" : "var(--muted)",
                transition:
                  "background 0.16s ease, color 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease, transform 0.12s ease",
                outline: "none",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "var(--surface2)";
                  e.currentTarget.style.color = "var(--text-sub)";
                  e.currentTarget.style.borderColor = "var(--border)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--muted)";
                  e.currentTarget.style.borderColor = "transparent";
                }
              }}
            >
              {isActive && <span className="sidebar-active-indicator" />}
              <Icon size={19} strokeWidth={isActive ? 2.2 : 1.75} />
              <span
                style={{
                  fontSize: "9.5px",
                  fontWeight: isActive ? 700 : 500,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  lineHeight: 1,
                  maxWidth: "54px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {label.length > 6 ? label.slice(0, 4) : label}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
