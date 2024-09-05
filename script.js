let dataHistory = [];

function saveState() {
  dataHistory.push(JSON.parse(JSON.stringify(data)));
}

function undo() {
  if (dataHistory.length > 1) {
    dataHistory.pop(); // Remove the current state
    data = dataHistory[dataHistory.length - 1];
    update();
  }
}

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
function saveState() {
  dataHistory.push(JSON.parse(JSON.stringify(data)));
}

function update() {
  saveState();
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

function undo() {
  if (dataHistory.length > 1) {
    dataHistory.pop(); // Remove the current state
    data = dataHistory[dataHistory.length - 1];
    update();
  }
}

function loadDistribution(type) {
  if (type === 'normal') {
    generateNormalDistribution();
  } else if (type === 'uniform') {
    generateUniformDistribution();
  } else if (type === 'exponential') {
    generateExponentialDistribution();
  } else if (type === 'triangular') {
    generateTriangularDistribution();
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
  
  // Add endpoints to make them visible and draggable
  data.unshift({x: minX, y: 0});
  data.push({x: maxX, y: 0});
  update();
}

function generateUniformDistribution() {
  const points = 2;
  data = [];
  const y = 1 / (maxX - minX);
  for (let i = 0; i < points; i++) {
    const x = minX + (i / (points - 1)) * (maxX - minX);
    data.push({x: x, y: y});
  }
  // Add endpoints to make them visible and draggable
  data.unshift({x: minX, y: 0});
  data.push({x: maxX, y: 0});
  update();
}

function generateExponentialDistribution() {
  const points = 10; // Reduced from 50 to 10
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
  // Add endpoints to make them visible and draggable
  data.unshift({x: minX, y: 0});
  data.push({x: maxX, y: 0});
  update();
}

function undo() {
  if (dataHistory.length > 1) {
    dataHistory.pop(); // Remove the current state
    data = dataHistory[dataHistory.length - 1];
    update();
  }
}

function saveState() {
  dataHistory.push(JSON.parse(JSON.stringify(data)));
}

document.getElementById('undo-button').addEventListener('click', undo);

document.getElementById('normal-dist').addEventListener('click', () => loadDistribution('normal'));

document.getElementById('undo-button').addEventListener('click', undo);
document.getElementById('uniform-dist').addEventListener('click', () => loadDistribution('uniform'));
document.getElementById('exponential-dist').addEventListener('click', () => loadDistribution('exponential'));

function generateTriangularDistribution() {
  const a = minX;
  const b = maxX;
  const c = (a + b) / 2; // Mode at the center
  const points = 3;
  data = [];
  for (let i = 0; i < points; i++) {
    const x = a + (i / (points - 1)) * (b - a);
    let y;
    if (x < c) {
      y = 1 * (x - a) / ((b - a) * (c - a));
    } else {
      y = 1 * (b - x) / ((b - a) * (b - c));
    }
    data.push({x: x, y: y});
  }
  // Add endpoints to make them visible and draggable
  data.unshift({x: minX, y: 0});
  data.push({x: maxX, y: 0});
  update();
}

function generateBetaDistribution() {
  const alpha = 2;
  const beta = 5;
  const points = 10;
  data = [];
  for (let i = 0; i < points; i++) {
    const x = minX + (i / (points - 1)) * (maxX - minX);
    const y = Math.pow(x, alpha - 1) * Math.pow(1 - x, beta - 1);
    data.push({x: x, y: y});
  }
  // Normalize the y values
  const maxY = Math.max(...data.map(d => d.y));
  data = data.map(d => ({x: d.x, y: d.y / maxY}));
  // Add endpoints
  data.unshift({x: minX, y: 0});
  data.push({x: maxX, y: 0});
  update();
}

function generateLognormalDistribution() {
  const mu = 0;
  const sigma = 0.5;
  const points = 10;
  data = [];
  for (let i = 0; i < points; i++) {
    const x = Math.max(minX, 0.01) + (i / (points - 1)) * (maxX - Math.max(minX, 0.01));
    const y = (1 / (x * sigma * Math.sqrt(2 * Math.PI))) * 
               Math.exp(-Math.pow(Math.log(x) - mu, 2) / (2 * Math.pow(sigma, 2)));
    data.push({x: x, y: y});
  }
  // Normalize the y values
  const maxY = Math.max(...data.map(d => d.y));
  data = data.map(d => ({x: d.x, y: d.y / maxY}));
  // Add endpoints
  data.unshift({x: minX, y: 0});
  data.push({x: maxX, y: 0});
  update();
}

function generateBimodalDistribution() {
  const points = 10;
  data = [];
  for (let i = 0; i < points; i++) {
    const x = minX + (i / (points - 1)) * (maxX - minX);
    const y = Math.exp(-Math.pow(x - 0.3, 2) / 0.02) + Math.exp(-Math.pow(x - 0.7, 2) / 0.02);
    data.push({x: x, y: y});
  }
  // Normalize the y values
  const maxY = Math.max(...data.map(d => d.y));
  data = data.map(d => ({x: d.x, y: d.y / maxY}));
  // Add endpoints
  data.unshift({x: minX, y: 0});
  data.push({x: maxX, y: 0});
  update();
}

// Add event listeners for the new buttons
document.getElementById('triangular-dist').addEventListener('click', () => loadDistribution('triangular'));
document.getElementById('beta-dist').addEventListener('click', () => loadDistribution('beta'));
document.getElementById('lognormal-dist').addEventListener('click', () => loadDistribution('lognormal'));
document.getElementById('bimodal-dist').addEventListener('click', () => loadDistribution('bimodal'));

// Modify the loadDistribution function to include the new distributions
function loadDistribution(type) {
  if (type === 'normal') {
    generateNormalDistribution();
  } else if (type === 'uniform') {
    generateUniformDistribution();
  } else if (type === 'exponential') {
    generateExponentialDistribution();
  } else if (type === 'triangular') {
    generateTriangularDistribution();
  } else if (type === 'beta') {
    generateBetaDistribution();
  } else if (type === 'lognormal') {
    generateLognormalDistribution();
  } else if (type === 'bimodal') {
    generateBimodalDistribution();
  }
}
