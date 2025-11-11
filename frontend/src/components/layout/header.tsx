import { Link, NavLink } from "react-router-dom";

export default function Header() {
  return (
    <div className="w-full flex items-center justify-between">
      {/* Logo + titre (clique -> /) */}
      <Link to="/" className="flex items-center gap-3 shrink-0 group">
        {/* Image du logo */}
        <img
          src="/ui/logo.png"
          alt="Litho-SCAN"
          className="h-20 w-auto select-none"
          draggable={false}
        />
        {/* Titre optionnel */}
        <span className="text-white/95 text-[30px] font-semibold tracking-tight group-hover:text-white">
          Litho-SCAN
        </span>
      </Link>

      {/* Nav simple (facultatif) */}
      <nav className="hidden sm:flex items-center gap-4 text-sm">
        <NavLink
          to="/"
          className={({ isActive }) =>
            [
              "px-4 py-2 rounded-lg transition-colors text-sm sm:text-base",
              isActive ? "bg-white/10 text-white" : "text-white/80 hover:text-white"
            ].join(" ")
          }
        >
          Accueil
        </NavLink>

      </nav>
    </div>
  );
}
