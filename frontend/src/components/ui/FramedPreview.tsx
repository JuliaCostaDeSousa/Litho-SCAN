// src/components/FramedPreview.tsx
import SquarePreview from "../SquarePreview";
import React from "react";

type Props = {
  size?: number;                 // 224 par défaut
  frameSrc: string;              // ex: "/ui/frame-224.png"
  imgSrc?: string;               // blob URL
  alt?: string;
  onLoad?: React.ReactEventHandler<HTMLImageElement>;
  onError?: React.ReactEventHandler<HTMLImageElement>;
  frameZ?: "above" | "below";    // cadre au-dessus (par défaut) ou en-dessous
  innerPadding?: number;         // marge intérieure du cadre (en px)
  placeholder?: React.ReactNode;
};

export default function FramedPreview({
  size = 224,
  frameSrc,
  imgSrc,
  alt = "Aperçu",
  onLoad,
  onError,
  frameZ = "above",
  innerPadding = 8,              // ← ajuste ça à l’épaisseur de ton cadre
  placeholder,
}: Props) {
  return (
    <div
      className="relative grid place-items-center"
      style={{ width: size, height: size }}
      aria-label="Zone d’aperçu"
    >
      {/* zone intérieure (préview) : on laisse une marge = innerPadding */}
      <div
        className={`absolute !rounded-none overflow-hidden`}
        style={{
          top: innerPadding,
          right: innerPadding,
          bottom: innerPadding,
          left: innerPadding,
          borderRadius: 0,
          clipPath: "inset(0)",
        }}
      >
        {imgSrc ? (
          <SquarePreview
            src={imgSrc}
            alt={alt}
            size={size - innerPadding * 2}
            fit="cover"             // recadrage propre
            decoding="async"
            loading="eager"
            onLoad={onLoad}
            onError={onError}
            className="w-full h-full object-cover !rounded-none"
          />
        ) : (
          <div className="w-full h-full grid place-items-center text-[11px] text-gray-300">
            {placeholder ?? "Aperçu en préparation…"}
          </div>
        )}
      </div>

      {/* cadre PNG, posé par-dessus (ou dessous) */}
      <img
        src={frameSrc}
        alt=""
        aria-hidden
        draggable={false}
        className={[
          "absolute inset-0 w-full h-full object-contain pointer-events-none ",
          frameZ === "above" ? "z-10" : "-z-10",
        ].join(" ")}
      />
    </div>
  );
}