// "emergence" — a particle-life sandbox.
//
// Every particle belongs to a type. Every ordered pair of types (A, B) has a
// signed attraction coefficient, drawn once from a random matrix. Each frame,
// every particle feels a short-range push away from everything near it and a
// longer-range pull or push from everything else, weighted by that
// coefficient. There is no global rule for what should happen — clusters,
// orbits, chases and dead zones all fall out of the matrix by accident.

(() => {
  const canvas = document.getElementById("scene");
  const ctx = canvas.getContext("2d");
  const matrixCanvas = document.getElementById("matrix");
  const matrixCtx = matrixCanvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const state = {
    width: 0,
    height: 0,
    numTypes: 5,
    countPerType: 150,
    forceScale: 1.0,
    friction: 0.35, // fraction of velocity removed per frame
    rMax: 80,
    beta: 0.3, // near-field repulsion zone, as a fraction of rMax
    paused: false,
    colors: [],
    matrix: [],
    x: new Float32Array(0),
    y: new Float32Array(0),
    vx: new Float32Array(0),
    vy: new Float32Array(0),
    type: new Int16Array(0),
    mouse: { x: 0, y: 0, active: false, sign: 1 },
  };

  // Half-stencil neighbor offsets: every unordered pair of cells (including a
  // cell with itself) is visited exactly once when this list is combined with
  // "only pair i<j within the same cell".
  const CELL_OFFSETS = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
    [-1, 1],
  ];

  function resize() {
    state.width = window.innerWidth;
    state.height = window.innerHeight;
    canvas.width = state.width * dpr;
    canvas.height = state.height * dpr;
    canvas.style.width = state.width + "px";
    canvas.style.height = state.height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#05070a";
    ctx.fillRect(0, 0, state.width, state.height);
  }

  function hslColor(i, n) {
    const hue = (360 * i) / n;
    return `hsl(${hue.toFixed(0)}, 75%, 62%)`;
  }

  function buildTypes(n) {
    state.numTypes = n;
    state.colors = Array.from({ length: n }, (_, i) => hslColor(i, n));
    randomizeMatrix();
  }

  function randomizeMatrix() {
    const n = state.numTypes;
    const m = [];
    for (let i = 0; i < n; i++) {
      const row = [];
      for (let j = 0; j < n; j++) {
        row.push(+(Math.random() * 2 - 1).toFixed(3));
      }
      m.push(row);
    }
    state.matrix = m;
    drawMatrix();
  }

  function scatter() {
    const n = state.numTypes * state.countPerType;
    state.x = new Float32Array(n);
    state.y = new Float32Array(n);
    state.vx = new Float32Array(n);
    state.vy = new Float32Array(n);
    state.type = new Int16Array(n);
    let k = 0;
    for (let t = 0; t < state.numTypes; t++) {
      for (let c = 0; c < state.countPerType; c++) {
        state.x[k] = Math.random() * state.width;
        state.y[k] = Math.random() * state.height;
        state.vx[k] = 0;
        state.vy[k] = 0;
        state.type[k] = t;
        k++;
      }
    }
  }

  function forceCurve(r, a, beta) {
    if (r < beta) return r / beta - 1;
    if (r < 1) return a * (1 - Math.abs(2 * r - 1 - beta) / (1 - beta));
    return 0;
  }

  // Bucket particle indices into a grid so we only test nearby pairs.
  function buildGrid(cellSize) {
    const cols = Math.max(1, Math.ceil(state.width / cellSize));
    const rows = Math.max(1, Math.ceil(state.height / cellSize));
    const grid = new Array(cols * rows);
    for (let i = 0; i < grid.length; i++) grid[i] = [];
    const n = state.x.length;
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(state.x[i] / cellSize) % cols;
      const cy = Math.floor(state.y[i] / cellSize) % rows;
      grid[cy * cols + cx].push(i);
    }
    return { grid, cols, rows };
  }

  function step() {
    const n = state.x.length;
    if (n === 0) return;

    const ax = new Float32Array(n);
    const ay = new Float32Array(n);
    const { width, height, rMax, beta, matrix, forceScale } = state;
    const cellSize = rMax;
    const { grid, cols, rows } = buildGrid(cellSize);
    const halfW = width / 2;
    const halfH = height / 2;

    function interact(i, j) {
      let dx = state.x[j] - state.x[i];
      let dy = state.y[j] - state.y[i];
      if (dx > halfW) dx -= width;
      else if (dx < -halfW) dx += width;
      if (dy > halfH) dy -= height;
      else if (dy < -halfH) dy += height;
      const dist = Math.hypot(dx, dy);
      if (dist < 1e-4 || dist >= rMax) return;
      const r = dist / rMax;
      const nx = dx / dist;
      const ny = dy / dist;

      const fOnI = forceCurve(r, matrix[state.type[i]][state.type[j]], beta);
      ax[i] += nx * fOnI;
      ay[i] += ny * fOnI;

      const fOnJ = forceCurve(r, matrix[state.type[j]][state.type[i]], beta);
      ax[j] -= nx * fOnJ;
      ay[j] -= ny * fOnJ;
    }

    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const cellA = grid[cy * cols + cx];
        // self-pairs within this cell
        for (let a = 0; a < cellA.length; a++) {
          for (let b = a + 1; b < cellA.length; b++) {
            interact(cellA[a], cellA[b]);
          }
        }
        for (const [ox, oy] of CELL_OFFSETS) {
          if (ox === 0 && oy === 0) continue;
          const nx = ((cx + ox) % cols + cols) % cols;
          const ny = ((cy + oy) % rows + rows) % rows;
          const cellB = grid[ny * cols + nx];
          for (let a = 0; a < cellA.length; a++) {
            for (let b = 0; b < cellB.length; b++) {
              interact(cellA[a], cellB[b]);
            }
          }
        }
      }
    }

    if (state.mouse.active) {
      const mr = 160;
      const sign = state.mouse.sign;
      for (let i = 0; i < n; i++) {
        let dx = state.mouse.x - state.x[i];
        let dy = state.mouse.y - state.y[i];
        if (dx > halfW) dx -= width;
        else if (dx < -halfW) dx += width;
        if (dy > halfH) dy -= height;
        else if (dy < -halfH) dy += height;
        const dist = Math.hypot(dx, dy);
        if (dist < 1e-4 || dist >= mr) continue;
        const pull = sign * (1 - dist / mr) * 2.2;
        ax[i] += (dx / dist) * pull;
        ay[i] += (dy / dist) * pull;
      }
    }

    const retain = 1 - state.friction;
    for (let i = 0; i < n; i++) {
      state.vx[i] = (state.vx[i] + ax[i] * forceScale * 60) * retain;
      state.vy[i] = (state.vy[i] + ay[i] * forceScale * 60) * retain;
      let nx = state.x[i] + state.vx[i] * (1 / 60);
      let ny = state.y[i] + state.vy[i] * (1 / 60);
      nx = ((nx % width) + width) % width;
      ny = ((ny % height) + height) % height;
      state.x[i] = nx;
      state.y[i] = ny;
    }
  }

  function render() {
    ctx.fillStyle = "rgba(5, 7, 10, 0.18)";
    ctx.fillRect(0, 0, state.width, state.height);
    const n = state.x.length;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = state.colors[state.type[i]];
      ctx.beginPath();
      ctx.arc(state.x[i], state.y[i], 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawMatrix() {
    const n = state.numTypes;
    const size = matrixCanvas.clientWidth || 220;
    matrixCanvas.width = size * dpr;
    matrixCanvas.height = size * dpr;
    matrixCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cell = size / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const v = state.matrix[i][j];
        const alpha = Math.min(1, Math.abs(v));
        matrixCtx.fillStyle =
          v >= 0 ? `rgba(110, 231, 183, ${alpha})` : `rgba(248, 113, 113, ${alpha})`;
        matrixCtx.fillRect(j * cell, i * cell, cell, cell);
      }
    }
    matrixCtx.strokeStyle = "rgba(255,255,255,0.15)";
    for (let i = 0; i <= n; i++) {
      matrixCtx.beginPath();
      matrixCtx.moveTo(i * cell, 0);
      matrixCtx.lineTo(i * cell, size);
      matrixCtx.stroke();
      matrixCtx.beginPath();
      matrixCtx.moveTo(0, i * cell);
      matrixCtx.lineTo(size, i * cell);
      matrixCtx.stroke();
    }
  }

  function loop() {
    if (!state.paused) {
      step();
      render();
    }
    requestAnimationFrame(loop);
  }

  // --- UI wiring ---

  function bindSlider(id, valId, initial, fmt, onChange) {
    const el = document.getElementById(id);
    const val = document.getElementById(valId);
    el.value = initial;
    val.textContent = fmt(initial);
    el.addEventListener("input", () => {
      const v = parseFloat(el.value);
      val.textContent = fmt(v);
      onChange(v);
    });
  }

  function init() {
    resize();
    buildTypes(state.numTypes);
    scatter();

    bindSlider("slider-types", "val-types", state.numTypes, (v) => v, (v) => {
      state.numTypes = Math.round(v);
      buildTypes(state.numTypes);
      scatter();
    });
    bindSlider("slider-count", "val-count", state.countPerType, (v) => v, (v) => {
      state.countPerType = Math.round(v);
      scatter();
    });
    bindSlider("slider-force", "val-force", state.forceScale, (v) => v.toFixed(1), (v) => {
      state.forceScale = v;
    });
    bindSlider("slider-friction", "val-friction", state.friction, (v) => v.toFixed(2), (v) => {
      state.friction = v;
    });
    bindSlider("slider-radius", "val-radius", state.rMax, (v) => Math.round(v), (v) => {
      state.rMax = v;
    });

    document.getElementById("btn-randomize").addEventListener("click", randomizeMatrix);
    document.getElementById("btn-reset").addEventListener("click", scatter);
    const pauseBtn = document.getElementById("btn-pause");
    pauseBtn.addEventListener("click", () => {
      state.paused = !state.paused;
      pauseBtn.textContent = state.paused ? "Resume" : "Pause";
    });

    document.getElementById("toggle-panel").addEventListener("click", (e) => {
      const panel = document.getElementById("panel");
      panel.classList.toggle("collapsed");
      e.target.textContent = panel.classList.contains("collapsed") ? "+" : "–";
    });

    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("mousedown", (e) => {
      state.mouse.active = true;
      state.mouse.sign = e.button === 2 || e.shiftKey ? -1 : 1;
      state.mouse.x = e.clientX;
      state.mouse.y = e.clientY;
    });
    window.addEventListener("mousemove", (e) => {
      state.mouse.x = e.clientX;
      state.mouse.y = e.clientY;
    });
    window.addEventListener("mouseup", () => {
      state.mouse.active = false;
    });
    canvas.addEventListener(
      "touchstart",
      (e) => {
        state.mouse.active = true;
        state.mouse.sign = 1;
        const t = e.touches[0];
        state.mouse.x = t.clientX;
        state.mouse.y = t.clientY;
      },
      { passive: true }
    );
    canvas.addEventListener(
      "touchmove",
      (e) => {
        const t = e.touches[0];
        state.mouse.x = t.clientX;
        state.mouse.y = t.clientY;
      },
      { passive: true }
    );
    canvas.addEventListener("touchend", () => {
      state.mouse.active = false;
    });

    window.addEventListener("resize", () => {
      resize();
      drawMatrix();
    });

    requestAnimationFrame(loop);
  }

  init();
})();
