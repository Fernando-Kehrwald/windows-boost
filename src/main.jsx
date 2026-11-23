import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';

async function boot() {
  // Pré-visualização no navegador (sem Electron): usa dados de exemplo.
  if (!window.api) { const m = await import('./mock.js'); m.install(); }
  createRoot(document.getElementById('root')).render(<App />);
}
boot();
