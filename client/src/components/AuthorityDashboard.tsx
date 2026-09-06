import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  CheckCircle,
  Clock,
  ArrowUpDown,
  Filter,
  Eye,
  CheckCircle2,
  TrendingUp,
  AlertOctagon,
  Users,
  Layers,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { IssueCluster, ClusterStatus } from '../types';
import { fetchTopClusters, updateClusterStatusApi } from '../api';

interface AuthorityDashboardProps {
  onSelectCluster: (cluster: IssueCluster) => void;
  onRefreshClusters: () => void;
  totalComplaints: number;
  totalClusters: number;
}

export const AuthorityDashboard: React.FC<AuthorityDashboardProps> = ({
  onSelectCluster,
  onRefreshClusters,
  totalComplaints,
  totalClusters,
}) => {
  const [topClusters, setTopClusters] = useState<IssueCluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetchTopClusters({
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        category: categoryFilter === 'ALL' ? undefined : categoryFilter,
        limit: 25,
      });
      setTopClusters(res.data.topClusters);
    } catch (err) {
      console.error('Failed to load top priority clusters:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter, categoryFilter]);

  const handleStatusChange = async (id: string, newStatus: ClusterStatus) => {
    try {
      setUpdatingId(id);
      await updateClusterStatusApi(id, newStatus);
      await loadData();
      onRefreshClusters();
    } catch (err) {
      console.error('Failed to update status:', err);
      alert('Failed to update cluster status');
    } finally {
      setUpdatingId(null);
    }
  };

  const deduplicationRate =
    totalComplaints > 0
      ? (((totalComplaints - totalClusters) / totalComplaints) * 100).toFixed(1)
      : '0';

  const formatCategory = (cat: string) =>
    cat.replace('_', ' ').toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Municipal Triage & Priority Command Center
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time geospatial hazard clusters ranked by composite community impact score.
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center space-x-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="OPEN">Open Only</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="RESOLVED">Resolved</option>
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="ALL">All Categories</option>
            <option value="POTHOLE">Pothole</option>
            <option value="GARBAGE_DUMP">Garbage Dump</option>
            <option value="STREETLIGHT">Streetlight</option>
            <option value="WATER_LEAKAGE">Water Leakage</option>
            <option value="OPEN_SEWAGE">Open Sewage</option>
            <option value="FOOTPATH_OBSTRUCTION">Footpath Obstruction</option>
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Total Reports
            </span>
            <Users className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900">{totalComplaints}</div>
          <div className="text-[10px] text-slate-500 mt-1">Raw citizen tickets ingested</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Active Clusters
            </span>
            <Layers className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900">{totalClusters}</div>
          <div className="text-[10px] text-slate-500 mt-1">Geospatially aggregated sites</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Deduplication Rate
            </span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-600">{deduplicationRate}%</div>
          <div className="text-[10px] text-slate-500 mt-1">Duplicate tickets prevented</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Formula Model
            </span>
            <AlertOctagon className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-xs font-mono font-bold text-slate-800">
            2N + Upvotes + W
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Weighted priority calculation</div>
        </div>
      </div>

      {/* Priority Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">
            Top Priority Civic Incidents ({topClusters.length})
          </h2>
          <span className="text-xs text-slate-400">Ranked by Priority Score</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Loading priority queue...
          </div>
        ) : topClusters.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No clusters found matching the active filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3">Rank & Category</th>
                  <th className="px-6 py-3">Reports</th>
                  <th className="px-6 py-3">Upvotes</th>
                  <th className="px-6 py-3">Priority Score</th>
                  <th className="px-6 py-3">Centroid Location</th>
                  <th className="px-6 py-3">Workflow Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topClusters.map((cluster, index) => {
                  const isCritical = cluster.reportCount >= 6 && cluster.status !== 'RESOLVED';

                  return (
                    <tr
                      key={cluster.id}
                      className={`hover:bg-slate-50/80 transition ${
                        isCritical ? 'bg-red-50/20' : ''
                      }`}
                    >
                      {/* Rank & Category */}
                      <td className="px-6 py-3.5">
                        <div className="flex items-center space-x-3">
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center font-extrabold text-[11px] ${
                              index === 0
                                ? 'bg-amber-400 text-slate-950 shadow-sm'
                                : index === 1
                                ? 'bg-slate-200 text-slate-800'
                                : index === 2
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {index + 1}
                          </span>
                          <div>
                            <div className="font-bold text-slate-900">
                              {formatCategory(cluster.category)}
                            </div>
                            <span className="text-[10px] font-mono text-slate-400">
                              ID: {cluster.id.slice(0, 8)}...
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Reports */}
                      <td className="px-6 py-3.5">
                        <span
                          className={`font-bold text-xs px-2.5 py-1 rounded-full ${
                            cluster.reportCount >= 6
                              ? 'bg-red-100 text-red-800'
                              : cluster.reportCount >= 3
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {cluster.reportCount} reports
                        </span>
                      </td>

                      {/* Upvotes */}
                      <td className="px-6 py-3.5 font-semibold text-slate-700">
                        {cluster.upvotes}
                      </td>

                      {/* Priority Score */}
                      <td className="px-6 py-3.5">
                        <span className="text-sm font-extrabold text-slate-900">
                          {cluster.priorityScore.toFixed(1)}
                        </span>
                      </td>

                      {/* Centroid */}
                      <td className="px-6 py-3.5 font-mono text-[11px] text-slate-500">
                        {cluster.centroidLat.toFixed(4)}, {cluster.centroidLng.toFixed(4)}
                      </td>

                      {/* Status Dropdown */}
                      <td className="px-6 py-3.5">
                        <select
                          value={cluster.status}
                          disabled={updatingId === cluster.id}
                          onChange={(e) =>
                            handleStatusChange(cluster.id, e.target.value as ClusterStatus)
                          }
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider border transition ${
                            cluster.status === 'OPEN'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : cluster.status === 'IN_PROGRESS'
                              ? 'bg-blue-50 text-blue-800 border-blue-200'
                              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          }`}
                        >
                          <option value="OPEN">OPEN</option>
                          <option value="IN_PROGRESS">IN PROGRESS</option>
                          <option value="RESOLVED">RESOLVED</option>
                        </select>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-3.5 text-right">
                        <button
                          onClick={() => onSelectCluster(cluster)}
                          className="p-1.5 text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition"
                          title="Inspect Constituent Complaints"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
