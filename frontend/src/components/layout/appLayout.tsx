// layout par défaut
import { Outlet } from "react-router-dom";
import Header from "./header";
import Footer from "./footer";

export default function AppLayout() {
  // Hauteurs standard (doivent matcher h-20 et h-14)
  const HEADER_H = 80; // px
  const FOOTER_H = 56; // px
  const MIN_MAIN = 520; // px => ta hauteur minimale "jolie" quand peu de contenu

  return (
    <div className="min-h-screen flex flex-col bg-neutral-100
    bg-[url('/ui/bg.png')] bg-cover bg-center">
      {/* Header fixe 80px */}
      <header className="h-30 border-b bg-neutral-900/60 text-white">
        <div className="mx-auto max-w-7xl h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          <Header />
        </div>
      </header>

      {/* Main : centré si peu de contenu, sinon s'étend */}
      <main id="main" className="px-4 sm:px-6 lg:px-8">
        <div
          className="mx-auto max-w-7xl grid place-content-center"
          style={{
            // min-height = max(hauteur_min, viewport - header - footer)
            minHeight: `max(${MIN_MAIN}px, calc(100svh - ${HEADER_H}px - ${FOOTER_H}px))`,
          }}
        >
          <div className="w-full rounded-2xl bg-transparent p-6 shadow-sm">
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
