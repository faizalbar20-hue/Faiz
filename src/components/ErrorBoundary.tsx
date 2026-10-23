import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RotateCcw, RefreshCw, Home, ShieldAlert } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  isTabLevel?: boolean;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled exception:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetSettings = () => {
    try {
      localStorage.removeItem('ppic_dashboard_settings');
    } catch (e) {
      console.warn('Failed to clear localStorage', e);
    }
    window.location.reload();
  };

  private handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.isTabLevel) {
        return (
          <div className="bg-white rounded-2xl border border-red-200 p-6 sm:p-8 shadow-xs my-4">
            <div className="flex items-start space-x-4">
              <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center text-red-600 shrink-0">
                <AlertOctagon className="w-6 h-6" />
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {this.props.fallbackTitle || 'Terjadi Kendala Tampilan pada Bagian Ini'}
                  </h3>
                  <p className="text-xs text-slate-600 mt-1">
                    Komponen ini mengalami kesalahan pemrosesan data. Bagian lain dari dashboard tetap berjalan normal.
                  </p>
                </div>

                {this.state.error && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-[11px] font-mono text-red-700 overflow-x-auto">
                    {this.state.error.message || 'Unknown error occurred'}
                  </div>
                )}

                <div className="flex items-center space-x-2 pt-1">
                  <button
                    onClick={this.handleRetry}
                    className="inline-flex items-center space-x-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Coba Tampilkan Kembali</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      }

      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden p-6 sm:p-8 space-y-6">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center text-red-600 shrink-0">
                <ShieldAlert className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900">
                  Dashboard PPIC Menghadapi Kendala
                </h1>
                <p className="text-xs text-slate-500">
                  Aplikasi mendeteksi error tak terduga dan berhasil mencegah layar putih (white screen crash).
                </p>
              </div>
            </div>

            {this.state.error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 text-xs text-red-800 space-y-1">
                <div className="font-semibold text-red-900">Pesan Kesalahan:</div>
                <div className="font-mono text-[11px] break-all">
                  {this.state.error.message || 'Kesalahan sistem tidak dikenal.'}
                </div>
              </div>
            )}

            <div className="space-y-2 text-xs text-slate-600 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <div className="font-semibold text-slate-800">Langkah Pemulihan yang Disarankan:</div>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-600">
                <li>Klik <strong>Muat Ulang Dashboard</strong> untuk mencoba memuat kembali.</li>
                <li>Jika error berlanjut akibat format data yang rusak, gunakan <strong>Reset ke Pengaturan Default</strong>.</li>
              </ul>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
              <button
                onClick={this.handleReload}
                className="inline-flex items-center justify-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Muat Ulang Dashboard</span>
              </button>

              <button
                onClick={this.handleResetSettings}
                className="inline-flex items-center justify-center space-x-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold border border-slate-300 transition"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset ke Default</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
