import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { CivicMapView } from './components/CivicMapView';
import { AuthorityDashboard } from './components/AuthorityDashboard';
import { ReportModal } from './components/ReportModal';
import { ClusterDetailModal } from './components/ClusterDetailModal';
import { AuthModal } from './components/AuthModal';
import { User, IssueCluster } from './types';
import {
  getCurrentUser,
  fetchClusters,
  upvoteClusterApi,
  clearAuthToken,
  getAuthToken,
} from './api';

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activeView, setActiveView] = useState<'map' | 'authority'>('map');
  const [clusters, setClusters] = useState<IssueCluster[]>([]);
  const [totalComplaints, setTotalComplaints] = useState<number>(0);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  // Modals
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [focusedCoords, setFocusedCoords] = useState<[number, number] | undefined>(undefined);

  // Check auth on load
  useEffect(() => {
    const token = getAuthToken();
    if (token) {
      getCurrentUser()
        .then((res) => setUser(res.data.user))
        .catch(() => clearAuthToken());
    }
  }, []);

  // Fetch clusters
  const loadClusters = async () => {
    try {
      const res = await fetchClusters({
        category: selectedCategory === 'ALL' ? undefined : selectedCategory,
        status: selectedStatus === 'ALL' ? undefined : selectedStatus,
      });
      setClusters(res.data.clusters);

      // Compute total reports across all clusters
      const total = res.data.clusters.reduce((acc, c) => acc + c.reportCount, 0);
      setTotalComplaints(total);
    } catch (err) {
      console.error('Failed to load clusters:', err);
    }
  };

  useEffect(() => {
    loadClusters();
  }, [selectedCategory, selectedStatus]);

  const handleLogout = () => {
    clearAuthToken();
    setUser(null);
  };

  const handleUpvoteCluster = async (clusterId: string) => {
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }
    try {
      await upvoteClusterApi(clusterId);
      await loadClusters();
    } catch (err: any) {
      alert(err.message || 'Failed to record upvote');
    }
  };

  const handleSelectCluster = (cluster: IssueCluster) => {
    setSelectedClusterId(cluster.id);
  };

  const handleReportModalOpen = () => {
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }
    setIsReportModalOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar
        user={user}
        activeView={activeView}
        setActiveView={setActiveView}
        onOpenReportModal={handleReportModalOpen}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onLogout={handleLogout}
        clusterCount={clusters.length}
        totalComplaintsCount={totalComplaints}
      />

      <main className="flex-1">
        {activeView === 'map' ? (
          <CivicMapView
            clusters={clusters}
            onSelectCluster={handleSelectCluster}
            onUpvoteCluster={handleUpvoteCluster}
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            selectedStatus={selectedStatus}
            setSelectedStatus={setSelectedStatus}
            centerCoords={focusedCoords}
          />
        ) : (
          <AuthorityDashboard
            onSelectCluster={(c) => {
              setSelectedClusterId(c.id);
              setFocusedCoords([c.centroidLat, c.centroidLng]);
            }}
            onRefreshClusters={loadClusters}
            totalComplaints={totalComplaints}
            totalClusters={clusters.length}
          />
        )}
      </main>

      {/* Modals */}
      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        onComplaintSubmitted={() => {
          loadClusters();
        }}
        onViewClusterOnMap={(cluster) => {
          setIsReportModalOpen(false);
          setActiveView('map');
          setSelectedClusterId(cluster.id);
          setFocusedCoords([cluster.centroidLat, cluster.centroidLng]);
        }}
      />

      <ClusterDetailModal
        clusterId={selectedClusterId}
        onClose={() => setSelectedClusterId(null)}
        onUpvoteSuccess={() => {
          loadClusters();
        }}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={(loggedInUser) => {
          setUser(loggedInUser);
        }}
      />
    </div>
  );
}

export default App;
