'use strict'
// The page: draws the model from math.js with d3 and turns clicks, taps, and drags into edits of
// pts. Quals: quals/ui.qual.mjs.

const M = {top: 20, right: 40, bottom: 30, left: 40}  // margins around the plot area, CSS px
const HIT = 20  // a press within this many CSS px of a pt's center grabs that pt (fingers are fat)
const TAP = 15  // a finger straying less than this many CSS px is tapping, not dragging (as in
                // Leaflet's tapTolerance); for a mouse, any movement at all is a drag
const STEP = .05  // spacing of the dots a drag from a blank spot leaves along its path: 5% of the plot width, any direction

function $(id) { const e = document.getElementById(id); assert(e, `no element #${id}`); return e }

let pts = []       // the current pts (see math.js for the vocabulary)
const past = []    // undo stack: earlier versions of pts, newest last
const future = []  // redo stack: versions of pts that undo stepped back from, newest last

// The press in progress, from pointer down to pointer up ({i: -1} between presses):
//   before  pts at the press
//   i       index of the pt pressed, or -1 for a blank spot
//   path    where the pointer has been, in unit coordinates
//   tol     how far the pointer may stray, CSS px, and still be tapping
//   tap     whether it has stayed within tol so far
let press = {i: -1}

const svg = d3.select('#plot')
const plot = svg.append('g')                        // plot area, CSS px from its top-left
const bg = plot.append('rect').attr('class', 'bg')  // outline of the plot area
const unit = plot.append('g')                       // unit square: (0,0) bottom-left, (1,1) top-right
const area = unit.append('path').attr('class', 'area')
const cdfLine = unit.append('path').attr('class', 'cdf-line')
const xAxis = plot.append('g').attr('class', 'x-axis')
const yAxis = plot.append('g').attr('class', 'y-axis')      // left: pdf (true density)
const cdfAxis = plot.append('g').attr('class', 'cdf-axis')  // right: cdf
const dots = plot.append('g')
const X = d3.scaleLinear([0, 1], [0, 1])  // u to CSS px in the plot area; range set by render()
const Y = d3.scaleLinear([0, 1], [1, 0])  // y to CSS px in the plot area; range set by render()

// Redraw everything from pts, the X-min/X-max inputs, and the svg's current size
function render() {
  const {width, height} = svg.node().getBoundingClientRect()
  const w = width - M.left - M.right, h = height - M.top - M.bottom
  const [a, b] = [$('min-x').valueAsNumber, $('max-x').valueAsNumber]  // NaN when blank
  const P = poly(check(pts)), A = cum(P).at(-1)  // A: area under poly in the unit square
  X.range([0, w]); Y.range([h, 0])
  plot.attr('transform', `translate(${M.left},${M.top})`)
  bg.attr('width', w).attr('height', h)
  unit.attr('transform', `translate(0,${h}) scale(${w},${-h})`)
  area.attr('d', areaD(P))
  cdfLine.attr('d', A > 0 ? cdfD(P) : null)  // a density with zero area has no cdf
  xAxis.attr('transform', `translate(0,${h})`).call(d3.axisBottom(d3.scaleLinear([a, b], [0, w])).ticks(w / 60))
  // Density at the plot's top: drawn height 1 over the area in x units, A·(b−a). With zero area
  // that's Infinity (NaN for a blank range), for which d3 draws no ticks.
  yAxis.call(d3.axisLeft(d3.scaleLinear([0, 1 / (A * (b - a))], [h, 0])).ticks(h / 40))
  cdfAxis.attr('transform', `translate(${w},0)`).call(d3.axisRight(Y).ticks(h / 40))
  dots.selectAll('circle').data(pts).join('circle').attr('class', 'pt')
    .attr('r', (_, i) => i === press.i ? 7 : 5).attr('cx', p => X(p.u)).attr('cy', p => Y(p.y))
  $('range-err').hidden = a < b  // also shows the error for blanks, since NaN < anything is false
  $('undo-button').disabled = past.length === 0
  $('redo-button').disabled = future.length === 0
}

// Remember prev for undo and forget anything to redo, unless pts ended up the same (as after
// pressing a pt without dragging)
function commit(prev) {
  if (JSON.stringify(prev) !== JSON.stringify(pts)) { past.push(prev); future.length = 0 }
  render()
}

// Undo or redo: put the current pts on one stack and take the newest pts off the other
function step(from, to) {
  assert(from.length > 0, 'nothing to step to')
  to.push(pts); pts = from.pop(); render()
}

function edit(next) { const prev = pts; pts = check(next); commit(prev) }

// Index of the pt within HIT of plot-area position (x, y), or -1
const pick = (x, y) => nearest(pts.map(p => [X(p.u), Y(p.y)]), x, y, HIT)

// pts for the press so far (done: the pointer is up). From a blank spot: before plus a trail of
// dots, only the one at the press while it's still a tap. On a pt: a drag moves the pt as far as the
// pointer has moved; a tap removes it when the pointer comes up.
function pressed(done) {
  const {before, i, path, tap} = press, [p0, p] = [path[0], path.at(-1)]
  const aspect = Y.range()[0] / X.range()[1]  // plot height over width, so trail spaces dots evenly on screen
  return i < 0 ? add(before, ...trail(tap ? [p0] : path, STEP, aspect))
       : tap ? (done ? remove(before, i) : before)
       : move(before, i, {u: before[i].u + p.u - p0.u, y: before[i].y + p.y - p0.y})
}

const at = e => ({u: X.invert(e.x), y: Y.invert(e.y)})  // where a drag event is, in unit coordinates

// Every press, mouse or finger, is one gesture (see pressed) and one undo step. No click handlers:
// the gesture itself tells taps from drags, with a tolerance for finger drift.
svg.call(d3.drag()
  .container(plot.node())
  .subject(e => ({x: e.x, y: e.y}))  // where the pointer went down; e.x - e.subject.x is how far it's gone
  .on('start', e => {
    press = {before: pts, i: pick(e.x, e.y), path: [at(e)], tol: e.identifier === 'mouse' ? 0 : TAP, tap: true}
    pts = check(pressed(false)); render()
  })
  .on('drag', e => {
    press.path.push(at(e))
    press.tap = press.tap && Math.hypot(e.x - e.subject.x, e.y - e.subject.y) <= press.tol
    pts = check(pressed(false)); render()
  })
  .on('end', () => { pts = check(pressed(true)); const {before} = press; press = {i: -1}; commit(before) }))

$('undo-button').onclick = () => step(past, future)
$('redo-button').onclick = () => step(future, past)
for (const name in PRESETS) $(`${name}-dist`).onclick = () => edit(PRESETS[name])
$('min-x').oninput = $('max-x').oninput = render

render()
new ResizeObserver(render).observe(svg.node())
