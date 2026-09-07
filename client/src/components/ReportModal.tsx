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
} from 'lucide-react';
import { IssueCategory, NearbyClusterCheckResult } from '../types';
import { checkNearbyCluster, submitComplaintApi, upvoteClusterApi } from '../api';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplaintSubmitted: () => void;
}

const CATEGORIES: { value: IssueCategory; label: string; icon: string }[] = [
  { value: 'POTHOLE', label: 'Pothole', icon: '🕳️' },
  { value: 'GARBAGE_DUMP', label: 'Garbage Dump', icon: '🗑️' },
  { value: 'STREETLIGHT', label: 'Streetlight', icon: '💡' },
  { value: 'WATER_LEAKAGE', label: 'Water Leakage', icon: '🚰' },
  { value: 'OPEN_SEWAGE', label: 'Open Sewage', icon: '⚠️' },
  { value: 'FOOTPATH_OBSTRUCTION', label: 'Footpath Encroachment', icon: '🚶' },
  { value: 'OTHER', label: 'Other Hazard', icon: '📌' },
];

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  onComplaintSubmitted,
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
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(Math.round(position.coords.latitude * 1e6) / 1e6);
        setLongitude(Math.round(position.coords.longitude * 1e6) / 1e6);
        setIsLocating(false);
      },
      (err) => {
        console.warn('Geolocation error:', err);
        setErrorMessage('Unable to retrieve your current location. Please enter coordinates manually.');
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-500"></span>
            <h2 className="text-base font-bold text-slate-900">
              Report Civic Hazard
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700 flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Category Selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Issue Category
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  type="button"
                  key={cat.value}
                  onClick={() => setCategory(cat.value)}
                  className={`flex items-center space-x-2 p-2.5 rounded-xl border text-xs font-semibold transition text-left ${
                    category === cat.value
                      ? 'border-sky-500 bg-sky-50/50 text-sky-900 ring-1 ring-sky-500'
                      : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                  }`}
                >
                  <span className="text-base">{cat.icon}</span>
                  <span className="truncate">{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Location Picker */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Incident Location (GPS)
              </label>
              <button
                type="button"
                onClick={handleDetectLocation}
                disabled={isLocating}
                className="flex items-center space-x-1 text-xs font-semibold text-sky-600 hover:text-sky-700 transition"
              >
                {isLocating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Navigation className="w-3.5 h-3.5" />
                )}
                <span>Use Current Location</span>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] text-slate-400 font-medium">Latitude</span>
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
                <span className="text-[10px] text-slate-400 font-medium">Longitude</span>
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
          </div>

          {/* Day 13 Upvote-Instead-Of-Duplicate Intercept Banner */}
          {nearbyCheck?.hasNearbyCluster && nearbyCheck.cluster && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 animate-in fade-in duration-200">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1 text-xs">
                  <div className="font-bold text-amber-950 mb-0.5">
                    Nearby Similar Issue Detected ({nearbyCheck.distanceMeters}m away)
                  </div>
                  <p className="text-amber-800 mb-2.5 leading-relaxed">
                    Neighbors have already submitted{' '}
                    <strong>{nearbyCheck.cluster.reportCount} reports</strong> for this{' '}
                    {category.toLowerCase().replace('_', ' ')} with{' '}
                    <strong>{nearbyCheck.cluster.upvotes} upvotes</strong>.
                  </p>
                  <button
                    type="button"
                    onClick={handleUpvoteInstead}
                    disabled={isSubmitting}
                    className="w-full flex items-center justify-center space-x-2 py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold shadow-sm transition active:scale-95"
                  >
                    <ThumbsUp className="w-4 h-4" />
                    <span>Upvote Existing Issue Instead (Recommended)</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Issue Description
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide details (e.g. depth of crater, water line burst, broken pole)..."
              required
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
            />
          </div>

          {/* Photo Evidence (Device Upload or URL) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                Photo Evidence (Optional)
              </label>
              <div className="flex items-center space-x-1 bg-slate-100 p-0.5 rounded-lg text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setPhotoMode('file')}
                  className={`px-2 py-0.5 rounded-md transition ${
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
                  className={`px-2 py-0.5 rounded-md transition ${
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
                  <div className="relative p-2.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center space-x-3">
                    <img
                      src={imageUrl}
                      alt="Uploaded preview"
                      className="w-16 h-16 rounded-xl object-cover border border-slate-200 shadow-sm shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">
                        {fileName || 'Selected photo'}
                      </p>
                      <p className="text-[10px] text-emerald-600 font-semibold flex items-center space-x-1 mt-0.5">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Ready to upload</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition"
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
                        <span>Optimizing image from device...</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center space-y-1 text-slate-500">
                        <div className="w-9 h-9 rounded-full bg-slate-100 group-hover:bg-sky-100 group-hover:text-sky-600 flex items-center justify-center transition">
                          <Upload className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-semibold text-slate-700">
                          Click to select photo from device or camera
                        </span>
                        <span className="text-[10px] text-slate-400">
                          JPG, PNG, WEBP (automatically optimized)
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

          {/* Actions */}
          <div className="pt-2 flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 flex items-center justify-center space-x-2 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl shadow-md shadow-sky-600/20 transition active:scale-95 disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span>{nearbyCheck?.hasNearbyCluster ? 'Submit & Merge' : 'Submit Report'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
