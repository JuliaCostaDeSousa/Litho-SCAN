import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import './index.css'
import App from './App.tsx'
import ScanMenu from "./ScanMenu.tsx";
import ScanPage from "./ScanPage.tsx";
import ResultsPage from "./ResultsPage.tsx";

const router = createBrowserRouter([
  { path: "/", element: <App /> }, // capture + predict
  { path: "/scan", element: <ScanMenu /> }, // menu scan
  { path: "/scanning", element: <ScanPage /> }, // scan en cours
  { path: "/results", element: <ResultsPage /> }, // affichage Top-3
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
