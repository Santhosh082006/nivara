import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  MapPin,
  Camera,
  AlertCircle,
  ThumbsUp,
  Send,
  Loader2,
  CheckCircle2,
  Navigation,
  Upload,
  Trash2,
  Link as LinkIcon,
  Info,
  Radar,
  Eye,
} from 'lucide-react';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Circle,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import { IssueCategory, IssueCluster, NearbyClusterCheckResult } from '../types';
import { checkNearbyCluster, submitComplaintApi, upvoteClusterApi } from '../api';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplaintSubmitted: () => void;
  onViewClusterOnMap?: (cluster: IssueCluster) => void;
}

const CATEGORIES: { value: IssueCategory; label: string; icon: string; accent: string }[] = [
  { value: 'POTHOLE', label: 'Pothole', icon: '🕳️', accent: 'hover:border-orange-400 hover:bg-orange-50/50' },
  { value: 'GARBAGE_DUMP', label: 'Garbage Dump', icon: '🗑️', accent: 'hover:border-emerald-400 hover:bg-emerald-50/50' },
  { value: 'STREETLIGHT', label: 'Streetlight', icon: '💡', accent: 'hover:border-amber-400 hover:bg-amber-50/50' },
  { value: 'WATER_LEAKAGE', label: 'Water Leak', icon: '🚰', accent: 'hover:border-cyan-400 hover:bg-cyan-50/50' },
  { value: 'OPEN_SEWAGE', label: 'Open Sewage', icon: '⚠️', accent: 'hover:border-red-400 hover:bg-red-50/50' },
  { value: 'FOOTPATH_OBSTRUCTION', label: 'Footpath Block', icon: '🚶', accent: 'hover:border-violet-400 hover:bg-violet-50/50' },
  { value: 'OTHER', label: 'Other Hazard', icon: '📌', accent: 'hover:border-slate-400 hover:bg-slate-50/50' },
];

function MiniMapController({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, 16, { duration: 0.8 });
  }, [center, map]);
  return null;
}

function MiniMapClickHandler({
  onLocationSelect,
}: {
  onLocationSelect: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onLocationSelect(
        Math.round(e.latlng.lat * 1e6) / 1e6,
        Math.round(e.latlng.lng * 1e6) / 1e6
      );
    },
  });
  return null;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  onComplaintSubmitted,
  onViewClusterOnMap,
}) => {
  const [category, setCategory] = useState<IssueCategory>('POTHOLE');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [photoMode, setPhotoMode] = useState<'file' | 'url'>('file');
  const [fileName, setFileName] = useState<string>('');
  const [isProcessingPhoto, setIsProcessingPhoto] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [latitude, setLatitude] = useState<number>(12.935242);
  const [longitude, setLongitude] = useState<number>(77.624461);
  const [isLocating, setIsLocating] = useState(false);
  const [isCheckingNearby, setIsCheckingNearby] = useState(false);
  const [nearbyCheck, setNearbyCheck] = useState<NearbyClusterCheckResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Auto-detect browser GPS location
  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      setErrorMessage('Geolocation is not supported by your browser');
      return;
    }

    setIsLocating(true);
    setErrorMessage(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(Math.round(position.coords.latitude * 1e6) / 1e6);
        setLongitude(Math.round(position.coords.longitude * 1e6) / 1e6);
        setIsLocating(false);
      },
      (err) => {
        console.warn('Geolocation error:', err);
        setErrorMessage('Unable to retrieve current location. You can click on the mini-map or enter coordinates manually.');
        setIsLocating(false);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  // Check for nearby similar issue cluster whenever category or coordinates change
  useEffect(() => {
    if (!isOpen || isNaN(latitude) || isNaN(longitude)) return;

    const timer = setTimeout(async () => {
      try {
        setIsCheckingNearby(true);
        const res = await checkNearbyCluster(latitude, longitude, category);
        setNearbyCheck(res.data);
      } catch (err) {
        console.warn('Failed to check nearby clusters:', err);
      } finally {
        setIsCheckingNearby(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [isOpen, category, latitude, longitude]);

  // Handle direct upvote flow (upvote-instead-of-duplicate)
  const handleUpvoteInstead = async () => {
    if (!nearbyCheck?.cluster) return;

    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      await upvoteClusterApi(nearbyCheck.cluster.id);
      setSuccessMessage('Upvote recorded successfully! Priority elevated without creating a duplicate ticket.');
      setTimeout(() => {
        onComplaintSubmitted();
        onClose();
      }, 1500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to upvote cluster');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle file selection from local device or smartphone camera
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      setErrorMessage('Image file is too large (max 20MB)');
      return;
    }

    setIsProcessingPhoto(true);
    setErrorMessage(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_DIMENSION = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_DIMENSION) {
            height = Math.round((height * MAX_DIMENSION) / width);
            width = MAX_DIMENSION;
          }
        } else {
          if (height > MAX_DIMENSION) {
            width = Math.round((width * MAX_DIMENSION) / height);
            height = MAX_DIMENSION;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
          setImageUrl(compressedDataUrl);
          setFileName(file.name);
        } else {
          setImageUrl(event.target?.result as string);
          setFileName(file.name);
        }
        setIsProcessingPhoto(false);
      };
      img.onerror = () => {
        setErrorMessage('Failed to process image file');
        setIsProcessingPhoto(false);
      };
      img.src = event.target?.result as string;
    };
    reader.onerror = () => {
      setErrorMessage('Failed to read image file');
      setIsProcessingPhoto(false);
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setImageUrl('');
    setFileName('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle standard complaint submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setErrorMessage('Please provide a brief description of the issue');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      const res = await submitComplaintApi({
        category,
        description: description.trim(),
        latitude,
        longitude,
        imageUrl: imageUrl.trim() || undefined,
      });

      setSuccessMessage(
        res.data.isNewCluster
          ? 'New civic issue cluster initiated successfully!'
          : `Merged into existing cluster (${res.data.distanceToCentroid}m away). Centroid updated!`
      );

      setTimeout(() => {
        onComplaintSubmitted();
        onClose();
      }, 1500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to submit complaint');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid =
    description.trim().length >= 5 &&
    !isNaN(latitude) &&
    !isNaN(longitude) &&
    !isSubmitting &&
    !isLocating;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center space-x-2.5">
            <span className="w-3 h-3 rounded-full bg-sky-500 ring-4 ring-sky-100 animate-pulse"></span>
            <div>
              <h2 className="text-base font-extrabold text-slate-900">
                Report Civic Hazard
              </h2>
              <p className="text-[11px] text-slate-500 font-medium">
                Geospatial clustering with 50-meter deduplication
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {errorMessage && (
            <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700 flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Category Selector with clean grid wrapping */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Issue Category
              </label>
              <span className="text-[11px] text-slate-400 font-medium">
                Select defect type
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  type="button"
                  key={cat.value}
                  onClick={() => setCategory(cat.value)}
                  className={`flex items-center space-x-2 p-2.5 rounded-2xl border text-xs font-semibold transition text-left ${
                    category === cat.value
                      ? 'border-sky-500 bg-sky-50/80 text-sky-950 ring-2 ring-sky-500/20 shadow-sm'
                      : `border-slate-200 text-slate-700 bg-white ${cat.accent}`
                  }`}
                >
                  <span className="text-lg shrink-0">{cat.icon}</span>
                  <span className="truncate leading-tight">{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Mini-Map Preview & Location Picker */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center space-x-1.5">
                <MapPin className="w-3.5 h-3.5 text-sky-600" />
                <span>Incident Location (GPS)</span>
              </label>
              <button
                type="button"
                onClick={handleDetectLocation}
                disabled={isLocating}
                className="flex items-center space-x-1.5 text-xs font-bold text-sky-600 hover:text-sky-700 bg-sky-50 hover:bg-sky-100 px-2.5 py-1 rounded-xl transition active:scale-95 disabled:opacity-60"
              >
                {isLocating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Locating via GPS...</span>
                  </>
                ) : (
                  <>
                    <Navigation className="w-3.5 h-3.5" />
                    <span>Use Current Location</span>
                  </>
                )}
              </button>
            </div>

            {/* Embedded Mini-Map */}
            <div className="h-44 w-full rounded-2xl overflow-hidden border border-slate-200 shadow-inner relative z-0">
              <MapContainer
                center={[latitude, longitude]}
                zoom={16}
                scrollWheelZoom={false}
                className="h-full w-full"
                attributionControl={false}
              >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <MiniMapController center={[latitude, longitude]} />
                <MiniMapClickHandler
                  onLocationSelect={(lat, lng) => {
                    setLatitude(lat);
                    setLongitude(lng);
                  }}
                />

                {/* Current Report Pin (Blue) */}
                <CircleMarker
                  center={[latitude, longitude]}
                  radius={8}
                  pathOptions={{
                    fillColor: '#0284c7',
                    fillOpacity: 0.9,
                    color: '#ffffff',
                    weight: 2.5,
                  }}
                />

                {/* Nearby Cluster Marker & 50m Radius Threshold (Amber) if detected */}
                {nearbyCheck?.hasNearbyCluster && nearbyCheck.cluster && (
                  <>
                    {/* 50m Clustering Radius Boundary */}
                    <Circle
                      center={[nearbyCheck.cluster.centroidLat, nearbyCheck.cluster.centroidLng]}
                      radius={50}
                      pathOptions={{
                        color: '#f59e0b',
                        dashArray: '5, 5',
                        fillColor: '#fef3c7',
                        fillOpacity: 0.25,
                        weight: 1.5,
                      }}
                    />
                    {/* Nearby Cluster Centroid Pin */}
                    <CircleMarker
                      center={[nearbyCheck.cluster.centroidLat, nearbyCheck.cluster.centroidLng]}
                      radius={10}
                      pathOptions={{
                        fillColor: '#d97706',
                        fillOpacity: 0.95,
                        color: '#ffffff',
                        weight: 2.5,
                      }}
                    />
                  </>
                )}
              </MapContainer>

              {/* Map floating helper badge */}
              <div className="absolute top-2 left-2 bg-slate-900/75 backdrop-blur-sm text-white px-2.5 py-1 rounded-lg text-[10px] font-semibold pointer-events-none flex items-center space-x-1.5 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-sky-400"></span>
                <span>Click map to adjust pin position</span>
              </div>
            </div>

            {/* Coordinate Number Boxes */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Latitude</span>
                <input
                  type="number"
                  step="any"
                  value={latitude}
                  onChange={(e) => setLatitude(parseFloat(e.target.value))}
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Longitude</span>
                <input
                  type="number"
                  step="any"
                  value={longitude}
                  onChange={(e) => setLongitude(parseFloat(e.target.value))}
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            {/* Trust & Transparency explanation */}
            <p className="text-[11px] text-slate-500 flex items-center space-x-1.5 pt-0.5">
              <Info className="w-3.5 h-3.5 text-sky-500 shrink-0" />
              <span>We use high-precision GPS to automatically detect and merge duplicate reports within 50 meters.</span>
            </p>
          </div>

          {/* Enhanced Duplicate-Detection Banner */}
          {nearbyCheck?.hasNearbyCluster && nearbyCheck.cluster && (
            <div className="p-4 rounded-3xl bg-gradient-to-br from-amber-50 to-orange-50/60 border border-amber-200/90 text-amber-900 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="space-y-3">
                {/* Header with Prominent Proximity Badge */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="p-1 rounded-lg bg-amber-200/80 text-amber-800">
                      <Radar className="w-4 h-4 animate-pulse text-amber-700" />
                    </span>
                    <span className="font-extrabold text-xs text-amber-950">
                      Nearby Similar Issue Detected
                    </span>
                  </div>

                  {/* Prominent Distance Tag */}
                  <div className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-amber-200/90 text-amber-950 font-black text-xs tracking-tight shadow-sm border border-amber-300">
                    <span>📍</span>
                    <span>{nearbyCheck.distanceMeters}m AWAY</span>
                  </div>
                </div>

                {/* Explanation */}
                <p className="text-xs text-amber-800 leading-relaxed">
                  Neighbors have already submitted{' '}
                  <strong className="text-amber-950">{nearbyCheck.cluster.reportCount} reports</strong> for this{' '}
                  <span className="font-semibold">{category.toLowerCase().replace('_', ' ')}</span> with{' '}
                  <strong className="text-amber-950">{nearbyCheck.cluster.upvotes} community upvotes</strong>.
                </p>

                {/* Actions inside Banner */}
                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    onClick={handleUpvoteInstead}
                    disabled={isSubmitting}
                    className="w-full flex items-center justify-center space-x-2 py-2.5 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl font-bold text-xs shadow-md shadow-amber-600/20 transition active:scale-95 disabled:opacity-50"
                  >
                    <ThumbsUp className="w-4 h-4" />
                    <span>Upvote Existing Issue Instead (+1 Priority)</span>
                  </button>

                  <div className="flex items-center justify-between pt-0.5">
                    <p className="text-[10px] text-amber-700 font-medium">
                      ⚡ This will boost priority without creating a duplicate ticket.
                    </p>

                    {onViewClusterOnMap && (
                      <button
                        type="button"
                        onClick={() => onViewClusterOnMap(nearbyCheck.cluster!)}
                        className="text-[11px] font-bold text-amber-900 hover:text-amber-950 hover:underline flex items-center space-x-1 shrink-0 ml-2"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View on map</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Description with Character Counter */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                Issue Description
              </label>
              <span
                className={`text-[11px] font-mono font-medium ${
                  description.length >= 450
                    ? 'text-red-500 font-bold'
                    : 'text-slate-400'
                }`}
              >
                {description.length} / 500
              </span>
            </div>
            <textarea
              rows={3}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide specific details (e.g. depth of crater, water line burst, broken pole, danger to two-wheelers)..."
              required
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none transition"
            />
            {description.trim().length > 0 && description.trim().length < 5 && (
              <p className="text-[10px] text-amber-600 font-medium mt-1">
                Please enter at least 5 characters to describe the issue.
              </p>
            )}
          </div>

          {/* Photo Evidence (Device Upload or URL) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                Photo Evidence (Optional)
              </label>
              <div className="flex items-center space-x-1 bg-slate-100 p-0.5 rounded-xl text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setPhotoMode('file')}
                  className={`px-2.5 py-1 rounded-lg transition ${
                    photoMode === 'file'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  From Device
                </button>
                <button
                  type="button"
                  onClick={() => setPhotoMode('url')}
                  className={`px-2.5 py-1 rounded-lg transition ${
                    photoMode === 'url'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Image URL
                </button>
              </div>
            </div>

            {photoMode === 'file' ? (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                {imageUrl ? (
                  <div className="relative p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center space-x-3">
                    <img
                      src={imageUrl}
                      alt="Uploaded preview"
                      className="w-16 h-16 rounded-xl object-cover border border-slate-200 shadow-sm shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">
                        {fileName || 'Selected photo'}
                      </p>
                      <p className="text-[11px] text-emerald-600 font-semibold flex items-center space-x-1 mt-0.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Ready to upload</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition"
                      title="Remove photo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="cursor-pointer border-2 border-dashed border-slate-200 hover:border-sky-400 hover:bg-sky-50/40 rounded-2xl p-4 text-center transition group"
                  >
                    {isProcessingPhoto ? (
                      <div className="flex items-center justify-center space-x-2 py-1 text-xs text-slate-500">
                        <Loader2 className="w-4 h-4 animate-spin text-sky-500" />
                        <span>Optimizing photo from device...</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center space-y-1 text-slate-500">
                        <div className="w-10 h-10 rounded-full bg-slate-100 group-hover:bg-sky-100 group-hover:text-sky-600 flex items-center justify-center transition">
                          <Upload className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-bold text-slate-700">
                          Click to select photo from device or camera
                        </span>
                        <span className="text-[10px] text-slate-400">
                          JPG, PNG, WEBP (automatically resized & compressed)
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <LinkIcon className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
                  <input
                    type="url"
                    value={imageUrl}
                    onChange={(e) => {
                      setImageUrl(e.target.value);
                      setFileName('');
                    }}
                    placeholder="https://images.unsplash.com/..."
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  {imageUrl && (
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {imageUrl && (
                  <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 flex items-center space-x-2">
                    <img
                      src={imageUrl}
                      alt="URL Preview"
                      onError={() => setErrorMessage('Unable to load image from provided URL')}
                      className="w-12 h-12 rounded-lg object-cover border border-slate-200"
                    />
                    <span className="text-[11px] text-slate-500 truncate">URL Image Preview</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center space-x-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-2xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isFormValid}
              className="flex-1 flex items-center justify-center space-x-2 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-2xl shadow-md shadow-sky-600/20 transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span>
                {nearbyCheck?.hasNearbyCluster ? 'Submit & Merge (+1 Report)' : 'Submit Report'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ReportModal;
