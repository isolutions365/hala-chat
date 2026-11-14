import React, { useState, useEffect } from 'react';
import {
  Map as GoogleMap,
  AdvancedMarker,
  Pin,
  APILoadingStatus,
  useApiLoadingStatus,
} from '@vis.gl/react-google-maps';
import { Maximize2, Navigation, X } from 'lucide-react';
import { useGoogleMapsAvailable } from './GoogleMapsWrapper';
import { getGoogleMapsApiKey } from '../../services/location';

const GMP_ATTRIBUTION_IDS = ['gmp_mcp_codeassist_v1_aistudio'];
const DEMO_MAP_ID = 'DEMO_MAP_ID';

interface LocationMapPreviewProps {
  latitude: number;
  longitude: number;
  locationName?: string;
  mapsUrl?: string;
  isRtl: boolean;
  isOwn?: boolean;
}

export const LocationMapPreview: React.FC<LocationMapPreviewProps> = ({
  latitude,
  longitude,
  locationName,
  mapsUrl,
  isRtl,
  isOwn = false,
}) => {
  const isMapsEnabled = useGoogleMapsAvailable();
  const apiStatus = useApiLoadingStatus();
  const [isExpanded, setIsExpanded] = useState(false);
  const [staticImgError, setStaticImgError] = useState(false);

  const apiKey = getGoogleMapsApiKey();
  const hasValidCoords = Number.isFinite(latitude) && Number.isFinite(longitude);

  useEffect(() => {
    setStaticImgError(false);
  }, [latitude, longitude, apiKey]);

  if (!apiKey || !hasValidCoords || staticImgError) {
    return null;
  }

  const canRenderInteractiveMap =
    isMapsEnabled &&
    hasValidCoords &&
    apiStatus !== APILoadingStatus.FAILED &&
    apiStatus !== APILoadingStatus.AUTH_FAILURE;

  const position = { lat: latitude, lng: longitude };
  const latStr = encodeURIComponent(String(latitude));
  const lngStr = encodeURIComponent(String(longitude));
  const staticMapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${latStr},${lngStr}&zoom=15&size=480x240&scale=2&markers=color:0x087F75%7C${latStr},${lngStr}&key=${encodeURIComponent(apiKey)}`;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          setIsExpanded(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            setIsExpanded(true);
          }
        }}
        aria-label={isRtl ? 'توسيع الخريطة' : 'Expand map'}
        title={isRtl ? 'توسيع الخريطة' : 'Expand map'}
        className="relative w-full h-[140px] rounded-xl overflow-hidden border border-black/10 bg-slate-200/70 cursor-pointer group"
      >
        <img
          src={staticMapUrl}
          alt={locationName || (isRtl ? 'خريطة الموقع' : 'Shared location map')}
          loading="lazy"
          onError={() => setStaticImgError(true)}
          className="w-full h-full object-cover"
        />

        <span
          className={`absolute top-2 ${isRtl ? 'left-2' : 'right-2'} p-1.5 rounded-lg bg-white/95 text-slate-800 shadow-md group-hover:bg-white transition-colors pointer-events-none`}
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </span>

        {isOwn && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-black/15 to-transparent" />
        )}
      </div>

      {isExpanded && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
          onClick={() => setIsExpanded(false)}
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          <div
            className="w-full max-w-lg h-[72vh] max-h-[620px] bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 bg-white border-b border-slate-100 flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900 truncate">
                  {locationName || (isRtl ? 'الموقع المشارك' : 'Shared Location')}
                </h3>
                <p className="text-[11px] font-mono text-slate-500">
                  {latitude.toFixed(5)}, {longitude.toFixed(5)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                aria-label={isRtl ? 'إغلاق الخريطة' : 'Close map'}
                className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 min-h-0 relative bg-slate-100">
              {canRenderInteractiveMap ? (
                <GoogleMap
                  defaultCenter={position}
                  defaultZoom={16}
                  mapId={DEMO_MAP_ID}
                  gestureHandling="greedy"
                  streetViewControl={false}
                  mapTypeControl={false}
                  fullscreenControl={false}
                  internalUsageAttributionIds={GMP_ATTRIBUTION_IDS}
                  style={{ width: '100%', height: '100%' }}
                >
                  <AdvancedMarker position={position} title={locationName || 'Shared location'}>
                    <Pin background="#087F75" borderColor="#055851" glyphColor="#FFFFFF" scale={1.15} />
                  </AdvancedMarker>
                </GoogleMap>
              ) : (
                <img
                  src={staticMapUrl}
                  alt={locationName || (isRtl ? 'خريطة الموقع' : 'Shared location map')}
                  className="w-full h-full object-cover"
                />
              )}
            </div>

            {mapsUrl && (
              <div className="p-3 bg-white border-t border-slate-100 shrink-0">
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 px-4 rounded-xl bg-[#087F75] hover:bg-[#06685F] text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  <Navigation className="w-4 h-4" />
                  <span>{isRtl ? 'فتح الاتجاهات في خرائط جوجل' : 'Open Directions in Google Maps'}</span>
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
