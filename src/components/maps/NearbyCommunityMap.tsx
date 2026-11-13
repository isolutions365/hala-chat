import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Map as GoogleMap,
  AdvancedMarker,
  type AdvancedMarkerProps,
  APILoadingStatus,
  InfoWindow,
  Pin,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMap,
} from '@vis.gl/react-google-maps';
import {
  ExternalLink,
  FileText,
  Loader2,
  LocateFixed,
  MapPin,
  MessageCircle,
  Users,
  X,
} from 'lucide-react';
import {
  buildGoogleMapsUrl,
  calculateDistanceKm,
  formatDistanceLabel,
  getCurrentLocationWithAddress,
  getLocationErrorMessage,
} from '../../services/location';
import type {
  CommunityGeoLocation,
  CommunityGroup,
  CommunityPost,
} from '../../services/community';
import { Language } from '../../types';
import { useGoogleMapsAvailable } from './GoogleMapsWrapper';

const GMP_ATTRIBUTION_IDS = ['gmp_mcp_codeassist_v1_aistudio'];
const DEMO_MAP_ID = 'DEMO_MAP_ID';
const DEFAULT_CENTER = { lat: 24.7136, lng: 46.6753 };

const Z_INDEX_SELECTED = 1000;
const Z_INDEX_HOVER = 999;

export type NearbyMapFilter = 'all' | 'posts' | 'groups';
type RadiusFilterKm = 'all' | 5 | 25 | 100;

interface NearbyCommunityMapProps {
  posts: CommunityPost[];
  groups: CommunityGroup[];
  language: Language;
  onOpenGroup: (groupId: string) => void;
  onSelectPost: (post: CommunityPost) => void;
  onRequestCreatePost?: () => void;
}

type MapItemPost = {
  key: string;
  kind: 'post';
  position: { lat: number; lng: number };
  location: CommunityGeoLocation;
  title: string;
  subtitle: string;
  snippet: string;
  distanceKm: number | null;
  zIndex: number;
  post: CommunityPost;
};

type MapItemGroup = {
  key: string;
  kind: 'group';
  position: { lat: number; lng: number };
  location: CommunityGeoLocation;
  title: string;
  subtitle: string;
  snippet: string;
  distanceKm: number | null;
  zIndex: number;
  group: CommunityGroup;
};

type MapItem = MapItemPost | MapItemGroup;
type RawMapItem = Omit<MapItemPost, 'zIndex'> | Omit<MapItemGroup, 'zIndex'>;

type AdvancedMarkerInstance = google.maps.marker.AdvancedMarkerElement;

interface AdvancedMarkerWithRefProps extends AdvancedMarkerProps {
  onMarkerClick: (marker: AdvancedMarkerInstance) => void;
  onMarkerReady?: (marker: AdvancedMarkerInstance | null) => void;
}

const AdvancedMarkerWithRef: React.FC<AdvancedMarkerWithRefProps> = ({
  children,
  onMarkerClick,
  onMarkerReady,
  ...advancedMarkerProps
}) => {
  const [markerRef, marker] = useAdvancedMarkerRef();

  useEffect(() => {
    onMarkerReady?.(marker);
    return () => {
      onMarkerReady?.(null);
    };
  }, [marker, onMarkerReady]);

  return (
    <AdvancedMarker
      ref={markerRef}
      onClick={() => {
        if (marker) {
          onMarkerClick(marker);
        }
      }}
      {...advancedMarkerProps}
    >
      {children}
    </AdvancedMarker>
  );
};

function MapViewportSync({
  items,
  userCoords,
  focusedPosition,
  focusRevision,
  boundsRevision,
}: {
  items: MapItem[];
  userCoords: { lat: number; lng: number } | null;
  focusedPosition: { lat: number; lng: number } | null;
  focusRevision: number;
  boundsRevision: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || !focusedPosition || focusRevision === 0) return;
    map.panTo(focusedPosition);
    const zoom = map.getZoom();
    if (!zoom || zoom < 14) {
      map.setZoom(14);
    }
  }, [map, focusedPosition, focusRevision]);

  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps?.LatLngBounds) return;
    const points = [
      ...items.map((item) => item.position),
      ...(userCoords ? [userCoords] : []),
    ];
    if (points.length === 0) {
      map.panTo(DEFAULT_CENTER);
      map.setZoom(10);
      return;
    }
    if (points.length === 1) {
      map.panTo(points[0]);
      map.setZoom(13);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    points.forEach((pt) => bounds.extend(pt));
    map.fitBounds(bounds, { top: 44, right: 44, bottom: 44, left: 44 });
  }, [map, items, userCoords, boundsRevision]);

  return null;
}

export const NearbyCommunityMap: React.FC<NearbyCommunityMapProps> = ({
  posts,
  groups,
  language,
  onOpenGroup,
  onSelectPost,
  onRequestCreatePost,
}) => {
  const isRtl = language === 'ar';
  const isMapsEnabled = useGoogleMapsAvailable();
  const apiStatus = useApiLoadingStatus();

  const [typeFilter, setTypeFilter] = useState<NearbyMapFilter>('all');
  const [radiusKm, setRadiusKm] = useState<RadiusFilterKm>('all');
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [userLocationLabel, setUserLocationLabel] = useState<string>('');
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<AdvancedMarkerInstance | null>(null);
  const [focusedPosition, setFocusedPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [focusRevision, setFocusRevision] = useState(0);
  const [boundsRevision, setBoundsRevision] = useState(0);

  const markerRefs = useRef<Record<string, AdvancedMarkerInstance | null>>({});

  const canRenderInteractiveMap =
    isMapsEnabled &&
    apiStatus !== APILoadingStatus.FAILED &&
    apiStatus !== APILoadingStatus.AUTH_FAILURE;

  const allMappedItems = useMemo(() => {
    const rawItems: RawMapItem[] = [];

    groups.forEach((group) => {
      if (!group.location) return;
      const dist = userCoords
        ? calculateDistanceKm(
            userCoords.lat,
            userCoords.lng,
            group.location.latitude,
            group.location.longitude
          )
        : null;
      rawItems.push({
        key: `group:${group.id}`,
        kind: 'group',
        position: { lat: group.location.latitude, lng: group.location.longitude },
        location: group.location,
        title: group.name,
        subtitle: `${group.memberCount} ${
          isRtl ? 'عضو' : group.memberCount === 1 ? 'member' : 'members'
        }`,
        snippet: group.description,
        distanceKm: dist,
        group,
      });
    });

    posts.forEach((post) => {
      if (!post.location) return;
      const dist = userCoords
        ? calculateDistanceKm(
            userCoords.lat,
            userCoords.lng,
            post.location.latitude,
            post.location.longitude
          )
        : null;
      rawItems.push({
        key: `post:${post.id}`,
        kind: 'post',
        position: { lat: post.location.latitude, lng: post.location.longitude },
        location: post.location,
        title: post.authorName,
        subtitle: post.groupName || (isRtl ? 'المجتمع العام' : 'Public Feed'),
        snippet: post.text || post.poll?.question || post.location.locationName,
        distanceKm: dist,
        post,
      });
    });

    return rawItems;
  }, [groups, posts, userCoords, isRtl]);

  const counts = useMemo(() => {
    let postsCount = 0;
    let groupsCount = 0;
    allMappedItems.forEach((item) => {
      if (
        userCoords &&
        radiusKm !== 'all' &&
        item.distanceKm !== null &&
        item.distanceKm > radiusKm
      ) {
        return;
      }
      if (item.kind === 'post') postsCount += 1;
      else groupsCount += 1;
    });
    return {
      all: postsCount + groupsCount,
      posts: postsCount,
      groups: groupsCount,
    };
  }, [allMappedItems, userCoords, radiusKm]);

  const filteredItems = useMemo<MapItem[]>(() => {
    const visible = allMappedItems.filter((item) => {
      if (typeFilter === 'posts' && item.kind !== 'post') return false;
      if (typeFilter === 'groups' && item.kind !== 'group') return false;
      if (
        userCoords &&
        radiusKm !== 'all' &&
        item.distanceKm !== null &&
        item.distanceKm > radiusKm
      ) {
        return false;
      }
      return true;
    });

    // Sort descending latitude so southern markers stack cleanly in front of northern markers
    const sortedForZ = [...visible].sort((a, b) => b.position.lat - a.position.lat);
    return sortedForZ.map((item, idx) => ({
      ...item,
      zIndex: idx,
    })) as MapItem[];
  }, [allMappedItems, typeFilter, userCoords, radiusKm]);

  const listItems = useMemo(() => {
    const copy = [...filteredItems];
    if (userCoords) {
      copy.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    }
    return copy;
  }, [filteredItems, userCoords]);

  const selectedItem = useMemo(
    () => filteredItems.find((item) => item.key === selectedKey) || null,
    [filteredItems, selectedKey]
  );

  // Close InfoWindow if active item gets filtered out
  useEffect(() => {
    if (selectedKey && !selectedItem) {
      setSelectedKey(null);
      setSelectedMarker(null);
    }
  }, [selectedKey, selectedItem]);

  const handleLocateMe = useCallback(async () => {
    if (isLocating) return;
    setIsLocating(true);
    setLocationError(null);
    try {
      const resolved = await getCurrentLocationWithAddress({ language });
      setUserCoords({ lat: resolved.latitude, lng: resolved.longitude });
      setUserLocationLabel(resolved.locationName);
      setBoundsRevision((prev) => prev + 1);
    } catch (err) {
      setLocationError(getLocationErrorMessage(err, isRtl));
    } finally {
      setIsLocating(false);
    }
  }, [isLocating, language, isRtl]);

  const handleClearUserLocation = () => {
    setUserCoords(null);
    setUserLocationLabel('');
    setRadiusKm('all');
    setLocationError(null);
    setBoundsRevision((prev) => prev + 1);
  };

  const handleMarkerClick = useCallback(
    (key: string, marker: AdvancedMarkerInstance) => {
      setSelectedKey(key);
      setSelectedMarker(marker);
    },
    []
  );

  const handleSelectListItem = (item: MapItem) => {
    setSelectedKey(item.key);
    const marker = markerRefs.current[item.key] || null;
    setSelectedMarker(marker);
    setFocusedPosition(item.position);
    setFocusRevision((prev) => prev + 1);
  };

  return (
    <div className="space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Filter & Location Controls Card */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-3 space-y-2.5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Type Filter Chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {(
              [
                { id: 'all', label: isRtl ? 'الكل' : 'All', count: counts.all },
                { id: 'posts', label: isRtl ? 'المنشورات' : 'Posts', count: counts.posts },
                { id: 'groups', label: isRtl ? 'المجموعات' : 'Groups', count: counts.groups },
              ] as const
            ).map((tab) => {
              const active = typeFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setTypeFilter(tab.id);
                    setBoundsRevision((prev) => prev + 1);
                  }}
                  className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#087F75] text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold ${
                      active ? 'bg-white/20 text-white' : 'bg-white text-slate-600'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Near Me Explicit GPS Trigger */}
          <div className="flex items-center gap-1.5">
            {userCoords ? (
              <div className="inline-flex items-center gap-1 bg-sky-50 border border-sky-200 text-sky-800 rounded-xl px-2.5 py-1.5 text-xs font-semibold max-w-[220px]">
                <LocateFixed className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                <span className="truncate">
                  {userLocationLabel || (isRtl ? 'موقعك الحالي' : 'Near you')}
                </span>
                <button
                  type="button"
                  onClick={handleClearUserLocation}
                  aria-label={isRtl ? 'مسح الموقع' : 'Clear location'}
                  className="p-0.5 rounded-full hover:bg-sky-200/60 text-sky-700 cursor-pointer shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={isLocating}
                onClick={() => void handleLocateMe()}
                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-[#087F75] text-[#087F75] hover:text-white border border-[#087F75]/20 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
              >
                {isLocating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <LocateFixed className="w-3.5 h-3.5" />
                )}
                <span>{isRtl ? 'بالقرب مني' : 'Near Me'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Radius Filter Row (active when user location is shared) */}
        {userCoords && (
          <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-slate-100">
            <span className="text-[11px] font-bold text-slate-500 me-1">
              {isRtl ? 'النطاق:' : 'Radius:'}
            </span>
            {(['all', 5, 25, 100] as const).map((r) => {
              const active = radiusKm === r;
              return (
                <button
                  key={String(r)}
                  type="button"
                  onClick={() => {
                    setRadiusKm(r);
                    setBoundsRevision((prev) => prev + 1);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                    active
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {r === 'all' ? (isRtl ? 'الكل' : 'Any distance') : `${r} km`}
                </button>
              );
            })}
          </div>
        )}

        {/* Map Legend */}
        <div className="flex items-center gap-4 pt-1 text-[11px] font-semibold text-slate-500 flex-wrap">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#087F75]" />
            <span>{isRtl ? 'منشورات الأعضاء' : 'User Posts'}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#D97706]" />
            <span>{isRtl ? 'مجموعات المجتمع' : 'Community Groups'}</span>
          </span>
          {userCoords && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#0284C7]" />
              <span>{isRtl ? 'موقعك' : 'Your Location'}</span>
            </span>
          )}
        </div>

        {locationError && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700">
            {locationError}
          </div>
        )}
      </div>

      {/* Interactive Google Map Canvas */}
      <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-2xs">
        <div className="relative w-full h-[340px] sm:h-[400px] bg-slate-100">
          {canRenderInteractiveMap ? (
            <GoogleMap
              defaultCenter={userCoords || DEFAULT_CENTER}
              defaultZoom={11}
              mapId={DEMO_MAP_ID}
              gestureHandling="greedy"
              streetViewControl={false}
              mapTypeControl={false}
              fullscreenControl={false}
              internalUsageAttributionIds={GMP_ATTRIBUTION_IDS}
              style={{ width: '100%', height: '100%' }}
              onClick={() => {
                setSelectedKey(null);
                setSelectedMarker(null);
              }}
            >
              <MapViewportSync
                items={filteredItems}
                userCoords={userCoords}
                focusedPosition={focusedPosition}
                focusRevision={focusRevision}
                boundsRevision={boundsRevision}
              />

              {/* User Current GPS Marker */}
              {userCoords && (
                <AdvancedMarker
                  position={userCoords}
                  zIndex={Z_INDEX_SELECTED + 1}
                  title={isRtl ? 'موقعك الحالي' : 'Your current location'}
                >
                  <Pin
                    background="#0284C7"
                    borderColor="#075985"
                    glyphColor="#FFFFFF"
                    scale={1.05}
                  />
                </AdvancedMarker>
              )}

              {/* Community Post & Group Markers */}
              {filteredItems.map((item) => {
                const isSelected = selectedKey === item.key;
                const isHovered = hoverKey === item.key;
                let zIndex = item.zIndex;
                if (isHovered) zIndex = Z_INDEX_HOVER;
                if (isSelected) zIndex = Z_INDEX_SELECTED;

                const isGroup = item.kind === 'group';

                return (
                  <AdvancedMarkerWithRef
                    key={item.key}
                    position={item.position}
                    zIndex={zIndex}
                    title={`${item.title} — ${item.location.locationName}`}
                    onMouseEnter={() => setHoverKey(item.key)}
                    onMouseLeave={() => setHoverKey(null)}
                    onMarkerReady={(marker) => {
                      markerRefs.current[item.key] = marker;
                    }}
                    onMarkerClick={(marker) => handleMarkerClick(item.key, marker)}
                  >
                    <Pin
                      background={isGroup ? '#D97706' : '#087F75'}
                      borderColor={isGroup ? '#92400E' : '#055851'}
                      glyphColor="#FFFFFF"
                      scale={isSelected ? 1.25 : 1.0}
                    >
                      {isGroup ? (
                        <Users className="w-3.5 h-3.5 text-white" />
                      ) : (
                        <FileText className="w-3.5 h-3.5 text-white" />
                      )}
                    </Pin>
                  </AdvancedMarkerWithRef>
                );
              })}

              {/* Anchored InfoWindow for Selected Marker */}
              {selectedItem && selectedMarker && (
                <InfoWindow
                  anchor={selectedMarker}
                  pixelOffset={[0, -4]}
                  onCloseClick={() => {
                    setSelectedKey(null);
                    setSelectedMarker(null);
                  }}
                >
                  <div
                    className="min-w-[210px] max-w-[260px] p-1 space-y-2 text-slate-900"
                    dir={isRtl ? 'rtl' : 'ltr'}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wide ${
                          selectedItem.kind === 'group'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-teal-100 text-[#087F75]'
                        }`}
                      >
                        {selectedItem.kind === 'group'
                          ? isRtl
                            ? 'مجموعة'
                            : 'Group'
                          : isRtl
                          ? 'منشور'
                          : 'Post'}
                      </span>
                      {selectedItem.distanceKm !== null && (
                        <span className="text-[11px] font-bold text-sky-700">
                          {formatDistanceLabel(selectedItem.distanceKm, isRtl)}
                        </span>
                      )}
                    </div>

                    <div>
                      <h4 className="text-xs font-bold text-[#112330] truncate">
                        {selectedItem.title}
                      </h4>
                      <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-[#087F75] shrink-0" />
                        <span className="truncate">{selectedItem.location.locationName}</span>
                      </p>
                    </div>

                    {selectedItem.snippet && (
                      <p className="text-xs text-slate-700 line-clamp-2 leading-snug">
                        {selectedItem.snippet}
                      </p>
                    )}

                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedItem.kind === 'group') {
                            onOpenGroup(selectedItem.group.id);
                          } else {
                            onSelectPost(selectedItem.post);
                          }
                        }}
                        className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#087F75] hover:bg-[#06685F] text-white text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                      >
                        {selectedItem.kind === 'group' ? (
                          <>
                            <Users className="w-3 h-3" />
                            <span>{isRtl ? 'فتح المجموعة' : 'Open Group'}</span>
                          </>
                        ) : (
                          <>
                            <MessageCircle className="w-3 h-3" />
                            <span>{isRtl ? 'عرض المنشور' : 'View Post'}</span>
                          </>
                        )}
                      </button>

                      <a
                        href={buildGoogleMapsUrl(
                          selectedItem.location.latitude,
                          selectedItem.location.longitude
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={isRtl ? 'فتح في خرائط جوجل' : 'Open in Google Maps'}
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                </InfoWindow>
              )}
            </GoogleMap>
          ) : (
            <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center gap-2 bg-slate-100">
              <MapPin className="w-8 h-8 text-[#087F75]" />
              <p className="text-sm font-bold text-slate-700">
                {isRtl ? 'الخريطة التفاعلية غير متوفرة حالياً' : 'Interactive map unavailable right now'}
              </p>
              <p className="text-xs text-slate-500 max-w-xs">
                {isRtl
                  ? 'يمكنك تصفح المواقع القريبة من القائمة أدناه وفتحها في خرائط جوجل.'
                  : 'You can still browse tagged locations below and open them in Google Maps.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Nearby Tagged Posts & Groups List */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
            {isRtl ? 'المواقع المثبتة على الخريطة' : 'Pinned Locations Nearby'} ({listItems.length})
          </h3>
        </div>

        {listItems.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center space-y-2.5">
            <div className="w-11 h-11 rounded-2xl bg-teal-50 text-[#087F75] flex items-center justify-center mx-auto">
              <MapPin className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-bold text-[#112330]">
              {isRtl ? 'لا توجد مواقع منشورة ضمن هذا النطاق' : 'No tagged posts or groups in this view'}
            </h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {isRtl
                ? 'أضف موقعاً عند إنشاء منشور مجتمع أو مجموعة ليظهر هنا للأعضاء القريبين.'
                : 'Tag a location when creating a community post or group so members nearby can discover it on the map.'}
            </p>
            {onRequestCreatePost && (
              <button
                type="button"
                onClick={onRequestCreatePost}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-[#087F75] hover:bg-[#06685F] text-white text-xs font-bold cursor-pointer"
              >
                {isRtl ? 'مشاركة منشور مع موقع' : 'Create Post with Location'}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {listItems.map((item) => {
              const isSelected = selectedKey === item.key;
              const isGroup = item.kind === 'group';
              return (
                <div
                  key={item.key}
                  onClick={() => handleSelectListItem(item)}
                  className={`bg-white border rounded-2xl p-3 transition-all cursor-pointer flex items-start justify-between gap-3 ${
                    isSelected
                      ? 'border-[#087F75] ring-2 ring-[#087F75]/15'
                      : 'border-slate-200/80 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        isGroup
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-teal-50 text-[#087F75]'
                      }`}
                    >
                      {isGroup ? (
                        <Users className="w-5 h-5" />
                      ) : (
                        <FileText className="w-5 h-5" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-[#112330] truncate">
                          {item.title}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                            isGroup
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-teal-100 text-[#087F75]'
                          }`}
                        >
                          {isGroup
                            ? isRtl
                              ? 'مجموعة'
                              : 'Group'
                            : isRtl
                            ? 'منشور'
                            : 'Post'}
                        </span>
                        {item.distanceKm !== null && (
                          <span className="text-[11px] font-bold text-sky-700">
                            • {formatDistanceLabel(item.distanceKm, isRtl)}
                          </span>
                        )}
                      </div>

                      <p className="text-xs font-semibold text-slate-600 flex items-center gap-1 truncate">
                        <MapPin className="w-3.5 h-3.5 text-[#087F75] shrink-0" />
                        <span className="truncate">{item.location.locationName}</span>
                      </p>

                      {item.snippet && (
                        <p className="text-xs text-slate-500 line-clamp-1">{item.snippet}</p>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (item.kind === 'group') {
                        onOpenGroup(item.group.id);
                      } else {
                        onSelectPost(item.post);
                      }
                    }}
                    className="shrink-0 min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-[#087F75] text-slate-700 hover:text-white text-xs font-bold transition-colors cursor-pointer"
                  >
                    {isGroup
                      ? isRtl
                        ? 'فتح'
                        : 'Open'
                      : isRtl
                      ? 'عرض'
                      : 'View'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
