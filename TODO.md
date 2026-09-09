# TODO

Personal backlog for snappy_tool — not committed to a delivery timeline. See
`snappy_tool_proposal_v2.md` for the actual phased design/build order.

- **Package for sharing with colleagues.** Not a project yet — this remains a
  personal tool under evaluation for now. When it's ready to share: an Inno
  Setup installer wrapping a pre-`npm ci`'d copy of the app plus a Node
  check/install step and a Desktop shortcut to `start.bat`. Deliberately not
  Electron — the app's picker code leans on the File System Access API and
  targets Edge/Chromium by design (see `CLAUDE.md`), and Electron would mean
  reworking that instead of just packaging it.
