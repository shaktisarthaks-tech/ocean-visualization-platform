import React from 'react';
import { Volume2, VolumeX, Globe2, FileText, Info, ShieldAlert, AlertCircle, GitCompare, Mountain, Bot } from 'lucide-react';
import { oceanAudio } from '../utils/audio';

interface HeaderProps {
  isPlayingAudio: boolean;
  setIsPlayingAudio: (val: boolean) => void;
  onOpenReportModal: () => void;
  onOpenAboutModal: () => void;
  onOpenOperationsModal: () => void;
  onOpenAnomalyModal: () => void;
  onOpenComparisonModal: () => void;
  onOpenTransectModal: () => void;
  onToggleAssistant: () => void;
  isAssistantOpen: boolean;
  isUnderwater?: boolean;
  onToggleUnderwater?: () => void;
  isLand?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  isPlayingAudio,
  setIsPlayingAudio,
  onOpenReportModal,
  onOpenAboutModal,
  onOpenOperationsModal,
  onOpenAnomalyModal,
  onOpenComparisonModal,
  onOpenTransectModal,
  onToggleAssistant,
  isAssistantOpen,
  isUnderwater = false,
  onToggleUnderwater,
  isLand = false
}) => {
  const handleToggleAudio = () => {
    const isNowPlaying = oceanAudio.toggleMute();
    setIsPlayingAudio(isNowPlaying);
  };

  return (
    <header className="flex items-center justify-between gap-4 lg:gap-8 px-4 sm:px-6 py-3.5 border-b border-cyan-500/20 bg-[#031122]/95 backdrop-blur-md z-30 sticky top-0">
      {/* Zone 1: Single text element wordmark */}
      <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
        <div className="w-8 sm:w-9 h-8 sm:h-9 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-500 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
          <Globe2 className="w-4 sm:w-5 h-4 sm:h-5 text-cyan-100" />
        </div>
        <div>
          <span className="text-lg sm:text-xl font-extrabold tracking-tight text-white flex items-center gap-1.5 font-mono">
            MARIVEX
            <span className="text-[10px] font-sans font-semibold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-400/30">
              3D
            </span>
          </span>
        </div>
      </div>

      {/* Zone 2: Navigation & Feature Modals Launcher */}
      <nav className="hidden xl:flex items-center gap-4 lg:gap-5 text-xs font-semibold text-slate-300">
        <button
          type="button"
          onClick={onOpenOperationsModal}
          className="hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 text-slate-300 hover:text-white"
        >
          <ShieldAlert className="w-3.5 h-3.5 text-cyan-400" />
          <span>Marine Operations</span>
        </button>

        <button
          type="button"
          onClick={onOpenAnomalyModal}
          className="hover:text-amber-300 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 text-slate-300 hover:text-white"
        >
          <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
          <span>Anomaly Detection</span>
        </button>

        <button
          type="button"
          onClick={onOpenComparisonModal}
          className="hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 text-slate-300 hover:text-white"
        >
          <GitCompare className="w-3.5 h-3.5 text-cyan-400" />
          <span>Compare Regions</span>
        </button>

        <button
          type="button"
          onClick={onOpenTransectModal}
          className="hover:text-violet-300 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 text-slate-300 hover:text-white"
        >
          <Mountain className="w-3.5 h-3.5 text-violet-400" />
          <span>Seafloor Transects</span>
        </button>

        <button
          type="button"
          onClick={onOpenAboutModal}
          className="hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
        >
          <Info className="w-3.5 h-3.5 text-cyan-400" />
          <span>Oceanic Models</span>
        </button>
      </nav>

      {/* Zone 3: Primary action & controls */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Explore Ocean Floor / Return to Globe Button */}
        {onToggleUnderwater && (
          <button
            type="button"
            onClick={onToggleUnderwater}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all whitespace-nowrap shrink-0 shadow-md ${
              isUnderwater
                ? 'border-emerald-400 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30 shadow-emerald-950/40'
                : 'border-cyan-400/40 bg-[#062446] text-cyan-200 hover:border-cyan-400 hover:bg-cyan-500/20 shadow-cyan-950/30'
            }`}
          >
            <Mountain className="w-3.5 h-3.5 text-cyan-300" />
            <span className="hidden sm:inline">{isUnderwater ? 'Return to Globe' : 'Explore Ocean Floor'}</span>
            <span className="sm:hidden">{isUnderwater ? 'Globe' : 'Floor'}</span>
          </button>
        )}

        {/* Ask MARIVEX AI Assistant Launcher */}
        <button
          type="button"
          onClick={onToggleAssistant}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all whitespace-nowrap shrink-0 shadow-md ${
            isAssistantOpen
              ? 'border-cyan-400 bg-cyan-500/25 text-white shadow-cyan-900/50'
              : 'border-cyan-500/30 bg-[#051f3c] text-cyan-200 hover:border-cyan-400 hover:bg-cyan-500/20'
          }`}
        >
          <Bot className="w-3.5 h-3.5 text-cyan-300" />
          <span className="hidden sm:inline">Ask MARIVEX</span>
          <span className="sm:hidden">AI</span>
        </button>

        <button
          type="button"
          onClick={handleToggleAudio}
          title={isPlayingAudio ? 'Mute Hydrophone Sound' : 'Play Deep Sea Hydrophone Ambient'}
          className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
            isPlayingAudio
              ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200 shadow-md shadow-cyan-900/40'
              : 'border-white/10 bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
          }`}
        >
          {isPlayingAudio ? (
            <>
              <Volume2 className="w-3.5 h-3.5 text-cyan-300 animate-pulse" />
              <span className="hidden md:inline">Hydrophone</span>
            </>
          ) : (
            <>
              <VolumeX className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Audio Off</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={isLand ? undefined : onOpenReportModal}
          disabled={isLand}
          title={isLand ? 'Research Dossier is unavailable on landmasses' : 'Generate Research Dossier'}
          className={`px-3 sm:px-4 py-1.5 sm:py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
            isLand
              ? 'opacity-40 bg-slate-700 text-slate-400 cursor-not-allowed border border-white/10 shadow-none'
              : 'text-black bg-cyan-400 hover:bg-cyan-300 shadow-lg shadow-cyan-500/30 cursor-pointer'
          }`}
        >
          <FileText className={`w-3.5 h-3.5 ${isLand ? 'text-slate-400' : 'text-black'}`} />
          <span className="hidden sm:inline">Research Dossier</span>
          <span className="sm:hidden">PDF</span>
        </button>
      </div>
    </header>
  );
};