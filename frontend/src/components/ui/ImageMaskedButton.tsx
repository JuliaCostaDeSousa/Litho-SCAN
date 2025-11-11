// src/components/ui/ImageMaskedButton.tsx
type ImgBtnProps = {
  src: string;
  label?: string;
  ariaLabel?: string;
  onClick?: () => void;
  className?: string;
  width?: number;
  height?: number;
  hoverEffect?: boolean;
  disabled?: boolean;
};

export default function ImageButton({
  src, label, ariaLabel, onClick,
  className = "", width = 256, height = 80,
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

  return (
    <button
      type="button"
      aria-label={ariaLabel || (label ? undefined : "Bouton")}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className={[base, disabledCls, className].join(" ")}
      style={{ width, height }}
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
