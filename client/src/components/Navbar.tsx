import React from 'react';
import {
  MapPin,
  ShieldAlert,
  PlusCircle,
  LogIn,
  LogOut,
  User as UserIcon,
  Layers,
} from 'lucide-react';
import { User } from '../types';

interface NavbarProps {
  user: User | null;
  activeView: 'map' | 'authority';
  setActiveView: (view: 'map' | 'authority') => void;
  onOpenReportModal: () => void;
  onOpenAuthModal: () => void;
  onLogout: () => void;
  clusterCount: number;
  totalComplaintsCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  activeView,
  setActiveView,
  onOpenReportModal,
  onOpenAuthModal,
  onLogout,
  clusterCount,
  totalComplaintsCount,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-sky-500/20">
            <MapPin className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-xl tracking-tight text-slate-900">
                NIVARA
              </span>
              <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">
                Clustering Engine
              </span>
            </div>
            <p className="text-xs text-slate-500 hidden sm:block">
              Geospatial Civic Issue Aggregation & Prioritization
            </p>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveView('map')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeView === 'map'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Civic Map</span>
          </button>
          <button
            onClick={() => setActiveView('authority')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeView === 'authority'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShieldAlert className="w-4 h-4 text-amber-600" />
            <span>Authority Triage</span>
          </button>
        </div>

        {/* Actions & User Profile */}
        <div className="flex items-center space-x-3">
          <button
            onClick={onOpenReportModal}
            className="flex items-center space-x-2 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-sm shadow-sky-600/30 transition active:scale-95"
          >
            <PlusCircle className="w-4 h-4" />
            <span className="hidden sm:inline">Report Issue</span>
          </button>

          {user ? (
            <div className="flex items-center space-x-2 pl-2 border-l border-slate-200">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-semibold text-slate-900 leading-tight">
                  {user.name}
                </p>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                    user.role === 'AUTHORITY'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {user.role}
                </span>
              </div>
              <button
                onClick={onLogout}
                title="Log out"
                className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuthModal}
              className="flex items-center space-x-1.5 text-xs font-semibold text-slate-700 hover:text-sky-600 px-3 py-2 rounded-lg hover:bg-slate-100 transition"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
