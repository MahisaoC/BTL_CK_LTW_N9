import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import {
  MapPin,
  Compass,
  ExternalLink,
  Navigation,
  LocateFixed,
} from 'lucide-react';
import type { LocationStat } from '../types/travel';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { apiRequest, formatVndCurrency } from '../utils/api';
import {
  VIETNAM_CITY_HUBS,
  buildGoogleMapsPlaceUrl,
  calculateGeoDistance,
  resolveReferenceOrigin,
  type GeoCoordinates,
} from '../utils/travelRules';

/**
 * Component #15: TravelMapPage
 * Bản đồ đánh dấu các nơi đã đi & điểm đến thịnh hành bằng Leaflet với tông màu Trắng - Đen - Xám giản dị,
 * tích hợp đo khoảng cách địa lý và nhảy trực tiếp sang Google Maps xem vị trí chính xác.
 */
export const TravelMapPage: React.FC = () => {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  const [locations, setLocations] = useState<LocationStat[]>([]);
  const [selectedLoc, setSelectedLoc] = useState<LocationStat | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedOriginHub, setSelectedOriginHub] = useState<string>('');
  const [liveGpsCoords, setLiveGpsCoords] = useState<GeoCoordinates | null>(null);
  const [locatingGps, setLocatingGps] = useState(false);

  const referenceOrigin = useMemo(
    () =>
      resolveReferenceOrigin(
        user?.homeCity,
        selectedOriginHub || null,
        liveGpsCoords
      ),
    [user?.homeCity, selectedOriginHub, liveGpsCoords]
  );

  const handleLocateMyGps = () => {
    if (!navigator.geolocation) return;
    setLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLiveGpsCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setSelectedOriginHub('gps');
        setLocatingGps(false);
      },
      () => {
        setLocatingGps(false);
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  useEffect(() => {
    let active = true;
    apiRequest<{ locations: LocationStat[] }>('/api/stats/locations?limit=20')
      .then((res) => {
        if (!active) return;
        setLocations(res.locations);
        if (res.locations[0]) {
          setSelectedLoc(res.locations[0]);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Initialize Leaflet Map, Markers, Origin Marker & Geographical Distance Line
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const defaultCenter: [number, number] =
      locations.length > 0
        ? [locations[0].coordinates.lat, locations[0].coordinates.lng]
        : [16.4637, 106.5909];
    const defaultZoom = locations.length === 1 ? 10 : 6;

    const map = L.map(mapContainerRef.current, {
      center: defaultCenter,
      zoom: defaultZoom,
      scrollWheelZoom: true,
    });
    mapInstanceRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map);

    const bounds: [number, number][] = [];

    // Plot Reference Origin Marker (Understated zinc/white)
    const originLat = Number(referenceOrigin.coordinates.lat);
    const originLng = Number(referenceOrigin.coordinates.lng);
    if (!Number.isNaN(originLat) && !Number.isNaN(originLng)) {
      const originLabel =
        language === 'en' ? referenceOrigin.labelEn : referenceOrigin.labelVi;
      const originPrefix =
        language === 'en' ? 'Your Departure / Origin' : 'Điểm xuất phát của bạn';
      const originMarker = L.circleMarker([originLat, originLng], {
        radius: 6,
        fillColor: '#52525b',
        color: '#ffffff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.9,
      }).addTo(map);

      originMarker.bindPopup(`
        <div style="min-width: 170px; padding: 4px;">
          <div style="font-size: 11px; color: #71717a; font-weight: 600;">${originPrefix}</div>
          <div style="font-weight: 700; font-size: 13px; color: #09090b; margin-top: 2px;">${originLabel}</div>
          <div style="font-size: 11px; color: #52525b; margin-top: 2px;">GPS: ${originLat.toFixed(4)}°N, ${originLng.toFixed(4)}°E</div>
        </div>
      `);
    }

    // Draw subtle dashed line from Origin to Selected Location
    if (
      selectedLoc &&
      !Number.isNaN(originLat) &&
      !Number.isNaN(originLng) &&
      !Number.isNaN(Number(selectedLoc.coordinates.lat)) &&
      !Number.isNaN(Number(selectedLoc.coordinates.lng))
    ) {
      L.polyline(
        [
          [originLat, originLng],
          [
            Number(selectedLoc.coordinates.lat),
            Number(selectedLoc.coordinates.lng),
          ],
        ],
        {
          color: '#52525b',
          weight: 2,
          dashArray: '5, 5',
          opacity: 0.75,
        }
      ).addTo(map);
    }

    locations.forEach((loc) => {
      const lat = Number(loc.coordinates.lat);
      const lng = Number(loc.coordinates.lng);
      if (Number.isNaN(lat) || Number.isNaN(lng)) return;

      bounds.push([lat, lng]);

      const dist = calculateGeoDistance(
        referenceOrigin.coordinates,
        loc.coordinates
      );
      const placeUrl = buildGoogleMapsPlaceUrl({
        location: loc.location,
        provinceOrCountry: loc.provinceOrCountry,
        coordinates: loc.coordinates,
      });

      const isSelected = selectedLoc?.location === loc.location;

      const marker = L.circleMarker([lat, lng], {
        radius: Math.min(16, (isSelected ? 10 : 8) + loc.postCount * 2.5),
        fillColor: '#27272a',
        color: '#ffffff',
        weight: isSelected ? 3 : 2,
        opacity: 1,
        fillOpacity: 0.92,
      }).addTo(map);

      const postsLabel = language === 'en' ? 'posts' : 'bài viết';
      const likesLabel = language === 'en' ? 'likes' : 'lượt thích';
      const avgCostLabel = language === 'en' ? 'Avg cost' : 'Chi phí TB';
      const originLabel =
        language === 'en' ? referenceOrigin.labelEn : referenceOrigin.labelVi;
      const distText =
        language === 'en'
          ? `${dist.straightKm} km from ${originLabel} (~${dist.roadEstimateKm} km road)`
          : `Cách ${originLabel}: ${dist.straightKm} km (Đường bộ ~${dist.roadEstimateKm} km)`;
      const openPinLabel =
        language === 'en' ? 'Open Google Maps ↗' : 'Mở Google Maps ↗';

      marker.bindPopup(`
        <div style="min-width: 210px; padding: 6px;">
          <div style="font-weight: 700; font-size: 14px; color: #09090b;">${loc.location}</div>
          <div style="font-size: 11px; color: #71717a; margin-top: 2px;">${loc.provinceOrCountry} · ${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E</div>
          <div style="font-size: 11px; color: #27272a; background: #f4f4f5; border: 1px solid #e4e4e7; border-radius: 6px; padding: 4px 6px; font-weight: 600; margin-top: 6px;">
            ${distText}
          </div>
          <div style="font-size: 12px; color: #3f3f46; font-weight: 700; margin-top: 6px;">
            ${loc.postCount} ${postsLabel} · ${loc.totalLikes} ${likesLabel}
          </div>
          <div style="font-size: 11px; color: #18181b; font-weight: 600; margin-top: 2px;">
            ${avgCostLabel}: ${formatVndCurrency(loc.avgCost)}
          </div>
          <div style="margin-top: 8px;">
            <a href="${placeUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 5px 10px; border-radius: 6px; background: #18181b; color: #ffffff; font-size: 11px; font-weight: 700; text-decoration: none;">
              ${openPinLabel}
            </a>
          </div>
        </div>
      `);

      marker.on('click', () => {
        setSelectedLoc(loc);
      });
    });

    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 11 });
    }

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [locations, language, referenceOrigin, selectedLoc]);

  const handleFocusLocation = (loc: LocationStat) => {
    setSelectedLoc(loc);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView(
        [loc.coordinates.lat, loc.coordinates.lng],
        11,
        { animate: true }
      );
    }
  };

  return (
    <div className="w-full max-w-[1920px] mx-auto px-3 sm:px-6 lg:px-8 2xl:px-10 py-6 sm:py-8 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
            {t('Bản đồ hành trình & Thịnh hành', 'Interactive Travel & Trending Map')}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-950 dark:text-white font-editorial mt-1">
            {t(
              'Bản đồ đánh dấu các tọa độ đã đặt chân tới',
              'Map of Visited Travel Coordinates'
            )}
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            {t(
              'Bấm vào từng điểm đến để xem khoảng cách địa lý từ vị trí của bạn và mở trực tiếp trên Google Maps.',
              'Select any destination to view geographical distance from your location and jump directly to Google Maps.'
            )}
          </p>
        </div>

        {/* Origin / GPS Selector Bar for Distance Calculation */}
        <div className="flex flex-wrap items-center gap-2.5 p-2.5 rounded-2xl bg-white dark:bg-[#141414] border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            <Navigation className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
            <label htmlFor="map-origin-select">
              {t('Đo khoảng cách từ:', 'Distance from:')}
            </label>
          </div>
          <select
            id="map-origin-select"
            value={referenceOrigin.key}
            onChange={(e) => setSelectedOriginHub(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-bold text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-700 focus:outline-none cursor-pointer"
          >
            {liveGpsCoords && (
              <option value="gps">
                {t('Vị trí GPS hiện tại của bạn', 'Your current GPS')}
              </option>
            )}
            {VIETNAM_CITY_HUBS.map((hub) => (
              <option key={hub.key} value={hub.key}>
                {t(hub.labelVi, hub.labelEn)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleLocateMyGps}
            disabled={locatingGps}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer"
          >
            <LocateFixed className="w-3.5 h-3.5" />
            <span>
              {locatingGps
                ? t('Đang định vị...', 'Locating...')
                : t('Định vị GPS của tôi', 'Use My GPS')}
            </span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left List of Visited / Trending Places */}
        <div className="lg:col-span-4 space-y-3">
          {loading ? (
            <div className="p-6 text-sm text-zinc-500">
              {t('Đang tải dữ liệu bản đồ...', 'Loading map data...')}
            </div>
          ) : locations.length === 0 ? (
            <div className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-500 space-y-2">
              <p className="font-semibold text-zinc-800 dark:text-zinc-200">
                {t(
                  'Chưa có địa điểm nào được đánh dấu.',
                  'No destinations pinned yet.'
                )}
              </p>
              <p>
                {t(
                  'Khi bạn đăng bài viết mới và nhập địa điểm, tọa độ sẽ tự động được ghim lên bản đồ này.',
                  'When you publish a post with a location, its coordinates are automatically pinned on this map.'
                )}
              </p>
            </div>
          ) : (
            locations.map((loc, idx) => {
              const isSelected = selectedLoc?.location === loc.location;
              const distance = calculateGeoDistance(
                referenceOrigin.coordinates,
                loc.coordinates
              );

              return (
                <div
                  key={loc.location}
                  className={`p-4 rounded-2xl border transition-colors space-y-2.5 ${
                    isSelected
                      ? 'bg-zinc-100 dark:bg-zinc-800/80 border-zinc-400 dark:border-zinc-600'
                      : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => handleFocusLocation(loc)}
                      className="text-left flex-1 cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5 text-sm font-bold text-zinc-900 dark:text-white">
                        <MapPin className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0" />
                        <span>
                          0{idx + 1}. {loc.location}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 font-mono-num">
                        {loc.provinceOrCountry} ·{' '}
                        {t(
                          `Vĩ độ ${loc.coordinates.lat.toFixed(4)}°N, Kinh độ ${loc.coordinates.lng.toFixed(4)}°E`,
                          `Lat ${loc.coordinates.lat.toFixed(4)}°N, Lng ${loc.coordinates.lng.toFixed(4)}°E`
                        )}
                      </div>
                    </button>

                    <Link
                      to={`/posts/${loc.recentPostId}`}
                      className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:underline whitespace-nowrap shrink-0"
                    >
                      {t('Xem bài →', 'View post →')}
                    </Link>
                  </div>

                  {/* Understated Geographical Distance Badge */}
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800/70 border border-zinc-200/80 dark:border-zinc-700/80 text-xs font-mono-num text-zinc-700 dark:text-zinc-300">
                    <Navigation className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 shrink-0" />
                    <span>
                      {t(
                        `Cách ${referenceOrigin.labelVi}: ${distance.straightKm} km · Đường bộ ~${distance.roadEstimateKm} km`,
                        `${distance.straightKm} km from ${referenceOrigin.labelEn} · Road ~${distance.roadEstimateKm} km`
                      )}
                    </span>
                  </div>

                  <div className="text-xs text-zinc-600 dark:text-zinc-400 font-mono-num">
                    {loc.postCount} {t('bài viết', 'posts')} · {loc.totalLikes}{' '}
                    {t('lượt thích', 'likes')} ·{' '}
                    <span className="text-zinc-900 dark:text-zinc-200 font-semibold">
                      {t('TB', 'Avg')} {formatVndCurrency(loc.avgCost)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Interactive Leaflet Map Container */}
        <div className="lg:col-span-8 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-4">
          <div
            ref={mapContainerRef}
            data-testid="travel-leaflet-map"
            className="w-full h-[520px] rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800"
          />

          {selectedLoc && (() => {
            const selectedDist = calculateGeoDistance(
              referenceOrigin.coordinates,
              selectedLoc.coordinates
            );
            const selectedPlaceUrl = buildGoogleMapsPlaceUrl({
              location: selectedLoc.location,
              provinceOrCountry: selectedLoc.provinceOrCountry,
              coordinates: selectedLoc.coordinates,
            });

            return (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 px-2">
                <div className="flex items-start gap-3">
                  <Compass className="w-5 h-5 text-zinc-600 dark:text-zinc-300 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="text-sm font-bold text-zinc-900 dark:text-white">
                      {t('Đang chọn:', 'Selected:')} {selectedLoc.location} (
                      {selectedLoc.provinceOrCountry})
                    </div>
                    <div className="text-xs text-zinc-500 font-mono-num">
                      {t('Tọa độ GPS chuẩn:', 'Exact GPS Coordinates:')}{' '}
                      {selectedLoc.coordinates.lat.toFixed(4)}°N,{' '}
                      {selectedLoc.coordinates.lng.toFixed(4)}°E ·{' '}
                      {t('Chi phí trung bình:', 'Average cost:')}{' '}
                      <span className="text-zinc-900 dark:text-zinc-200 font-semibold">
                        {formatVndCurrency(selectedLoc.avgCost)}
                      </span>
                    </div>
                    <div className="text-xs font-mono-num text-zinc-600 dark:text-zinc-300 font-medium">
                      {t(
                        `Khoảng cách từ ${referenceOrigin.labelVi}: ${selectedDist.straightKm} km (Đường bộ ước tính ~${selectedDist.roadEstimateKm} km)`,
                        `Distance from ${referenceOrigin.labelEn}: ${selectedDist.straightKm} km (Estimated road ~${selectedDist.roadEstimateKm} km)`
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={selectedPlaceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 transition-colors"
                  >
                    <MapPin className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-300" />
                    <span>{t('Mở Google Maps', 'Open Google Maps')}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>

                  <Link
                    to={`/posts/${selectedLoc.recentPostId}`}
                    className="px-4 py-2 text-xs font-semibold text-white bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 rounded-xl transition-colors"
                  >
                    {t(
                      `Đọc nhật ký tại ${selectedLoc.location}`,
                      `Read journal at ${selectedLoc.location}`
                    )}
                  </Link>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
};
