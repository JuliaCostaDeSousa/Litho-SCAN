// layout par défaut
import { Outlet } from "react-router-dom";
import Header from "./header";
import Footer from "./footer";

export default function AppLayout() {
  // Hauteurs standard (doivent matcher h-20 et h-14)
  const HEADER_H = 80; // px (5rem = h-20)
  const FOOTER_H = 56; // px (3.5rem = h-14)
  const MIN_MAIN = 520;

  return (
    <div className="relative min-h-screen flex flex-col">
      {/* BACKDROP fixe plein écran (unifié pour toutes les pages) */}
      <div aria-hidden className="fixed inset-0 -z-10">
        <img
          src="/ui/bg.png"
          alt=""
          className="w-full h-full object-cover"  // même rendu partout, sans “zoom” variable
          // si tu veux un léger assombrissement global comme ailleurs :
          // style={{ filter: 'brightness(0.95)' }}
        />
        {/* Optionnel : léger overlay uniforme */}
        {/* <div className="absolute inset-0 bg-black/10" /> */}
      </div>

      {/* Header fixe 80px — assure-toi que la classe et la constante matchent */}
      <header className="h-20 border-b bg-neutral-900/60 text-white">
        <div className="mx-auto max-w-7xl h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          <Header />
        </div>
      </header>

      {/* Main : centré si peu de contenu, sinon s’étend */}
        <main id="main" className="px-4 sm:px-6 lg:px-8 flex-1">
        <div
            className="mx-auto max-w-5xl py-10 sm:py-12 lg:py-14"
            style={{
            minHeight: `calc(100svh - ${HEADER_H}px - ${FOOTER_H}px)`,
            }}
        >
            {/* Surface standard pour toutes les pages */}
            <div className="w-full rounded-2xl border border-white/10 bg-black/35 backdrop-blur-[2px] shadow-xl p-6 sm:p-8">
            <Outlet />
            </div>
        </div>
        </main>

      {/* Footer fixe 56px */}
      <footer className="h-14 border-t bg-neutral-900/60 text-white">
        <div className="mx-auto max-w-7xl h-full px-4 sm:px-6 lg:px-8 flex items-center text-sm opacity-90">
          <Footer />
        </div>
      </footer>
    </div>
  );
}
