// Primitives — token-faithful shadcn equivalents.
// Every value here traces back to colors_and_type.css. Do not introduce new colors.

const cn = (...xs) => xs.filter(Boolean).join(" ");

// Lucide icon — UMD build exposes icons directly on window.lucide as PascalCase keys.
// The value is the children array: [[tag, attrs], …]. No outer wrapper.
function Icon({ name, size = 16, className, style, strokeWidth = 2 }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!ref.current || !window.lucide) return;
    ref.current.innerHTML = "";
    const toPascal = s => s.replace(/(^|-)(.)/g, (_, __, c) => c.toUpperCase());
    const key = toPascal(name);
    const children = window.lucide[key];
    if (!Array.isArray(children)) return;
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    const baseAttrs = {
      xmlns: ns, width: size, height: size, viewBox: "0 0 24 24",
      fill: "none", stroke: "currentColor", "stroke-width": strokeWidth,
      "stroke-linecap": "round", "stroke-linejoin": "round",
    };
    Object.entries(baseAttrs).forEach(([k, v]) => svg.setAttribute(k, v));
    children.forEach(([tag, a]) => {
      const el = document.createElementNS(ns, tag);
      Object.entries(a || {}).forEach(([k, v]) => el.setAttribute(k, v));
      svg.appendChild(el);
    });
    ref.current.appendChild(svg);
  }, [name, size, strokeWidth]);
  return <span ref={ref} className={className} style={{ display: "inline-flex", lineHeight: 0, ...style }} />;
}

const buttonStyles = {
  base: { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, whiteSpace: "nowrap", borderRadius: 8, fontWeight: 500, transition: "background-color 150ms, color 150ms, border-color 150ms", cursor: "pointer", border: 0, outline: "none", lineHeight: 1, userSelect: "none" },
  sizes: {
    sm: { height: 32, padding: "0 12px", fontSize: 13, gap: 6 },
    default: { height: 36, padding: "0 16px", fontSize: 14 },
    lg: { height: 40, padding: "0 24px", fontSize: 14 },
    icon: { width: 36, height: 36, padding: 0 },
    "icon-sm": { width: 32, height: 32, padding: 0 },
  },
  variants: {
    default: { background: "var(--primary)", color: "var(--primary-foreground)" },
    secondary: { background: "var(--secondary)", color: "var(--secondary-foreground)" },
    outline: { background: "transparent", color: "var(--foreground)", border: "1px solid var(--border)" },
    ghost: { background: "transparent", color: "var(--foreground)" },
    destructive: { background: "var(--destructive)", color: "#fff" },
    link: { background: "transparent", color: "var(--foreground)", textDecoration: "underline", textUnderlineOffset: 4 },
  },
};

function Button({ variant = "default", size = "default", className, style, children, onClick, ...rest }) {
  const [hover, setHover] = React.useState(false);
  const v = buttonStyles.variants[variant];
  const s = buttonStyles.sizes[size];
  const hoverBg = {
    default: "color-mix(in oklch, var(--primary) 90%, transparent)",
    secondary: "color-mix(in oklch, var(--secondary) 80%, transparent)",
    outline: "var(--accent)",
    ghost: "var(--accent)",
    destructive: "color-mix(in oklch, var(--destructive) 90%, transparent)",
    link: "transparent",
  }[variant];
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...buttonStyles.base, ...s, ...v, ...(hover ? { background: hoverBg } : {}), ...style }}
      className={className}
      {...rest}
    >
      {children}
    </button>
  );
}

function Badge({ variant = "default", className, style, children }) {
  const variants = {
    default: { background: "var(--primary)", color: "var(--primary-foreground)", border: "1px solid transparent" },
    secondary: { background: "var(--secondary)", color: "var(--secondary-foreground)", border: "1px solid transparent" },
    outline: { background: "transparent", color: "var(--foreground)", border: "1px solid var(--border)" },
    destructive: { background: "var(--destructive)", color: "#fff", border: "1px solid transparent" },
    success: { background: "transparent", color: "oklch(0.7 0.15 145)", border: "1px solid color-mix(in oklch, oklch(0.7 0.15 145) 40%, transparent)" },
    warning: { background: "transparent", color: "oklch(0.78 0.15 75)", border: "1px solid color-mix(in oklch, oklch(0.78 0.15 75) 40%, transparent)" },
    danger: { background: "transparent", color: "var(--destructive)", border: "1px solid color-mix(in oklch, var(--destructive) 40%, transparent)" },
  };
  return (
    <span className={className} style={{
      display: "inline-flex", alignItems: "center", height: 20, padding: "0 8px",
      borderRadius: 6, fontSize: 12, fontWeight: 500, lineHeight: 1, gap: 4,
      ...variants[variant], ...style,
    }}>{children}</span>
  );
}

function Card({ className, style, children, ...rest }) {
  return (
    <div className={className} style={{
      background: "var(--card)", color: "var(--card-foreground)",
      border: "1px solid var(--border)", borderRadius: 14,
      boxShadow: "var(--shadow-sm)", ...style,
    }} {...rest}>{children}</div>
  );
}

function CardHeader({ children, style }) {
  return <div style={{ padding: "20px 24px 0 24px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, ...style }}>{children}</div>;
}
function CardTitle({ children, style }) {
  return <div style={{ fontWeight: 600, fontSize: 16, lineHeight: 1.2, ...style }}>{children}</div>;
}
function CardDescription({ children, style }) {
  return <div style={{ color: "var(--muted-foreground)", fontSize: 13, marginTop: 4, ...style }}>{children}</div>;
}
function CardContent({ children, style }) {
  return <div style={{ padding: 24, ...style }}>{children}</div>;
}
function CardFooter({ children, style }) {
  return <div style={{ padding: "0 24px 20px 24px", display: "flex", alignItems: "center", ...style }}>{children}</div>;
}

function Input({ style, ...rest }) {
  const [focus, setFocus] = React.useState(false);
  return (
    <input
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={{
        height: 36, padding: "0 12px", borderRadius: 8,
        border: `1px solid ${focus ? "var(--ring)" : "var(--border)"}`,
        background: "transparent", color: "var(--foreground)",
        fontSize: 14, outline: "none", width: "100%",
        boxShadow: focus ? "0 0 0 3px color-mix(in oklch, var(--ring) 50%, transparent)" : "none",
        transition: "border-color 150ms, box-shadow 150ms",
        ...style,
      }}
      {...rest}
    />
  );
}

function Textarea({ style, rows = 3, ...rest }) {
  const [focus, setFocus] = React.useState(false);
  return (
    <textarea
      rows={rows}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={{
        padding: "8px 12px", borderRadius: 8,
        border: `1px solid ${focus ? "var(--ring)" : "var(--border)"}`,
        background: "transparent", color: "var(--foreground)",
        fontSize: 14, outline: "none", width: "100%", resize: "vertical",
        fontFamily: "inherit",
        boxShadow: focus ? "0 0 0 3px color-mix(in oklch, var(--ring) 50%, transparent)" : "none",
        transition: "border-color 150ms, box-shadow 150ms",
        ...style,
      }}
      {...rest}
    />
  );
}

function Switch({ checked, onChange }) {
  return (
    <button onClick={() => onChange(!checked)} style={{
      width: 36, height: 20, borderRadius: 999,
      background: checked ? "var(--primary)" : "var(--secondary)",
      border: "1px solid var(--border)", position: "relative", cursor: "pointer", transition: "background 150ms", padding: 0,
    }}>
      <span style={{
        position: "absolute", top: 1, left: checked ? 17 : 1,
        width: 16, height: 16, borderRadius: 999,
        background: checked ? "var(--primary-foreground)" : "var(--foreground)",
        transition: "left 150ms",
      }} />
    </button>
  );
}

function Avatar({ initials = "U", src, size = 32 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 999,
      background: "var(--secondary)", color: "var(--secondary-foreground)",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.36, fontWeight: 500, overflow: "hidden", flexShrink: 0,
    }}>
      {src ? <img src={src} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" /> : initials}
    </div>
  );
}

function IconTile({ name, size = 40, iconSize = 20, tone = "default" }) {
  const tones = {
    default: { background: "var(--secondary)", color: "var(--muted-foreground)" },
    success: { background: "color-mix(in oklch, oklch(0.7 0.15 145) 20%, transparent)", color: "oklch(0.7 0.15 145)" },
    danger: { background: "color-mix(in oklch, var(--destructive) 15%, transparent)", color: "var(--destructive)" },
  };
  return (
    <div style={{
      width: size, height: size, borderRadius: 10,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0, ...tones[tone],
    }}>
      <Icon name={name} size={iconSize} />
    </div>
  );
}

function Empty({ icon, title, description, action }) {
  return (
    <div style={{
      border: "1px dashed var(--border)",
      background: "color-mix(in oklch, var(--background) 40%, transparent)",
      borderRadius: 10, padding: 32,
      display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center",
    }}>
      <IconTile name={icon} />
      <div style={{ fontWeight: 500, fontSize: 14 }}>{title}</div>
      <div style={{ fontSize: 13, color: "var(--muted-foreground)", maxWidth: 360 }}>{description}</div>
      {action}
    </div>
  );
}

function StatusDot({ tone = "success" }) {
  const colors = {
    success: "oklch(0.7 0.15 145)",
    warning: "oklch(0.78 0.15 75)",
    danger: "var(--destructive)",
    neutral: "var(--muted-foreground)",
  };
  return <span style={{ width: 6, height: 6, borderRadius: 999, background: colors[tone], display: "inline-block" }} />;
}

function Logo({ size = 32, showText = true }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: size, height: size, borderRadius: 8, background: "var(--foreground)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none" stroke="var(--background)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3v18h18"/>
          <path d="M7 12l4-4 4 4 5-5"/>
          <circle cx="20" cy="7" r="2" fill="var(--background)"/>
        </svg>
      </div>
      {showText && <span style={{ fontWeight: 600, fontSize: 17, letterSpacing: "-0.01em" }}>CodeMap</span>}
    </div>
  );
}

Object.assign(window, {
  cn, Icon, Button, Badge, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter,
  Input, Textarea, Switch, Avatar, IconTile, Empty, StatusDot, Logo,
});
