import {AppErrorBoundary} from './components/AppErrorBoundary';
import { applyTypography, readTypography } from './lib/typography';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

applyTypography(readTypography());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary><App /></AppErrorBoundary>
  </StrictMode>,
);
