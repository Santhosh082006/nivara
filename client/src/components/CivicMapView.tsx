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
  ClusterStatus,
} from '../types';
import {
  ThumbsUp,
  AlertTriangle,
  Clock,
  ExternalLink,
  Filter,
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

  // Sizing circles according to report count
  const getMarkerRadius = (count: number): number => {
    if (count <= 1) return 10;
    if (count <= 3) return 14;
    if (count <= 6) return 18;
    return 24;
  };

  const getMarkerColor = (cluster: IssueCluster): string => {
    if (cluster.status === 'RESOLVED') return '#64748b'; // Gray
    if (cluster.reportCount >= 6) return '#dc2626'; // High alert Red
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

      {/* Leaflet Map Canvas */}
      <MapContainer
        center={[12.95, 77.63]} // Default Bangalore urban bounding center
        zoom={12}
        className="w-full h-full z-0"
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapViewBoundsController onBoundsChange={setViewportBounds} />
        <FlyToCluster coords={centerCoords} />

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
                color: color,
                fillColor: color,
                fillOpacity: isHighPriority ? 0.85 : 0.65,
                weight: isHighPriority ? 3 : 2,
              }}
            >
              <Popup className="custom-leaflet-popup">
                <div className="p-1 min-w-[220px]">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                      {formatCategoryName(cluster.category)}
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                        cluster.status === 'OPEN'
                          ? 'bg-amber-100 text-amber-800'
                          : cluster.status === 'IN_PROGRESS'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {cluster.status}
                    </span>
                  </div>

                  <div className="my-2 p-2 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-around text-center">
                    <div>
                      <div className="text-lg font-extrabold text-slate-900 leading-none">
                        {cluster.reportCount}
                      </div>
                      <div className="text-[10px] text-slate-500 font-medium">
                        Reports
                      </div>
                    </div>
                    <div className="h-6 w-px bg-slate-200"></div>
                    <div>
                      <div className="text-lg font-extrabold text-sky-600 leading-none">
                        {cluster.upvotes}
                      </div>
                      <div className="text-[10px] text-slate-500 font-medium">
                        Upvotes
                      </div>
                    </div>
                    <div className="h-6 w-px bg-slate-200"></div>
                    <div>
                      <div className="text-lg font-extrabold text-amber-600 leading-none">
                        {cluster.priorityScore.toFixed(0)}
                      </div>
                      <div className="text-[10px] text-slate-500 font-medium">
                        Priority
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 mt-2">
                    <button
                      onClick={() => onUpvoteCluster(cluster.id)}
                      className="flex-1 flex items-center justify-center space-x-1 py-1.5 px-2 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-lg text-xs font-semibold transition"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                      <span>Upvote</span>
                    </button>
                    <button
                      onClick={() => onSelectCluster(cluster)}
                      className="flex-1 flex items-center justify-center space-x-1 py-1.5 px-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Details</span>
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
