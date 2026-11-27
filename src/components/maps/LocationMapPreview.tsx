import React, { useState } from 'react';
import {
  Map as GoogleMap,
  AdvancedMarker,
  Pin,
  APILoadingStatus,
  useApiLoadingStatus,
} from '@vis.gl/react-google-maps';
import { Maximize2, Navigation, X } from 'lucide-react';
import { useGoogleMapsAvailable } from './GoogleMapsWrapper';
import { SlippyTileMap } from './SlippyTileMap';
import { buildGoogleMapsUrl, getGoogleMapsApiKey } from '../../services/location';

const GMP_ATTRIBUTION_IDS = ['gmp_mcp_codeassist_v1_aistudio'];
const DEMO_MAP_ID = 'DEMO_MAP_ID';

interface LocationMapPreviewProps {
  latitude: number;
  longitude: number;
  locationName?: string;
  mapsUrl?: string;
  isRtl: boolean;
  isOwn?: boolean;
  directMapsRedirect?: boolean;
  edgeToEdge?: boolean;
}

export const LocationMapPreview: React.FC<LocationMapPreviewProps> = ({
  latitude,
  longitude,
  locationName,
  mapsUrl,
  isRtl,
  isOwn = false,
  directMapsRedirect = false,
  edgeToEdge = false,
}) => {
  const isMapsEnabled = useGoogleMapsAvailable();
  const apiStatus = useApiLoadingStatus();
  const [isExpanded, setIsExpanded] = useState(false);

  const apiKey = getGoogleMapsApiKey();
  const hasValidCoords = Number.isFinite(latitude) && Number.isFinite(longitude);

  if (!hasValidCoords) {
    return null;
  }

  const canRenderInteractiveGoogleMap =
    Boolean(apiKey) &&
    isMapsEnabled &&
    apiStatus === APILoadingStatus.LOADED;

  const position = { lat: latitude, lng: longitude };
  const effectiveMapsUrl = mapsUrl || buildGoogleMapsUrl(latitude, longitude);

  // Fast, crisp, zero-iframe WhatsApp/Telegram-style street map thumbnail anchored to exact (lat, lng).
  // Never triggers CSP iframe blocks or Google Static Maps quota failures.
  const previewMapContent = (
    <>
      <SlippyTileMap
        latitude={latitude}
        longitude={longitude}
        zoom={15}
        isRtl={isRtl}
      />

      {!directMapsRedirect && (
        <span
          className={`absolute top-2 ${isRtl ? 'left-2' : 'right-2'} p-1.5 rounded-lg bg-white/95 text-slate-800 shadow-md group-hover:bg-white transition-colors pointer-events-none z-20`}
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </span>
      )}

      {isOwn && !edgeToEdge && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-black/15 to-transparent z-10" />
      )}
    </>
  );

  const previewClassName = `relative block w-full h-[155px] overflow-hidden bg-[#E6EFEA] cursor-pointer group ${
    edgeToEdge ? 'rounded-none border-0' : 'rounded-xl border border-black/10'
  }`;

  return (
    <>
      {directMapsRedirect && effectiveMapsUrl ? (
        <a
          href={effectiveMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label={locationName || (isRtl ? 'فتح الموقع في خرائط جوجل' : 'Open location in Google Maps')}
          className={previewClassName}
        >
          {previewMapContent}
        </a>
      ) : (
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
          className={previewClassName}
        >
          {previewMapContent}
        </div>
      )}

      {!directMapsRedirect && isExpanded && (
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
              {canRenderInteractiveGoogleMap ? (
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
                <SlippyTileMap
                  latitude={latitude}
                  longitude={longitude}
                  zoom={16}
                  showZoomControls={true}
                  isRtl={isRtl}
                />
              )}
            </div>

            {effectiveMapsUrl && (
              <div className="p-3 bg-white border-t border-slate-100 shrink-0">
                <a
                  href={effectiveMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 px-4 rounded-xl bg-[#087F75] hover:bg-[#06685F] text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
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
