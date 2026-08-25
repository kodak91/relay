import { useEffect, useRef } from 'react';

// Relay 톤에 맞춘 팔레트 (LeftSidebar의 워크스페이스 색과 같은 oklch 어휘, 새 색조 추가는 최소화)
const KIND_COLORS = [
  'oklch(0.72 0.17 270)', // 바이올렛 (Relay 강조색)
  'oklch(0.66 0.14 160)', // 에메랄드
  'oklch(0.70 0.15 70)',  // 앰버
  'oklch(0.62 0.18 25)',  // 로즈
  'oklch(0.62 0.10 230)', // 슬레이트-블루
  'oklch(0.68 0.14 320)', // 마젠타
];
function colorForKind(kind) {
  let h = 0;
  for (let i = 0; i < kind.length; i++) h = (h * 31 + kind.charCodeAt(i)) >>> 0;
  return KIND_COLORS[h % KIND_COLORS.length];
}

function bfsPath(edges, fromId, toId) {
  const adj = new Map();
  edges.forEach((e) => {
    if (!adj.has(e.source)) adj.set(e.source, []);
    if (!adj.has(e.target)) adj.set(e.target, []);
    adj.get(e.source).push(e.target);
    adj.get(e.target).push(e.source);
  });
  const prev = new Map([[fromId, null]]);
  const queue = [fromId];
  while (queue.length) {
    const cur = queue.shift();
    if (cur === toId) break;
    for (const next of adj.get(cur) || []) {
      if (!prev.has(next)) { prev.set(next, cur); queue.push(next); }
    }
  }
  if (!prev.has(toId)) return [];
  const path = [];
  let cur = toId;
  while (cur !== null) { path.push(cur); cur = prev.get(cur); }
  return path.reverse();
}

export default function GraphCanvas({ nodes, edges, selectedId, onSelect }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  // 시뮬레이션/인터랙션 상태는 전부 ref에 — 매 프레임 React 리렌더를 피한다.
  const stateRef = useRef({
    pos: new Map(),      // id -> {x,y,vx,vy,fixed}
    view: { x: 0, y: 0, scale: 1 },
    hoverId: null,
    selectedId: null,
    shiftAnchorId: null,
    pathIds: new Set(),
    dragging: null,      // node id being dragged, or 'pan'
    dragStart: null,
    pulses: [],          // 유휴 상태에서 흐르는 빛 {edge, t0}
  });

  // nodes/edges가 바뀔 때만 위치 초기화(기존 위치는 최대한 유지)
  useEffect(() => {
    const { pos } = stateRef.current;
    const seen = new Set();
    nodes.forEach((n, i) => {
      seen.add(n.id);
      if (!pos.has(n.id)) {
        const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2;
        const r = 120 + Math.random() * 200;
        pos.set(n.id, { x: Math.cos(angle) * r, y: Math.sin(angle) * r, vx: 0, vy: 0, fixed: false });
      }
    });
    [...pos.keys()].forEach((id) => { if (!seen.has(id)) pos.delete(id); });
  }, [nodes]);

  useEffect(() => { stateRef.current.selectedId = selectedId; }, [selectedId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let width = 0, height = 0;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      width = rect.width; height = rect.height;
      canvas.width = width * dpr; canvas.height = height * dpr;
      canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const CELL = 90;

    function toWorld(px, py) {
      const { view } = stateRef.current;
      return { x: (px - width / 2 - view.x) / view.scale, y: (py - height / 2 - view.y) / view.scale };
    }
    function toScreen(x, y) {
      const { view } = stateRef.current;
      return { x: x * view.scale + width / 2 + view.x, y: y * view.scale + height / 2 + view.y };
    }
    function nodeRadius(n) { return 5 + Math.sqrt(n.degree) * 2.6; }

    function nodeAt(px, py) {
      const { pos } = stateRef.current;
      const w = toWorld(px, py);
      let best = null, bestD = Infinity;
      for (const n of nodes) {
        const p = pos.get(n.id); if (!p) continue;
        const d = Math.hypot(p.x - w.x, p.y - w.y);
        const r = nodeRadius(n) + 4;
        if (d < r && d < bestD) { best = n; bestD = d; }
      }
      return best;
    }

    // ── 물리 시뮬레이션: 격자로 근처만 밀어내서 O(n)에 가깝게 ──
    function tick() {
      const { pos } = stateRef.current;
      const grid = new Map();
      const cellOf = (x, y) => `${Math.floor(x / CELL)}:${Math.floor(y / CELL)}`;
      nodes.forEach((n) => {
        const p = pos.get(n.id);
        const key = cellOf(p.x, p.y);
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(n.id);
      });

      nodes.forEach((n) => {
        const p = pos.get(n.id);
        if (p.fixed) return;
        let fx = 0, fy = 0;
        const cx = Math.floor(p.x / CELL), cy = Math.floor(p.y / CELL);
        for (let gx = cx - 1; gx <= cx + 1; gx++) {
          for (let gy = cy - 1; gy <= cy + 1; gy++) {
            const bucket = grid.get(`${gx}:${gy}`);
            if (!bucket) continue;
            for (const otherId of bucket) {
              if (otherId === n.id) continue;
              const q = pos.get(otherId);
              const dx = p.x - q.x, dy = p.y - q.y;
              const d2 = dx * dx + dy * dy || 0.01;
              if (d2 > CELL * CELL) continue;
              const f = 900 / d2;
              fx += (dx / Math.sqrt(d2)) * f;
              fy += (dy / Math.sqrt(d2)) * f;
            }
          }
        }
        // 중심으로 약하게 당김 (그래프가 무한히 퍼지지 않게)
        fx += -p.x * 0.004;
        fy += -p.y * 0.004;
        p.vx = (p.vx + fx) * 0.82;
        p.vy = (p.vy + fy) * 0.82;
      });

      edges.forEach((e) => {
        const a = pos.get(e.source), b = pos.get(e.target);
        if (!a || !b) return;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        const target = 70;
        const f = (dist - target) * 0.02;
        const nx = dx / dist, ny = dy / dist;
        if (!a.fixed) { a.vx += nx * f; a.vy += ny * f; }
        if (!b.fixed) { b.vx -= nx * f; b.vy -= ny * f; }
      });

      nodes.forEach((n) => {
        const p = pos.get(n.id);
        if (p.fixed) return;
        p.x += p.vx; p.y += p.vy;
      });
    }

    // ── 유휴 시 임의의 선을 따라 옅은 빛이 흐르는 연출 ──
    let idleTimer = setInterval(() => {
      if (edges.length === 0) return;
      const e = edges[Math.floor(Math.random() * edges.length)];
      stateRef.current.pulses.push({ edge: e, t0: performance.now() });
    }, 2600);

    function draw() {
      const s = stateRef.current;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg') || '#111';
      ctx.fillRect(0, 0, width, height);

      const hoverNode = s.hoverId ? nodeById.get(s.hoverId) : null;
      const focusSet = hoverNode
        ? new Set([s.hoverId, ...edges.filter((e) => e.source === s.hoverId || e.target === s.hoverId)
            .map((e) => (e.source === s.hoverId ? e.target : e.source))])
        : null;

      // 간선
      edges.forEach((e) => {
        const a = s.pos.get(e.source), b = s.pos.get(e.target);
        if (!a || !b) return;
        const pa = toScreen(a.x, a.y), pb = toScreen(b.x, b.y);
        const onPath = s.pathIds.has(e.source) && s.pathIds.has(e.target);
        const dimmed = focusSet && !(focusSet.has(e.source) && focusSet.has(e.target));
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        if (onPath) {
          ctx.strokeStyle = 'oklch(0.72 0.17 270)';
          ctx.lineWidth = 2.2;
          ctx.globalAlpha = 1;
        } else {
          ctx.strokeStyle = 'var(--border)';
          ctx.lineWidth = 1;
          ctx.globalAlpha = dimmed ? 0.08 : 0.4;
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      });

      // 유휴 펄스
      const now = performance.now();
      s.pulses = s.pulses.filter((p) => now - p.t0 < 900);
      s.pulses.forEach((p) => {
        const a = s.pos.get(p.edge.source), b = s.pos.get(p.edge.target);
        if (!a || !b) return;
        const t = (now - p.t0) / 900;
        const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
        const pt = toScreen(x, y);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = 'oklch(0.85 0.14 270)';
        ctx.globalAlpha = 1 - Math.abs(t - 0.5) * 1.4;
        ctx.fill();
        ctx.globalAlpha = 1;
      });

      // 노드 (연결 많은 것부터 그려서, 라벨이 큰 노드 우선권을 갖게)
      const sorted = [...nodes].sort((a, b) => b.degree - a.degree);
      const placedLabels = [];
      sorted.forEach((n) => {
        const p = s.pos.get(n.id);
        if (!p) return;
        const pt = toScreen(p.x, p.y);
        const r = nodeRadius(n) * s.view.scale;
        const dimmed = focusSet && !focusSet.has(n.id);
        const isSelected = n.id === s.selectedId;
        const onPath = s.pathIds.has(n.id);

        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
        ctx.fillStyle = colorForKind(n.kind);
        ctx.globalAlpha = dimmed ? 0.1 : 1;
        ctx.fill();
        if (isSelected || onPath) {
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#fff';
          ctx.globalAlpha = dimmed ? 0.1 : 0.9;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

        if (!dimmed && r > 3) {
          const label = n.title;
          ctx.font = '11px var(--font-sans), sans-serif';
          const w = ctx.measureText(label).width;
          const box = { x1: pt.x - w / 2 - 2, y1: pt.y + r + 2, x2: pt.x + w / 2 + 2, y2: pt.y + r + 14 };
          const overlaps = placedLabels.some((b) =>
            box.x1 < b.x2 && box.x2 > b.x1 && box.y1 < b.y2 && box.y2 > b.y1
          );
          if (!overlaps) {
            placedLabels.push(box);
            ctx.fillStyle = 'var(--ink)';
            ctx.textAlign = 'center';
            ctx.fillText(label, pt.x, pt.y + r + 12);
          }
        }
      });

      raf = requestAnimationFrame(() => { tick(); draw(); });
    }

    draw();

    // ── 인터랙션 ──
    function onMouseDown(e) {
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      const hit = nodeAt(px, py);
      if (hit) {
        stateRef.current.dragging = hit.id;
      } else {
        stateRef.current.dragging = 'pan';
        stateRef.current.dragStart = { x: e.clientX, y: e.clientY, view: { ...stateRef.current.view } };
      }
    }
    function onMouseMove(e) {
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      const s = stateRef.current;
      if (s.dragging === 'pan' && s.dragStart) {
        s.view.x = s.dragStart.view.x + (e.clientX - s.dragStart.x);
        s.view.y = s.dragStart.view.y + (e.clientY - s.dragStart.y);
      } else if (s.dragging) {
        const w = toWorld(px, py);
        const p = s.pos.get(s.dragging);
        if (p) { p.x = w.x; p.y = w.y; p.fixed = true; }
      } else {
        const hit = nodeAt(px, py);
        s.hoverId = hit ? hit.id : null;
        canvas.style.cursor = hit ? 'pointer' : 'grab';
      }
    }
    function onMouseUp(e) {
      const s = stateRef.current;
      if (s.dragging && s.dragging !== 'pan') {
        const p = s.pos.get(s.dragging);
        if (p) p.fixed = false;
        const rect = canvas.getBoundingClientRect();
        const hit = nodeAt(e.clientX - rect.left, e.clientY - rect.top);
        if (hit && hit.id === s.dragging) handleClick(hit, e);
      }
      s.dragging = null;
      s.dragStart = null;
    }
    function handleClick(node, e) {
      const s = stateRef.current;
      if (e.shiftKey && s.selectedId && s.selectedId !== node.id) {
        s.pathIds = new Set(bfsPath(edges, s.selectedId, node.id));
      } else {
        s.pathIds = new Set();
        onSelect(node.id);
      }
    }
    function onWheel(e) {
      e.preventDefault();
      const s = stateRef.current;
      const factor = Math.exp(-e.deltaY * 0.001);
      s.view.scale = Math.min(4, Math.max(0.2, s.view.scale * factor));
    }
    function onLeave() { stateRef.current.hoverId = null; }

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('mouseleave', onLeave);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(idleTimer);
      ro.disconnect();
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('mouseleave', onLeave);
    };
  }, [nodes, edges, onSelect]);

  return (
    <div ref={wrapRef} className="aide-graph-wrap">
      <canvas ref={canvasRef} className="aide-graph-canvas" />
    </div>
  );
}
