# Rocket Game — Project Configuration

## Development Workflow

After any code change, run the three quality skills in parallel:
- `/code-architect` — architecture and structural review
- `/code-simplifier` — dead code and complexity reduction
- `/build-validator` — static analysis and runtime validation

## Known Issues

See `issues.md` for documented bugs and their planned fixes.

## Stack

- Single-file HTML5 canvas game: `index.html`
- No build system — served directly via `python3 -m http.server 8080`
- Three.js for 3D rendering (loaded inline)
