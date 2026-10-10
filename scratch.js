'use strict';

// Background positions use a jittered grid so the entire viewport stays populated.
const background = document.querySelector('.celebration');
const columns = 8;
const rows = 10;
const confetti = document.createDocumentFragment();
for (let i = 0; i < columns * rows; i++) {
  const emoji = document.createElement('span');
  emoji.textContent = '🎉';
  emoji.style.left = `${((i % columns) + Math.random() * .9 - .2) / columns * 100}%`;
  emoji.style.top = `${(Math.floor(i / columns) + Math.random() * .9 - .2) / rows * 100}%`;
  emoji.style.fontSize = `${18 + Math.random() * 28}px`;
  emoji.style.setProperty('--rotation', `${Math.random() * 360}deg`);
  emoji.style.setProperty('--duration', `${35 + Math.random() * 50}s`);
  emoji.style.setProperty('--direction', i % 2 ? 'reverse' : 'normal');
  confetti.append(emoji);
}
background.append(confetti);

const area = document.querySelector('.scratch-area');
const reveal = document.querySelector('.reveal');
const canvas = document.querySelector('.coating');
const context = canvas.getContext('2d');
const sample = document.createElement('canvas');
sample.width = 128;
sample.height = 128;
const sampleContext = sample.getContext('2d', { willReadFrequently: true });
const brush = document.createElement('canvas');
brush.width = brush.height = 128;
const brushContext = brush.getContext('2d');
const softness = brushContext.createRadialGradient(64, 64, 46, 64, 64, 64);
softness.addColorStop(0, 'rgba(0,0,0,1)');
softness.addColorStop(1, 'rgba(0,0,0,0)');
brushContext.fillStyle = softness;
brushContext.fillRect(0, 0, 128, 128);

let bounds;
let scaleX = 1;
let scaleY = 1;
let pointer = null;
let last = null;
let pending = [];
let frame = 0;
let lastCheck = 0;
let finished = false;
let initialized = false;

function resize() {
  if (finished) return;
  flush();
  bounds = canvas.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  // Cap backing memory even when the HTML content is exceptionally tall.
  const density = Math.min(window.devicePixelRatio || 1, 2,
    Math.sqrt(4000000 / (bounds.width * bounds.height)));
  const width = Math.max(1, Math.round(bounds.width * density));
  const height = Math.max(1, Math.round(bounds.height * density));
  if (initialized && canvas.width === width && canvas.height === height) return;
  const previous = document.createElement('canvas');
  if (initialized) {
    previous.width = canvas.width;
    previous.height = canvas.height;
    previous.getContext('2d').drawImage(canvas, 0, 0);
  }
  canvas.width = width;
  canvas.height = height;
  scaleX = width / bounds.width;
  scaleY = height / bounds.height;
  context.fillStyle = '#96999e';
  context.fillRect(0, 0, width, height);
  // Keep scratched regions when either content or viewport changes size.
  if (initialized) {
    context.globalCompositeOperation = 'destination-in';
    context.drawImage(previous, 0, 0, width, height);
  }
  context.globalCompositeOperation = 'destination-out';
  initialized = true;
  last = null;
}

function stamp(x, y, radius) {
  context.drawImage(brush, (x - radius) * scaleX, (y - radius) * scaleY,
    radius * 2 * scaleX, radius * 2 * scaleY);
}

function flush() {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  if (!initialized || finished) { pending = []; return; }
  const radius = Math.max(22, Math.min(34, bounds.width * .065));
  for (const point of pending) {
    if (last) {
      const distance = Math.hypot(point.x - last.x, point.y - last.y);
      const steps = Math.max(1, Math.ceil(distance / (radius * .22)));
      for (let i = 1; i <= steps; i++) {
        stamp(last.x + (point.x - last.x) * i / steps,
          last.y + (point.y - last.y) * i / steps, radius);
      }
    } else stamp(point.x, point.y, radius);
    last = point;
  }
  pending = [];
  const now = performance.now();
  if (now - lastCheck > 120 || pointer === null) {
    lastCheck = now;
    checkCoverage();
  }
}

function checkCoverage() {
  sampleContext.clearRect(0, 0, 128, 128);
  sampleContext.drawImage(canvas, 0, 0, 128, 128);
  const pixels = sampleContext.getImageData(0, 0, 128, 128).data;
  let alpha = 0;
  for (let i = 3; i < pixels.length; i += 4) alpha += pixels[i];
  if (1 - alpha / (255 * 128 * 128) >= .65) {
    finished = true;
    canvas.classList.add('removed');
    reveal.inert = false;
    observer.disconnect();
    if (pointer !== null && canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
    pointer = null;
    last = null;
  }
}

function queue(event) {
  const events = event.getCoalescedEvents?.();
  for (const entry of events?.length ? events : [event]) {
    pending.push({ x: entry.clientX - bounds.left, y: entry.clientY - bounds.top });
  }
  if (!frame) frame = requestAnimationFrame(flush);
}

canvas.addEventListener('pointerdown', event => {
  if (finished || pointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
  bounds = canvas.getBoundingClientRect();
  pointer = event.pointerId;
  last = null;
  canvas.setPointerCapture(pointer);
  event.preventDefault();
  queue(event);
});
canvas.addEventListener('pointermove', event => {
  if (pointer !== event.pointerId || finished) return;
  event.preventDefault();
  queue(event);
}, { passive: false });
function end(event) {
  if (pointer !== event.pointerId) return;
  if (event.type === 'pointerup') queue(event);
  pointer = null;
  flush();
  last = null;
}
canvas.addEventListener('pointerup', end);
canvas.addEventListener('pointercancel', end);
canvas.addEventListener('lostpointercapture', end);
const observer = new ResizeObserver(resize);
observer.observe(area);
window.addEventListener('resize', resize);
resize();
