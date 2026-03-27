'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import type { FloorPlan, MotorPin } from '@/types'

// PDF.js worker 설정
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

interface FloorPlanViewProps {
  floorPlan: FloorPlan
  pins: MotorPin[]
  onPinClick?: (motorId: number) => void
}

const SEVERITY_COLORS: Record<string, string> = {
  normal:   'bg-emerald-500 shadow-emerald-500/40',
  warning:  'bg-amber-500 shadow-amber-500/40',
  critical: 'bg-red-500 shadow-red-500/40',
}

const RING_COLORS: Record<string, string> = {
  normal:   'bg-emerald-500/20',
  warning:  'bg-amber-500/30',
  critical: 'bg-red-500/40',
}

export default function FloorPlanView({ floorPlan, pins, onPinClick }: FloorPlanViewProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [pageNumber, setPageNumber] = useState<number>(1)
  const [scale, setScale] = useState<number>(1.5)

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages)
  }

  const currentPins = useMemo(() => {
    return pins.filter(p => p.page === pageNumber)
  }, [pins, pageNumber])

  const isImage = useMemo(() => {
    const ext = floorPlan.file_name.split('.').pop()?.toLowerCase() || ''
    return ['jpg', 'jpeg', 'png', 'webp'].includes(ext)
  }, [floorPlan.file_name])

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0a0f1e] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 font-sans relative">
      <style jsx global>{`
        @keyframes pin-pulse {
          0% { transform: scale(0.6); opacity: 0.8; }
          70% { transform: scale(1.6); opacity: 0; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        .animate-pin-pulse {
          animation: pin-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>

      {/* 툴바 */}
      <div className="px-3 py-2 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 z-40">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="text-[9px] font-bold text-blue-500 uppercase tracking-widest leading-none mb-0.5">Floor Plan {isImage ? '(Image)' : '(PDF)'}</span>
            <h3 className="text-xs font-black text-slate-800 dark:text-slate-100 truncate max-w-[200px] leading-none">{floorPlan.name}</h3>
          </div>
          <div className="h-6 w-[1px] bg-slate-200 dark:bg-slate-800" />
          <div className="flex items-center gap-2">
            <button
              disabled={isImage || pageNumber <= 1}
              onClick={() => setPageNumber(prev => Math.max(1, prev - 1))}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-20 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7"/></svg>
            </button>
            <span className="text-[11px] font-bold tabular-nums text-slate-600 dark:text-slate-400 min-w-[50px] text-center">
              {isImage ? '1 / 1' : `${pageNumber} / ${numPages || floorPlan.page_count}`}
            </span>
            <button
              disabled={isImage || pageNumber >= (numPages || floorPlan.page_count)}
              onClick={() => setPageNumber(prev => Math.min(numPages || floorPlan.page_count, prev + 1))}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-20 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7"/></svg>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-xl">
          <button onClick={() => setScale(s => Math.max(0.5, s - 0.1))} className="p-1 px-2 rounded-lg hover:bg-white dark:hover:bg-slate-700 shadow-sm transition-all">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M20 12H4"/></svg>
          </button>
          <span className="text-[10px] font-black text-slate-500 w-10 text-center tabular-nums">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(s => Math.min(3, s + 0.1))} className="p-1 px-2 rounded-lg hover:bg-white dark:hover:bg-slate-700 shadow-sm transition-all">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"/></svg>
          </button>
        </div>
      </div>

      {/* 도면 영역 */}
      <div className="flex-1 overflow-auto p-2 flex justify-center items-center bg-[#f1f5f9] dark:bg-slate-950 shadow-inner">
        <div className="relative shadow-[0_32px_64px_-12px_rgba(0,0,0,0.14)] border border-white dark:border-slate-800 rounded-sm overflow-hidden">
          {isImage ? (
            <img
              src={`/api/floor-plan/file?id=${floorPlan.id}`}
              alt={floorPlan.name}
              style={{ width: `${scale * 1600}px`, height: 'auto' }}
              className="display-block"
            />
          ) : (
            <Document
              file={`/api/floor-plan/file?id=${floorPlan.id}`}
              onLoadSuccess={onDocumentLoadSuccess}
              loading={<div className="p-20 flex flex-col items-center gap-3"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Loading Floor Plan</p></div>}
            >
              <Page
                pageNumber={pageNumber}
                width={1600 * scale}
                renderAnnotationLayer={false}
                renderTextLayer={false}
              />
            </Document>
          )}

          {/* 핀 오버레이 */}
          {currentPins.map(pin => (
            <div
              key={pin.id}
              onClick={() => onPinClick?.(pin.motor_id)}
              className="absolute group z-20 cursor-pointer"
              style={{
                left: `${pin.x_pct}%`,
                top: `${pin.y_pct}%`,
                transform: 'translate(-50%, -50%)'
              }}
            >
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 hidden group-hover:block whitespace-nowrap z-50 pointer-events-none transition-all animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="bg-slate-900/95 backdrop-blur-md border border-white/10 text-white p-3 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] min-w-[140px]">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-2 h-2 rounded-full ${SEVERITY_COLORS[pin.severity]?.split(' ')[0]}`} />
                    <p className="text-xs font-black tracking-tight">{pin.motor_name}</p>
                  </div>
                  <div className="space-y-1.5 pt-2 border-t border-white/5">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="opacity-40">Location</span>
                      <span className="font-bold">{pin.location || '—'}</span>
                    </div>
                    {pin.vel_y_rms !== null && (
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="opacity-40">Vibration</span>
                        <span className="text-blue-400 font-black">{pin.vel_y_rms.toFixed(2)} <span className="text-[8px] opacity-60">mm/s</span></span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="w-3 h-3 bg-slate-900/95 rotate-45 mx-auto -mt-1.5 border-r border-b border-white/10" />
              </div>

              {/* Pin Graphics */}
              <div className="relative flex items-center justify-center w-10 h-10">
                {/* Pulse Ring (Warning/Critical only) */}
                {pin.severity !== 'normal' && (
                  <div className={`absolute inset-0 rounded-full animate-pin-pulse ${RING_COLORS[pin.severity]}`} />
                )}
                
                {/* Static Outer Glow */}
                <div className={`absolute w-6 h-6 rounded-full opacity-20 blur-md ${SEVERITY_COLORS[pin.severity]?.split(' ')[0]}`} />
                
                {/* Main Pin Body */}
                <div className={`
                  relative w-4 h-4 rounded-full border-2 border-white dark:border-slate-900 shadow-xl transition-all duration-300
                  group-hover:scale-150 group-hover:shadow-[0_0_20px_rgba(255,255,255,0.4)]
                  ${SEVERITY_COLORS[pin.severity] || 'bg-slate-400'}
                `}>
                  {/* Center Dot */}
                  <div className="absolute inset-0 m-auto w-1 h-1 bg-white rounded-full opacity-80" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 하단 범례 */}
      <div className="px-6 py-2 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 flex items-center gap-6 shrink-0 overflow-x-auto no-scrollbar">
        {Object.entries(SEVERITY_COLORS).map(([key, cls]) => (
          <div key={key} className="flex items-center gap-2 whitespace-nowrap group">
            <span className={`w-2 h-2 rounded-full transition-transform group-hover:scale-125 ${cls.split(' ')[0]}`} />
            <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-tighter">
              {key === 'normal' ? 'Normal' : key === 'warning' ? 'Minor' : 'Critical'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
