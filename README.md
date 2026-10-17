# Düzenbaz — school timetable builder

A fast desktop timetable (ders programı) generator for Windows and Linux, built as a modern alternative to Dagitmatik.
Classes, teachers and lessons go in; a conflict-free weekly timetable with **no blank periods in any class day**
(MEB rule) comes out, with printable class and teacher sheets, an all-classes overview ("çarşaf liste") and
daily plans.

## Desktop app (recommended for real school data)

Düzenbaz ships as a small native desktop app built with [Tauri](https://tauri.app). It uses the operating
system's own web engine, so there is no bundled browser: installers are a few MB and idle CPU is ~0.

**Your data never leaves the computer:**
- the whole UI is compiled into the program; nothing is loaded from the internet,
- a strict content security policy forbids every network connection,
- the page cannot touch the disk by itself; files are read and written only by the app's own Rust commands
  (`src-tauri/src/lib.rs`), always after a native Open/Save dialog the user confirms,
- the working copy is stored in the user's own profile folder
  (Windows: `%LOCALAPPDATA%\com.duzenbaz.desktop`, Linux: `~/.local/share/com.duzenbaz.desktop`),
- saves are atomic (temporary file + rename), so a power cut can't corrupt a project.

| Platform | Package | Notes |
| --- | --- | --- |
| Windows 10 / 11 (64-bit) | `Duzenbaz_x.y.z_x64-setup.exe` | Installs per user, no admin rights needed. Uses Microsoft Edge WebView2, which Windows 11 and up-to-date Windows 10 already have; otherwise the installer fetches it once. |
| Linux (most distributions) | `Duzenbaz_x.y.z_amd64.AppImage` | `chmod +x` and run. Built on Ubuntu 22.04 (glibc 2.35) so it runs on Ubuntu 22.04+, Debian 12+, Fedora, Mint 21+, etc. |
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

The screens follow the left-hand menu (UI names in Turkish):

1. **Okul ve zaman çizelgesi** – school name, **Okul türü** (İlkokul, Ortaokul, Lise; also asked by
   *Dosya → Yeni proje*; the type's mandatory subjects – 13 for İlkokul, 12 for Ortaokul, 15 for Lise –
   are added to Dersler, skipping any that already exist under the same or a common alternative name,
   e.g. İngilizce for Yabancı Dil; nothing is ever removed), days, lesson periods with times (or generate them from start
   time, lesson, break and lunch lengths), school-wide closed periods, and **Kurallar**:
   - *Sınıf programlarında boş saat olmasın (MEB kuralı)* – on by default, see below.
   - *Derslik kullan* – off by default, because most schools have fixed classrooms. Turn it on only to share
     special rooms such as labs or the gym; until then every room screen, field and printout is hidden.
2. **Dersler, Öğretmenler, Sınıflar** (and **Derslikler** when rooms are on) – quick add with Enter, paste
   lists from Excel, colours, and lists you can sort by name, short name or total hours (click a column header).
   Each has an availability grid (*koşul*): click or drag to close periods, click a day to close the whole day.
   A teacher who only comes on Monday and Tuesday gets the other days closed, and lessons are never placed
   there. Teachers can also have max hours per day, max days per week and max gaps per day. Classes can be
   split into groups (electives, language groups). Rooms have a quantity (e.g. Spor Salonu × 2).
3. **Tanımlı dersler** – choose a teacher, pick a subject and tick the classes (or groups) they teach it to,
   as in Dagitmatik; ticking adds the lesson, unticking removes it, and classes taught by someone else show
   that teacher's name. Lessons for several classes or teachers together are added with the form below it.
   Weekly hours are split into blocks (`2+2+1` = two double lessons and a single, each on a different day).
   Lessons with the same *eş zamanlı bağ* always run at the same time (e.g. two elective groups).
   Tick lessons in the list (or *Hepsini seç*) to **Kopyala** them to other classes or **Sil** them together.
4. **Dağıt** – runs up to 8 searches in parallel and keeps the best. Checks before distributing stop
   impossible setups: more hours than open periods, blocks with no possible period, and classes with
   **fewer** hours than open periods (those would be left with empty periods). **Mevcudu iyileştir**
   continues from the current timetable.
5. **Ders programı** – drag blocks (mouse or touch) with live green / yellow / red feedback, drop on a block of
   the same length to swap, lock blocks (L), remove (Delete), undo/redo (Ctrl+Z / Ctrl+Y). Locked blocks stay
   put when you distribute again. Any blank class period is marked red.
6. **Yazdır ve paylaş** – one sheet per class / teacher (double lessons merged, lesson list, optional principal
   signature), all-classes and all-teachers overviews, daily plans. Print or save as PDF, save a standalone
   HTML file, or export CSV for Excel.

**Görünüm** (bottom-left) sets the colour theme (Açık, Krem, Yeşil, Lacivert, Yüksek kontrast, Koyu), the font
(Standart, Okunaklı, Ofis, Sade, Klasik — fonts already on Windows and Linux) and the text size
(Normal, Büyük, Çok büyük). **Örnek okulu dene** builds a demo ortaokul with the number of classes and
teachers you choose, every class with a full 35-hour week.

## How the distribution works

`src/solver/engine.ts`. Each lesson block is a card with a precomputed *domain*: the start periods where the
school, subject, every teacher, room and class are available. So availability can never be broken. Linked
lessons are merged into one card. The search:

* places the hardest cards first (fewest options, longest blocks),
* then runs simulated annealing with moves (relocate, swap with a same-length card, eject and re-place
  conflicting cards, best position), with costs updated per resource and day,
* weights conflicts adaptively so it can get through tight schools, and restarts from the best solution,
* ranks solutions by (hard problems, soft penalty). Hard: double bookings, two blocks of one lesson on a day,
  teacher limits, and — with the MEB rule on — any class day that does not start at the first open period or
  has an empty period between lessons (closed periods such as a school-wide lunch break don't count).
  Soft: teacher gaps and blocks of a lesson on consecutive days.

Benchmarks, all single-threaded (`npm run bench -- <ms> <classes> [teachers]`, `npm run bench:dagitmatik`):
full 35-hour weeks with 0 problems and 0 empty class periods for 4, 12 and 20 classes, and for 28 classes
in about 5–7 s, also with the smallest teacher count the demo allows. All Dagitmatik sample projects,
including the "Zor" ones, solve without conflicts.
