import { useEffect, useRef, useState } from 'react'
import type { Annotation } from '../types.ts'
import { uid } from '../lib/format.ts'
import { useQuest } from '../store.ts'
import { Icon } from './Icons.tsx'

const COLORS = ['#e36a5d', '#e0b072', '#8eb7e8', '#7dcec0', '#f3efe6', '#1a140c']
const WIDTHS = [0.003, 0.006, 0.012]

type Tool = 'arrow' | 'rect' | 'ellipse' | 'pen' | 'text'

export function Annotator() {
  const attachmentId = useQuest((s) => s.annotatorId)
  const attachment = useQuest((s) => s.attachments.find((item) => item.id === attachmentId))
  const saveAnnotations = useQuest((s) => s.saveAnnotations)
  const closeTop = useQuest((s) => s.closeTop)
  const [tool, setTool] = useState<Tool>('arrow')
  const [color, setColor] = useState(COLORS[0])
  const [width, setWidth] = useState(WIDTHS[1])
  const [strokes, setStrokes] = useState<Annotation[]>([])
  const [draft, setDraft] = useState<Annotation | null>(null)
  const [textAt, setTextAt] = useState<{ x: number; y: number; value: string } | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const drawing = useRef(false)

  useEffect(() => {
    if (!attachment) return
    setStrokes(attachment.annotations)
    setDraft(null)
    setTextAt(null)
    const image = new Image()
    image.onload = () => {
      imageRef.current = image
      paint(image, attachment.annotations, null)
    }
    image.src = attachment.originalDataUrl || attachment.dataUrl
  }, [attachment?.id])

  useEffect(() => {
    if (imageRef.current) paint(imageRef.current, strokes, draft)
  }, [strokes, draft])

  if (!attachment || attachment.fileType.startsWith('video/')) return null

  const point = (event: React.PointerEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    }
  }

  const commitText = () => {
    if (!textAt?.value.trim()) {
      setTextAt(null)
      return
    }
    setStrokes((list) => [
      ...list,
      { id: uid('ann'), tool: 'text', color, size: 0.045, x: textAt.x, y: textAt.y, text: textAt.value.trim() },
    ])
    setTextAt(null)
  }

  return (
    <div className="annotator" role="dialog" aria-label="Görsel işaretleme">
      <div className="tool-rail">
        <ToolButton name="arrow" label="Ok" active={tool === 'arrow'} onClick={() => setTool('arrow')} />
        <ToolButton name="circle" label="Daire" active={tool === 'ellipse'} onClick={() => setTool('ellipse')} />
        <ToolButton name="square" label="Kutu" active={tool === 'rect'} onClick={() => setTool('rect')} />
        <ToolButton name="pen" label="Kalem" active={tool === 'pen'} onClick={() => setTool('pen')} />
        <ToolButton name="type" label="Metin" active={tool === 'text'} onClick={() => setTool('text')} />
        <button
          className="tool-btn"
          type="button"
          aria-label="Geri al"
          onClick={() => setStrokes((list) => list.slice(0, -1))}
        >
          <Icon name="undo" />
        </button>
      </div>
      <div className="annot-stage">
        <div className="annot-frame">
        <canvas
          ref={canvasRef}
          onPointerDown={(event) => {
            const at = point(event)
            if (tool === 'text') {
              setTextAt({ ...at, value: '' })
              return
            }
            drawing.current = true
            event.currentTarget.setPointerCapture(event.pointerId)
            if (tool === 'pen') {
              setDraft({ id: 'draft', tool: 'pen', color, width, points: [[at.x, at.y]] })
            } else {
              setDraft({ id: 'draft', tool, color, width, x: at.x, y: at.y, w: 0, h: 0 })
            }
          }}
          onPointerMove={(event) => {
            if (!drawing.current || !draft) return
            const at = point(event)
            if (draft.tool === 'pen') {
              setDraft({ ...draft, points: [...draft.points, [at.x, at.y]] })
            } else if (draft.tool !== 'text') {
              setDraft({ ...draft, w: at.x - draft.x, h: at.y - draft.y })
            }
          }}
          onPointerUp={() => {
            drawing.current = false
            if (!draft) return
            const tooSmall = draft.tool !== 'pen' && draft.tool !== 'text' && Math.abs(draft.w) + Math.abs(draft.h) < 0.01
            const emptyPen = draft.tool === 'pen' && draft.points.length < 2
            if (!tooSmall && !emptyPen) setStrokes((list) => [...list, { ...draft, id: uid('ann') }])
            setDraft(null)
          }}
        />
        {textAt && (
          <form
            className="text-pop"
            style={{ left: `${textAt.x * 100}%`, top: `${textAt.y * 100}%` }}
            onSubmit={(event) => {
              event.preventDefault()
              commitText()
            }}
          >
            <input
              autoFocus
              value={textAt.value}
              placeholder="Not"
              onChange={(event) => setTextAt({ ...textAt, value: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.stopPropagation()
                  setTextAt(null)
                }
              }}
            />
          </form>
        )}
        </div>
      </div>
      <aside className="annot-side">
        <div className="label">Renk</div>
        <div className="colors">
          {COLORS.map((item) => (
            <button
              key={item}
              type="button"
              className={item === color ? 'swatch active' : 'swatch'}
              style={{ background: item }}
              onClick={() => setColor(item)}
              aria-label={item}
            />
          ))}
        </div>
        <div className="label">Kalınlık</div>
        <div className="seg">
          {WIDTHS.map((item, index) => (
            <button key={item} type="button" className={item === width ? 'active' : ''} onClick={() => setWidth(item)}>
              {index + 1}
            </button>
          ))}
        </div>
        <p className="row-meta">Ok, kutu, daire veya serbest çizim. Metin için bir noktaya tıkla.</p>
        <div style={{ marginTop: 'auto' }} className="foot-actions">
          <button className="btn-ghost" type="button" onClick={() => setStrokes([])}>Temizle</button>
          <button className="btn-ghost" type="button" onClick={closeTop}>Vazgeç</button>
          <button
            className="btn-primary"
            type="button"
            onClick={() => {
              const canvas = canvasRef.current
              if (!canvas) return
              saveAnnotations(attachment.id, strokes, canvas.toDataURL('image/jpeg', 0.9))
            }}
          >
            Kaydet
          </button>
        </div>
      </aside>
    </div>
  )
}

function ToolButton({
  name,
  label,
  active,
  onClick,
}: {
  name: 'arrow' | 'circle' | 'square' | 'pen' | 'type'
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button className={active ? 'tool-btn active' : 'tool-btn'} type="button" aria-label={label} onClick={onClick}>
      <Icon name={name} />
    </button>
  )
}

function paint(image: HTMLImageElement, strokes: Annotation[], draft: Annotation | null) {
  const canvas = document.querySelector('.annot-stage canvas')
  if (!(canvas instanceof HTMLCanvasElement)) return
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.drawImage(image, 0, 0)
  for (const stroke of strokes) draw(ctx, stroke, canvas.width, canvas.height)
  if (draft) draw(ctx, draft, canvas.width, canvas.height)
}

function draw(ctx: CanvasRenderingContext2D, stroke: Annotation, w: number, h: number) {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = stroke.color
  ctx.fillStyle = stroke.color
  ctx.lineWidth = (stroke.tool === 'text' ? 0.004 : stroke.width) * w
  if (stroke.tool === 'pen') {
    ctx.beginPath()
    stroke.points.forEach(([x, y], index) => {
      if (index === 0) ctx.moveTo(x * w, y * h)
      else ctx.lineTo(x * w, y * h)
    })
    ctx.stroke()
  } else if (stroke.tool === 'arrow') {
    const x1 = stroke.x * w
    const y1 = stroke.y * h
    const x2 = (stroke.x + stroke.w) * w
    const y2 = (stroke.y + stroke.h) * h
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
    const angle = Math.atan2(y2 - y1, x2 - x1)
    const head = Math.max(14, stroke.width * w * 5)
    ctx.beginPath()
    ctx.moveTo(x2, y2)
    ctx.lineTo(x2 - head * Math.cos(angle - 0.42), y2 - head * Math.sin(angle - 0.42))
    ctx.lineTo(x2 - head * Math.cos(angle + 0.42), y2 - head * Math.sin(angle + 0.42))
    ctx.closePath()
    ctx.fill()
  } else if (stroke.tool === 'rect' || stroke.tool === 'ellipse') {
    const x = (stroke.w < 0 ? stroke.x + stroke.w : stroke.x) * w
    const y = (stroke.h < 0 ? stroke.y + stroke.h : stroke.y) * h
    const rw = Math.abs(stroke.w) * w
    const rh = Math.abs(stroke.h) * h
    ctx.beginPath()
    if (stroke.tool === 'rect') ctx.strokeRect(x, y, rw, rh)
    else {
      ctx.ellipse(x + rw / 2, y + rh / 2, Math.max(rw / 2, 0.5), Math.max(rh / 2, 0.5), 0, 0, Math.PI * 2)
      ctx.stroke()
    }
  } else if (stroke.tool === 'text') {
    ctx.font = `600 ${stroke.size * h}px Outfit, sans-serif`
    ctx.fillText(stroke.text, stroke.x * w, stroke.y * h)
  }
  ctx.restore()
}
