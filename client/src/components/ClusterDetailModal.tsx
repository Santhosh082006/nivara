import React, { useState, useEffect } from 'react';
import {
  X,
  ThumbsUp,
  Clock,
  MapPin,
  AlertTriangle,
  User,
  CheckCircle,
  ExternalLink,
  Layers,
  Image as ImageIcon,
} from 'lucide-react';
import { IssueCluster, ClusterMembership } from '../types';
import { fetchClusterDetails, upvoteClusterApi } from '../api';

interface ClusterDetailModalProps {
  clusterId: string | null;
  onClose: () => void;
  onUpvoteSuccess: () => void;
}

export const ClusterDetailModal: React.FC<ClusterDetailModalProps> = ({
  clusterId,
  onClose,
  onUpvoteSuccess,
}) => {
  const [cluster, setCluster] = useState<IssueCluster | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUpvoting, setIsUpvoting] = useState(false);
  const [upvoteMessage, setUpvoteMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!clusterId) return;

    const load = async () => {
      try {
        setLoading(true);
        const res = await fetchClusterDetails(clusterId);
        setCluster(res.data.cluster);
      } catch (err) {
        console.error('Failed to load cluster details:', err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [clusterId]);

  const handleUpvote = async () => {
    if (!cluster) return;
    try {
      setIsUpvoting(true);
      await upvoteClusterApi(cluster.id);
      setUpvoteMessage('Upvote recorded! Priority score updated.');
      const res = await fetchClusterDetails(cluster.id);
      setCluster(res.data.cluster);
      onUpvoteSuccess();
    } catch (err: any) {
      setUpvoteMessage(err.message || 'Already upvoted');
    } finally {
      setIsUpvoting(false);
    }
  };

  if (!clusterId) return null;

  const formatCategory = (cat?: string) =>
    cat ? cat.replace('_', ' ').toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase()) : '';

  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-500"></span>
            <h2 className="text-base font-bold text-slate-900">
              Clustered Incident Breakdown
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
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400 font-medium">
            Loading constituent reports...
          </div>
        ) : !cluster ? (
          <div className="p-8 text-center text-xs text-red-500">
            Cluster details could not be found.
          </div>
        ) : (
          <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
            {/* Top Overview Cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 text-center">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Category
                </div>
                <div className="text-sm font-extrabold text-slate-900 mt-0.5">
                  {formatCategory(cluster.category)}
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 text-center">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Total Reports
                </div>
                <div className="text-xl font-extrabold text-sky-600 mt-0.5">
                  {cluster.reportCount}
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 text-center">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Priority Score
                </div>
                <div className="text-xl font-extrabold text-amber-600 mt-0.5">
                  {cluster.priorityScore.toFixed(1)}
                </div>
              </div>
            </div>

            {/* Centroid & Status Row */}
            <div className="flex flex-wrap items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100 text-xs text-slate-600 gap-2">
              <div className="flex items-center space-x-2">
                <MapPin className="w-4 h-4 text-slate-400" />
                <span className="font-mono">
                  Centroid: {cluster.centroidLat.toFixed(6)}, {cluster.centroidLng.toFixed(6)}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="font-semibold">Status:</span>
                <span
                  className={`font-bold uppercase px-2 py-0.5 rounded text-[10px] ${
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
            </div>

            {/* Upvote Call-to-action */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-sky-50 border border-sky-100">
              <div className="text-xs">
                <span className="font-bold text-sky-950">Community Endorsement</span>
                <p className="text-sky-700 text-[11px]">
                  {cluster.upvotes} neighbors have upvoted this hazard.
                </p>
              </div>
              <button
                onClick={handleUpvote}
                disabled={isUpvoting || cluster.status === 'RESOLVED'}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition shadow-sm disabled:opacity-50"
              >
                <ThumbsUp className="w-3.5 h-3.5" />
                <span>Upvote</span>
              </button>
            </div>

            {upvoteMessage && (
              <div className="text-xs text-center font-semibold text-slate-600">
                {upvoteMessage}
              </div>
            )}

            {/* Member Complaints Timeline */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center space-x-1.5">
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                <span>Aggregated Citizen Reports ({cluster.memberships?.length || 0})</span>
              </h3>

              <div className="space-y-2.5">
                {cluster.memberships?.map((membership: ClusterMembership, idx: number) => (
                  <div
                    key={membership.id}
                    className="p-3 rounded-2xl border border-slate-100 bg-white hover:bg-slate-50/50 transition text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600">
                          #{idx + 1}
                        </span>
                        <span className="font-semibold text-slate-800">
                          {membership.complaint.user?.name || 'Citizen'}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {new Date(membership.joinedAt).toLocaleDateString()} at{' '}
                        {new Date(membership.joinedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <p className="text-slate-600 leading-relaxed pl-7">
                      {membership.complaint.description}
                    </p>

                    <div className="pl-7 flex items-center space-x-3 text-[10px] text-slate-400">
                      <span>Distance to Centroid: {membership.distanceToCentroid.toFixed(1)}m</span>
                      {membership.complaint.imageUrl && (
                        <a
                          href={membership.complaint.imageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-600 hover:underline flex items-center space-x-1"
                        >
                          <ImageIcon className="w-3 h-3" />
                          <span>View Photo</span>
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
