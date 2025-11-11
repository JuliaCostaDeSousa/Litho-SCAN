type Props = {
  mp4: string;
  webm?: string;
  poster?: string;
  title?: string;
  trackVtt?: string; // optionnel
};

export default function LocalVideo({ mp4, webm, poster, title = "Demo video", trackVtt }: Props) {
  return (
    <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-white/10 bg-black/40">
      <video
        className="absolute inset-0 w-full h-full"
        poster={poster}
        controls
        playsInline
        preload="metadata"
      >
        {webm && <source src={webm} type="video/webm" />}
        <source src={mp4} type="video/mp4" />
        {trackVtt && <track kind="captions" src={trackVtt} srcLang="fr" label="Français" default />}
        {/* Fallback texte si aucun format n'est supporté */}
        Votre navigateur ne peut pas lire cette vidéo.
      </video>
      <span className="sr-only">{title}</span>
    </div>
  );
}