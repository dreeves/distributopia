// Quals for the app as a user sees it, in headless Google Chrome: desktop with a mouse, and a
// 375px-wide phone with touch. Run all quals with `npm run qual`.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const PAGE = new URL('../index.html', import.meta.url).href
const D3 = new URL('../node_modules/d3/dist/d3.min.js', import.meta.url).pathname
const DESK = {viewport: {width: 1024, height: 800}}
const PHONE = {viewport: {width: 375, height: 667}, hasTouch: true, isMobile: true, deviceScaleFactor: 2}
const TOL = .005  // position tolerance, as a fraction of the plot's width or height

let browser
before(async () => { browser = await chromium.launch({channel: 'chrome'}) })
after(() => browser.close())

// Fresh page; d3 comes from node_modules instead of the CDN so quals run offline
async function open(opts) {
  const ctx = await browser.newContext(opts)
  await ctx.route('https://d3js.org/d3.v7.min.js', r => r.fulfill({path: D3}))
  const page = await ctx.newPage()
  page.setDefaultTimeout(5000)  // fail fast when an element never shows up
  const errs = []
  page.on('pageerror', e => errs.push(e.message))
  page.on('console', m => m.type() === 'error' && errs.push(m.text()))
  await page.goto(PAGE)
  return {page, errs}
}

// Wait two animation frames so clicks synthesized from taps have landed
const settle = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))

// Screen position of plot coordinates (u across, y up), via the plot-area rect
async function at(page, u, y) {
  const b = await page.locator('#plot .bg').boundingBox()
  return {x: b.x + u * b.width, y: b.y + (1 - y) * b.height}
}

// The pts as drawn, read back from the dots' screen positions
const pts = page => page.evaluate(() => {
  const b = document.querySelector('#plot .bg').getBoundingClientRect()
  return [...document.querySelectorAll('#plot .pt')].map(c => {
    const r = c.getBoundingClientRect()
    return {u: (r.x + r.width / 2 - b.x) / b.width, y: 1 - (r.y + r.height / 2 - b.y) / b.height}
  })
})

async function assertPts(page, want) {
  const got = await pts(page)
  const ok = got.length === want.length && got.every((p, i) => Math.abs(p.u - want[i].u) <= TOL && Math.abs(p.y - want[i].y) <= TOL)
  assert.ok(ok, `pts are ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
}

async function click(page, u, y) { const p = await at(page, u, y); await page.mouse.click(p.x, p.y) }
async function tap(page, u, y, dx = 0) { const p = await at(page, u, y); await page.touchscreen.tap(p.x + dx, p.y); await settle(page) }

async function mouseDrag(page, [u0, y0], [u1, y1]) {
  const [a, b] = [await at(page, u0, y0), await at(page, u1, y1)]
  await page.mouse.move(a.x, a.y); await page.mouse.down()
  await page.mouse.move(b.x, b.y, {steps: 8}); await page.mouse.up()
}

// Real touch events (Chrome DevTools Protocol): finger down at the first point, through the rest, up
async function touchPath(page, path) {
  const cdp = await page.context().newCDPSession(page)
  const [first, ...rest] = path
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [first]})
  for (const p of rest) await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [p]})
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []})
  await settle(page)
}

const undoOff = page => page.locator('#undo-button').isDisabled()

// ---------------------------------------------------------------------------------------- desktop

test('desktop: load → no errors, no pts, no cdf, undo grayed out', async () => {
  const {page, errs} = await open(DESK)
  await assertPts(page, [])
  assert.equal(await page.locator('#plot .cdf-line').getAttribute('d') ?? '', '')
  assert.ok(await undoOff(page))
  assert.deepEqual(errs, [])
})

test('desktop: click the graph → pt appears where clicked', async () => {
  const {page} = await open(DESK)
  await click(page, .3, .6)
  await assertPts(page, [{u: .3, y: .6}])
})

test('desktop: click a pt → pt removed', async () => {
  const {page} = await open(DESK)
  await click(page, .5, .5); await click(page, .5, .5)
  await assertPts(page, [])
})

test('desktop: drag a pt → pt moves and stays', async () => {
  const {page} = await open(DESK)
  await click(page, .5, .5)
  await mouseDrag(page, [.5, .5], [.6, .8])
  await assertPts(page, [{u: .6, y: .8}])
})

test('desktop: drag a pt past its neighbor and above the top → stops at the neighbor and the top', async () => {
  const {page} = await open(DESK)
  for (const u of [.2, .5, .8]) await click(page, u, .5)
  await mouseDrag(page, [.5, .5], [.95, 1.3])
  await assertPts(page, [{u: .2, y: .5}, {u: .8, y: 1}, {u: .8, y: .5}])
})

test('desktop: undo → steps back one edit at a time (drags included), then grays out', async () => {
  const {page} = await open(DESK)
  await click(page, .3, .5); await click(page, .7, .5)
  await mouseDrag(page, [.7, .5], [.7, .9])
  const undo = () => page.click('#undo-button')
  await undo(); await assertPts(page, [{u: .3, y: .5}, {u: .7, y: .5}])
  await undo(); await assertPts(page, [{u: .3, y: .5}])
  await undo(); await assertPts(page, [])
  assert.ok(await undoOff(page))
})

test('desktop: click a pt to remove it → exactly one undo step brings it back', async () => {
  const {page} = await open(DESK)
  await click(page, .4, .4); await click(page, .4, .4)
  await page.click('#undo-button'); await assertPts(page, [{u: .4, y: .4}])
  await page.click('#undo-button'); await assertPts(page, [])
  assert.ok(await undoOff(page))
})

test('desktop: preset buttons → load their shapes, undoably', async () => {
  const {page} = await open(DESK)
  const counts = {normal: 18, uniform: 2, exponential: 10, triangular: 3, beta: 10, lognormal: 10, bimodal: 10}
  for (const [name, n] of Object.entries(counts)) {
    await page.click(`#${name}-dist`)
    assert.equal((await pts(page)).length, n, name)
  }
  await page.click('#triangular-dist')
  await assertPts(page, [{u: 0, y: 0}, {u: .5, y: 1}, {u: 1, y: 0}])
  await page.click('#undo-button')
  assert.equal((await pts(page)).length, 10)
})

test('desktop: density with area → cdf runs from bottom-left to top-right of the plot', async () => {
  const {page} = await open(DESK)
  await click(page, .5, .8)
  const [start, end, b] = await page.evaluate(() => {
    const path = document.querySelector('#plot .cdf-line'), m = path.getScreenCTM()
    const pt = s => new DOMPoint(path.getPointAtLength(s).x, path.getPointAtLength(s).y).matrixTransform(m)
    const [s, e] = [pt(0), pt(path.getTotalLength())]
    return [[s.x, s.y], [e.x, e.y], document.querySelector('#plot .bg').getBoundingClientRect().toJSON()]
  })
  for (const [got, want] of [[start, [b.left, b.bottom]], [end, [b.right, b.top]]])
    assert.ok(Math.hypot(got[0] - want[0], got[1] - want[1]) < 1, `cdf endpoint ${got} should be at ${want}`)
})

// Left-axis tick labels as numbers, each with its height as a fraction of the plot's height
const densityTicks = page => page.evaluate(() => {
  const h = document.querySelector('#plot .bg').getBBox().height
  return [...document.querySelectorAll('#plot .y-axis .tick')].map(t => ({
    v: +t.textContent.replace('−', '-').replaceAll(',', ''),
    frac: 1 - t.transform.baseVal.consolidate().matrix.f / h, h}))
})

// Every left-axis label must equal the true density at its height, given the density at the top
async function assertDensityTop(page, top) {
  const ticks = await densityTicks(page)
  assert.ok(ticks.length >= 2, `only ${ticks.length} left-axis ticks`)
  for (const {v, frac, h} of ticks)
    assert.ok(Math.abs(v - top * frac) <= top / h, `label ${v} sits where the density is ${top * frac}`)
}

test('desktop: left axis → true density; top of the plot is 1/(area in unit square × x-range width)', async () => {
  const {page} = await open(DESK)
  assert.deepEqual(await densityTicks(page), [])  // no pts, no density, no labels
  await page.click('#triangular-dist')            // peak 1 at the middle: area 1/2 in the unit square
  await assertDensityTop(page, 2)
  await page.fill('#max-x', '4')                  // same shape spread over 0..4
  await assertDensityTop(page, .5)
})

test('desktop: set X-min/X-max → x-axis relabels, pts stay put', async () => {
  const {page} = await open(DESK)
  await click(page, .25, .5)
  await page.fill('#min-x', '10'); await page.fill('#max-x', '20')
  const ticks = await page.locator('#plot .x-axis .tick text').allTextContents()
  assert.equal(ticks[0], '10'); assert.equal(ticks.at(-1), '20')
  await assertPts(page, [{u: .25, y: .5}])
})

test('desktop: X-min not below X-max, or blank → error banner; fixed → banner gone', async () => {
  const {page} = await open(DESK)
  const banner = () => page.locator('#range-err').isVisible()
  assert.equal(await banner(), false)
  await page.fill('#min-x', '5'); assert.equal(await banner(), true)
  await page.fill('#min-x', '0'); assert.equal(await banner(), false)
  await page.fill('#max-x', ''); assert.equal(await banner(), true)
})

test('desktop: narrow the window → graph shrinks to fit, pts keep their place in the plot', async () => {
  const {page} = await open(DESK)
  await click(page, .4, .7)
  await page.setViewportSize({width: 500, height: 800}); await settle(page)
  assert.ok(Math.abs((await page.locator('#plot').boundingBox()).width - (500 - 32)) <= 1)
  await assertPts(page, [{u: .4, y: .7}])
})

// ------------------------------------------------------------------------------------------ phone

test('phone: load → no errors, no sideways scrolling, graph spans the width inside 16px gutters', async () => {
  const {page, errs} = await open(PHONE)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  assert.ok(Math.abs((await page.locator('#plot').boundingBox()).width - (375 - 32)) <= 1)
  assert.deepEqual(errs, [])
})

test('phone: axis labels not shrunk; buttons ≥ 44px tall; inputs ≥ 16px text (no iOS zoom on focus)', async () => {
  const {page} = await open(PHONE)
  const [scale, tickPx, inputPx] = await page.evaluate(() => [
    document.querySelector('#plot').getScreenCTM().a,
    parseFloat(getComputedStyle(document.querySelector('#plot .tick text')).fontSize),
    Math.min(...[...document.querySelectorAll('input')].map(e => parseFloat(getComputedStyle(e).fontSize)))])
  assert.equal(scale, 1); assert.ok(tickPx >= 10, `tick font ${tickPx}px`); assert.ok(inputPx >= 16, `input font ${inputPx}px`)
  for (const b of await page.locator('button').all()) assert.ok((await b.boundingBox()).height >= 44, await b.textContent())
})

test('phone: tap the graph → pt appears where tapped', async () => {
  const {page} = await open(PHONE)
  await tap(page, .3, .6)
  await assertPts(page, [{u: .3, y: .6}])
})

test('phone: tap 15px beside a pt → pt removed (finger-sized target)', async () => {
  const {page} = await open(PHONE)
  await tap(page, .5, .5); await tap(page, .5, .5, 15)
  await assertPts(page, [])
})

test('phone: touch-drag a pt → pt follows the finger, page does not scroll', async () => {
  const {page} = await open(PHONE)
  await tap(page, .5, .5)
  const [a, b] = [await at(page, .5, .5), await at(page, .7, .8)]
  const path = Array.from({length: 9}, (_, i) => ({x: a.x + (b.x - a.x) * i / 8, y: a.y + (b.y - a.y) * i / 8}))
  await touchPath(page, path)
  await assertPts(page, [{u: .7, y: .8}])
  assert.equal(await page.evaluate(() => scrollY), 0)
})

test('phone: tap a pt with 2px of finger wobble → still counts as a tap, pt removed', async () => {
  const {page} = await open(PHONE)
  await tap(page, .5, .5)
  const a = await at(page, .5, .5)
  await touchPath(page, [a, {x: a.x + 2, y: a.y + 1}])
  await assertPts(page, [])
})
