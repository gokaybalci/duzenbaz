# Dersplan — school timetable builder

A fast desktop timetable (ders programı) generator for Windows and Linux, built as a modern alternative to Dagitmatik.
Classes, teachers, rooms and lessons go in; a conflict-free weekly timetable comes out, with printable
class / teacher / room sheets, an all-classes overview ("çarşaf liste") and daily plans.

## Desktop app (recommended for real school data)

Dersplan ships as a small native desktop app built with [Tauri](https://tauri.app). It uses the operating
system's own web engine, so there is no bundled browser: installers are a few MB and idle CPU is ~0.

**Your data never leaves the computer:**
- the whole UI is compiled into the program; nothing is loaded from the internet,
- a strict content security policy forbids every network connection,
- the page cannot touch the disk by itself; files are read and written only by the app's own Rust commands
  (`src-tauri/src/lib.rs`), always after a native Open/Save dialog the user confirms,
- the working copy is stored in the user's own profile folder
  (Windows: `%LOCALAPPDATA%\com.dersplan.desktop`, Linux: `~/.local/share/com.dersplan.desktop`),
- saves are atomic (temporary file + rename), so a power cut can't corrupt a project.

| Platform | Package | Notes |
| --- | --- | --- |
| Windows 10 / 11 (64-bit) | `Dersplan_x.y.z_x64-setup.exe` | Installs per user, no admin rights needed. Uses Microsoft Edge WebView2, which Windows 11 and up-to-date Windows 10 already have; otherwise the installer fetches it once. |
| Linux (most distributions) | `Dersplan_x.y.z_amd64.AppImage` | `chmod +x` and run. Built on Ubuntu 22.04 (glibc 2.35) so it runs on Ubuntu 22.04+, Debian 12+, Fedora, Mint 21+, etc. |
| Debian/Ubuntu, Fedora/openSUSE | `.deb`, `.rpm` | Native packages, if you prefer those. |

**Windows 8 / 8.1 and 7 are not supported.** Microsoft stopped WebView2 (the web engine Windows apps like this one use)
on Windows 7, 8 and 8.1 at version 109 in January 2023, and current Rust no longer builds for them. A build for those
systems would need an unsupported, no-longer-patched engine from an unofficial source, which is not acceptable for
student data.

The interface is **Turkish** (the default for every screen, button, printout and the Windows installer). An English
switch is available at the bottom-left of the sidebar.

### Build the packages

Only Docker is needed; everything else (Rust, Node, Windows cross-compiler, NSIS) is inside the build image.

```bash
packaging/build.sh           # Linux + Windows, results in release/
packaging/build.sh linux     # only AppImage/deb/rpm
packaging/build.sh windows   # only the Windows installer
```

### Develop

```bash
npm install
npm run dev        # browser at http://localhost:5173 (uses browser storage, for development only)
```

## Workflow

1. **School & schedule** – days, periods with times (auto-generate from start time / lesson / break length),
   school-wide closed slots, distribution preferences.
2. **Subjects, Teachers, Rooms, Classes** – quick add (Enter), paste lists from Excel, colours.
   Each has an availability grid (click/drag; click a day header to close a whole day).
   A teacher who only comes Monday and Tuesday → close the other days; lessons are *never* placed there.
   Teachers can also have max hours/day, max days/week and max gaps/day.
   Rooms have a quantity (e.g. Gym × 2). Classes can be split into groups (electives, language groups).
3. **Lessons** – class(es)/group, subject, teacher(s), room(s), weekly hours and how they split into blocks
   (`2+2+1` = two doubles and a single, each on a different day). Several classes in one lesson = taught together.
   Lessons with the same **parallel link** always run at the same time (e.g. two elective groups).
   Copy a class's lessons to other classes in one step.
4. **Generate** – runs several searches in parallel (Web Workers) and keeps the best. Pre-checks warn about
   impossible setups (more hours than open slots, blocks with no possible slot) before you start.
   **Improve current** continues from the existing timetable.
5. **Timetable** – drag blocks (mouse or touch) with live green / yellow / red feedback, drop on a block of the
   same length to swap, lock blocks (L), remove (Delete), undo/redo (Ctrl+Z / Ctrl+Y). Locked blocks stay put
   when you regenerate.
6. **Print & share** – per-class / per-teacher / per-room sheets (one per page, double lessons merged, lesson list,
   optional principal signature), all-classes and all-teachers overviews, daily plans.
   Print / save as PDF, download a standalone HTML file, export CSV for Excel, or share via the system share sheet.

## How the distribution works

`src/solver/engine.ts`. Each lesson block is a card with a precomputed *domain* — the start slots where the
school, subject, every teacher, room and class are available — so availability rules can never be violated.
Linked lessons are merged into one card. The search:

* places the hardest cards first (fewest options, longest blocks),
* then runs simulated annealing with moves (relocate, swap with a same-length card, eject-and-re-place
  conflicting cards, best-position), with costs updated incrementally per resource-day,
* weights conflicts adaptively so it can cross barriers in tight schools, and restarts from the best
  solution with reheats,
* ranks solutions by (hard problems, soft penalty): double bookings, same-lesson-same-day, teacher limits
  first; then class gaps, teacher gaps, late starts and consecutive-day spreads.

Benchmarks (`npm run bench`, `npm run bench:big`, `npm run bench:dagitmatik`): the 12-class demo solves with
0 conflicts and 0 class gaps in under a second; a 28-class / 50-teacher / 546-block school in ~7 s on one
thread; all Dagitmatik sample projects (including the "Zor" ones) solve conflict-free.
