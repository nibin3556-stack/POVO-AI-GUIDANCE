import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Fonts are bundled: the Posit VM cannot reach Google Fonts.
import '@fontsource-variable/heebo';
import 'material-symbols/rounded.css';
import './styles/index.css';
import App from './App';
import { setupStore } from './redux/store';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');

const store = setupStore();

createRoot(rootElement).render(
  <StrictMode>
    <App store={store} />
  </StrictMode>,
);
