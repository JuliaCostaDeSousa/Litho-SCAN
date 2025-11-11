// gère les différentes routes
import { createBrowserRouter } from "react-router-dom";
import AppLayout from "../components/layout/appLayout.tsx";

import App from "../App.tsx";               // '/'
import ScanMenu from "../ScanMenu";         // '/confirm'
import ScanPage from "../ScanPage";         // '/scan'
import ResultsPage from "../ResultsPage";   // '/results'
import ExportPage from "../ExportPage";     // '/exportPdf'

export const router = createBrowserRouter([
  {
    element: <AppLayout />, // header + footer
    children: [
      { index: true, element: <App /> },           // '/'
      { path: "confirm", element: <ScanMenu /> },  // '/confirm'
      { path: "scan", element: <ScanPage /> },     // '/scan'
      { path: "results", element: <ResultsPage /> },
      { path: "exportPdf", element: <ExportPage /> },
    ],
  },
]);
