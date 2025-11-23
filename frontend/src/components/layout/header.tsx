// src/header.tsx
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";

export default function Header() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const LANDING_PATH = "/";
  const isLanding = pathname === LANDING_PATH;

  function goSection(id: string) {
    if (isLanding) {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      navigate(`${LANDING_PATH}#${id}`);
    }
  }

  return (
    <div className="w-full flex items-center justify-between gap-2">
      {/* Logo + titre (clique -> /) */}
      <Link to="/" className="flex items-center gap-2 shrink-0">
        <img
          src="/ui/logo.png"
          alt="Litho-SCAN"
          className="h-10 w-auto sm:h-16 select-none"
          draggable={false}
        />
        <span className="text-white/95 font-semibold tracking-tight
                         text-base sm:text-2xl
                         truncate max-w-[40vw] sm:max-w-none">
          Litho-SCAN
        </span>
      </Link>

      {/* Nav compacte + scroll horiz si besoin */}
      <nav className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm
                      overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none]
                      [&::-webkit-scrollbar]:hidden">
        <NavLink
          to="/"
          className={({ isActive }) =>
            [
              "px-3 py-1.5 rounded-md transition-colors",
              isActive ? "bg-white/10 text-white" : "text-white/80 hover:text-white"
            ].join(" ")
          }
        >
          Accueil
        </NavLink>

        <NavLink
          to='/photo'
          className={({ isActive }) =>
            [
              "px-3 py-1.5 rounded-md transition-colors",
              isActive ? "bg-white/10 text-white" : "text-white/80 hover:text-white"
            ].join(" ")
          }
        >
          Photo
        </NavLink>

        {/* Liens vers sections de la landing */}
        <button
          onClick={() => goSection("about")}
          className="px-3 py-1.5 rounded-md text-white/80 hover:text-white"
        >
          À propos
        </button>
        
      </nav>
    </div>
  );
}
