type FitMode = "cover" | "contain";

type SquarePreviewProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  size?: number;             // défaut 224
  fit?: FitMode;             // "cover" (crop centré) | "contain" (letterbox)
};

export default function SquarePreview({
  src,
  alt = "",
  size = 224,
  fit = "contain", // "contain" (tout voir) ou "cover" (crop centré)
  ...imgProps
}: React.ImgHTMLAttributes<HTMLImageElement> & {
  size?: number;
  fit?: "contain" | "cover";
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        background: "rgba(0,0,0,0.08)",
      }}
    >
      <img
        className="block w-full h-full object-cover rounded-none"
        src={src}
        alt={alt}
        {...imgProps}
        style={{
          width: "100%",            // force 224
          height: "100%",           // force 224
          objectFit: fit,           // "contain" ou "cover"
          objectPosition: "center", // centre (évite “on ne voit que le haut”)
          display: "block",
          borderRadius: 0,
        }}
      />
    </div>
  );
}
