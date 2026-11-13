import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Map as GoogleMap,
  AdvancedMarker,
  Pin,
  APILoadingStatus,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { Loader2, LocateFixed, MapPin, Search, Send, X } from 'lucide-react';
import {
  buildGoogleMapsUrl,
  getCurrentLocationWithAddress,
  getLocationErrorMessage,
  reportGmpQuotaErrorIfApplicable,
  ResolvedLocationResult,
  reverseGeocodeCoordinates,
} from '../../services/location';
import { Language } from '../../types';
import { useGoogleMapsAvailable } from './GoogleMapsWrapper';

const GMP_ATTRIBUTION_IDS = ['gmp_mcp_codeassist_v1_aistudio'];
const DEMO_MAP_ID = 'DEMO_MAP_ID';

// Riyadh default fallback center if device GPS has not resolved yet
const DEFAULT_CENTER = { lat: 24.7136, lng: 46.6753 };

interface LocationPickerModalProps {
  isOpen: boolean;
  language: Language;
  title?: string;
  subtitle?: string;
  confirmLabel?: string;
  onClose: () => void;
  onConfirmLocation: (location: ResolvedLocationResult) => void;
}

function MapCameraSync({
  center,
  viewport,
  panRevision,
}: {
  center: { lat: number; lng: number };
  viewport?: google.maps.LatLngBounds | null;
  panRevision: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || panRevision === 0) return;
    if (viewport) {
      map.fitBounds(viewport);
    } else {
      map.panTo(center);
      const currentZoom = map.getZoom();
      if (!currentZoom || currentZoom < 14) {
        map.setZoom(15);
      }
    }
  }, [map, center, viewport, panRevision]);

  return null;
}

export const LocationPickerModal: React.FC<LocationPickerModalProps> = ({
  isOpen,
  language,
  title,
  subtitle,
  confirmLabel,
  onClose,
  onConfirmLocation,
}) => {
  const isRtl = language === 'ar';
  const isMapsEnabled = useGoogleMapsAvailable();
  const apiStatus = useApiLoadingStatus();
  const placesLib = useMapsLibrary('places');

  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lng: number }>(DEFAULT_CENTER);
  const [selectedAddress, setSelectedAddress] = useState<string>('');
  const [hasResolvedSelection, setHasResolvedSelection] = useState<boolean>(false);
  const [usedFallbackAccuracy, setUsedFallbackAccuracy] = useState<boolean>(false);
  const [isDetectingGps, setIsDetectingGps] = useState<boolean>(false);
  const [isResolvingAddress, setIsResolvingAddress] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [panRevision, setPanRevision] = useState<number>(0);
  const [selectedViewport, setSelectedViewport] = useState<google.maps.LatLngBounds | null>(null);

  // Places Autocomplete (New) state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState<boolean>(false);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  const canRenderInteractiveMap =
    isMapsEnabled &&
    apiStatus !== APILoadingStatus.FAILED &&
    apiStatus !== APILoadingStatus.AUTH_FAILURE;

  const detectCurrentPosition = useCallback(async () => {
    setIsDetectingGps(true);
    setErrorMessage(null);
    setStatusMessage(isRtl ? 'جاري تحديد موقعك الحالي...' : 'Detecting your current location...');

    try {
      const resolved = await getCurrentLocationWithAddress({
        language,
        onFallbackToLowAccuracy: () => {
          setStatusMessage(
            isRtl
              ? 'تعذر تحديد الموقع بدقة عالية، جاري المحاولة بالدقة القياسية...'
              : 'High accuracy unavailable, trying standard location...'
          );
        },
      });
      setSelectedCoords({ lat: resolved.latitude, lng: resolved.longitude });
      setSelectedAddress(resolved.locationName);
      setUsedFallbackAccuracy(resolved.usedFallbackAccuracy);
      setSelectedViewport(null);
      setHasResolvedSelection(true);
      setPanRevision((prev) => prev + 1);
      setStatusMessage(null);
    } catch (err) {
      setErrorMessage(getLocationErrorMessage(err, isRtl));
      setStatusMessage(null);
    } finally {
      setIsDetectingGps(false);
    }
  }, [isRtl, language]);

  // Run GPS detection automatically when modal opens
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setSuggestions([]);
      setErrorMessage(null);
      setStatusMessage(null);
      sessionTokenRef.current = null;
      return;
    }
    void detectCurrentPosition();
  }, [isOpen, detectCurrentPosition]);

  // Debounced Places API (New) AutocompleteSuggestion fetch
  useEffect(() => {
    if (!isOpen || !canRenderInteractiveMap || !placesLib) return;

    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSuggestions([]);
      setIsSearchingPlaces(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsSearchingPlaces(true);
        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new placesLib.AutocompleteSessionToken();
        }
        const response = await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: trimmed,
          sessionToken: sessionTokenRef.current,
          language: isRtl ? 'ar' : 'en',
        });
        setSuggestions(response.suggestions || []);
      } catch (err) {
        reportGmpQuotaErrorIfApplicable(err);
        setSuggestions([]);
      } finally {
        setIsSearchingPlaces(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [isOpen, canRenderInteractiveMap, placesLib, searchQuery, isRtl]);

  const updatePointFromCoordinates = useCallback(
    async (lat: number, lng: number) => {
      setSelectedCoords({ lat, lng });
      setSelectedViewport(null);
      setHasResolvedSelection(true);
      setErrorMessage(null);
      setIsResolvingAddress(true);
      try {
        const label = await reverseGeocodeCoordinates(lat, lng, language);
        setSelectedAddress(label);
      } finally {
        setIsResolvingAddress(false);
      }
    },
    [language]
  );

  const handleSelectSuggestion = async (suggestion: google.maps.places.AutocompleteSuggestion) => {
    if (!suggestion.placePrediction) return;

    try {
      setIsResolvingAddress(true);
      setErrorMessage(null);
      const place = suggestion.placePrediction.toPlace();
      await place.fetchFields({
        fields: ['displayName', 'formattedAddress', 'location', 'viewport'],
      });

      if (place.location) {
        const lat = place.location.lat();
        const lng = place.location.lng();
        const label =
          place.displayName && place.formattedAddress
            ? `${place.displayName} — ${place.formattedAddress.split(',').slice(0, 2).join(', ')}`
            : place.formattedAddress || place.displayName || suggestion.placePrediction.text.text;

        setSelectedCoords({ lat, lng });
        setSelectedAddress(label);
        setSelectedViewport(place.viewport || null);
        setUsedFallbackAccuracy(false);
        setHasResolvedSelection(true);
        setPanRevision((prev) => prev + 1);
      }
    } catch (err) {
      reportGmpQuotaErrorIfApplicable(err);
      setErrorMessage(
        isRtl ? 'تعذر تحميل تفاصيل هذا الموقع.' : 'Could not load details for the selected place.'
      );
    } finally {
      sessionTokenRef.current = null;
      setSuggestions([]);
      setSearchQuery('');
      setIsResolvingAddress(false);
    }
  };

  const handleConfirm = () => {
    if (!hasResolvedSelection) return;
    const { lat, lng } = selectedCoords;
    onConfirmLocation({
      latitude: lat,
      longitude: lng,
      accuracy: null,
      locationName: selectedAddress || (isRtl ? 'الموقع الجغرافي' : 'Location'),
      mapsUrl: buildGoogleMapsUrl(lat, lng),
      usedFallbackAccuracy,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div
        className="w-full sm:max-w-lg h-[86vh] sm:h-[640px] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-emerald-50 text-[#087F75] flex items-center justify-center">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {title || (isRtl ? 'مشاركة الموقع' : 'Share Location')}
              </h2>
              <p className="text-[11px] text-slate-500">
                {subtitle ||
                  (canRenderInteractiveMap
                    ? isRtl
                      ? 'ابحث عن مكان أو حرّك الدبوس على الخريطة'
                      : 'Search a place or tap the map to drop pin'
                    : isRtl
                      ? 'تحديد موقعك الجغرافي الحالي'
                      : 'Detect your current geographic position')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isRtl ? 'إغلاق' : 'Close'}
            className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Places Search Input */}
        {canRenderInteractiveMap && (
          <div className="p-3 bg-slate-50 border-b border-slate-100 relative shrink-0 z-20">
            <div className="relative flex items-center">
              <Search
                className={`w-4 h-4 text-slate-400 absolute ${isRtl ? 'right-3.5' : 'left-3.5'} pointer-events-none`}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isRtl ? 'ابحث عن عنوان أو معلم...' : 'Search address or landmark...'}
                className={`w-full bg-white border border-slate-200 rounded-xl py-2.5 ${
                  isRtl ? 'pr-10 pl-9' : 'pl-10 pr-9'
                } text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#087F75] focus:ring-2 focus:ring-[#087F75]/15`}
              />
              {isSearchingPlaces ? (
                <Loader2
                  className={`w-4 h-4 text-[#087F75] animate-spin absolute ${isRtl ? 'left-3' : 'right-3'}`}
                />
              ) : searchQuery ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSuggestions([]);
                  }}
                  aria-label={isRtl ? 'مسح البحث' : 'Clear search'}
                  className={`p-1 text-slate-400 hover:text-slate-600 absolute ${isRtl ? 'left-2.5' : 'right-2.5'} cursor-pointer`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : null}
            </div>

            {suggestions.length > 0 && (
              <ul className="absolute left-3 right-3 top-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-56 overflow-y-auto divide-y divide-slate-100 z-30">
                {suggestions.map((suggestion, index) => {
                  const mainText = suggestion.placePrediction?.mainText?.text || suggestion.placePrediction?.text.text;
                  const secondaryText = suggestion.placePrediction?.secondaryText?.text;
                  return (
                    <li key={suggestion.placePrediction?.placeId || index}>
                      <button
                        type="button"
                        onClick={() => void handleSelectSuggestion(suggestion)}
                        className="w-full px-3.5 py-2.5 text-start hover:bg-slate-50 transition-colors flex items-start gap-2.5 cursor-pointer"
                      >
                        <MapPin className="w-4 h-4 text-[#087F75] shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-800 truncate">{mainText}</p>
                          {secondaryText && (
                            <p className="text-[11px] text-slate-500 truncate">{secondaryText}</p>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* Map Canvas or Graceful Fallback */}
        <div className="flex-1 min-h-[220px] relative bg-slate-100">
          {canRenderInteractiveMap ? (
            <>
              <GoogleMap
                defaultCenter={selectedCoords}
                defaultZoom={15}
                mapId={DEMO_MAP_ID}
                gestureHandling="greedy"
                streetViewControl={false}
                mapTypeControl={false}
                fullscreenControl={false}
                internalUsageAttributionIds={GMP_ATTRIBUTION_IDS}
                style={{ width: '100%', height: '100%' }}
                onClick={(ev) => {
                  if (ev.detail.latLng) {
                    void updatePointFromCoordinates(ev.detail.latLng.lat, ev.detail.latLng.lng);
                  }
                }}
              >
                <MapCameraSync
                  center={selectedCoords}
                  viewport={selectedViewport}
                  panRevision={panRevision}
                />
                <AdvancedMarker
                  position={selectedCoords}
                  draggable={true}
                  onDragEnd={(ev) => {
                    if (ev.latLng) {
                      void updatePointFromCoordinates(ev.latLng.lat(), ev.latLng.lng());
                    }
                  }}
                >
                  <Pin background="#087F75" borderColor="#055851" glyphColor="#FFFFFF" scale={1.15} />
                </AdvancedMarker>
              </GoogleMap>

              <button
                type="button"
                onClick={() => void detectCurrentPosition()}
                disabled={isDetectingGps}
                title={isRtl ? 'موقعي الحالي' : 'My current location'}
                aria-label={isRtl ? 'موقعي الحالي' : 'My current location'}
                className={`absolute bottom-4 ${isRtl ? 'left-4' : 'right-4'} w-11 h-11 rounded-2xl bg-white shadow-lg border border-slate-200 text-[#087F75] hover:bg-slate-50 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-60`}
              >
                {isDetectingGps ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <LocateFixed className="w-5 h-5" />
                )}
              </button>
            </>
          ) : (
            <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center gap-3">
              <div className="w-14 h-14 rounded-3xl bg-emerald-100 text-[#087F75] flex items-center justify-center">
                {isDetectingGps ? (
                  <Loader2 className="w-7 h-7 animate-spin" />
                ) : (
                  <MapPin className="w-7 h-7" />
                )}
              </div>
              <p className="text-sm font-semibold text-slate-700 max-w-xs">
                {hasResolvedSelection
                  ? selectedAddress
                  : isRtl
                    ? 'اضغط لتحديد موقعك الحالي عبر نظام تحديد المواقع'
                    : 'Tap below to detect your current GPS position'}
              </p>
              <button
                type="button"
                onClick={() => void detectCurrentPosition()}
                disabled={isDetectingGps}
                className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-[#087F75] shadow-xs hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <LocateFixed className="w-4 h-4" />
                <span>{isRtl ? 'تحديث موقعي' : 'Refresh My Location'}</span>
              </button>
            </div>
          )}

          {(statusMessage || errorMessage) && (
            <div className="absolute top-3 inset-x-3 pointer-events-none flex justify-center z-10">
              <div
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold shadow-md max-w-sm text-center ${
                  errorMessage
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'bg-slate-900/85 text-white'
                }`}
              >
                {errorMessage || statusMessage}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Selection Summary & Send CTA */}
        <div className="p-4 bg-white border-t border-slate-100 space-y-3 shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex items-start gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-[#087F75] flex items-center justify-center shrink-0">
              {isResolvingAddress || isDetectingGps ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <MapPin className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-900 truncate" dir="auto">
                {hasResolvedSelection
                  ? selectedAddress || (isRtl ? 'الموقع المحدد' : 'Selected Location')
                  : isRtl
                    ? 'في انتظار تحديد الموقع...'
                    : 'Waiting for location...'}
              </p>
              <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                {hasResolvedSelection
                  ? `${selectedCoords.lat.toFixed(5)}, ${selectedCoords.lng.toFixed(5)}`
                  : '--, --'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={!hasResolvedSelection || isResolvingAddress}
            className="w-full py-3 px-4 rounded-2xl bg-[#087F75] hover:bg-[#06685F] text-white text-sm font-bold flex items-center justify-center gap-2 shadow-md shadow-teal-900/15 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
            <span>{confirmLabel || (isRtl ? 'إرسال الموقع المحدد' : 'Send This Location')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
