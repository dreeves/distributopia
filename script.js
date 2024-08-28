let minX = 0;
let maxX = 1;

const svg = d3.select("svg");
const margin = {top: 20, right: 60, bottom: 30, left: 40};
const width = +svg.attr("width") - margin.left - margin.right;
const height = +svg.attr("height") - margin.top - margin.bottom;
const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

// X axis
const x = d3.scaleLinear().domain([minX, maxX]).range([0, width]);
const xAxis = g.append("g")
  .attr("transform", `translate(0,${height})`)
  .call(d3.axisBottom(x));

// Left Y axis (PDF)
const y = d3.scaleLinear().domain([0, 1]).range([height, 0]);
const yAxis = g.append("g")
  .call(d3.axisLeft(y))
  .attr("color", "steelblue");  // Change color to blue

// Right Y axis (CDF)
const yRight = d3.scaleLinear().domain([0, 1]).range([height, 0]);
g.append("g")
  .attr("transform", `translate(${width},0)`)
  .call(d3.axisRight(yRight))
  .attr("color", "red");  // Change color to red

// Area under the curve (PDF)
const area = d3.area()
  .x(d => x(d.x))
  .y0(height)
  .y1(d => y(d.y));

// Line for CDF
const line = d3.line()
  .x(d => x(d.x))
  .y(d => yRight(d.cdf));

let data = [{x: minX, y: 0}, {x: maxX, y: 0}];
let cdfData = [];

const path = g.append("path")
  .datum(data)
  .attr("class", "area")
  .attr("d", area);

const cdfPath = g.append("path")
  .datum(cdfData)
  .attr("class", "cdf-line");

// Function to update the area, CDF, and handles
function update() {
  // Update scales
  x.domain([minX, maxX]);
  xAxis.call(d3.axisBottom(x));

  // Calculate CDF
  cdfData = [];
  let cumulative = 0;
  for (let i = 0; i < data.length; i++) {
    cumulative += data[i].y * (i === 0 ? data[i].x : data[i].x - data[i-1].x);
    cdfData.push({x: data[i].x, cdf: cumulative});
  }
  const maxCDF = cumulative;
  cdfData = cdfData.map(d => ({x: d.x, cdf: d.cdf / maxCDF}));

  // Update area and CDF path
  path.datum(data).attr("d", area);
  cdfPath.datum(cdfData).attr("d", line);

  // Update handles
  const handles = g.selectAll(".handle").data(data.slice(1, -1), d => d.x);
  handles.enter().append("circle")
    .attr("class", "handle")
    .attr("r", 5)
    .attr("cx", d => x(d.x))
    .attr("cy", d => y(d.y))
    .call(d3.drag()
      .on("start", function(event) {
        d3.select(this).raise().attr("r", 7);
      })
      .on("drag", function(event, d) {
        const coords = d3.pointer(event, g.node());
        const newX = x.invert(coords[0]);
        
        // Find the index of the current dot
        const index = data.indexOf(d);
        
        // Constrain x between the previous and next dot
        const minX = index > 0 ? data[index - 1].x : x.domain()[0];
        const maxX = index < data.length - 1 ? data[index + 1].x : x.domain()[1];
        
        d.x = Math.max(minX, Math.min(maxX, newX));
        d.y = Math.max(0, Math.min(1, y.invert(coords[1])));
        
        d3.select(this).attr("cx", x(d.x)).attr("cy", y(d.y));
        update();
      })
      .on("end", function() {
        d3.select(this).attr("r", 5);
      }))
    .merge(handles)
    .attr("cx", d => x(d.x))
    .attr("cy", d => y(d.y))
    .on("click", function(event, d) {
      event.stopPropagation();
      data = data.filter(p => p !== d);
      update();
    });

  handles.exit().remove();
}

// Click event to add points
svg.on("click", function(event) {
  const coords = d3.pointer(event, g.node());
  const newX = Math.max(minX, Math.min(maxX, x.invert(coords[0])));
  const newY = Math.max(0, Math.min(1, y.invert(coords[1])));
  data.push({x: newX, y: newY});
  data.sort((a, b) => a.x - b.x);
  update();
});

// Event listeners for the min and max inputs
d3.select("#min-x").on("input", function() {
  minX = +this.value;
  data[0].x = minX;
  update();
});

d3.select("#max-x").on("input", function() {
  maxX = +this.value;
  data[data.length - 1].x = maxX;
  update();
});

update();
