import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Network, RefreshCw, CheckCircle2, ExternalLink, Info,
  ZoomIn, ZoomOut, Maximize2, Search, X,
  AlertTriangle, Link2Off, ArrowUpDown, ArrowUp, ArrowDown,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../lib/store';
import PageHeader from '../components/ui/PageHeader';
import { SkeletonTable } from '../components/ui/Skeleton';
import Spinner from '../components/ui/Spinner';

type NodeStatus = 'indexed' | 'noindex' | 'orphan';
type GraphNode  = { id: number; label: string; url: string; status: NodeStatus; incoming: number };
type GraphEdge  = { source: number; target: number; anchor_text: string; broken: boolean; source_url?: string; target_url?: string };
type Graph      = { nodes: GraphNode[]; edges: GraphEdge[] };

const STATUS_META: Record<NodeStatus, { color: string; glow: string; ring: string; bg: string; text: string; label: string }> = {
  indexed: { color: '#22c55e', glow: '#22c55e40', ring: '#16a34a', bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Indexed' },
  noindex: { color: '#ef4444', glow: '#ef444440', ring: '#dc2626', bg: 'bg-red-50',     text: 'text-red-700',     label: 'No-Index' },
  orphan:  { color: '#f59e0b', glow: '#f59e0b40', ring: '#d97706', bg: 'bg-amber-50',   text: 'text-amber-700',   label: 'Orphan' },
};

// ── Stats bar ─────────────────────────────────────────────────
function StatsBar({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const stats = [
    { label: 'Total Pages',  value: nodes.length,                                      color: 'text-gray-900',    bg: 'bg-gray-100' },
    { label: 'Indexed',      value: nodes.filter(n => n.status === 'indexed').length,  color: 'text-emerald-700', bg: 'bg-emerald-50' },
    { label: 'No-Index',     value: nodes.filter(n => n.status === 'noindex').length,  color: 'text-red-600',     bg: 'bg-red-50' },
    { label: 'Orphan Pages', value: nodes.filter(n => n.status === 'orphan').length,   color: 'text-amber-600',   bg: 'bg-amber-50' },
    { label: 'Broken Links', value: edges.filter(e => e.broken).length,               color: 'text-red-600',     bg: 'bg-red-50' },
    { label: 'Total Links',  value: edges.length,                                      color: 'text-blue-600',    bg: 'bg-blue-50' },
  ];
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      {stats.map(({ label, value, color, bg }) => (
        <div key={label} className={`rounded-xl p-3 ${bg} text-center`}>
          <p className={`text-xl font-black ${color}`}>{value}</p>
          <p className="text-xs font-medium text-gray-600 mt-0.5">{label}</p>
        </div>
      ))}
    </div>
  );
}

// ── Visual Link Graph (SVG, pan + zoom) ───────────────────────
interface LayoutNode { id: number; x: number; y: number; r: number; node: GraphNode }

function LinkGraph({ nodes, edges, onSelect }: Graph & { onSelect: (n: GraphNode) => void }) {
  const svgRef  = useRef<SVGSVGElement>(null);
  const [zoom, setZoom]   = useState(1);
  const [pan,  setPan]    = useState({ x: 0, y: 0 });
  const [drag, setDrag]   = useState<{ ox: number; oy: number; px: number; py: number } | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  // Build layout: most-linked nodes near center, orphans at edge
  const layout = useMemo<LayoutNode[]>(() => {
    if (nodes.length === 0) return [];

    const W = 900, H = 700;
    const cx = W / 2, cy = H / 2;

    // Compute outgoing count
    const outMap: Record<number, number> = {};
    for (const e of edges) {
      const src = typeof e.source === 'object' ? (e.source as any).id : e.source;
      outMap[src] = (outMap[src] ?? 0) + 1;
    }

    // Sort by link authority (incoming + outgoing)
    const sorted = [...nodes].sort((a, b) => {
      const aScore = a.incoming + (outMap[a.id] ?? 0);
      const bScore = b.incoming + (outMap[b.id] ?? 0);
      return bScore - aScore;
    });

    const result: LayoutNode[] = [];
    const n = sorted.length;

    if (n === 1) {
      const node = sorted[0];
      const maxIn = Math.max(1, node.incoming);
      result.push({ id: node.id, x: cx, y: cy, r: 18, node });
      return result;
    }

    // Place top ~20% in inner ring, rest in outer rings
    const innerCount = Math.max(1, Math.min(8, Math.ceil(n * 0.2)));
    const midCount   = Math.min(16, Math.ceil(n * 0.4));
    const outerCount = n - innerCount - midCount;

    const maxIn = Math.max(1, ...nodes.map(n => n.incoming));

    const place = (node: GraphNode, ring: number, idx: number, ringCount: number) => {
      const radii  = [0, 130, 250, 370];
      const r_val  = radii[ring] ?? 370;
      const angle  = (idx / ringCount) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(angle) * r_val;
      const y = cy + Math.sin(angle) * r_val;
      const nodeR = 8 + Math.round((node.incoming / maxIn) * 14);
      result.push({ id: node.id, x, y, r: nodeR, node });
    };

    if (innerCount > 0) {
      for (let i = 0; i < innerCount && i < sorted.length; i++) {
        if (innerCount === 1) {
          result.push({ id: sorted[0].id, x: cx, y: cy, r: 22, node: sorted[0] });
        } else {
          place(sorted[i], 1, i, innerCount);
        }
      }
    }
    for (let i = innerCount; i < innerCount + midCount && i < sorted.length; i++) {
      place(sorted[i], 2, i - innerCount, midCount);
    }
    for (let i = innerCount + midCount; i < sorted.length; i++) {
      place(sorted[i], 3, i - innerCount - midCount, Math.max(1, outerCount));
    }

    return result;
  }, [nodes, edges]);

  const layoutById = useMemo(() => {
    const map: Record<number, LayoutNode> = {};
    for (const l of layout) map[l.id] = l;
    return map;
  }, [layout]);

  // Pan/zoom handlers — wheel listener is attached natively in useEffect below
  // so we can register it as non-passive (React's synthetic onWheel is passive
  // by default in React 18+, which prevents preventDefault from working).

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as SVGElement).closest('[data-node]')) return;
    setDrag({ ox: e.clientX, oy: e.clientY, px: pan.x, py: pan.y });
  }, [pan]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drag) return;
    setPan({ x: drag.px + (e.clientX - drag.ox), y: drag.py + (e.clientY - drag.oy) });
  }, [drag]);

  const onMouseUp = useCallback(() => setDrag(null), []);

  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  // Native non-passive wheel listener so preventDefault works (stops page scroll).
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      setZoom(z => Math.max(0.25, Math.min(4, z * (e.deltaY < 0 ? 1.12 : 0.9))));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const W = 900, H = 700;

  return (
    <div className="relative w-full" style={{ height: 560 }}>
      <svg
        ref={svgRef}
        className="w-full h-full rounded-2xl"
        style={{
          background: 'radial-gradient(ellipse at 50% 40%, #f0f4ff 0%, #f7f8fa 60%, #eef0f5 100%)',
          cursor: drag ? 'grabbing' : 'grab',
        }}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <defs>
          {/* Glow filters per status */}
          {(['indexed', 'noindex', 'orphan'] as NodeStatus[]).map(s => (
            <filter key={s} id={`glow-${s}`} x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feFlood floodColor={STATUS_META[s].color} floodOpacity="0.35" result="color" />
              <feComposite in="color" in2="blur" operator="in" result="shadow" />
              <feMerge><feMergeNode in="shadow" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          ))}
          {/* Arrow marker */}
          <marker id="arrow-normal" viewBox="0 -3 6 6" refX="6" refY="0" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0,-3L6,0L0,3" fill="#94a3b8" opacity="0.5" />
          </marker>
          <marker id="arrow-broken" viewBox="0 -3 6 6" refX="6" refY="0" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0,-3L6,0L0,3" fill="#ef4444" opacity="0.7" />
          </marker>
          <marker id="arrow-hover" viewBox="0 -3 6 6" refX="6" refY="0" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0,-3L6,0L0,3" fill="#6366f1" opacity="0.9" />
          </marker>
        </defs>

        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}
           style={{ transformOrigin: `${W/2}px ${H/2}px` }}>

          {/* Ring guides */}
          {[130, 250, 370].map(r => (
            <circle key={r} cx={W/2} cy={H/2} r={r}
              fill="none" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 6" opacity="0.6" />
          ))}

          {/* Edges */}
          {edges.map((e, i) => {
            const srcId = typeof e.source === 'object' ? (e.source as any).id : e.source;
            const tgtId = typeof e.target === 'object' ? (e.target as any).id : e.target;
            const src = layoutById[srcId];
            const tgt = layoutById[tgtId];
            if (!src || !tgt || src.id === tgt.id) return null;

            const isHovered = hovered === srcId || hovered === tgtId;
            const dx = tgt.x - src.x, dy = tgt.y - src.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 1) return null;
            const ux = dx / dist, uy = dy / dist;
            const x1 = src.x + ux * (src.r + 2);
            const y1 = src.y + uy * (src.r + 2);
            const x2 = tgt.x - ux * (tgt.r + 8);
            const y2 = tgt.y - uy * (tgt.r + 8);

            // Slight curve
            const mx = (x1 + x2) / 2 - uy * 20;
            const my = (y1 + y2) / 2 + ux * 20;

            return (
              <path
                key={i}
                d={`M${x1},${y1} Q${mx},${my} ${x2},${y2}`}
                fill="none"
                stroke={e.broken ? '#ef4444' : isHovered ? '#6366f1' : '#94a3b8'}
                strokeWidth={isHovered ? 1.8 : e.broken ? 1.5 : 0.8}
                strokeOpacity={isHovered ? 0.9 : e.broken ? 0.6 : 0.25}
                markerEnd={e.broken ? 'url(#arrow-broken)' : isHovered ? 'url(#arrow-hover)' : 'url(#arrow-normal)'}
                strokeDasharray={e.broken ? '4 3' : undefined}
              />
            );
          })}

          {/* Nodes */}
          {layout.map(({ id, x, y, r, node }) => {
            const meta = STATUS_META[node.status];
            const isHov = hovered === id;
            const nodeR = isHov ? r + 2 : r;
            return (
              <g
                key={id}
                data-node="true"
                transform={`translate(${x},${y})`}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHovered(id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onSelect(node)}
              >
                {/* Glow halo on hover */}
                {isHov && (
                  <circle r={nodeR + 8} fill={meta.glow} />
                )}
                {/* Node body */}
                <circle
                  r={nodeR}
                  fill={meta.color}
                  stroke="white"
                  strokeWidth={2}
                  filter={isHov ? `url(#glow-${node.status})` : undefined}
                  style={{ transition: 'r 0.15s ease' }}
                />
                {/* Orphan ring indicator */}
                {node.status === 'orphan' && (
                  <circle r={nodeR + 4} fill="none" stroke={meta.color} strokeWidth="1.5" strokeDasharray="3 2" opacity={0.6} />
                )}
                {/* Label (shown when hovered or node is large) */}
                {(isHov || r >= 16) && (
                  <text
                    y={nodeR + 12}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={isHov ? 700 : 500}
                    fill={isHov ? '#1e1b4b' : '#64748b'}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {node.label.length > 20 ? node.label.slice(0, 18) + '…' : node.label}
                  </text>
                )}
                {/* Link count badge for prominent nodes */}
                {node.incoming > 0 && r >= 14 && (
                  <text
                    y={4}
                    textAnchor="middle"
                    fontSize={9}
                    fontWeight={700}
                    fill="white"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {node.incoming}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Legend */}
      <div className="absolute top-3 right-3 flex flex-col gap-1.5 bg-white/90 backdrop-blur-sm rounded-xl border border-gray-100 shadow-sm px-3 py-2.5">
        {(Object.entries(STATUS_META) as [NodeStatus, typeof STATUS_META[NodeStatus]][]).map(([k, v]) => (
          <span key={k} className="flex items-center gap-2 text-xs text-gray-600">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: v.color }} />
            {v.label}
          </span>
        ))}
        <span className="flex items-center gap-2 text-xs text-gray-600 mt-0.5 pt-0.5 border-t border-gray-100">
          <span className="w-4 h-0.5 rounded" style={{ background: '#ef4444' }} />
          Broken link
        </span>
        <span className="flex items-center gap-2 text-xs text-gray-500 mt-0.5 pt-0.5 border-t border-gray-100">
          <span className="w-3 h-3 rounded-full border-2 border-gray-300 flex-shrink-0" />
          Node size = links in
        </span>
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-3 right-3 flex flex-col gap-1">
        <button onClick={() => setZoom(z => Math.min(4, z * 1.25))} className="np-btn-secondary !px-2 !py-1.5" title="Zoom in"><ZoomIn className="w-3.5 h-3.5" /></button>
        <button onClick={() => setZoom(z => Math.max(0.25, z * 0.8))} className="np-btn-secondary !px-2 !py-1.5" title="Zoom out"><ZoomOut className="w-3.5 h-3.5" /></button>
        <button onClick={resetView} className="np-btn-secondary !px-2 !py-1.5" title="Reset view"><Maximize2 className="w-3.5 h-3.5" /></button>
      </div>

      {/* Hint */}
      <div className="absolute bottom-3 left-3 text-[11px] text-gray-600">
        Click node to inspect · Scroll to zoom · Drag to pan
      </div>
    </div>
  );
}

// ── Node detail panel ─────────────────────────────────────────
function NodeDetail({ node, onClose }: { node: GraphNode; onClose: () => void }) {
  const meta = STATUS_META[node.status];
  return (
    <div className="np-card p-4" style={{ boxShadow: '0 12px 40px rgb(15 23 42 / 0.18)' }}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: meta.color }} />
          <span className={`text-xs font-bold ${meta.text}`}>{meta.label}</span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-0.5">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-sm font-semibold text-gray-900 leading-snug mb-1">{node.label}</p>
      <p className="text-[11px] text-gray-600 font-mono truncate mb-3">{node.url}</p>
      <div className="flex items-center justify-between text-xs mb-3">
        <span className="text-gray-500">Incoming links</span>
        <span className="font-bold text-gray-900">{node.incoming}</span>
      </div>
      {node.status === 'orphan' && (
        <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-2 leading-relaxed mb-3">
          No pages link here. Add at least one internal link so search engines can discover this page.
        </p>
      )}
      {node.status === 'noindex' && (
        <p className="text-[11px] text-red-700 bg-red-50 rounded-lg px-2.5 py-2 leading-relaxed mb-3">
          This page is hidden from search engines. Remove the noindex directive if it should be indexed.
        </p>
      )}
      <a href={node.url} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-[11px] text-pulse-600 hover:underline font-medium">
        Open page <ExternalLink className="w-3 h-3" />
      </a>
    </div>
  );
}

// ── Orphan list ───────────────────────────────────────────────
function OrphanList({ nodes }: { nodes: GraphNode[] }) {
  const orphans = nodes.filter(n => n.status === 'orphan');
  if (orphans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center">
          <CheckCircle2 className="w-6 h-6 text-emerald-500" />
        </div>
        <p className="text-sm font-semibold text-gray-900">No orphan pages</p>
        <p className="text-xs text-gray-500 max-w-xs">Every page has at least one internal link pointing to it.</p>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-start gap-3 mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <Info className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700 leading-relaxed">
          <strong>Orphan pages</strong> have no internal links pointing to them. Search engine crawlers can't discover
          them through your site's link structure — fix by adding internal links from related pages.
        </p>
      </div>
      <div className="space-y-1">
        {orphans.map(n => (
          <div key={n.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors group">
            <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{n.label}</p>
              <p className="text-xs text-gray-400 truncate font-mono">{n.url}</p>
            </div>
            <a href={n.url} target="_blank" rel="noopener noreferrer"
              className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-pulse-500">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Broken links ──────────────────────────────────────────────
function BrokenList({ edges }: { edges: GraphEdge[] }) {
  const broken = edges.filter(e => e.broken);
  if (broken.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center">
          <CheckCircle2 className="w-6 h-6 text-emerald-500" />
        </div>
        <p className="text-sm font-semibold text-gray-900">No broken links</p>
        <p className="text-xs text-gray-500 max-w-xs">All internal links resolve correctly.</p>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-start gap-3 mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
        <Info className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-red-700 leading-relaxed">
          <strong>Broken links</strong> hurt user experience and waste crawl budget. Fix or redirect these targets to remove 404 errors.
        </p>
      </div>
      <div className="np-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Broken URL</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Source Page</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Anchor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {broken.map((e, i) => (
              <tr key={i} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <span className="text-xs text-red-600 font-mono truncate block max-w-xs">
                    {e.target_url ?? String(e.target)}
                  </span>
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <span className="text-xs text-gray-500 font-mono truncate block max-w-xs">
                    {e.source_url ?? String(e.source)}
                  </span>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  {e.anchor_text && <span className="text-xs text-gray-500 italic">"{e.anchor_text}"</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Link table (sortable) ─────────────────────────────────────
type SortKey = 'title' | 'status' | 'incoming' | 'outgoing';
type SortDir = 'asc' | 'desc';

function LinkTable({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const [sort, setSort]   = useState<SortKey>('incoming');
  const [dir, setDir]     = useState<SortDir>('desc');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | NodeStatus>('all');

  const outMap = useMemo(() => {
    const m: Record<number, number> = {};
    for (const e of edges) {
      const src = typeof e.source === 'object' ? (e.source as any).id : e.source;
      m[src] = (m[src] ?? 0) + 1;
    }
    return m;
  }, [edges]);

  const sorted = useMemo(() => {
    let list = [...nodes];
    if (filter !== 'all') list = list.filter(n => n.status === filter);
    if (search) { const q = search.toLowerCase(); list = list.filter(n => n.label.toLowerCase().includes(q) || n.url.toLowerCase().includes(q)); }
    list.sort((a, b) => {
      let va: number | string, vb: number | string;
      if (sort === 'title')    { va = a.label;  vb = b.label; }
      else if (sort === 'status')  { va = a.status; vb = b.status; }
      else if (sort === 'incoming') { va = a.incoming; vb = b.incoming; }
      else { va = outMap[a.id] ?? 0; vb = outMap[b.id] ?? 0; }
      const cmp = typeof va === 'string' ? va.localeCompare(String(vb)) : (va as number) - (vb as number);
      return dir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [nodes, edges, sort, dir, search, filter, outMap]);

  const handleSort = (key: SortKey) => {
    if (sort === key) setDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSort(key); setDir('desc'); }
  };

  const Th = ({ col, label, cls }: { col: SortKey; label: string; cls?: string }) => {
    const active = sort === col;
    return (
      <th className={`px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none group ${cls ?? ''}`}
        onClick={() => handleSort(col)}>
        <span className="inline-flex items-center gap-1.5">
          {label}
          {active
            ? (dir === 'asc' ? <ArrowUp className="w-3 h-3 text-pulse-600" /> : <ArrowDown className="w-3 h-3 text-pulse-600" />)
            : <ArrowUpDown className="w-3 h-3 text-gray-300 group-hover:text-gray-500" />}
        </span>
      </th>
    );
  };

  return (
    <div className="np-card overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input className="np-input pl-8 text-sm w-full" placeholder="Search pages…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {(['all', 'indexed', 'noindex', 'orphan'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${filter === f ? 'bg-pulse-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {f === 'all' ? 'All' : STATUS_META[f as NodeStatus].label}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-500 ml-auto">{sorted.length} pages</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <Th col="title" label="Page" />
              <Th col="status" label="Status" cls="w-28" />
              <Th col="incoming" label="Links In" cls="w-28" />
              <Th col="outgoing" label="Links Out" cls="w-28" />
              <th className="px-4 py-2.5 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map(node => {
              const out = outMap[node.id] ?? 0;
              const meta = STATUS_META[node.status];
              return (
                <tr key={node.id} className="hover:bg-gray-50/70 transition-colors group">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900 truncate max-w-xs">{node.label}</p>
                    <p className="text-xs text-gray-400 font-mono truncate max-w-xs mt-0.5">{node.url}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${meta.bg} ${meta.text}`}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.color }} />
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${node.incoming === 0 ? 'text-amber-500' : 'text-gray-900'}`}>{node.incoming}</span>
                      {node.incoming > 0 && (
                        <div className="w-16 h-1.5 rounded-full bg-gray-100 hidden sm:block">
                          <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(100, node.incoming * 10)}%` }} />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${out === 0 ? 'text-gray-400' : 'text-gray-900'}`}>{out}</span>
                      {out > 0 && (
                        <div className="w-16 h-1.5 rounded-full bg-gray-100 hidden sm:block">
                          <div className="h-full rounded-full bg-blue-400" style={{ width: `${Math.min(100, out * 10)}%` }} />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <a href={node.url} target="_blank" rel="noopener noreferrer"
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-pulse-600">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────
function GraphEmpty({ onScan, isPending }: { onScan: () => void; isPending: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-5">
      <div className="w-20 h-20 rounded-3xl flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)' }}>
        <Network className="w-10 h-10 text-teal-300" />
      </div>
      <div>
        <h3 className="text-base font-bold text-gray-900 mb-2">No link data yet</h3>
        <p className="text-sm text-gray-500 max-w-sm leading-relaxed">
          Nexora Pulse crawls every published page, maps all internal links, and surfaces orphan pages and broken connections.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3 w-full max-w-xs text-center">
        {[
          { color: '#22c55e', label: 'Indexed pages' },
          { color: '#f59e0b', label: 'Orphan pages' },
          { color: '#ef4444', label: 'Broken links' },
        ].map(({ color, label }) => (
          <div key={label} className="rounded-xl p-2 bg-gray-50">
            <div className="w-3 h-3 rounded-full mx-auto mb-1" style={{ background: color }} />
            <p className="text-[10px] text-gray-500">{label}</p>
          </div>
        ))}
      </div>
      <button className="np-btn-primary" onClick={onScan} disabled={isPending}>
        {isPending ? <Spinner size="sm" /> : <Network className="w-4 h-4" />}
        Build Link Graph
      </button>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────
type Tab = 'graph' | 'table' | 'orphans' | 'broken';

export default function NeuralLinks() {
  const { addToast } = useAppStore();
  const qc           = useQueryClient();
  const [tab, setTab]               = useState<Tab>('graph');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  const { data: graph, isLoading } = useQuery({
    queryKey: ['link-graph'],
    queryFn: () => api.get<Graph>('links/graph'),
  });

  const scan = useMutation({
    mutationFn: () => api.post('links/scan'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['link-graph'] });
      qc.invalidateQueries({ queryKey: ['links-progress'] });
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      qc.invalidateQueries({ queryKey: ['recent-logs'] });
      addToast('success', 'Link graph rebuilt', 'Internal link structure analysed and updated.');
    },
    onError: () => addToast('error', 'Scan failed', 'Could not rebuild the link graph. Please try again.'),
  });

  const nodes   = graph?.nodes ?? [];
  const edges   = graph?.edges ?? [];
  const orphans = nodes.filter(n => n.status === 'orphan');
  const broken  = edges.filter(e => e.broken);
  const hasData = nodes.length > 0;

  const TABS: { id: Tab; label: string; count?: number; alert?: boolean }[] = [
    { id: 'graph',   label: 'Visual Graph' },
    { id: 'table',   label: 'Link Table' },
    { id: 'orphans', label: 'Orphan Pages', count: orphans.length, alert: orphans.length > 0 },
    { id: 'broken',  label: 'Broken Links', count: broken.length,  alert: broken.length > 0 },
  ];

  return (
    <div className="flex-1 overflow-y-auto np-scrollbar">
      <PageHeader
        eyebrow="Analyze"
        title="Neural Link Graph"
        subtitle="Map every internal link — see link authority, orphan pages, and broken connections visually"
        actions={
          <button className="np-btn-primary" onClick={() => scan.mutate()} disabled={scan.isPending}>
            {scan.isPending ? <Spinner size="sm" /> : <RefreshCw className="w-4 h-4" />}
            {scan.isPending ? 'Building…' : 'Rebuild Graph'}
          </button>
        }
      />

      <div className="p-6 space-y-4">
        {isLoading ? (
          <div className="np-card p-4"><SkeletonTable /></div>
        ) : !hasData ? (
          <div className="np-card"><GraphEmpty onScan={() => scan.mutate()} isPending={scan.isPending} /></div>
        ) : (
          <>
            <StatsBar nodes={nodes} edges={edges} />

            {/* Tab bar */}
            <div className="flex gap-0.5 border-b border-gray-200">
              {TABS.map(({ id, label, count, alert }) => (
                <button key={id} onClick={() => { setTab(id); setSelectedNode(null); }}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    tab === id ? 'border-pulse-600 text-pulse-700' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}>
                  {label}
                  {count !== undefined && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      alert && count > 0 ? (id === 'broken' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700') : 'bg-gray-100 text-gray-500'
                    }`}>{count}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Graph tab */}
            {tab === 'graph' && (
              <div className="np-card overflow-hidden">
                <div className="p-4">
                  <div className="relative">
                    <LinkGraph nodes={nodes} edges={edges} onSelect={n => setSelectedNode(n)} />
                    {/* Node detail — floating overlay (top-right of graph) */}
                    {selectedNode && (
                      <div
                        className="absolute top-3 right-3 w-80 z-10 np-animate-scale-in"
                        style={{ maxHeight: 'calc(100% - 24px)', overflowY: 'auto' }}
                      >
                        <NodeDetail node={selectedNode} onClose={() => setSelectedNode(null)} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {tab === 'table'   && <LinkTable nodes={nodes} edges={edges} />}
            {tab === 'orphans' && <div className="np-card p-5"><OrphanList nodes={nodes} /></div>}
            {tab === 'broken'  && <BrokenList edges={edges} />}
          </>
        )}
      </div>
    </div>
  );
}
