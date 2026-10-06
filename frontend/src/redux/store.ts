import { combineReducers, configureStore, createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';
import { registerBrandGetter, registerImpersonationGetter } from '../config/axiosConfig';
import { baseApi } from './api/baseApi';
import callSessionReducer, { callSessionReset } from './callSession/callSessionSlice';
import sessionReducer, {
  brandSelected,
  impersonationEnded,
  impersonationStarted,
  persistBrand,
  persistImpersonation,
} from './session/sessionSlice';

export const rootReducer = combineReducers({
  session: sessionReducer,
  callSession: callSessionReducer,
  [baseApi.reducerPath]: baseApi.reducer,
});

export type RootState = ReturnType<typeof rootReducer>;

/**
 * Impersonation or brand change: persist it, then drop every cached response
 * and the call session — every figure on screen belongs to the new effective
 * user or brand.
 */
const createImpersonationListener = () => {
  const listener = createListenerMiddleware();
  listener.startListening({
    matcher: isAnyOf(impersonationStarted, impersonationEnded, brandSelected),
    effect: (_action, api) => {
      const { session } = api.getState() as RootState;
      persistImpersonation(session.impersonation);
      persistBrand(session.brandCode);
      api.dispatch(callSessionReset());
      api.dispatch(baseApi.util.resetApiState());
    },
  });
  return listener;
};

export const setupStore = (preloadedState?: Partial<RootState>) => {
  const listener = createImpersonationListener();
  const store = configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: (getDefault) => getDefault().prepend(listener.middleware).concat(baseApi.middleware),
  });
  registerImpersonationGetter(() => store.getState().session.impersonation?.employeeId ?? null);
  registerBrandGetter(() => store.getState().session.brandCode);
  return store;
};

export type AppStore = ReturnType<typeof setupStore>;
export type AppDispatch = AppStore['dispatch'];
