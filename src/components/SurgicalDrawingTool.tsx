import React, { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react'
import {
  MousePointer2, Pencil, Highlighter, Minus, MoveUpRight, Square, Circle as CircleIcon,
  Type, Eraser, Stamp as StampIcon, X, CircleDot, Hash, Spline, Check,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { SPECIALTIES, DEFAULT_SPECIALTY, toDataUri, type TemplateSet } from './drawing/templates'

// Anatomical templates live in ./drawing/templates/<specialty>.ts —
// each specialty pack is a lazy-loaded chunk so the canvas bundle stays flat.

// ── Types ────────────────────────────────────────────────────────────────────────────────────────────

type Tool = 'select' | 'draw' | 'marker' | 'line' | 'arrow' | 'rect' | 'circle' | 'text' | 'eraser'

interface Stamp { label: string; icon: React.ReactNode; action: (canvas: any, x: number, y: number, color: string) => void }

interface Props {
  encounterId: string
  patientId: string
  orgId: string
  specialty?: string
  procedureType?: string
  onSave?: (drawingId: string) => void
}

// ── Surgical annotation stamps ─────────────────────────────────────────────────────────────────────

function makeStamps(fabric: any): Stamp[] {
  return [
    {
      label: 'Incision', icon: <Minus size={15} />,
      action: (c, x, y, color) => {
        const line = new fabric.Line([x - 40, y, x + 40, y], { stroke: color, strokeWidth: 2, strokeDashArray: [6, 3], selectable: true })
        c.add(line)
      },
    },
    {
      label: 'X Mark', icon: <X size={15} />,
      action: (c, x, y, color) => {
        const g = new fabric.Group([
          new fabric.Line([x - 12, y - 12, x + 12, y + 12], { stroke: color, strokeWidth: 2.5 }),
          new fabric.Line([x + 12, y - 12, x - 12, y + 12], { stroke: color, strokeWidth: 2.5 }),
        ], { selectable: true })
        c.add(g)
      },
    },
    {
      label: 'Dot / NAV', icon: <CircleDot size={15} />,
      action: (c, x, y, color) => {
        const circle = new fabric.Circle({ left: x - 6, top: y - 6, radius: 6, fill: color, selectable: true })
        c.add(circle)
      },
    },
    {
      label: 'Hatch Zone', icon: <Hash size={15} />,
      action: (c, x, y, color) => {
        const lines = []
        for (let i = -3; i <= 3; i++) {
          lines.push(new fabric.Line([x - 28 + i * 8, y - 24, x - 28 + i * 8 + 24, y + 24], { stroke: color, strokeWidth: 1.5, opacity: 0.7 }))
        }
        const g = new fabric.Group(lines, { selectable: true })
        c.add(g)
      },
    },
    {
      label: 'IMF Line', icon: <Spline size={15} />,
      action: (c, x, y, color) => {
        const path = new fabric.Path(`M ${x - 50},${y} Q ${x},${y + 20} ${x + 50},${y}`, {
          stroke: color, strokeWidth: 2, fill: 'transparent', strokeDashArray: [5, 3], selectable: true,
        })
        c.add(path)
      },
    },
    {
      label: 'Circle Zone', icon: <CircleIcon size={15} />,
      action: (c, x, y, color) => {
        const circle = new fabric.Circle({ left: x - 30, top: y - 30, radius: 30, fill: 'transparent', stroke: color, strokeWidth: 2, strokeDashArray: [4, 3], selectable: true })
        c.add(circle)
      },
    },
  ]
}

// ── Component ─────────────────────────────────────────────────────────────────────────────────────

export default function SurgicalDrawingTool({ encounterId, patientId, orgId, specialty = DEFAULT_SPECIALTY, procedureType = 'abdomen', onSave }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const fabricRef = useRef<any>(null)
  const arrowStartRef = useRef<{ x: number; y: number } | null>(null)
  const penActiveRef = useRef(false)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveDrawingRef = useRef<(() => void) | null>(null)

  const [fabricLoaded, setFabricLoaded] = useState(false)
  const [templates, setTemplates] = useState<TemplateSet | null>(null)
  const [activeTool, setActiveTool] = useState<Tool>('draw')
  const [activeColor, setActiveColor] = useState('#e74c3c')
  const [brushSize, setBrushSize] = useState(4)
  const [activeTemplate, setActiveTemplate] = useState<string>(procedureType)
  const [activeView, setActiveView] = useState(0)

  // Load the specialty template pack (lazy chunk)
  useEffect(() => {
    let alive = true
    const pack = SPECIALTIES[specialty] ?? SPECIALTIES[DEFAULT_SPECIALTY]
    pack.load().then(t => {
      if (!alive) return
      setTemplates(t)
      setActiveTemplate(prev => (prev in t ? prev : Object.keys(t)[0]))
      setActiveView(0)
    })
    return () => { alive = false }
  }, [specialty])
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [canvasSize, setCanvasSize] = useState({ width: 700, height: 540 })
  const [showStamps, setShowStamps] = useState(false)
  const [isTouch, setIsTouch] = useState(false)
  const [loadingDrawing, setLoadingDrawing] = useState(false)
  const [photos, setPhotos] = useState<{ photo_id: string; photo_url: string; photo_type: string; view_label: string | null; storage_path: string }[]>([])
  const [showPhotoPanel, setShowPhotoPanel] = useState(false)
  const [activePhotoUrl, setActivePhotoUrl] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const photoFileInputRef = useRef<HTMLInputElement>(null)

  const colors = [
    '#1a1a1a', '#e74c3c', '#e67e22', '#f1c40f',
    '#2ecc71', '#3498db', '#9b59b6', '#1abc9c',
    '#0044CC', '#CC0000', '#00AA44', '#8B15CC',
    '#ffffff',
  ]

  useEffect(() => {
    setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0)
  }, [])

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = (w: number) => {
      const ar = templates?.[activeTemplate]?.views[activeView]?.aspectRatio ?? (260 / 500)
      const cw = Math.min(Math.max(w - 32, 320), 1200)
      const ch = Math.round(cw / ar)
      setCanvasSize({ width: cw, height: Math.min(ch, window.innerHeight - 220) })
    }
    const ro = new ResizeObserver(entries => update(entries[0].contentRect.width))
    ro.observe(el)
    update(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [templates, activeTemplate, activeView])

  useEffect(() => {
    if ((window as any).fabric) { setFabricLoaded(true); return }
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.1/fabric.min.js'
    script.onload = () => setFabricLoaded(true)
    document.head.appendChild(script)
  }, [])

  useEffect(() => {
    if (!fabricLoaded || !canvasRef.current || !templates) return
    const fabric = (window as any).fabric

    const canvas = new fabric.Canvas(canvasRef.current, {
      isDrawingMode: true,
      width: canvasSize.width,
      height: canvasSize.height,
      backgroundColor: '#ffffff',
      enableRetinaScaling: true,
      allowTouchScrolling: false,
    })

    canvas.freeDrawingBrush.color = activeColor
    canvas.freeDrawingBrush.width = brushSize
    canvas.freeDrawingBrush.decimate = 2

    canvas.on('object:added', () => pushHistory(canvas))
    canvas.on('object:modified', () => pushHistory(canvas))
    canvas.on('object:removed', () => pushHistory(canvas))

    canvas.on('path:created', () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = setTimeout(() => {
        setSaveStatus('idle')
        saveDrawingRef.current?.()
      }, 2000)
    })

    fabricRef.current = canvas
    loadTemplate(canvas, activeTemplate, activeView, canvasSize)

    const templateKey = `${activeTemplate}:${templates[activeTemplate]?.views[activeView]?.name ?? activeView}`
    setLoadingDrawing(true)
    supabase.schema('cr').from('surgical_drawings')
      .select('drawing_json')
      .eq('encounter_id', encounterId)
      .eq('template_key', templateKey)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.drawing_json) {
          canvas.loadFromJSON(data.drawing_json, () => {
            canvas.renderAll()
            loadTemplate(canvas, activeTemplate, activeView, canvasSize)
          })
        }
        setLoadingDrawing(false)
      })
      .catch(() => setLoadingDrawing(false))

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
      canvas.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fabricLoaded, templates])

  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas || !fabricLoaded) return
    canvas.setWidth(canvasSize.width)
    canvas.setHeight(canvasSize.height)
    canvas.renderAll()
  }, [canvasSize, fabricLoaded])

  useEffect(() => {
    const el = canvasRef.current
    if (!el || !isTouch) return
    const handlePointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'pen' && fabricRef.current?.isDrawingMode) {
        const pressure = Math.max(e.pressure, 0.2)
        if (fabricRef.current.freeDrawingBrush) {
          fabricRef.current.freeDrawingBrush.width = brushSize * pressure * 2.5
        }
      }
    }
    el.addEventListener('pointermove', handlePointerMove)
    return () => el.removeEventListener('pointermove', handlePointerMove)
  }, [isTouch, brushSize])

  useEffect(() => {
    const el = canvasRef.current
    if (!el || !isTouch) return
    const prevent = (e: TouchEvent) => { if (fabricRef.current?.isDrawingMode) e.preventDefault() }
    el.addEventListener('touchmove', prevent, { passive: false })
    return () => el.removeEventListener('touchmove', prevent)
  }, [isTouch])

  useEffect(() => {
    const el = canvasRef.current
    if (!el || !isTouch) return

    const onPenDown = (e: PointerEvent) => {
      if (e.pointerType === 'pen') penActiveRef.current = true
    }
    const onPenUp = (e: PointerEvent) => {
      if (e.pointerType === 'pen') {
        setTimeout(() => { penActiveRef.current = false }, 120)
      }
    }
    const blockPalmTouch = (e: PointerEvent) => {
      if (e.pointerType === 'touch' && penActiveRef.current) e.stopImmediatePropagation()
    }

    el.addEventListener('pointerdown', onPenDown, { capture: true })
    el.addEventListener('pointerup', onPenUp, { capture: true })
    el.addEventListener('pointercancel', onPenUp, { capture: true })
    el.addEventListener('pointerdown', blockPalmTouch, { capture: true })
    el.addEventListener('pointermove', blockPalmTouch, { capture: true })

    return () => {
      el.removeEventListener('pointerdown', onPenDown, { capture: true })
      el.removeEventListener('pointerup', onPenUp, { capture: true })
      el.removeEventListener('pointercancel', onPenUp, { capture: true })
      el.removeEventListener('pointerdown', blockPalmTouch, { capture: true })
      el.removeEventListener('pointermove', blockPalmTouch, { capture: true })
    }
  }, [isTouch])

  const loadTemplate = useCallback((canvas: any, templateKey: string, viewIndex: number, size: { width: number; height: number }) => {
    if (!canvas) return
    const fabric = (window as any).fabric
    const template = templates?.[templateKey]
    if (!template) return
    const view = template.views[viewIndex]
    if (!view) return

    const uri = toDataUri(view.svg)
    canvas.setBackgroundImage(null, () => {})

    fabric.Image.fromURL(uri, (img: any) => {
      if (!img) return
      const scale = Math.min(size.width / (img.width || size.width), size.height / (img.height || size.height)) * 0.88
      img.set({
        scaleX: scale,
        scaleY: scale,
        left: (size.width - (img.width || 0) * scale) / 2,
        top: (size.height - (img.height || 0) * scale) / 2,
        selectable: false,
        evented: false,
        opacity: 1,
      })
      canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas))
    }, { crossOrigin: 'anonymous' })
  }, [templates])

  const loadPhotos = useCallback(async () => {
    const { data } = await supabase.schema('cr').from('patient_photos')
      .select('photo_id,photo_url,photo_type,view_label,storage_path')
      .eq('encounter_id', encounterId)
      .eq('is_active', true)
      .order('captured_at', { ascending: false })
    setPhotos(data ?? [])
  }, [encounterId])

  useEffect(() => { loadPhotos() }, [loadPhotos])

  const uploadAndUsePhoto = useCallback(async (file: File) => {
    setUploadingPhoto(true)
    try {
      const blob = await new Promise<Blob>(resolve => {
        const img = new window.Image()
        img.onload = () => {
          const scale = Math.min(1, 1600 / img.width)
          const c = document.createElement('canvas')
          c.width = Math.round(img.width * scale)
          c.height = Math.round(img.height * scale)
          const ctx = c.getContext('2d')!
          ctx.drawImage(img, 0, 0, c.width, c.height)
          c.toBlob(b => resolve(b!), 'image/jpeg', 0.88)
          URL.revokeObjectURL(img.src)
        }
        img.src = URL.createObjectURL(file)
      })
      const ts   = Date.now()
      const path = `${orgId}/patients/${encounterId}/${ts}_drawing_background.jpg`
      const { error: se } = await supabase.storage.from('revela-assets').upload(path, blob, { contentType: 'image/jpeg', upsert: false })
      if (se) throw se
      const { data: ud } = supabase.storage.from('revela-assets').getPublicUrl(path)
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.schema('cr').from('patient_photos').insert({
        org_id: orgId, encounter_id: encounterId, storage_path: path,
        photo_url: ud.publicUrl, photo_type: 'drawing_background',
        file_size_bytes: blob.size, mime_type: 'image/jpeg',
        captured_by: user?.id ?? null,
      })
      setActivePhotoUrl(ud.publicUrl)
      await loadPhotos()
    } catch {
      // silently ignore
    } finally {
      setUploadingPhoto(false)
    }
  }, [orgId, encounterId, loadPhotos])

  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas || !fabricLoaded) return
    if (!activePhotoUrl) {
      loadTemplate(canvas, activeTemplate, activeView, canvasSize)
      return
    }
    const fabric = (window as any).fabric
    fabric.Image.fromURL(activePhotoUrl, (img: any) => {
      if (!img) return
      const scaleX = canvasSize.width  / (img.width  || canvasSize.width)
      const scaleY = canvasSize.height / (img.height || canvasSize.height)
      const scale  = Math.max(scaleX, scaleY)
      img.set({
        scaleX: scale, scaleY: scale,
        left: (canvasSize.width  - (img.width  || 0) * scale) / 2,
        top:  (canvasSize.height - (img.height || 0) * scale) / 2,
        selectable: false, evented: false,
      })
      canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas))
    }, { crossOrigin: 'anonymous' })
  }, [activePhotoUrl, fabricLoaded, canvasSize])

  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas || !fabricLoaded) return
    canvas.clear()
    canvas.backgroundColor = '#ffffff'
    if (!activePhotoUrl) {
      loadTemplate(canvas, activeTemplate, activeView, canvasSize)
    }
    setHistory([])
    setHistoryIndex(-1)
  }, [activeTemplate, activeView, fabricLoaded, loadTemplate, canvasSize])

  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    const fabric = (window as any).fabric
    canvas.isDrawingMode = false
    canvas.selection = false
    canvas.off('mouse:down')

    switch (activeTool) {
      case 'draw':
        canvas.isDrawingMode = true
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas)
        canvas.freeDrawingBrush.color = activeColor
        canvas.freeDrawingBrush.width = brushSize
        canvas.freeDrawingBrush.decimate = 2
        break
      case 'marker':
        canvas.isDrawingMode = true
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas)
        canvas.freeDrawingBrush.color = activeColor + '70'
        canvas.freeDrawingBrush.width = brushSize * 5
        canvas.freeDrawingBrush.decimate = 4
        break
      case 'eraser':
        canvas.isDrawingMode = true
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas)
        canvas.freeDrawingBrush.color = '#ffffff'
        canvas.freeDrawingBrush.width = brushSize * 6
        canvas.freeDrawingBrush.decimate = 4
        break
      case 'select':
        canvas.selection = true
        break
      case 'text':
        canvas.on('mouse:down', handleTextAdd)
        break
      case 'rect':
        canvas.on('mouse:down', handleRectAdd)
        break
      case 'circle':
        canvas.on('mouse:down', handleCircleAdd)
        break
      case 'line':
        canvas.on('mouse:down', handleLineAdd)
        break
      case 'arrow':
        canvas.on('mouse:down', handleArrowStart)
        canvas.on('mouse:up', handleArrowEnd)
        break
    }
    return () => {
      if (canvas) {
        canvas.off('mouse:down')
        canvas.off('mouse:up')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, activeColor, brushSize])

  const handleTextAdd = useCallback((opt: any) => {
    const fabric = (window as any).fabric
    const canvas = fabricRef.current
    const pointer = canvas.getPointer(opt.e)
    const text = new fabric.IText('Label', {
      left: pointer.x, top: pointer.y,
      fontSize: isTouch ? 18 : 14, fill: activeColor,
      fontFamily: 'Arial, sans-serif', fontWeight: 'bold', editable: true,
    })
    canvas.add(text)
    canvas.setActiveObject(text)
    text.enterEditing()
    canvas.off('mouse:down', handleTextAdd)
    setActiveTool('select')
  }, [activeColor, isTouch])

  const handleRectAdd = useCallback((opt: any) => {
    const fabric = (window as any).fabric
    const canvas = fabricRef.current
    const pointer = canvas.getPointer(opt.e)
    canvas.add(new fabric.Rect({ left: pointer.x - 40, top: pointer.y - 25, width: 80, height: 50, fill: 'transparent', stroke: activeColor, strokeWidth: 2, rx: 4 }))
    canvas.off('mouse:down', handleRectAdd)
    setActiveTool('select')
  }, [activeColor])

  const handleCircleAdd = useCallback((opt: any) => {
    const fabric = (window as any).fabric
    const canvas = fabricRef.current
    const pointer = canvas.getPointer(opt.e)
    canvas.add(new fabric.Circle({ left: pointer.x - 30, top: pointer.y - 30, radius: 30, fill: 'transparent', stroke: activeColor, strokeWidth: 2 }))
    canvas.off('mouse:down', handleCircleAdd)
    setActiveTool('select')
  }, [activeColor])

  const handleLineAdd = useCallback((opt: any) => {
    const fabric = (window as any).fabric
    const canvas = fabricRef.current
    const pointer = canvas.getPointer(opt.e)
    canvas.add(new fabric.Line([pointer.x - 40, pointer.y, pointer.x + 40, pointer.y], { stroke: activeColor, strokeWidth: 2 }))
    canvas.off('mouse:down', handleLineAdd)
    setActiveTool('select')
  }, [activeColor])

  const handleArrowStart = useCallback((opt: any) => {
    const canvas = fabricRef.current
    const pointer = canvas.getPointer(opt.e)
    arrowStartRef.current = { x: pointer.x, y: pointer.y }
  }, [])

  const handleArrowEnd = useCallback((opt: any) => {
    const fabric = (window as any).fabric
    const canvas = fabricRef.current
    const start = arrowStartRef.current
    if (!start) return
    const pointer = canvas.getPointer(opt.e)
    const dx = pointer.x - start.x
    const dy = pointer.y - start.y
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len < 10) { arrowStartRef.current = null; return }
    const angle = Math.atan2(dy, dx) * 180 / Math.PI
    const headLen = Math.min(20, len * 0.35)
    const line = new fabric.Line([start.x, start.y, pointer.x, pointer.y], { stroke: activeColor, strokeWidth: 2.5 })
    const head = new fabric.Triangle({ width: headLen, height: headLen * 1.2, fill: activeColor, left: pointer.x, top: pointer.y, angle: angle + 90, originX: 'center', originY: 'center' })
    canvas.add(new fabric.Group([line, head], { selectable: true }))
    arrowStartRef.current = null
    setActiveTool('select')
  }, [activeColor])

  const applyStamp = useCallback((stamp: Stamp) => {
    const fabric = (window as any).fabric
    const canvas = fabricRef.current
    if (!canvas || !fabric) return
    const cx = canvas.width / 2
    const cy = canvas.height / 2
    stamp.action(canvas, cx, cy, activeColor)
    setShowStamps(false)
    setActiveTool('select')
  }, [activeColor])

  const pushHistory = (canvas: any) => {
    const json = JSON.stringify(canvas.toJSON())
    setHistory(prev => {
      const next = [...prev.slice(0, historyIndex + 1), json]
      setHistoryIndex(next.length - 1)
      return next
    })
  }

  const undo = () => {
    const canvas = fabricRef.current
    if (!canvas || historyIndex <= 0) return
    const ni = historyIndex - 1
    canvas.loadFromJSON(history[ni], canvas.renderAll.bind(canvas))
    setHistoryIndex(ni)
  }

  const redo = () => {
    const canvas = fabricRef.current
    if (!canvas || historyIndex >= history.length - 1) return
    const ni = historyIndex + 1
    canvas.loadFromJSON(history[ni], canvas.renderAll.bind(canvas))
    setHistoryIndex(ni)
  }

  const clearDrawing = () => {
    const canvas = fabricRef.current
    if (!canvas) return
    canvas.getObjects().forEach((obj: any) => canvas.remove(obj))
    canvas.renderAll()
  }

  const saveDrawing = useCallback(async () => {
    const canvas = fabricRef.current
    if (!canvas) return
    setSaving(true)
    setSaveStatus('idle')
    try {
      const svgData = canvas.toSVG()
      const jsonData = JSON.stringify(canvas.toJSON())
      const templateInfo = `${activeTemplate}:${templates?.[activeTemplate]?.views[activeView]?.name ?? activeView}`
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .schema('cr').from('surgical_drawings')
        .upsert(
          {
            encounter_id: encounterId,
            org_id: orgId,
            template_key: templateInfo,
            drawing_svg: svgData,
            drawing_json: jsonData,
            created_by: user?.id ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'encounter_id,template_key' },
        )
        .select('id').single()
      if (error) throw error
      setSaveStatus('saved')
      onSave?.(data.id)
      setTimeout(() => setSaveStatus('idle'), 3000)
    } catch { setSaveStatus('error') } finally { setSaving(false) }
  }, [templates, activeTemplate, activeView, encounterId, orgId, onSave])

  useEffect(() => { saveDrawingRef.current = saveDrawing }, [saveDrawing])

  const exportPng = () => {
    const canvas = fabricRef.current
    if (!canvas) return
    const a = document.createElement('a')
    a.href = canvas.toDataURL({ format: 'png', multiplier: 2 })
    a.download = `drawing-${encounterId}-${activeTemplate}.png`
    a.click()
  }

  const template = templates?.[activeTemplate]
  const btnH = isTouch ? 48 : 36
  const fontSize = isTouch ? 14 : 12
  const toolIconSize = isTouch ? 19 : 16

  const tools: { id: Tool; icon: React.ReactNode; label: string }[] = [
    { id: 'select', icon: <MousePointer2 size={toolIconSize} />, label: 'Select' },
    { id: 'draw', icon: <Pencil size={toolIconSize} />, label: 'Draw' },
    { id: 'marker', icon: <Highlighter size={toolIconSize} />, label: 'Marker' },
    { id: 'line', icon: <Minus size={toolIconSize} />, label: 'Line' },
    { id: 'arrow', icon: <MoveUpRight size={toolIconSize} />, label: 'Arrow' },
    { id: 'rect', icon: <Square size={toolIconSize} />, label: 'Rect' },
    { id: 'circle', icon: <CircleIcon size={toolIconSize} />, label: 'Circle' },
    { id: 'text', icon: <Type size={toolIconSize} />, label: 'Text' },
    { id: 'eraser', icon: <Eraser size={toolIconSize} />, label: 'Erase' },
  ]

  return (
    <div style={{ fontFamily: 'var(--font-sans, system-ui, sans-serif)', background: '#060e1c', borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(201,169,110,0.2)', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ background: '#0a1628', padding: `10px ${isTouch ? 16 : 14}px`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(201,169,110,0.15)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <polygon points="9,1 17,9 9,17 1,9" fill="none" stroke="#c9a96e" strokeWidth="1.2"/>
            <polygon points="9,5 13,9 9,13 5,9" fill="#c9a96e" opacity="0.4"/>
          </svg>
          <span style={{ color: '#c9a96e', fontSize: 14, fontWeight: 600, letterSpacing: '0.3px' }}>Surgical Drawing</span>
          {isTouch && <span style={{ fontSize: 10, color: 'rgba(201,169,110,0.5)', marginLeft: 4 }}>Apple Pencil ready</span>}
          {activePhotoUrl && <span style={{ fontSize: 10, background: 'rgba(201,169,110,0.15)', color: '#c9a96e', border: '1px solid rgba(201,169,110,0.35)', borderRadius: 6, padding: '2px 8px', fontWeight: 700 }}>Photo Mode</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={exportPng} style={btn('ghost', false, btnH, fontSize)}>Export PNG</button>
          <button onClick={saveDrawing} disabled={saving} style={{ ...btn('gold', saving, btnH, fontSize), display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            {saving ? 'Saving...' : saveStatus === 'saved' ? <><Check size={14} /> Saved</> : saveStatus === 'error' ? <><X size={14} /> Error</> : 'Save'}
          </button>
        </div>
      </div>

      {/* Template tabs */}
      <div style={{ background: '#0a1628', borderBottom: '1px solid rgba(255,255,255,0.06)', overflowX: 'auto', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 2, padding: `8px ${isTouch ? 12 : 10}px`, minWidth: 'max-content' }}>
          {Object.entries(templates ?? {}).map(([key, tmpl]) => (
            <button key={key}
              onClick={() => { setActiveTemplate(key); setActiveView(0) }}
              style={{ padding: `${isTouch ? '10px 16px' : '7px 12px'}`, borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: isTouch ? 14 : 12, fontWeight: 600, whiteSpace: 'nowrap',
                background: activeTemplate === key ? 'rgba(201,169,110,0.2)' : 'rgba(255,255,255,0.04)',
                color: activeTemplate === key ? '#c9a96e' : 'rgba(255,255,255,0.5)',
                outline: activeTemplate === key ? '1px solid rgba(201,169,110,0.4)' : 'none',
              }}>
              {tmpl.label}
            </button>
          ))}
        </div>
        {template && template.views.length > 1 && (
          <div style={{ display: 'flex', gap: 2, padding: `0 ${isTouch ? 12 : 10}px 8px`, minWidth: 'max-content' }}>
            {template.views.map((v, i) => (
              <button key={i} onClick={() => setActiveView(i)}
                style={{ padding: `${isTouch ? '8px 14px' : '5px 10px'}`, borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: isTouch ? 13 : 11, fontWeight: 500,
                  background: activeView === i ? 'rgba(0,212,255,0.15)' : 'transparent',
                  color: activeView === i ? '#00d4ff' : 'rgba(255,255,255,0.4)',
                }}>
                {v.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div style={{ background: '#0d1f3c', padding: `${isTouch ? 10 : 8}px ${isTouch ? 12 : 10}px`, display: 'flex', alignItems: 'center', gap: isTouch ? 8 : 6, flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>

        {/* Tool buttons */}
        <div style={{ display: 'flex', gap: isTouch ? 6 : 4, flexWrap: 'wrap' }}>
          {tools.map(t => (
            <button key={t.id} title={t.label} onClick={() => { setActiveTool(t.id); setShowStamps(false) }}
              style={{ width: btnH, height: btnH, borderRadius: 8, border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: activeTool === t.id ? '#c9a96e' : 'rgba(255,255,255,0.07)',
                color: activeTool === t.id ? '#060e1c' : 'rgba(255,255,255,0.65)',
                boxShadow: activeTool === t.id ? '0 2px 8px rgba(201,169,110,0.4)' : 'none',
                transition: 'all 0.12s',
              }}>
              {t.icon}
            </button>
          ))}
          {/* Stamp button */}
          <div style={{ position: 'relative' }}>
            <button title="Stamps" onClick={() => setShowStamps(s => !s)}
              style={{ width: btnH, height: btnH, borderRadius: 8, border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: showStamps ? '#c9a96e' : 'rgba(255,255,255,0.07)',
                color: showStamps ? '#060e1c' : 'rgba(255,255,255,0.65)',
              }}>
              <StampIcon size={toolIconSize} />
            </button>
            {showStamps && fabricLoaded && (
              <div style={{ position: 'absolute', top: btnH + 6, left: 0, background: '#0d1f3c', border: '1px solid rgba(201,169,110,0.3)', borderRadius: 10, padding: 8, zIndex: 100, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                {makeStamps((window as any).fabric).map(stamp => (
                  <button key={stamp.label} onClick={() => applyStamp(stamp)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: `${isTouch ? 10 : 7}px 12px`, borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: isTouch ? 14 : 12,
                      background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.8)', textAlign: 'left',
                    }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', color: activeColor }}>{stamp.icon}</span> {stamp.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Photo background button */}
          <div style={{ position: 'relative' }}>
            <button
              title={activePhotoUrl ? 'Clear photo background' : 'Add photo background'}
              onClick={() => { setShowPhotoPanel(s => !s) }}
              style={{ width: btnH, height: btnH, borderRadius: 8, border: activePhotoUrl ? '1.5px solid rgba(201,169,110,0.6)' : 'none', cursor: 'pointer', fontSize: isTouch ? 15 : 13,
                background: showPhotoPanel ? '#c9a96e' : activePhotoUrl ? 'rgba(201,169,110,0.2)' : 'rgba(255,255,255,0.07)',
                color: showPhotoPanel ? '#060e1c' : activePhotoUrl ? '#c9a96e' : 'rgba(255,255,255,0.65)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, minWidth: isTouch ? 52 : 44,
              }}
            >
              {activePhotoUrl ? 'Photo ON' : 'Photo'}
            </button>
            {showPhotoPanel && (
              <div style={{ position: 'absolute', top: btnH + 8, left: 0, background: '#0a1628', border: '1px solid rgba(201,169,110,0.3)', borderRadius: 12, padding: 14, zIndex: 200, width: 280, boxShadow: '0 12px 40px rgba(0,0,0,0.7)' }}>
                <div style={{ color: '#c9a96e', fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Photo Background</div>
                <input ref={photoFileInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setShowPhotoPanel(false); uploadAndUsePhoto(f) } }}
                />
                <button
                  onClick={() => photoFileInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px dashed rgba(201,169,110,0.4)', background: 'transparent', color: '#c9a96e', fontSize: 12, cursor: 'pointer', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: uploadingPhoto ? 0.6 : 1 }}
                >
                  {uploadingPhoto ? 'Uploading...' : 'Camera / Upload New'}
                </button>
                {photos.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                    {photos.map(p => (
                      <div key={p.photo_id}
                        onClick={() => { setActivePhotoUrl(activePhotoUrl === p.photo_url ? null : p.photo_url); setShowPhotoPanel(false) }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, cursor: 'pointer',
                          background: activePhotoUrl === p.photo_url ? 'rgba(201,169,110,0.15)' : 'rgba(255,255,255,0.04)',
                          border: activePhotoUrl === p.photo_url ? '1px solid rgba(201,169,110,0.4)' : '1px solid transparent',
                        }}
                      >
                        <img src={p.photo_url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 5, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: '#fff', fontSize: 11, fontWeight: 600, textTransform: 'capitalize' }}>{p.photo_type.replace('_', ' ')}</div>
                          {p.view_label && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>{p.view_label}</div>}
                        </div>
                        {activePhotoUrl === p.photo_url && <Check size={14} style={{ color: '#c9a96e', flexShrink: 0 }} />}
                      </div>
                    ))}
                  </div>
                )}
                {photos.length === 0 && !uploadingPhoto && (
                  <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, margin: 0 }}>No photos yet. Tap Camera above to add one.</p>
                )}
                {activePhotoUrl && (
                  <button
                    onClick={() => { setActivePhotoUrl(null); setShowPhotoPanel(false) }}
                    style={{ width: '100%', marginTop: 10, padding: '7px 12px', borderRadius: 8, border: 'none', background: 'rgba(239,68,68,0.15)', color: '#f87171', fontSize: 12, cursor: 'pointer' }}
                  >
                    Clear Photo Background
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }}/>

        {/* Color palette */}
        <div style={{ display: 'flex', gap: isTouch ? 6 : 4, flexWrap: 'wrap' }}>
          {colors.map(c => (
            <button key={c} onClick={() => setActiveColor(c)}
              style={{ width: isTouch ? 32 : 24, height: isTouch ? 32 : 24, borderRadius: '50%', border: activeColor === c ? '3px solid #c9a96e' : '2px solid transparent',
                background: c, cursor: 'pointer', padding: 0, flexShrink: 0,
                boxShadow: c === '#ffffff' ? 'inset 0 0 0 1px rgba(255,255,255,0.15)' : activeColor === c ? '0 0 8px rgba(201,169,110,0.6)' : 'none',
                transition: 'border 0.1s, box-shadow 0.1s',
              }}/>
          ))}
        </div>

        <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }}/>

        {/* Brush size */}
        {isTouch ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Size</span>
            {[2, 4, 8, 14].map(s => (
              <button key={s} onClick={() => setBrushSize(s)}
                style={{ width: 40, height: 40, borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                  background: brushSize === s ? 'rgba(201,169,110,0.2)' : 'rgba(255,255,255,0.06)',
                  color: brushSize === s ? '#c9a96e' : 'rgba(255,255,255,0.5)',
                }}>
                {s === 2 ? 'S' : s === 4 ? 'M' : s === 8 ? 'L' : 'XL'}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Size</span>
            <input type="range" min={1} max={20} value={brushSize} onChange={e => setBrushSize(Number(e.target.value))}
              style={{ width: 80, accentColor: '#c9a96e' }}/>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', width: 20 }}>{brushSize}</span>
          </div>
        )}

        <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }}/>

        {/* Undo / Redo / Clear */}
        <div style={{ display: 'flex', gap: isTouch ? 6 : 4 }}>
          <button onClick={undo} disabled={historyIndex <= 0} style={btn('ghost', historyIndex <= 0, btnH, fontSize)}>Undo</button>
          <button onClick={redo} disabled={historyIndex >= history.length - 1} style={btn('ghost', historyIndex >= history.length - 1, btnH, fontSize)}>Redo</button>
          <button onClick={clearDrawing} style={btn('ghost', false, btnH, fontSize)}>Clear</button>
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} style={{ background: '#f0f2f5', flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: 16, overflowY: 'auto', touchAction: 'pan-y' }}>
        {loadingDrawing && (
          <div style={{ position: 'absolute', color: 'rgba(201,169,110,0.7)', fontSize: 13, pointerEvents: 'none' }}>Loading...</div>
        )}
        <canvas ref={canvasRef} style={{ borderRadius: 10, boxShadow: '0 4px 28px rgba(0,0,0,0.35)', touchAction: 'none', cursor: activeTool === 'select' ? 'default' : 'crosshair', display: 'block' }}/>
      </div>

      {/* Footer */}
      <div style={{ background: '#060e1c', padding: '7px 14px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)' }}>
          Anatomical references by{' '}
          <a href="https://smart.servier.com" target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(201,169,110,0.45)', textDecoration: 'none' }}>
            Servier Medical Art
          </a>{' '}CC BY 4.0
        </span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)' }}>
          {encounterId.slice(0, 8)}...
        </span>
      </div>
    </div>
  )
}

// ── Style helper ──────────────────────────────────────────────────────────────────────────────────
function btn(variant: 'gold' | 'ghost', disabled: boolean, h = 36, fs = 12): React.CSSProperties {
  return {
    height: h, minWidth: h, paddingLeft: 12, paddingRight: 12,
    borderRadius: 8, border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: fs, fontWeight: 600, opacity: disabled ? 0.35 : 1,
    transition: 'opacity 0.12s',
    background: variant === 'gold' ? '#c9a96e' : 'rgba(255,255,255,0.07)',
    color: variant === 'gold' ? '#060e1c' : 'rgba(255,255,255,0.65)',
  }
}
