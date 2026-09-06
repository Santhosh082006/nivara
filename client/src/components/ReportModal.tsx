import React, { useState, useEffect } from 'react';
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

          {/* Photo URL */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Photo URL (Optional)
            </label>
            <div className="flex items-center space-x-2">
              <Camera className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://images.unsplash.com/..."
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
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
