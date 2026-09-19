import {
  Background,
  BackgroundVariant,
  Controls,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
  type NodeTypes,
  ReactFlow,
  useViewport,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { COLUMN_HEIGHT, COLUMN_WIDTH, useColumnStore } from '@entities/column/model'
import { mockPresenceUsers } from '@entities/presence/model'
import { PresenceCursor } from '@entities/presence/ui/PresenceCursor'
import type { Task } from '@entities/task/model'
import { useTaskStore } from '@entities/task/model'
import { TaskCard, type TaskCardData } from '@entities/task/ui/TaskCard'
import { useCallback, useMemo } from 'react'
import styles from './BoardCanvas.module.scss'
import { ZoneNode } from './ZoneNode'

const nodeTypes: NodeTypes = {
  task: TaskCard,
  presence: PresenceCursor,
  zone: ZoneNode,
}

const CANVAS_MARGIN = 420

// The zoom percentage, rendered inside the zoom cluster where a canvas tool
// keeps it.
function ZoomValue() {
  const { zoom } = useViewport()
  return (
    <div className={styles.zoomValue} data-numeric aria-hidden="true">
      {Math.round(zoom * 100)}%
    </div>
  )
}

interface BoardCanvasProps {
  onTaskClick: (task: Task) => void
}

export function BoardCanvas({ onTaskClick }: BoardCanvasProps) {
  const tasks = useTaskStore((s) => s.tasks)
  const moveTask = useTaskStore((s) => s.moveTask)
  const setColumn = useTaskStore((s) => s.setColumn)
  const columns = useColumnStore((s) => s.columns)
  const removeColumn = useColumnStore((s) => s.removeColumn)
  const moveColumnPosition = useColumnStore((s) => s.moveColumnPosition)

  const zoneNodes: Node[] = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const t of tasks) counts[t.columnId] = (counts[t.columnId] ?? 0) + 1
    return columns.map((col) => ({
      id: `zone-${col.id}`,
      type: 'zone',
      position: col.position,
      data: {
        label: col.name,
        color: col.color,
        count: counts[col.id] ?? 0,
        canDelete: columns.length > 1,
        onDelete: () => removeColumn(col.id),
      },
      draggable: true,
      selectable: false,
      zIndex: -1,
      // React Flow keeps a node invisible until it has dimensions. Handing it
      // the size we already know removes the first-paint pop-in.
      initialWidth: COLUMN_WIDTH,
      initialHeight: COLUMN_HEIGHT,
    }))
  }, [columns, tasks, removeColumn])

  const taskNodes: Node[] = useMemo(
    () =>
      tasks.map((task) => ({
        id: task.id,
        type: 'task',
        position: task.position,
        data: task satisfies TaskCardData,
        initialWidth: 250,
        initialHeight: 132,
      })),
    [tasks],
  )

  const presenceNodes: Node[] = useMemo(
    () =>
      mockPresenceUsers.map((p) => ({
        id: p.id,
        type: 'presence',
        position: p.cursor,
        data: p,
        draggable: false,
        selectable: false,
        zIndex: 10,
        initialWidth: 20,
        initialHeight: 22,
      })),
    [],
  )

  const nodes = useMemo(
    () => [...zoneNodes, ...taskNodes, ...presenceNodes],
    [zoneNodes, taskNodes, presenceNodes],
  )

  // The pannable area always keeps a comfortable margin around whatever is on
  // the board right now — it grows as content spreads out and shrinks back
  // once tasks/columns are removed, instead of being either infinite or fixed.
  const translateExtent = useMemo((): [[number, number], [number, number]] => {
    const points = [
      ...columns.map((c) => c.position),
      ...tasks.map((t) => t.position),
      { x: 0, y: 0 },
    ]
    const minX = Math.min(...points.map((p) => p.x))
    const minY = Math.min(...points.map((p) => p.y))
    const maxX = Math.max(...points.map((p) => p.x)) + COLUMN_WIDTH
    const maxY = Math.max(...points.map((p) => p.y)) + COLUMN_HEIGHT
    return [
      [minX - CANVAS_MARGIN, minY - CANVAS_MARGIN],
      [maxX + CANVAS_MARGIN, maxY + CANVAS_MARGIN],
    ]
  }, [columns, tasks])

  const zoneRects = useMemo(
    () =>
      columns.map((c) => ({
        id: c.id,
        x1: c.position.x,
        y1: c.position.y,
        x2: c.position.x + COLUMN_WIDTH,
        y2: c.position.y + COLUMN_HEIGHT,
      })),
    [columns],
  )

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const change of changes) {
        if (change.type !== 'position' || !change.position) continue
        if (mockPresenceUsers.some((p) => p.id === change.id)) continue

        if (change.id.startsWith('zone-')) {
          moveColumnPosition(change.id.slice(5), change.position)
          continue
        }

        moveTask(change.id, change.position)

        // A clip dropped inside a bin's rectangle is spliced onto that reel.
        const { x, y } = change.position
        const hit = zoneRects.find((z) => x >= z.x1 && x <= z.x2 && y >= z.y1 && y <= z.y2)
        if (hit) setColumn(change.id, hit.id)
      }
    },
    [moveTask, setColumn, moveColumnPosition, zoneRects],
  )

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      if (node.type === 'task') onTaskClick(node.data as unknown as Task)
    },
    [onTaskClick],
  )

  return (
    <div className={styles.canvas}>
      <div className={styles.flow}>
        <ReactFlow
          nodes={nodes}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeClick={handleNodeClick}
          translateExtent={translateExtent}
          minZoom={0.35}
          maxZoom={2}
          fitView
          fitViewOptions={{ padding: 0.28 }}
          proOptions={{ hideAttribution: true }}
        >
          {/* An exposure sheet, not a dot grid: frame rules every 24px with a
              heavier foot rule every eighth, so the deck reads as measured
              footage and a card's position means something. */}
          <Background
            id="frames"
            variant={BackgroundVariant.Lines}
            gap={24}
            lineWidth={1}
            color="rgba(255,255,255,0.028)"
          />
          <Background
            id="feet"
            variant={BackgroundVariant.Lines}
            gap={192}
            lineWidth={1}
            color="rgba(216,168,81,0.11)"
          />
          <Controls showInteractive={false}>
            <ZoomValue />
          </Controls>
        </ReactFlow>
      </div>
    </div>
  )
}
