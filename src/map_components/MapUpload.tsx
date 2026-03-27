'use client'

import { useState, useRef, useMemo, useEffect } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import type { FloorPlan, Motor, MotorPin, ApiResponse } from '@/types'

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

export default function MapUpload() {
  const { data: fpRes, mutate: mutateFP } = useSWR<{ ok: boolean, floorPlan: FloorPlan | null, pins: MotorPin[] }>('/api/floor-plan', fetcher)
  const { data: motorRes } = useSWR<ApiResponse<Motor[]>>('/api/motors', fetcher)

  const [uploading, setUploading] = useState(false)
  const [pageNumber, setPageNumber] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const [draggingMotorId, setDraggingMotorId] = useState<number | null>(null)

  const mapRef = useRef<HTMLDivElement>(null)
  const innerMapRef = useRef<HTMLDivElement>(null)

  const [localPins, setLocalPins] = useState<MotorPin[]>([])
  const [deletedMotorIds, setDeletedMotorIds] = useState<Set<number>>(new Set())
  const [hasChanges, setHasChanges] = useState(false)

  const floorPlan = fpRes?.floorPlan
  const pins = fpRes?.pins || []
  const motors = motorRes?.data || []

  // 초기 데이터 로드 시 localPins 동기화
  useEffect(() => {
    if (pins && pins.length > 0) {
      setLocalPins(pins)
      setDeletedMotorIds(new Set())
      setHasChanges(false)
    }
  }, [pins])

  // 아직 핀이 꽂히지 않은 모터들 (localPins 기준)
  const unmappedMotors = useMemo(() => {
    return motors.filter(m => !localPins.some(p => p.motor_id === m.id))
  }, [motors, localPins])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const name = prompt('도면 이름을 입력하세요', file.name.replace(/\.[^/.]+$/, ""))
    if (!name) return

    setUploading(true)
    const form = new FormData()
    form.append('file', file)
    form.append('name', name)

    try {
      const res = await fetch('/api/floor-plan', { method: 'POST', body: form })
      if (res.ok) {
        await mutateFP()
        alert('도면이 업로드되었습니다.')
      } else {
        const err = await res.json()
        alert(`업로드 실패: ${err.error}`)
      }
    } catch (err) {
      alert(`업로드 오류: ${err}`)
    } finally {
      setUploading(false)
    }
  }

  const isImage = useMemo(() => {
    if (!floorPlan) return false
    const ext = floorPlan.file_name.split('.').pop()?.toLowerCase() || ''
    return ['jpg', 'jpeg', 'png', 'webp'].includes(ext)
  }, [floorPlan])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    if (draggingMotorId === null || !floorPlan || !innerMapRef.current) return

    const rect = innerMapRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100

    const motor = motors.find(m => m.id === draggingMotorId)
    if (!motor) return

    setLocalPins(prev => {
      const existing = prev.find(p => p.motor_id === draggingMotorId)
      if (existing) {
        return prev.map(p => p.motor_id === draggingMotorId ? { ...p, x_pct: x, y_pct: y, page: isImage ? 1 : pageNumber } : p)
      } else {
        return [...prev, {
          id: -Date.now(), // 임시 ID
          motor_id: motor.id,
          motor_name: motor.name,
          location: motor.location,
          page: isImage ? 1 : pageNumber,
          x_pct: x,
          y_pct: y,
          severity: 'normal'
        } as MotorPin]
      }
    })
    setDeletedMotorIds(prev => {
      const next = new Set(prev)
      next.delete(motor.id)
      return next
    })
    setHasChanges(true)
    setDraggingMotorId(null)
  }

  function removePin(motorId: number) {
    if (!confirm('이 모터 배치를 삭제하시겠습니까? (저장 버튼을 눌러야 최종 반영됩니다.)')) return
    setLocalPins(prev => prev.filter(p => p.motor_id !== motorId))
    setDeletedMotorIds(prev => new Set(prev).add(motorId))
    setHasChanges(true)
  }

  async function savePositions() {
    if (!floorPlan || !hasChanges) return
    setUploading(true)
    try {
      // 1. 삭제 수행
      await Promise.all(Array.from(deletedMotorIds).map(motorId => 
        fetch(`/api/floor-plan/pins?floor_plan_id=${floorPlan.id}&motor_id=${motorId}`, { method: 'DELETE' })
      ))

      // 2. 추가/업데이트 수행
      await Promise.all(localPins.map(pin => 
        fetch('/api/floor-plan/pins', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            floor_plan_id: floorPlan.id,
            motor_id: pin.motor_id,
            page: pin.page,
            x_pct: pin.x_pct,
            y_pct: pin.y_pct
          })
        })
      ))

      await mutateFP()
      setHasChanges(false)
      setDeletedMotorIds(new Set())
      alert('설정이 성공적으로 저장되었습니다.')
    } catch (err) {
      alert('저장 중 오류 발생: ' + err)
    } finally {
      setUploading(false)
    }
  }

  function resetPositions() {
    if (confirm('모든 변경사항을 취소하시겠습니까?')) {
      setLocalPins(pins)
      setDeletedMotorIds(new Set())
      setHasChanges(false)
    }
  }

  // deleteMap 함수 (기존 코드 유지)
  async function deleteMap() {
    if (!floorPlan || !confirm('도면을 삭제하시겠습니까? 관련 핀 데이터도 모두 사라질 수 있습니다.')) return
    await fetch(`/api/floor-plan?id=${floorPlan.id}`, { method: 'DELETE' })
    await mutateFP()
  }

  return (
    <div className="flex flex-col gap-6 font-sans">
      <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-[11px] text-blue-700 dark:text-blue-400">
        <p className="font-bold mb-1 tracking-tight">💡 도면 설정 가이드</p>
        <ol className="list-decimal list-inside space-y-1 opacity-80">
          <li>공장 도면(PDF 또는 이미지)을 업로드하세요.</li>
          <li>왼쪽 모터 목록에서 모터를 도면 위로 드래그하여 배치하세요.</li>
          <li>이미 배치된 핀은 드래그하여 위치를 옮길 수 있습니다.</li>
          <li><b>핀에 마우스를 올리면 나타나는 [x] 버튼으로 배치를 취소할 수 있습니다.</b></li>
          <li><b>배치/수정 완료 후 반드시 우측 하단의 '위치 저장' 버튼을 눌러주세요.</b></li>
        </ol>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 h-auto lg:h-[600px]">
        {/* 왼쪽: 미할당 모터 목록 (기존 코드 유지) */}
        <div className="w-full lg:w-64 shrink-0 flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden min-h-[200px]">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-[#0a0f1e]">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">배치 안 된 모터 ({unmappedMotors.length})</h4>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {unmappedMotors.map(m => (
              <div
                key={m.id}
                draggable
                onDragStart={() => setDraggingMotorId(m.id)}
                className="p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg cursor-grab active:cursor-grabbing hover:border-blue-400 dark:hover:border-blue-600 transition-colors shadow-sm"
              >
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{m.name}</p>
                <p className="text-[10px] text-slate-400 mt-1 truncate">{m.location || '-'}</p>
              </div>
            ))}
            {unmappedMotors.length === 0 && (
              <p className="text-[10px] text-slate-400 text-center py-10">모든 모터가 배치되었습니다.</p>
            )}
          </div>
        </div>

        {/* 오른쪽: 도면 에어리어 */}
        <div className={`flex-1 bg-slate-100 dark:bg-slate-950 rounded-xl border-2 transition-all relative overflow-hidden flex flex-col min-h-[400px] ${hasChanges ? 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.1)]' : 'border-dashed border-slate-300 dark:border-slate-800'}`}>
          {!floorPlan ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12">
              <p className="text-sm text-slate-500 mb-6 font-medium text-center">등록된 도면이 없습니다. 새로운 공장 도면을 업로드하세요.</p>
              <label className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-8 py-3 rounded-lg cursor-pointer transition-all shadow-xl shadow-blue-500/20 active:scale-95">
                도면 업로드 (PDF/IMAGE)
                <input type="file" className="hidden" accept=".pdf,image/*" onChange={handleUpload} disabled={uploading} />
              </label>
            </div>
          ) : (
            <>
              <div
                ref={mapRef}
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}
                className="flex-1 overflow-auto p-4 flex justify-center items-center bg-slate-200/40 dark:bg-slate-950/40"
              >
                <div ref={innerMapRef} className="relative bg-white shadow-2xl">
                  {isImage ? (
                    <img
                      src={`/api/floor-plan/file?id=${floorPlan.id}`}
                      alt={floorPlan.name}
                      style={{ width: '1600px', height: 'auto' }}
                      className="block"
                    />
                  ) : (
                    <Document
                      file={`/api/floor-plan/file?id=${floorPlan.id}`}
                      onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                    >
                      <Page
                        pageNumber={pageNumber}
                        width={1600}
                        renderAnnotationLayer={false}
                        renderTextLayer={false}
                      />
                    </Document>
                  )}

                  {/* 배치된 핀 레이어 */}
                  {localPins.filter(p => isImage ? true : p.page === pageNumber).map(pin => (
                    <div
                      key={pin.id}
                      draggable
                      onDragStart={() => setDraggingMotorId(pin.motor_id)}
                      className="absolute z-20 group cursor-move"
                      style={{ left: `${pin.x_pct}%`, top: `${pin.y_pct}%`, transform: 'translate(-50%, -100%)' }}
                    >
                      <button 
                        onClick={(e) => { e.stopPropagation(); removePin(pin.motor_id); }}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-30 shadow-lg hover:bg-red-600 scale-75 group-hover:scale-100"
                      >
                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"/></svg>
                      </button>
                      <div className="w-3.5 h-3.5 bg-white border-2 border-blue-500 rounded-full shadow-xl flex items-center justify-center group-hover:scale-125 transition-transform">
                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                      </div>
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-slate-900/90 backdrop-blur-sm text-white px-2 py-0.5 rounded text-[8px] font-black whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        {pin.motor_name}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 하단 컨트롤 바 */}
              <div className="px-4 py-2.5 bg-white/95 dark:bg-slate-900/95 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest truncate max-w-[120px]">{floorPlan.name}</span>
                  {!isImage && (
                    <div className="flex items-center gap-1.5 ml-2 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">
                      <button onClick={() => setPageNumber(p => Math.max(1, p - 1))} className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2" d="M15 19l-7-7 7-7"/></svg></button>
                      <span className="text-[9px] font-mono font-bold text-slate-600 dark:text-slate-400 min-w-[30px] text-center">{pageNumber} / {numPages || floorPlan.page_count}</span>
                      <button onClick={() => setPageNumber(p => Math.min(numPages || floorPlan.page_count, p + 1))} className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2" d="M9 5l7 7-7 7"/></svg></button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={resetPositions}
                    disabled={!hasChanges || uploading}
                    className="text-[10px] font-bold px-3 py-1.5 text-slate-400 hover:text-slate-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    초기화
                  </button>
                  <button
                    onClick={savePositions}
                    disabled={!hasChanges || uploading}
                    className={`text-[10px] font-black px-4 py-1.5 rounded-lg transition-all active:scale-95 shadow-lg border border-transparent
                      ${hasChanges 
                        ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-blue-500/20' 
                        : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}
                  >
                    {uploading ? '처리 중...' : '위치 저장'}
                  </button>
                  <div className="w-[1px] h-4 bg-slate-200 dark:bg-slate-800 mx-1" />
                  <button
                    onClick={deleteMap}
                    className="text-[10px] text-red-500/60 hover:text-red-500 hover:underline transition-colors font-medium px-2"
                  >
                    도면 삭제
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
