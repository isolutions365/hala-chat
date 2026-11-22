import React, { createContext, useContext, useEffect } from 'react';
import { APIProvider, APILoadingStatus, useApiLoadingStatus } from '@vis.gl/react-google-maps';
import { getGoogleMapsApiKey } from '../../services/location';
import { Language } from '../../types';

const GoogleMapsAvailableContext = createContext<boolean>(false);

export function useGoogleMapsAvailable(): boolean {
  return useContext(GoogleMapsAvailableContext);
}

function MapsAuthStatusWatcher() {
  const status = useApiLoadingStatus();

  useEffect(() => {
    if (status === APILoadingStatus.AUTH_FAILURE) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    }
  }, [status]);

  return null;
}

interface GoogleMapsWrapperProps {
  language: Language;
  children: React.ReactNode;
}

export const GoogleMapsWrapper: React.FC<GoogleMapsWrapperProps> = ({ language, children }) => {
  const apiKey = getGoogleMapsApiKey();
  const isAvailable = Boolean(apiKey);

  if (!isAvailable) {
    return (
      <GoogleMapsAvailableContext.Provider value={false}>
        {children}
      </GoogleMapsAvailableContext.Provider>
    );
  }

  return (
    <GoogleMapsAvailableContext.Provider value={true}>
      <APIProvider
        apiKey={apiKey}
        language={language === 'ar' ? 'ar' : 'en'}
        libraries={['places', 'marker']}
      >
        <MapsAuthStatusWatcher />
        {children}
      </APIProvider>
    </GoogleMapsAvailableContext.Provider>
  );
};
