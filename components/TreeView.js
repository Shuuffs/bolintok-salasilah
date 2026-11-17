'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { ChevronsUpDown, ChevronsDownUp, RotateCcw, LocateFixed, List, X, Menu } from 'lucide-react';

// Generation-colored dots (index = generation). Colors live in globals.css as --gen-1..--gen-7.
const GEN_COLORS = [1, 2, 3, 4, 5, 6, 7].map((n) => `var(--gen-${n})`);

// Real photos shown instead of the dot. Keys are matched against the start of the
// (uppercased, whitespace-collapsed) stored name, so trailing dates/parentheses are ignored.
const PHOTOS = {
  'MELANIA KUPUK': '/photos/kupuk.png',
  'MAGDALENA KINDAYAM': '/photos/kindayam.png',
  'CLEMENT MUYUK BOLINTOK': '/photos/muyuk.png',
  'SIMIN @ SIMON BOLINTOK': '/photos/simin.png',
  'BOLINTOK BIN SURAT': '/photos/bolintok.png', // root ancestor; family logo emblem as placeholder avatar
};
const photoFor = (name) => {
  const n = (name || '').replace(/\s+/g, ' ').trim().toUpperCase();
  const key = Object.keys(PHOTOS).find((k) => n === k || n.startsWith(k + ' ') || n.startsWith(k + '('));
  return key ? PHOTOS[key] : null;
};
const AVATAR_R = 16; // 32px avatar

// Single source of truth for generation color (used by nodes AND the legend).
// Generation 6+ (Gen 7+) shares the last color.
const genColor = (g) => GEN_COLORS[Math.min(g, GEN_COLORS.length - 1)];
const genLabel = (g) => (g === 0 ? 'Gen 1 (root)' : g >= GEN_COLORS.length - 1 ? `Gen ${GEN_COLORS.length}+` : `Gen ${g + 1}`);

// One motion system for every tree animation (expand/collapse, zoom/pan, first load).
// Keep in step with --motion in globals.css (buttons).
const MOTION = {
  duration: 300,            // ms, within the 200-400ms target
  ease: d3.easeCubicOut,    // ease-out: fast start, gentle settle
  stagger: 70,              // ms per depth level on first load (root outward)
  staggerMaxDepth: 4,       // caps total first-load delay at ~280ms
};
const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const motionDuration = () => (prefersReducedMotion() ? 0 : MOTION.duration);

const SCALE_MIN = 0.2;
const SCALE_MAX = 3;
// The one "correct" view: root anchored near the left edge, vertically centered, slightly zoomed out.
// Used for the first paint, "Reset view" and "Center" (never computed anywhere else).
const DEFAULT_VIEW = { x: 30, k: 0.9 };
const DX = 46;   // vertical spacing between rows
const DY = 250;  // horizontal spacing between generations

const linkGen = d3.linkHorizontal().x((d) => d.y).y((d) => d.x);
const linkPath = (s, t) => linkGen({ source: s, target: t });

export default function TreeView({ people }) {
  const svgRef = useRef(null);
  const gRef = useRef(null);
  const zoomRef = useRef(null);
  const prevIdsRef = useRef(new Set());   // ids drawn last time (to find enter/exit origins)
  const hlRef = useRef(new Set());        // highlighted path ids
  const drawRef = useRef(null);
  const [query, setQuery] = useState('');
  const [legendOpen, setLegendOpen] = useState(false);
  const [treeState, setTreeState] = useState(null); // 'all' | 'gen2' | null (custom)

  // Mobile-only actions dropdown: closes on action or outside tap / Escape.
  const [menuOpen, setMenuOpen] = useState(false);
  const toolbarRef = useRef(null);
  const runAction = (fn) => { fn(); setMenuOpen(false); };
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e) => { if (toolbarRef.current && !toolbarRef.current.contains(e.target)) setMenuOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  // Legend starts collapsed (also on first/server render); open by default only on desktop/tablet.
  useEffect(() => {
    if (window.matchMedia('(min-width: 800px)').matches) setLegendOpen(true);
  }, []);

  // Build hierarchy once; collapse everything below generation 1.
  const root = useMemo(() => {
    const byId = new Map(people.map((p) => [p.id, { ...p, children: [] }]));
    let top = null;
    for (const p of byId.values()) {
      if (p.parent_id && byId.has(p.parent_id)) byId.get(p.parent_id).children.push(p);
      else if (!p.parent_id) top = p;
    }
    if (!top) return null;
    const h = d3.hierarchy(top, (d) => d.children);
    h.each((n) => {
      if (n.depth >= 1 && n.children) { n._children = n.children; n.children = null; }
    });
    return h;
  }, [people]);

  const layout = useMemo(() => d3.tree().nodeSize([DX, DY]), []);

  // Default transform lives in a ref: computed once on mount (and refreshed if the viewport resizes).
  const defaultTransformRef = useRef(null);
  const computeDefaultTransform = () =>
    d3.zoomIdentity.translate(DEFAULT_VIEW.x, svgRef.current.clientHeight / 2).scale(DEFAULT_VIEW.k);

  const animateTo = (t) =>
    d3.select(svgRef.current).transition().duration(motionDuration()).ease(MOTION.ease)
      .call(zoomRef.current.transform, t);

  // Zoom/pan setup. useLayoutEffect runs before the browser paints, so the default transform is
  // applied once, before the first frame (no visible jump); the grow-in draw effect runs after it.
  useLayoutEffect(() => {
    const svg = d3.select(svgRef.current);
    const zoom = d3.zoom().scaleExtent([SCALE_MIN, SCALE_MAX]).on('zoom', (e) => {
      d3.select(gRef.current).attr('transform', e.transform);
    });
    zoomRef.current = zoom;
    defaultTransformRef.current = computeDefaultTransform();
    svg.call(zoom).on('dblclick.zoom', null);
    svg.call(zoom.transform, defaultTransformRef.current);
    const onResize = () => { defaultTransformRef.current = computeDefaultTransform(); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Which toolbar mode matches the current expand/collapse state?
  const deriveState = () => {
    let anyCollapsed = false;
    let gen2 = true;
    root.each((n) => {
      if (n._children) anyCollapsed = true;
      if (n.depth < 2 && n._children) gen2 = false;
      if (n.depth >= 2 && n.children) gen2 = false;
    });
    if (!anyCollapsed) return 'all';
    return gen2 ? 'gen2' : null;
  };

  // D3 data-join render: nodes and links fade + slide between positions.
  const draw = () => {
    if (!root || !gRef.current) return;
    layout(root);
    const nodes = root.descendants();
    const links = root.links();
    const ids = new Set(nodes.map((n) => n.data.id));
    const prev = prevIdsRef.current;
    const first = prev.size === 0;
    const hl = hlRef.current;
    const D = motionDuration();
    const E = MOTION.ease;
    const delay = (n) => (first && D ? Math.min(n.depth, MOTION.staggerMaxDepth) * MOTION.stagger : 0);

    // Where a new element grows from: nearest ancestor that was visible before (else the root).
    const origin = (n) => {
      let a = n.parent;
      while (a && !prev.has(a.data.id)) a = a.parent;
      return a ? { x: a.x0, y: a.y0 } : { x: root.x, y: root.y };
    };
    // Where a removed element shrinks to: nearest ancestor still visible.
    const target = (n) => {
      let a = n.parent;
      while (a && !ids.has(a.data.id)) a = a.parent;
      return a || root;
    };

    const g = d3.select(gRef.current);

    // ----- links -----
    const lsel = g.select('g.links').selectAll('path.link').data(links, (d) => d.target.data.id);
    lsel.exit().transition().duration(D).ease(E).attr('opacity', 0)
      .attr('d', (d) => { const a = target(d.target); return linkPath(a, a); }).remove();
    const lenter = lsel.enter().append('path').attr('opacity', 0)
      .attr('d', (d) => { const o = origin(d.target); return linkPath(o, o); });
    lenter.merge(lsel)
      .attr('class', (d) => 'link' + (hl.has(d.target.data.id) && hl.has(d.source.data.id) ? ' hl' : ''))
      .transition().duration(D).ease(E).delay((d) => delay(d.target))
      .attr('opacity', 1).attr('d', (d) => linkPath(d.source, d.target));

    // ----- nodes -----
    const nsel = g.select('g.nodes').selectAll('g.node').data(nodes, (d) => d.data.id);
    nsel.exit().transition().duration(D).ease(E).attr('opacity', 0)
      .attr('transform', (d) => { const a = target(d); return `translate(${a.y},${a.x})`; }).remove();
    const nenter = nsel.enter().append('g').attr('opacity', 0)
      .attr('transform', (d) => { const o = origin(d); return `translate(${o.y},${o.x})`; })
      .on('click', (e, d) => {
        e.stopPropagation(); // a node click only toggles; never reaches svg/zoom handlers
        if (!(d.children || d._children)) return;
        if (d.children) { d._children = d.children; d.children = null; }
        else { d.children = d._children; d._children = null; }
        drawRef.current();
      });
    // large invisible tap target
    nenter.append('rect').attr('x', -14).attr('y', -DX / 2).attr('width', DY - 20).attr('height', DX).attr('fill', 'transparent');
    nenter.append('image').attr('class', 'avatar').attr('x', -AVATAR_R).attr('y', -AVATAR_R)
      .attr('width', AVATAR_R * 2).attr('height', AVATAR_R * 2)
      .attr('preserveAspectRatio', 'xMidYMid slice').attr('clip-path', 'url(#avatar-clip)');
    nenter.append('circle');
    nenter.append('text').attr('class', 'name');
    nenter.append('text').attr('class', 'spouse');
    nenter.append('text').attr('class', 'count').attr('y', 4).attr('text-anchor', 'end');

    const nmerge = nenter.merge(nsel);
    const photo = (d) => photoFor(d.data.name);
    const textX = (d) => (photo(d) ? AVATAR_R + 8 : 16);
    nmerge.attr('class', (d) => 'node' + (hl.has(d.data.id) ? ' hl' : ''));
    nmerge.select('image.avatar')
      .attr('href', (d) => photo(d))
      .style('display', (d) => (photo(d) ? null : 'none'));
    // Photo nodes: the circle becomes a thin accent ring around the avatar (no generation dot).
    nmerge.select('circle')
      .attr('r', (d) => (photo(d) ? AVATAR_R : ((d.children || d._children) ? 9 : 6)))
      .style('fill', (d) => (photo(d) ? 'none' : genColor(d.data.generation)))
      .style('stroke', (d) => (photo(d) ? 'var(--accent)' : null))
      .attr('class', (d) => (d._children && !photo(d) ? 'collapsed' : null))
      .attr('stroke-width', (d) => (photo(d) ? 2 : (d._children ? 2 : 0)));
    nmerge.select('text.name').attr('x', textX).attr('y', (d) => (d.data.spouse ? -2 : 5)).text((d) => d.data.name);
    nmerge.select('text.spouse').attr('x', textX).attr('y', 14).text((d) => (d.data.spouse ? `& ${d.data.spouse}` : ''));
    nmerge.select('text.count').attr('x', (d) => (photo(d) ? -AVATAR_R - 6 : -14))
      .text((d) => (d._children ? `+${d._children.length}` : ''));
    nmerge.transition().duration(D).ease(E).delay(delay)
      .attr('opacity', 1).attr('transform', (d) => `translate(${d.y},${d.x})`);

    // Remember positions for the next transition, and keep panning inside the content bounds.
    nodes.forEach((n) => { n.x0 = n.x; n.y0 = n.y; });
    prevIdsRef.current = ids;
    if (zoomRef.current) {
      const pad = 300;
      zoomRef.current.translateExtent([
        [d3.min(nodes, (n) => n.y) - pad, d3.min(nodes, (n) => n.x) - pad],
        [d3.max(nodes, (n) => n.y) + DY + pad, d3.max(nodes, (n) => n.x) + pad],
      ]);
    }
    setTreeState(deriveState());
  };
  drawRef.current = draw;

  // Initial render (animates in from the root outward).
  useEffect(() => { drawRef.current(); }, [root]);

  const expandAll = () => {
    root.each((n) => { if (n._children) { n.children = n._children; n._children = null; } });
    draw();
  };

  // Show generations 0-2 only: nodes at depth 2 are visible but their children are hidden.
  const collapseToGen2 = () => {
    root.each((n) => {
      if (n.depth < 2 && n._children) { n.children = n._children; n._children = null; }
      else if (n.depth >= 2 && n.children) { n._children = n.children; n.children = null; }
    });
    hlRef.current = new Set();
    draw();
  };

  // Both buttons return to the stored default view; expand/collapse state is untouched.
  const goToDefaultView = () => animateTo(defaultTransformRef.current);
  const resetView = goToDefaultView;
  const centerOnRoot = goToDefaultView;

  const generations = useMemo(() => {
    if (!root) return [];
    const max = Math.min(d3.max(root.descendants().concat(allHidden(root)), (n) => n.data.generation) ?? 0, GEN_COLORS.length - 1);
    return d3.range(0, max + 1);
  }, [root]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2 || !root) return [];
    return root.descendants().concat(allHidden(root)).filter((n, i, a) => a.indexOf(n) === i)
      .filter((n) => n.data.name.toLowerCase().includes(q) || (n.data.spouse || '').toLowerCase().includes(q))
      .slice(0, 30);
  }, [query, root]);

  const jumpTo = (n) => {
    // expand path to root, highlight it, then glide to the person
    const path = [];
    for (let a = n; a; a = a.parent) path.push(a);
    path.forEach((a) => { if (a._children) { a.children = a._children; a._children = null; } });
    hlRef.current = new Set(path.map((a) => a.data.id));
    setQuery('');
    draw(); // runs layout synchronously, so n.x / n.y are current
    const { clientWidth: w, clientHeight: h } = svgRef.current;
    animateTo(d3.zoomIdentity.translate(w / 2 - n.y, h / 2 - n.x).scale(1));
  };

  if (!root) return <p className="page muted">No family data yet.</p>;

  return (
    <div className="tree-wrap">
      <div className="tree-search">
        <div className="tree-toolbar" ref={toolbarRef}>
          <input
            placeholder="Search a name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            className="btn secondary small tree-menu-btn"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-haspopup="true"
            aria-label="Tree actions"
          >
            {menuOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
          </button>
          <div className={`tree-buttons${menuOpen ? ' open' : ''}`}>
            <button className="btn secondary small" aria-pressed={treeState === 'all'} onClick={() => runAction(expandAll)}>
              <ChevronsUpDown size={18} aria-hidden="true" />Expand all
            </button>
            <button className="btn secondary small" aria-pressed={treeState === 'gen2'} onClick={() => runAction(collapseToGen2)}>
              <ChevronsDownUp size={18} aria-hidden="true" />Collapse to Gen 2
            </button>
            <button className="btn secondary small" onClick={() => runAction(resetView)}><RotateCcw size={18} aria-hidden="true" />Reset view</button>
            <button className="btn secondary small" onClick={() => runAction(centerOnRoot)}><LocateFixed size={18} aria-hidden="true" />Center</button>
          </div>
        </div>
        {matches.length > 0 && (
          <div className="tree-results">
            {matches.map((n) => (
              <button key={n.data.id} onClick={() => jumpTo(n)}>
                {n.data.name}
                {n.data.spouse && <span className="muted"> · {n.data.spouse}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      <svg ref={svgRef} className="tree-svg">
        <defs>
          <clipPath id="avatar-clip" clipPathUnits="objectBoundingBox"><circle cx=".5" cy=".5" r=".5" /></clipPath>
        </defs>
        <g ref={gRef}>
          <g className="links" />
          <g className="nodes" />
        </g>
      </svg>
      <div className="tree-legend">
        <button className="btn secondary small" onClick={() => setLegendOpen((o) => !o)} aria-expanded={legendOpen}>
          {legendOpen ? <X size={18} aria-hidden="true" /> : <List size={18} aria-hidden="true" />}
          Legend
        </button>
        {legendOpen && (
          <ul>
            {generations.map((g) => (
              <li key={g}><span className="dot" style={{ background: genColor(g) }} />{genLabel(g)}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="tree-hint">Drag to pan · pinch to zoom · tap a person to expand/collapse</div>
    </div>
  );
}

// Collect nodes hidden inside collapsed branches so search can find them.
function allHidden(root) {
  const out = [];
  (function walk(n) {
    for (const c of n.children || n._children || []) { out.push(c); walk(c); }
  })(root);
  return out;
}
