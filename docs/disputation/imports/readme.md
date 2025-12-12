# Imports (Vendored Dependencies)

This directory contains **local snapshots of third-party libraries** that are normally loaded via public CDNs.

These files are **not original work** and **are not owned by this project**.  
They are included solely to support:

- Complete **offline hosting**
- Easier **local development and debugging**
- **Reproducible builds** that do not depend on external CDNs
- Protection against upstream CDN outages or version drift

**Meaning**
- These files are **not authored by this project**
- They are **not re-licensed** under this project’s license
- Inclusion here does **not imply ownership, authorship, or endorsement**


All files in this directory and subdirectories are **verbatim or minimally modified copies** of upstream libraries that were originally loaded from CDNs such as:

- https://cdnjs.cloudflare.com
- https://cdn.jsdelivr.net

Each file retains its original license and copyright.
Where applicable, original license headers are preserved inside the files.



## Source Libraries

The following libraries are included as local snapshots:

### Reveal.js (v5.2.1)
Source:
- https://cdnjs.cloudflare.com/ajax/libs/reveal.js/5.2.1/

Files:
- `imports/reveal.esm.js`
- `imports/plugin/markdown/markdown.esm.js`
- `imports/plugin/math/math.esm.js`
- `imports/plugin/notes/notes.esm.js`
- `imports/plugin/highlight/highlight.esm.js`
- `imports/plugin/search/search.esm.js`
- `imports/plugin/zoom/zoom.esm.js`


Copyright © Hakim El Hattab and contributors
https://github.com/hakimel/reveal.js

---

### KaTeX
Source:
- https://cdn.jsdelivr.net/npm/katex

Files:
- `imports/katex`

Used for Math rendering via Reveal.js Math plugin

MIT License & Copyright © Khan Academy
https://github.com/KaTeX/KaTeX

