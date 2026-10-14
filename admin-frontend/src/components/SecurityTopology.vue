<template>
  <div class="topo">
    <div class="topo-toolbar">
      <button class="topo-btn" title="Zoom in" @click="zoom(1.2)">+</button>
      <button class="topo-btn" title="Zoom out" @click="zoom(1 / 1.2)">−</button>
      <button class="topo-btn" title="Fit" @click="fit">Fit</button>
      <div class="topo-legend">
        <span v-for="(s, k) in TRAFFIC_STYLES" :key="k" class="legend-item">
          <svg width="28" height="8"><line x1="0" y1="4" x2="28" y2="4" :stroke="s.color" :stroke-width="s.width" :stroke-dasharray="s.dash" /></svg>
          {{ s.label }}
        </span>
      </div>
    </div>
    <p class="topo-help">Схема показывает разрешённые связи. Проверки запрещённых портов находятся в разделе Exposure; блокировка не является сетевым соединением.</p>
    <div ref="wrap" class="topo-canvas" @wheel.prevent="onWheel" @pointerdown="onDown" @pointermove="onMove"
         @pointerup="onUp" @pointerleave="onUp">
      <svg :viewBox="`0 0 ${layout.width} ${layout.height}`" preserveAspectRatio="xMinYMin meet" class="topo-svg"
           role="img" aria-label="KINOSOTA security topology">
        <g :transform="`translate(${tx} ${ty}) scale(${scale})`">
          <g v-for="b in layout.bands" :key="b.layer">
            <rect :x="b.x - 10" y="8" :width="b.width + 20" :height="layout.height - 16" rx="10" class="band" />
            <text :x="b.x" y="30" class="band-label">{{ LAYER_LABELS[b.layer] || b.layer }}</text>
          </g>
          <g v-for="e in drawableEdges" :key="e.id" class="edge" :class="{ dim: dimmed(e.id), hl: hl.has(e.id) }"
             @click.stop="$emit('select', { kind: 'edge', item: e })">
            <path :d="e.d" fill="none" :stroke="TRAFFIC_STYLES[e.traffic]?.color || '#64748b'"
                  :stroke-width="(TRAFFIC_STYLES[e.traffic]?.width || 2) + (hl.has(e.id) ? 1.5 : 0)"
                  :stroke-dasharray="TRAFFIC_STYLES[e.traffic]?.dash || ''" />
            <path :d="e.d" fill="none" stroke="transparent" stroke-width="12" />
            <title>{{ e.protocol }} {{ e.port }} — {{ e.purpose }} — {{ stateMeta(e.actual_state).label }}</title>
            <g v-if="e.actual_state !== 'MISSING'" :transform="`translate(${e.mx} ${e.my})`">
              <circle r="8" :fill="stateMeta(e.actual_state).color" class="edge-badge" />
              <text text-anchor="middle" dy="3.5" class="edge-icon">{{ stateMeta(e.actual_state).icon }}</text>
              <title>{{ e.protocol }} {{ e.port }} — {{ e.purpose }} — {{ stateMeta(e.actual_state).label }}</title>
            </g>
          </g>
          <g v-for="n in nodes" :key="n.id" class="node" :class="{ dim: dimmed(n.id), sel: selectedId === n.id, rc: rootCauses.has(n.id) }"
             :transform="`translate(${layout.placed[n.id]?.x || 0} ${layout.placed[n.id]?.y || 0})`"
             tabindex="0" @click.stop="$emit('select', { kind: 'node', item: n })"
             @keydown.enter="$emit('select', { kind: 'node', item: n })">
            <rect :width="layout.placed[n.id]?.w" :height="layout.placed[n.id]?.h" rx="8" class="node-box"
                  :stroke="stateMeta(n.actual_state).color" />
            <rect width="5" :height="layout.placed[n.id]?.h" rx="2" :fill="stateMeta(n.actual_state).color" />
            <text x="14" y="21" class="node-label">{{ short(n.label) }}</text>
            <text x="14" y="40" class="node-state" :fill="stateMeta(n.actual_state).color">
              {{ stateMeta(n.actual_state).icon }} {{ stateMeta(n.actual_state).label }}
            </text>
            <title>{{ n.label }} — {{ n.actual_state }}{{ n.reason ? ': ' + n.reason : '' }}</title>
          </g>
        </g>
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  edgePath, mediaEdgeRoute, highlightSet, LAYER_LABELS, layoutTopology, stateMeta, TRAFFIC_STYLES,
  type TopoEdge, type TopoNode,
} from '../lib/securityView'

const props = defineProps<{ nodes: TopoNode[]; edges: TopoEdge[]; selectedId?: string | null }>()
defineEmits<{ (e: 'select', v: { kind: 'node' | 'edge'; item: TopoNode | TopoEdge }): void }>()

const layout = computed(() => layoutTopology(props.nodes))
const drawableEdges = computed(() => props.edges.filter(e => e.traffic !== "forbidden").flatMap((e, index) => {
  const a = layout.value.placed[e.source], b = layout.value.placed[e.target]
  if (!a || !b) return []
  if (e.traffic === 'direct_media') return [{ ...e, ...mediaEdgeRoute(a, b, index) }]
  const d = edgePath(a, b)
  const mx = (a.x + a.w / 2 + b.x + b.w / 2) / 2, my = (a.y + a.h / 2 + b.y + b.h / 2) / 2
  return [{ ...e, d, mx, my }]
}))
const hl = computed(() => highlightSet(props.selectedId || null, props.nodes, props.edges))
const rootCauses = computed(() => new Set(props.nodes.find((n) => n.id === props.selectedId)?.root_cause || []))
const dimmed = (id: string) => !!props.selectedId && !hl.value.has(id)
const short = (s: string) => (s.length > 24 ? s.slice(0, 23) + '…' : s)

const scale = ref(1), tx = ref(0), ty = ref(0)
const wrap = ref<HTMLElement | null>(null)
let drag: { x: number; y: number; tx: number; ty: number } | null = null
const zoom = (f: number) => { scale.value = Math.min(3, Math.max(0.4, scale.value * f)) }
const fit = () => { scale.value = 1; tx.value = 0; ty.value = 0 }
const onWheel = (ev: WheelEvent) => zoom(ev.deltaY < 0 ? 1.1 : 1 / 1.1)
const onDown = (ev: PointerEvent) => { drag = { x: ev.clientX, y: ev.clientY, tx: tx.value, ty: ty.value } }
const onMove = (ev: PointerEvent) => {
  if (!drag) return
  const k = layout.value.width / (wrap.value?.clientWidth || layout.value.width)
  tx.value = drag.tx + (ev.clientX - drag.x) * k / scale.value
  ty.value = drag.ty + (ev.clientY - drag.y) * k / scale.value
}
const onUp = () => { drag = null }
</script>

<style scoped>
.topo-help { color: #94a3b8; font-size: 14px; margin: 4px 0; }
.topo { display: flex; flex-direction: column; gap: 8px; }
.topo-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.topo-btn { background: #1e293b; color: #e2e8f0; border: 1px solid #334155; border-radius: 6px; padding: 4px 10px; cursor: pointer; }
.topo-legend { display: flex; flex-wrap: wrap; gap: 12px; margin-left: 8px; font-size: 12px; color: #94a3b8; }
.legend-item { display: inline-flex; align-items: center; gap: 4px; }
.topo-canvas { border: 1px solid #1e293b; border-radius: 10px; background: #0b1220; overflow: hidden; touch-action: none; cursor: grab; min-height: 260px; }
.topo-svg { width: 100%; height: auto; max-height: 70vh; display: block; }
.band { fill: rgba(30, 41, 59, .35); stroke: #1e293b; }
.band-label { fill: #64748b; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }
.node { cursor: pointer; }
.node-box { fill: #111827; stroke-width: 1.5; }
.node.sel .node-box { stroke-width: 3; fill: #1e1b4b; }
.node.rc .node-box { stroke-width: 3; stroke-dasharray: 4 3; }
.node-label { fill: #e2e8f0; font-size: 12.5px; font-weight: 600; }
.node-state { font-size: 11.5px; }
.edge { cursor: pointer; }
.edge-icon { fill: #0b1220; font-size: 10px; font-weight: 700; pointer-events: none; }
.dim { opacity: .25; }
.edge.hl path:first-child { filter: drop-shadow(0 0 3px rgba(129, 140, 248, .8)); }
</style>
