// gère les différentes routes
import { createBrowserRouter } from "react-router-dom";
import AppLayout from "../components/layout/appLayout.tsx";

import PhotoPage from "../PhotoPage";       // '/photo'
import ScanMenu from "../ScanMenu";         // '/confirm'
import ScanPage from "../ScanPage";         // '/scan'
import ResultsPage from "../ResultsPage";   // '/results'
import ExportPage from "../ExportPage";     // '/exportPdf'
import LandingPage from "../LandingPage";   // '/landing'
import ModelPage from "../ModelPage";       // '/model'

export const router = createBrowserRouter([
  {
    element: <AppLayout />, // header + footer
    children: [
      { index: true, element: <LandingPage /> },
      { path: "confirm", element: <ScanMenu /> },
      { path: "scan", element: <ScanPage /> },
      { path: "results", element: <ResultsPage /> },
      { path: "exportPdf", element: <ExportPage /> },
      { path: "identification", element: <PhotoPage />},
      { path: "IA", element: <ModelPage />},
    ],
  },
]);
