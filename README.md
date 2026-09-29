me in the manifold discord on 2024-07-23:

i've been wanting a distribution-builder for a long time, like metaculus has, and it occurred to me today that chatgpt could, with nonzero probability, throw something usable together. here's what it has so far: https://distributopia.dreev.es/

update: it's all wrong and chatgpt is hopelessly confused trying to fix it. it did make more progress than claude 3.5 sonnet though.

But then I got it working with Manicode. Yay!


## Wishlist

1. A redo button
2. Dragging from a blank spot on the graph makes a stream of dots spaced, say, at 5% of the domain
3. Pick a better red; think about accessibility
4. Do all the favicon and link-preview stuff

## The Math

Here's how to get the cdf from a segment of the piecewise-linear density function.
Say the density function (the thing the user is drawing) starts at (x1,x2) and
goes to (x2,y2). 
Then we can get the cdf for that segment like so:

```
m = (y2-y1)/(x2-x1);
b = y1 - m*x1;
Integrate[m*x + b, {t, x1, x}]
```

which yields this:

`((x-x1)*(x2*y1 - x1*y2 + x*(y2-y1))) / (x2-x1)`
