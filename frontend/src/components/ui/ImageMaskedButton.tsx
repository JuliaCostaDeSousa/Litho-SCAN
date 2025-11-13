// src/components/ui/ImageMaskedButton.tsx
type ImgBtnProps = {
  src: string;
  label?: string;
  ariaLabel?: string;
  onClick?: () => void;
  className?: string;

  // FIXE (héritage existant)
  width?: number;
  height?: number;

  // NOUVEAU: mode fluide
  fluid?: boolean;           // << si true: width:100% du conteneur
  maxWidth?: number | string; // ex: 320 ou "22rem"
  minWidth?: number | string; // ex: 200
  aspect?: number;           // ratio w/h; par défaut déduit de width/height

  hoverEffect?: boolean;
  disabled?: boolean;
};

export default function ImageButton({
  src, label, ariaLabel, onClick,
  className = "",
  width = 256,
  height = 80,
  fluid = false,
  maxWidth,       // ex: 320
  minWidth,       // ex: 200
  aspect,         // ex: 3.2 (== 320/100)
  hoverEffect = false,
  disabled = false,
}: ImgBtnProps) {
  const base = [
    "relative inline-grid place-items-center select-none transition-transform",
    "active:scale-[0.98]",
    "appearance-none border-0 outline-none",
    "focus:outline-none focus-visible:outline-none",
    "focus-visible:ring-2 focus-visible:ring-emerald-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
    "bg-transparent shadow-none",
  ].join(" ");

  const disabledCls = disabled ? "opacity-50 grayscale pointer-events-none" : "";

  // Style sizing
  const style: React.CSSProperties = {};
  if (fluid) {
    style.width = "100%";
    if (typeof maxWidth !== "undefined") {
      style.maxWidth = typeof maxWidth === "number" ? `${maxWidth}px` : maxWidth;
    }
    if (typeof minWidth !== "undefined") {
      style.minWidth = typeof minWidth === "number" ? `${minWidth}px` : minWidth;
    }
    // garde un ratio stable (sinon “min-height” collapse)
    const r = aspect ?? (width / height); // fallback sur tes dimensions “fixes”
    // CSS moderne supporté: https://caniuse.com/mdn-css_properties_aspect-ratio
    (style as any).aspectRatio = r;
    // pas de height fixe en fluide
  } else {
    style.width = width;
    style.height = height;
  }

  return (
    <button
      type="button"
      aria-label={ariaLabel || (label ? undefined : "Bouton")}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className={[base, disabledCls, className, fluid ? "w-full" : ""].join(" ")}
      style={style}
    >
      <img
        src={src}
        alt=""
        aria-hidden
        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        draggable={false}
      />
      {hoverEffect && (
        <span aria-hidden className="absolute inset-0 bg-black/0 hover:bg-black/10 rounded-[12px]" />
      )}
      {label && <span className="relative z-10 font-semibold text-white drop-shadow">{label}</span>}
    </button>
  );
}
