# emergence

A small particle-life sandbox. No build step, no dependencies — a single
HTML page and about 300 lines of vanilla JS and Canvas 2D.

Each particle belongs to one of a few types. Every pair of types has a
random signed number attached to it — how strongly one pulls or pushes the
other. Every frame, every particle feels a short-range shove away from
whatever is nearest, and a longer-range pull or push from everything else
within its radius, weighted by that number. That's the entire rule set.

Nothing in the code decides what should form. Clusters, orbiting pairs,
chases, membranes, dead empty zones — whatever shows up is a side effect of
a random matrix and a lot of repeated arithmetic. Rerolling the matrix
("New rules") can produce something inert, or something that looks
unmistakably alive; there's no way to tell which from the numbers alone,
only by watching it run.

## Running it

No build, no server strictly required — just open `index.html` in a
browser. For a smoother experience (some browsers throttle `file://`
pages), serve it locally:

```
python3 -m http.server 8000
```

then visit `http://localhost:8000`.

## Controls

- **New rules** — reroll the attraction/repulsion matrix.
- **Re-scatter** — respawn all particles at random positions.
- **Pause** — freeze the simulation.
- **Types / Particles per type** — change the population.
- **Force scale / Friction / Interaction radius** — tune the physics.
- **Click-drag** on the field to attract nearby particles; **right-click**
  or **shift-click** drag to repel them.
- The small grid panel shows the current rule matrix — green cells attract,
  red cells repel, brightness is strength.

## How the physics works

Distance between two particles is normalized to `[0, 1]` over the
interaction radius. The force curve is:

- inside a small inner zone (`r < beta`), particles always repel, growing
  sharply stronger as they get closer — this keeps things from collapsing
  into a point;
- from `beta` to the outer radius, the force follows a triangular curve
  scaled by that pair's matrix coefficient, peaking at the midpoint;
- beyond the outer radius, there's no interaction at all.

The world wraps at the edges (a torus), so structures can drift off one
side and reappear on the other instead of piling up against a wall.
Neighbor lookups use a spatial grid so the simulation stays interactive
with thousands of particles instead of checking every pair against every
other pair.
