// layout par défaut
import { Outlet } from "react-router-dom";
import Header from "./header";
import Footer from "./footer";
import ScrollToTop from "./ScrollToTop";

export default function AppLayout() {
  /* Hauteurs standard
  const HEADER_H = 80; // px (5rem = h-20)
  const FOOTER_H = 56; // px (3.5rem = h-14)
  */
  return (
    <div className="relative min-h-screen flex flex-col">
      {/* BACKDROP fixe plein écran (unifié pour toutes les pages) */}
      <div aria-hidden className="fixed inset-0 -z-10">
        <img
          src="/ui/bg.png"
          alt=""
          className="w-full h-full object-cover"
        />
        {/* Optionnel : léger overlay uniforme */}
        {/* <div className="absolute inset-0 bg-black/10" /> */}
      </div>

      <ScrollToTop />

      {/* Header FIXE en haut */}
      <header
        className="
          fixed top-0 left-0 right-0 z-50
          h-20
          bg-neutral-900/60 backdrop-blur-md
          border-b border-white/10
          text-white
        "
      >
        <div className="mx-auto max-w-7xl h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          <Header />
        </div>
      </header>

      {/* Main : on décale le contenu vers le bas avec pt-20 */}
      <main id="main" className="px-4 sm:px-6 lg:px-8 flex-1 pt-20">
      <div className="mx-auto max-w-5xl py-10 sm:py-12 lg:py-14">
          <div className="w-full rounded-2xl border border-white/10 bg-black/35 backdrop-blur-[2px] shadow-xl p-6 sm:p-8">
          <Outlet />
          </div>
      </div>
      </main>

      {/* Footer (toujours en bas, non fixe) */}
      <footer className="h-14 border-t bg-neutral-900/60 text-white">
        <div className="mx-auto max-w-7xl h-full px-4 sm:px-6 lg:px-8 flex items-center text-sm opacity-90">
          <Footer />
        </div>
      </footer>
    </div>
  );
}
