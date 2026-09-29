'use strict'
// The page: draws the model from math.js with d3 and turns clicks, taps, and drags into edits of
// pts. Quals: quals/ui.qual.mjs.

const M = {top: 20, right: 40, bottom: 30, left: 40}  // margins around the plot area, CSS px
const HIT = 20  // a press within this many CSS px of a pt's center grabs that pt (fingers are fat)

function $(id) { const e = document.getElementById(id); assert(e, `no element #${id}`); return e }

let pts = []       // the current pts (see math.js for the vocabulary)
const past = []    // undo stack: earlier versions of pts, newest last
let grab = -1      // index of the pt being dragged, or -1
let before = null  // pts as they were when the current drag started

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
    .attr('r', (_, i) => i === grab ? 7 : 5).attr('cx', p => X(p.u)).attr('cy', p => Y(p.y))
  $('range-err').hidden = a < b  // also shows the error for blanks, since NaN < anything is false
  $('undo-button').disabled = past.length === 0
}

// Remember prev for undo, unless pts ended up the same (as after pressing a pt without dragging)
function commit(prev) {
  if (JSON.stringify(prev) !== JSON.stringify(pts)) past.push(prev)
  render()
}

function edit(next) { const prev = pts; pts = check(next); commit(prev) }

// Index of the pt within HIT of plot-area position (x, y), or -1
const pick = (x, y) => nearest(pts.map(p => [X(p.u), Y(p.y)]), x, y, HIT)

// Mouse and touch alike: press near a pt and drag to move it; click or tap near a pt to remove it,
// or away from every pt to add one there. d3.drag keeps drags from also counting as clicks.
svg.call(d3.drag()
  .container(plot.node())
  .subject(e => { const i = pick(e.x, e.y); return i < 0 ? null : {i, x: X(pts[i].u), y: Y(pts[i].y)} })
  .on('start', e => { grab = e.subject.i; before = pts; render() })
  .on('drag', e => { pts = check(move(pts, grab, {u: X.invert(e.x), y: Y.invert(e.y)})); render() })
  .on('end', () => { grab = -1; commit(before) }))

svg.on('click', e => {
  const [x, y] = d3.pointer(e, plot.node()), i = pick(x, y)
  edit(i < 0 ? add(pts, {u: X.invert(x), y: Y.invert(y)}) : remove(pts, i))
})

$('undo-button').onclick = () => { assert(past.length > 0, 'nothing to undo'); pts = past.pop(); render() }
for (const name in PRESETS) $(`${name}-dist`).onclick = () => edit(PRESETS[name])
$('min-x').oninput = $('max-x').oninput = render

render()
new ResizeObserver(render).observe(svg.node())
