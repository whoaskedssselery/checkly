import {
  Background,
  BackgroundVariant,
  Controls,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
  type NodeTypes,
  ReactFlow,
  type ReactFlowInstance,
  useViewport,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useBoardStore } from '@entities/board/model'
import {
  COLUMN_HEIGHT,
  COLUMN_WIDTH,
  columnAtCard,
  columnHeight,
  columnHeights,
  freeCardsInside,
  useColumnStore,
} from '@entities/column/model'
import { peersOnBoard, usePresenceStore } from '@entities/presence/model'
import { PresenceCursor } from '@entities/presence/ui/PresenceCursor'
import type { Task } from '@entities/task/model'
import { useTaskStore } from '@entities/task/model'
import { TaskCard, type TaskCardData } from '@entities/task/ui/TaskCard'
import { sendCursor } from '@features/presence/presenceChannel'
import { CARD_HEIGHT, CARD_WIDTH } from '@shared/config/board'
import { useCallback, useMemo, useRef } from 'react'
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
  const commitColumn = useColumnStore((s) => s.commitColumn)
  const commitTask = useTaskStore((s) => s.commitTask)
  const shiftColumnTasks = useTaskStore((s) => s.shiftColumnTasks)
  const commitColumnTasks = useTaskStore((s) => s.commitColumnTasks)
  const peers = usePresenceStore((s) => s.peers)
  const boardId = useBoardStore((s) => s.board?.id)
  const flow = useRef<ReactFlowInstance | null>(null)

  // Columns grow to hold their cards.
  const heights = useMemo(() => columnHeights(columns, tasks), [columns, tasks])

  const zoneNodes: Node[] = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const t of tasks) if (t.columnId) counts[t.columnId] = (counts[t.columnId] ?? 0) + 1
    return columns.map((col) => ({
      id: `zone-${col.id}`,
      type: 'zone',
      position: col.position,
      data: {
        label: col.name,
        color: col.color,
        count: counts[col.id] ?? 0,
        height: heights[col.id] ?? COLUMN_HEIGHT,
        canDelete: columns.length > 1,
        onDelete: () => removeColumn(col.id),
      },
      draggable: true,
      selectable: false,
      zIndex: -1,
      // React Flow keeps a node invisible until it has dimensions. Handing it
      // the size we already know removes the first-paint pop-in.
      initialWidth: COLUMN_WIDTH,
      initialHeight: heights[col.id] ?? COLUMN_HEIGHT,
    }))
  }, [columns, tasks, heights, removeColumn])

  const taskNodes: Node[] = useMemo(
    () =>
      tasks.map((task) => ({
        id: task.id,
        type: 'task',
        position: task.position,
        data: task satisfies TaskCardData,
        initialWidth: CARD_WIDTH,
        initialHeight: CARD_HEIGHT,
      })),
    [tasks],
  )

  const presenceNodes: Node[] = useMemo(
    () =>
      peersOnBoard(peers, boardId).map((p) => ({
        id: `presence-${p.id}`,
        type: 'presence',
        position: p.cursor,
        data: p,
        draggable: false,
        selectable: false,
        zIndex: 10,
        initialWidth: 20,
        initialHeight: 22,
      })),
    [peers, boardId],
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
    const maxY =
      Math.max(...points.map((p) => p.y)) + Math.max(COLUMN_HEIGHT, ...Object.values(heights))
    return [
      [minX - CANVAS_MARGIN, minY - CANVAS_MARGIN],
      [maxX + CANVAS_MARGIN, maxY + CANVAS_MARGIN],
    ]
  }, [columns, tasks, heights])

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const change of changes) {
        if (change.type !== 'position' || !change.position) continue
        if (change.id.startsWith('presence-')) continue

        // React Flow reports `dragging: false` once, when the drag ends. Writes
        // to the server happen then — not on every tick of the drag.
        const dragEnded = change.dragging === false

        if (change.id.startsWith('zone-')) {
          const columnId = change.id.slice(5)
          // The cards in a column travel with it: shift them by however far the
          // column just moved, then save the column and its cards together.
          const before = useColumnStore.getState().columns.find((c) => c.id === columnId)
          if (before) {
            shiftColumnTasks(
              columnId,
              change.position.x - before.position.x,
              change.position.y - before.position.y,
            )
          }
          moveColumnPosition(columnId, change.position)
          if (dragEnded) {
            // A column dropped over free-floating cards takes them in.
            const column = useColumnStore.getState().columns.find((c) => c.id === columnId)
            if (column) {
              const all = useTaskStore.getState().tasks
              for (const t of freeCardsInside(column, all, columnHeight(column, all))) {
                setColumn(t.id, columnId)
              }
            }
            void commitColumn(columnId)
            void commitColumnTasks(columnId)
          }
          continue
        }

        moveTask(change.id, change.position)

        // A clip dropped inside a bin is spliced onto that reel. Dropped anywhere
        // else it belongs to no column: it stays where it was put and no longer
        // travels with the column it came from.
        // Hit-test against the columns as they are WITHOUT this card: otherwise
        // dragging a card down would keep growing its column and it could never
        // be dragged out of the bottom.
        const others = useTaskStore.getState().tasks.filter((t) => t.id !== change.id)
        const cols = useColumnStore.getState().columns
        const hit = columnAtCard(change.position, cols, columnHeights(cols, others))
        if (hit) setColumn(change.id, hit)
        if (dragEnded) {
          if (!hit) setColumn(change.id, null)
          void commitTask(change.id)
        }
      }
    },
    [
      moveTask,
      setColumn,
      moveColumnPosition,
      commitColumn,
      commitTask,
      shiftColumnTasks,
      commitColumnTasks,
    ],
  )

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      if (node.type === 'task') onTaskClick(node.data as unknown as Task)
    },
    [onTaskClick],
  )

  return (
    <div className={styles.canvas}>
      <div
        className={styles.flow}
        onPointerMove={(e) => {
          const at = flow.current?.screenToFlowPosition({ x: e.clientX, y: e.clientY })
          if (at) sendCursor(at.x, at.y)
        }}
      >
        <ReactFlow
          onInit={(instance) => {
            flow.current = instance
          }}
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
