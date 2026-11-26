import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Global styles first, so component styles (imported by App) can override them.
// Brand fonts are self-hosted (no request to Google Fonts: better for privacy and speed).
import '@fontsource-variable/atkinson-hyperlegible-next';
import '@fontsource-variable/atkinson-hyperlegible-next/wght-italic.css';
import '@fontsource-variable/jetbrains-mono';
import './styles/tokens.css';
import './styles/base.css';
import App from './App.jsx';

createRoot(/** @type {HTMLElement} */ (document.getElementById('root'))).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
