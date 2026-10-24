import React from 'react';
import { Coordinates, OceanObservation } from '../types/ocean';
import { getPelagicZone } from '../utils/oceanData';
import { generateOceanPdfReport, exportOceanCsv } from '../utils/pdfReport';
import { X, FileText, Download, CheckCircle2, AlertTriangle } from 'lucide-react';

interface ResearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  coords: Coordinates | null;
  depth: number;
  hour: number;
  oceanData: OceanObservation | null;
}

export const ResearchModal: React.FC<ResearchModalProps> = ({
  isOpen,
  onClose,
  coords,
  depth,
  hour,
  oceanData
}) => {
  if (!isOpen) return null;

  const isLand = Boolean(
    oceanData?.seabedInfo?.isLand ||
    (oceanData?.seabedInfo?.elevationMeters !== undefined && oceanData.seabedInfo.elevationMeters > 0)
  );

  const currentZone = getPelagicZone(depth);

  const handleDownloadPdf = () => {
    if (!coords || !oceanData || isLand) return;
    generateOceanPdfReport(coords, depth, hour, oceanData);
  };

  const handleDownloadCsv = () => {
    if (!coords || !oceanData || isLand) return;
    exportOceanCsv(coords, depth, hour, oceanData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-cyan-500/30 bg-[#06172a] text-slate-100 shadow-2xl p-6">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 text-cyan-400 text-xs font-mono font-semibold uppercase tracking-wider mb-1">
          <FileText className="w-4 h-4" />
          <span>MARIVEX SCIENTIFIC DOSSIER</span>
        </div>
        <h2 className="text-2xl font-bold text-white mb-4">
          Oceanographic Research Report
        </h2>

        {coords && oceanData ? (
          isLand ? (
            <div className="space-y-5 text-xs text-slate-300">
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200">
                <div className="flex items-center gap-2 text-red-400 font-bold text-sm mb-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Continental Landmass Detected</span>
                </div>
                <p className="leading-relaxed text-slate-300">
                  The selected coordinates{' '}
                  <span className="font-mono text-cyan-300 font-semibold">
                    {coords.latitude.toFixed(4)}°, {coords.longitude.toFixed(4)}°
                  </span>{' '}
                  are situated on dry land (
                  <span className="text-white font-medium">
                    {oceanData.seabedInfo?.elevationMeters !== undefined && oceanData.seabedInfo.elevationMeters > 0
                      ? `+${oceanData.seabedInfo.elevationMeters}m ASL`
                      : 'Subaerial Topography'}
                  </span>
                  ). Official oceanographic dossiers, seawater stratification models, and hydrodynamic analyses are only compiled for oceanic and marine coordinates.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#041a31] border border-cyan-500/20 text-slate-400 leading-relaxed">
                Please click on an open ocean basin, marginal sea, or coastal trench on the 3D globe to generate an authentic 5-page research dossier.
              </div>

              {/* Disabled Export buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  disabled={true}
                  className="w-full sm:w-auto flex-1 py-3 px-5 rounded-xl bg-slate-800 text-slate-500 font-bold text-xs flex items-center justify-center gap-2 cursor-not-allowed border border-white/5 shadow-none"
                >
                  <FileText className="w-4 h-4 text-slate-500" />
                  <span>PDF Unavailable on Landmass</span>
                </button>

                <button
                  type="button"
                  disabled={true}
                  className="w-full sm:w-auto py-3 px-5 rounded-xl border border-white/5 bg-white/5 text-slate-600 font-semibold text-xs flex items-center justify-center gap-2 cursor-not-allowed"
                >
                  <Download className="w-4 h-4 text-slate-600" />
                  <span>CSV Unavailable</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5 text-xs text-slate-300">
              <p className="leading-relaxed">
                Consolidated snapshot of physical oceanographic parameters compiled for coordinates{' '}
                <span className="font-mono text-cyan-300 font-semibold">
                  {coords.latitude.toFixed(4)}°, {coords.longitude.toFixed(4)}°
                </span>{' '}
                ({oceanData.oceanBasin}) at depth horizon{' '}
                <span className="font-mono text-cyan-300 font-semibold">{depth}m</span>.
              </p>

              {/* Quick Summary Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-xl bg-[#09223a] border border-cyan-500/20">
                  <div className="text-[10px] text-slate-400 font-mono">TEMPERATURE</div>
                  <div className="text-lg font-bold text-white font-mono mt-1">
                    {oceanData.temperature !== null ? `${oceanData.temperature.toFixed(2)} °C` : '--'}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#09223a] border border-cyan-500/20">
                  <div className="text-[10px] text-slate-400 font-mono">SALINITY</div>
                  <div className="text-lg font-bold text-white font-mono mt-1">
                    {oceanData.salinity !== null ? `${oceanData.salinity.toFixed(2)} PSU` : '--'}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#09223a] border border-cyan-500/20">
                  <div className="text-[10px] text-slate-400 font-mono">CURRENT VELOCITY</div>
                  <div className="text-lg font-bold text-white font-mono mt-1">
                    {oceanData.currentSpeed !== null ? `${oceanData.currentSpeed.toFixed(2)} km/h` : '--'}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#09223a] border border-cyan-500/20">
                  <div className="text-[10px] text-slate-400 font-mono">PRESSURE</div>
                  <div className="text-lg font-bold text-white font-mono mt-1">
                    {oceanData.pressure !== null ? `${oceanData.pressure.toFixed(1)} dbar` : '--'}
                  </div>
                </div>
              </div>

              {/* Pelagic Stratum Detail */}
              <div className="p-4 rounded-xl bg-[#041a31] border border-cyan-500/20">
                <div className="text-cyan-300 font-semibold text-sm mb-1">
                  Stratum: {currentZone.name} ({currentZone.altName})
                </div>
                <p className="text-slate-400 leading-relaxed">
                  {currentZone.description} Solar irradiance is estimated at{' '}
                  <span className="text-slate-200">{currentZone.lightLevel}</span>. Seafloor bathymetric boundary is located at approximately{' '}
                  <span className="text-slate-200 font-mono">{oceanData.bathymetryDepth.toLocaleString()}m</span>.
                </p>
              </div>

              {/* Inclusions checklist */}
              <div className="space-y-1.5 pt-2">
                <div className="font-semibold text-slate-200 mb-1">Included in Official PDF Dossier:</div>
                <div className="flex items-center gap-2 text-slate-400">
                  <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>Executive Summary & Hydrodynamic Analysis</span>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>5-Page Publication-Grade Layout formatted to ISO A4</span>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>Full UNESCO EOS-80 Seawater Equation Attributions</span>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>Cryptographic Telemetry Parity Seal</span>
                </div>
              </div>

              {/* Export buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  className="w-full sm:w-auto flex-1 py-3 px-5 rounded-xl bg-cyan-400 text-black font-bold text-xs flex items-center justify-center gap-2 hover:bg-cyan-300 transition-colors shadow-lg shadow-cyan-500/30"
                >
                  <FileText className="w-4 h-4 text-black" />
                  <span>Download Official 5-Page PDF</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadCsv}
                  className="w-full sm:w-auto py-3 px-5 rounded-xl border border-white/10 bg-white/5 text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 hover:bg-white/10 transition-colors"
                >
                  <Download className="w-4 h-4 text-slate-400" />
                  <span>Export CSV Dataset</span>
                </button>
              </div>
            </div>
          )
        ) : (
          <div className="py-12 text-center text-slate-400">
            Please pin a marine coordinate on the 3D globe to compile your research dossier.
          </div>
        )}
      </div>
    </div>
  );
};