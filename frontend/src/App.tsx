import { CssBaseline, StyledEngineProvider, ThemeProvider } from '@mui/material';
import { useMemo } from 'react';
import { Toaster } from 'react-hot-toast';
import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router';
import { getTheme } from './context/theme';
import type { AppStore } from './redux/store';
import { createAppRouter } from './routes/router';

interface AppProps {
  store: AppStore;
}

/** Providers: Redux, MUI (in the `mui` CSS layer so Tailwind utilities win), toasts, router. */
const App = ({ store }: AppProps) => {
  const theme = useMemo(() => getTheme(), []);
  const router = useMemo(() => createAppRouter(), []);
  return (
    <Provider store={store}>
      <StyledEngineProvider enableCssLayer>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
          <RouterProvider router={router} />
        </ThemeProvider>
      </StyledEngineProvider>
    </Provider>
  );
};

export default App;
