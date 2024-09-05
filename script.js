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
const cdfLine = d3.line()
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
  let cdfShift = 0;
  for (let i = 0; i < data.length - 1; i++) {
    const x1 = data[i].x;
    const y1 = data[i].y;
    const x2 = data[i + 1].x;
    const y2 = data[i + 1].y;
    
    if (x1 !== x2) {  // Check if the segment is not vertical
      // Generate points for the CDF curve
      for (let j = 0; j <= 10; j++) {
        const t = j / 10;
        const x = x1 + t * (x2 - x1);
        const cdf = ((x - x1) * (-2 * x2 * y1 + x * (y1 - y2) + x1 * (y1 + y2))) / (2 * (x1 - x2));
        cdfData.push({x: x, cdf: cdf + cdfShift});
      }
      cdfShift += ((x2 - x1) * (y1 + y2)) / 2; // Area of the trapezoid
    }
  }

  // Normalize CDF
  const maxCDF = Math.max(...cdfData.map(d => d.cdf));
  cdfData = cdfData.map(d => ({x: d.x, cdf: d.cdf / maxCDF}));

  // Update area and CDF path
  path.datum(data.filter(d => !isNaN(d.y))).attr("d", area);
  cdfPath.datum(cdfData.filter(d => !isNaN(d.cdf))).attr("d", cdfLine);

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

const drag = d3.drag()
  .on("start", function(event) {
    if (event.sourceEvent.type === 'touchstart') return;
    d3.select(this).raise().attr("r", 7);
  })
  .on("drag", function(event, d) {
    if (event.sourceEvent.type === 'touchmove') return;
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
  .on("end", function(event) {
    if (event.sourceEvent.type === 'touchend') return;
    d3.select(this).attr("r", 5);
  });

function loadDistribution() {
  const distributionType = document.getElementById('distribution-select').value;
  if (distributionType === 'normal') {
    generateNormalDistribution();
  } else if (distributionType === 'uniform') {
    generateUniformDistribution();
  } else if (distributionType === 'exponential') {
    generateExponentialDistribution();
  }
}

function generateNormalDistribution() {
  const mean = (maxX + minX) / 2;
  const stdDev = (maxX - minX) / 6; // Assuming 99.7% of data within range
  const points = 18;
  
  data = [];
  for (let i = 0; i < points; i++) {
    const x = minX + (i / (points - 1)) * (maxX - minX);
    const y = (1 / (stdDev * Math.sqrt(2 * Math.PI))) * 
               Math.exp(-0.5 * Math.pow((x - mean) / stdDev, 2));
    data.push({x: x, y: y});
  }
  
  // Normalize the y values
  const maxY = Math.max(...data.map(d => d.y));
  data = data.map(d => ({x: d.x, y: d.y / maxY}));
  
  update();
}

function generateUniformDistribution() {
  const points = 3;
  data = [];
  const y = 1 / (maxX - minX);
  for (let i = 0; i < points; i++) {
    const x = minX + (i / (points - 1)) * (maxX - minX);
    data.push({x: x, y: y});
  }
  update();
}

function generateExponentialDistribution() {
  const points = 20;
  const rate = 1 / ((maxX - minX) / 5); // Assuming mean is 1/5 of the range
  data = [];
  for (let i = 0; i < points; i++) {
    const x = minX + (i / (points - 1)) * (maxX - minX);
    const y = rate * Math.exp(-rate * (x - minX));
    data.push({x: x, y: y});
  }
  // Normalize the y values
  const maxY = Math.max(...data.map(d => d.y));
  data = data.map(d => ({x: d.x, y: d.y / maxY}));
  update();
}

// Add event listener for the load distribution button
document.getElementById('load-distribution').addEventListener('click', loadDistribution);
