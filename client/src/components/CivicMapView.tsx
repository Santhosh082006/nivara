import React, { useEffect, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import {
  IssueCategory,
  IssueCluster,
} from '../types';
import {
  ThumbsUp,
  Clock,
  ExternalLink,
  Filter,
  Search,
  MapPin,
  Loader2,
  X,
} from 'lucide-react';

interface CivicMapViewProps {
  clusters: IssueCluster[];
  onSelectCluster: (cluster: IssueCluster) => void;
  onUpvoteCluster: (clusterId: string) => void;
  selectedCategory: string;
  setSelectedCategory: (cat: string) => void;
  selectedStatus: string;
  setSelectedStatus: (status: string) => void;
  centerCoords?: [number, number];
}

const CATEGORY_COLORS: Record<IssueCategory, string> = {
  POTHOLE: '#f97316', // Orange
  GARBAGE_DUMP: '#10b981', // Emerald
  STREETLIGHT: '#eab308', // Amber
  WATER_LEAKAGE: '#06b6d4', // Cyan
  OPEN_SEWAGE: '#ef4444', // Red
  FOOTPATH_OBSTRUCTION: '#8b5cf6', // Violet
  OTHER: '#64748b', // Slate
};

function MapViewBoundsController({ onBoundsChange }: { onBoundsChange: (bounds: string) => void }) {
  const map = useMapEvents({
    moveend: () => {
      const b = map.getBounds();
      const boundsStr = `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
      onBoundsChange(boundsStr);
    },
  });
  return null;
}

function FlyToCluster({ coords }: { coords?: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    if (coords) {
      map.flyTo(coords, 16, { duration: 1.5 });
    }
  }, [coords, map]);
  return null;
}

export const CivicMapView: React.FC<CivicMapViewProps> = ({
  clusters,
  onSelectCluster,
  onUpvoteCluster,
  selectedCategory,
  setSelectedCategory,
  selectedStatus,
  setSelectedStatus,
  centerCoords,
}) => {
  const [viewportBounds, setViewportBounds] = useState<string>('');
  const [mapType, setMapType] = useState<'gmaps' | 'satellite'>('gmaps');

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<{ place_id: number; display_name: string; lat: string; lon: string }[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [activeCenter, setActiveCenter] = useState<[number, number] | undefined>(centerCoords);

  useEffect(() => {
    if (centerCoords) {
      setActiveCenter(centerCoords);
    }
  }, [centerCoords]);

  // Debounced address search using OpenStreetMap Nominatim
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 3) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsSearching(true);
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            searchQuery.trim()
          )}&limit=5`
        );
        const data = await res.json();
        setSearchResults(data || []);
      } catch (err) {
        console.warn('Geocoding search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectSearchResult = (item: { display_name: string; lat: string; lon: string }) => {
    const lat = parseFloat(item.lat);
    const lon = parseFloat(item.lon);
    setActiveCenter([lat, lon]);
    setSearchQuery(item.display_name.split(',')[0]);
    setSearchResults([]);
  };

  // Sizing circles according to report count
  const getMarkerRadius = (count: number): number => {
    if (count <= 1) return 10;
    if (count <= 3) return 14;
    if (count <= 6) return 18;
    return 24;
  };

  const getMarkerColor = (cluster: IssueCluster): string => {
    if (cluster.status === 'RESOLVED') return '#64748b'; // Gray
    if (cluster.reportCount >= 6) return '#EA4335'; // Google Red alert
    return CATEGORY_COLORS[cluster.category] || '#0284c7';
  };

  const formatCategoryName = (cat: string) =>
    cat.replace('_', ' ').toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());

  return (
    <div className="relative w-full h-[calc(100vh-4rem)] bg-slate-100">
      {/* Floating Filter Controls Overlay */}
      <div className="absolute top-4 left-4 z-[400] bg-white/95 backdrop-blur-md rounded-2xl shadow-lg border border-slate-200 p-3 max-w-sm flex flex-col space-y-2">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-800">
            <Filter className="w-3.5 h-3.5 text-sky-600" />
            <span>Map Layers & Filters</span>
          </div>
          <span className="text-[11px] font-semibold text-slate-500">
            {clusters.length} clusters visible
          </span>
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
              selectedCategory === 'ALL'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Categories
          </button>
          {[
            'POTHOLE',
            'GARBAGE_DUMP',
            'STREETLIGHT',
            'WATER_LEAKAGE',
            'OPEN_SEWAGE',
            'FOOTPATH_OBSTRUCTION',
          ].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                selectedCategory === cat
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {formatCategoryName(cat)}
            </button>
          ))}
        </div>

        {/* Status Pills */}
        <div className="flex items-center space-x-1.5 pt-1 border-t border-slate-100">
          {['ALL', 'OPEN', 'IN_PROGRESS', 'RESOLVED'].map((st) => (
            <button
              key={st}
              onClick={() => setSelectedStatus(st)}
              className={`flex-1 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition ${
                selectedStatus === st
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Floating Top-Right Controls: Location Search & Google Maps Layer Switcher */}
      <div className="absolute top-4 right-4 z-[400] flex flex-col items-end space-y-2">
        {/* Google Maps Style Switcher */}
        <div className="bg-white/95 backdrop-blur-md rounded-2xl p-1 shadow-lg border border-slate-200 flex items-center space-x-1 text-xs font-bold">
          <button
            type="button"
            onClick={() => setMapType('gmaps')}
            className={`px-3 py-1.5 rounded-xl transition flex items-center space-x-1.5 ${
              mapType === 'gmaps'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <span>🗺️</span>
            <span>Google Map</span>
          </button>
          <button
            type="button"
            onClick={() => setMapType('satellite')}
            className={`px-3 py-1.5 rounded-xl transition flex items-center space-x-1.5 ${
              mapType === 'satellite'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <span>🛰️</span>
            <span>Satellite</span>
          </button>
        </div>

        {/* Google-Style Location Search Box */}
        <div className="relative w-72 sm:w-80">
          <div className="flex items-center space-x-2 bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl px-3.5 py-2 shadow-lg focus-within:ring-2 focus-within:ring-sky-500 transition">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search area, landmark, or city..."
              className="w-full bg-transparent text-xs text-slate-800 placeholder-slate-400 focus:outline-none font-medium"
            />
            {isSearching && <Loader2 className="w-4 h-4 animate-spin text-sky-500 shrink-0" />}
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                }}
                className="text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Search Results Dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute top-full right-0 mt-1.5 w-full bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-[500] max-h-56 overflow-y-auto animate-in fade-in slide-in-from-top-1">
              {searchResults.map((item) => (
                <button
                  key={item.place_id}
                  type="button"
                  onClick={() => handleSelectSearchResult(item)}
                  className="w-full text-left px-3.5 py-2 hover:bg-sky-50 text-xs text-slate-700 flex items-start space-x-2.5 transition border-b border-slate-50 last:border-0"
                >
                  <MapPin className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                  <span className="leading-relaxed line-clamp-2">{item.display_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Legend Overlay */}
      <div className="absolute bottom-6 left-4 z-[400] bg-white/95 backdrop-blur-md rounded-xl shadow-md border border-slate-200 p-2.5 text-xs text-slate-700 hidden sm:block">
        <div className="font-bold text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">
          Cluster Density Legend
        </div>
        <div className="flex items-center space-x-3 text-[11px]">
          <div className="flex items-center space-x-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
            <span>1–2 Reports</span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="w-3.5 h-3.5 rounded-full bg-amber-500 inline-block"></span>
            <span>3–5 Reports</span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="w-4 h-4 rounded-full bg-red-600 inline-block shadow-sm"></span>
            <span>6+ Reports (Urgent)</span>
          </div>
        </div>
      </div>

      {/* Google Maps Canvas */}
      <MapContainer
        center={[12.95, 77.63]} // Default Bangalore urban bounding center
        zoom={12}
        className="w-full h-full z-0"
        scrollWheelZoom={true}
      >
        {/* Official Google Maps Tiles: Standard Roadmap vs Satellite Hybrid */}
        {mapType === 'gmaps' ? (
          <TileLayer
            url="https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
            subdomains={['mt0', 'mt1', 'mt2', 'mt3']}
            maxZoom={20}
            attribution="&copy; Google Maps"
          />
        ) : (
          <TileLayer
            url="https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
            subdomains={['mt0', 'mt1', 'mt2', 'mt3']}
            maxZoom={20}
            attribution="&copy; Google Maps"
          />
        )}

        <MapViewBoundsController onBoundsChange={setViewportBounds} />
        <FlyToCluster coords={activeCenter} />

        {/* Dynamic Clustered Pins */}
        {clusters.map((cluster) => {
          const radius = getMarkerRadius(cluster.reportCount);
          const color = getMarkerColor(cluster);
          const isHighPriority = cluster.reportCount >= 6 && cluster.status !== 'RESOLVED';

          return (
            <CircleMarker
              key={cluster.id}
              center={[cluster.centroidLat, cluster.centroidLng]}
              radius={radius}
              pathOptions={{
                color: '#ffffff',
                fillColor: color,
                fillOpacity: isHighPriority ? 0.92 : 0.8,
                weight: 2.5,
              }}
            >
              <Popup className="custom-leaflet-popup">
                <div className="p-1 min-w-[220px]">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                      {formatCategoryName(cluster.category)}
                    </span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                        cluster.status === 'OPEN'
                          ? 'bg-amber-100 text-amber-800'
                          : cluster.status === 'IN_PROGRESS'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {cluster.status}
                    </span>
                  </div>

                  <div className="space-y-1 mb-2.5">
                    <div className="text-xs font-bold text-slate-800">
                      {cluster.reportCount} Aggregated Reports
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center space-x-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>Updated {new Date(cluster.updatedAt).toLocaleDateString()}</span>
                    </div>
                    <div className="text-[11px] font-semibold text-amber-600">
                      Priority Score: {cluster.priorityScore.toFixed(1)}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 pt-1 border-t border-slate-100">
                    <button
                      onClick={() => onUpvoteCluster(cluster.id)}
                      className="flex-1 flex items-center justify-center space-x-1 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-semibold rounded-lg transition"
                    >
                      <ThumbsUp className="w-3 h-3" />
                      <span>Upvote ({cluster.upvotes})</span>
                    </button>
                    <button
                      onClick={() => onSelectCluster(cluster)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                      title="Inspect Cluster History"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
};
