# Distributopia Knowledge Base

## Project Overview

Distributopia is a web-based distribution-builder tool, similar to what Metaculus offers. It allows users to create and visualize probability distributions interactively.

## Technical Stack
- HTML5
- CSS3
- JavaScript
- D3.js (version 7) for data visualization

## Key Components
1. **index.html**: The main HTML file that structures the web page.
2. **script.js**: Contains all the JavaScript code for the interactive distribution graph.
3. **style.css**: (Assumed) Contains the CSS styles for the page.

## Functionality
- Users can create and manipulate probability distributions using an interactive graph.
- The tool visualizes both Probability Density Function (PDF) and Cumulative Distribution Function (CDF).
- Users can add, move, and delete points on the graph to shape the distribution.
- The x-axis range is adjustable through input fields.

## Development Guidelines
1. Keep JavaScript code separate from HTML for better maintainability.
2. Use D3.js for all data visualization and interaction with the graph.
3. Ensure responsive design for various screen sizes.

## TODO
- Implement additional distribution types
- Add ability to save and load distributions
- Improve mobile responsiveness

## Useful Resources
- [D3.js Documentation](https://d3js.org/documentation)
- [Metaculus Distribution Builder](https://www.metaculus.com/questions/create/) (for reference)
- [D3.js Touch Support](https://github.com/d3/d3-drag#drag_touchable) (for mobile interactions)
