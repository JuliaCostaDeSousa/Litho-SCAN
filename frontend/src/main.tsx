import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './index.css'
import App from './App.tsx'
import ScanMenu from './ScanMenu.tsx';
import ScanPage from './ScanPage.tsx';
import ResultsPage from './ResultsPage.tsx';
import ExportPage from './ExportPage.tsx';

window.addEventListener('error', (e) => {
  console.error('[window.onerror]', e.message, e.error);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[unhandledrejection]', e.reason);
});
console.log('[debug] global handlers installed');

const router = createBrowserRouter([
  { path: '/', element: <App /> }, // capture + predict
  { path: '/confirm', element: <ScanMenu /> }, // menu scan
  { path: '/scan', element: <ScanPage /> }, // scan en cours
  { path: '/results', element: <ResultsPage /> }, // affichage Top-3
  { path: '/exportPdf', element: <ExportPage /> }, // export pdf
]);

createRoot(document.getElementById('root')!).render(
  <RouterProvider router={router} />
)
