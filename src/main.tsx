import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// Guard against uncaught promise rejections from third-party network fetches or extensions
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    console.warn('Captured unhandled rejection:', event.reason);
    // Prevent unhandled promise rejections from causing browser crashes
    event.preventDefault();
  });
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
