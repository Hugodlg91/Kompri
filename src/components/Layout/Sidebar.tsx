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
    <aside
      style={{
        width: "78px",
        minWidth: "78px",
        background: "var(--surface)",
        backdropFilter: "var(--glass-blur)",
        WebkitBackdropFilter: "var(--glass-blur)",
        borderRight: "1px solid var(--border)",
        boxShadow: "inset -1px 0 0 var(--glass-edge)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: "14px",
        paddingBottom: "14px",
        gap: "4px",
        height: "100%",
        flexShrink: 0,
        zIndex: 10,
      }}
    >
      {/* Logo mark — Liquid Glass Gem */}
      <div
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
        <span
          style={{
            color: "#ffffff",
            fontWeight: 800,
            fontSize: "16px",
            lineHeight: 1,
            letterSpacing: "-0.02em",
            textShadow: "0 1px 3px rgba(0, 0, 0, 0.25)",
          }}
        >
          M
        </span>
      </div>

      <nav
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          width: "100%",
          padding: "0 8px",
        }}
      >
        {navItems.map(({ key, Icon }, index) => {
          const isActive = active === key;
          const label = t("nav." + key);
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              title={label}
              aria-keyshortcuts={`Control+${index + 1}`}
              style={{
                position: "relative",
                width: "100%",
                height: "54px",
                borderRadius: "12px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "5px",
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
                flexShrink: 0,
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
              {isActive && (
                <span
                  style={{
                    position: "absolute",
                    left: "-9px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: "3.5px",
                    height: "24px",
                    background: "var(--accent)",
                    boxShadow: "0 0 10px var(--accent)",
                    borderRadius: "0 4px 4px 0",
                  }}
                />
              )}
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
