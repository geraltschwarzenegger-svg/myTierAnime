# Graph Report - ASTRAVA  (2026-11-23)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 804 nodes · 1654 edges · 40 communities (32 shown, 8 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 58 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38

## God Nodes (most connected - your core abstractions)
1. `render()` - 40 edges
2. `esc()` - 28 edges
3. `api()` - 21 edges
4. `showPreview()` - 18 edges
5. `save()` - 18 edges
6. `toast()` - 17 edges
7. `normWatched()` - 16 edges
8. `findItem()` - 14 edges
9. `openModal()` - 14 edges
10. `itemCount()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `renderPage()` --indirect_call--> `page()`  [INFERRED]
  src/app.inline.js → tools/test/preview.browser.cjs
- `validateState()` --calls--> `watchDurationIssue()`  [EXTRACTED]
  site/src/security.mjs → site/src/watchtime.mjs
- `call()` --calls--> `fetch()`  [EXTRACTED]
  site/test/security.test.mjs → site/src/index.js
- `envOf()` --calls--> `makeD1()`  [EXTRACTED]
  site/test/security.test.mjs → site/test/d1.mjs
- `makeEnv()` --calls--> `makeD1()`  [EXTRACTED]
  site/test/worker.test.mjs → site/test/d1.mjs

## Import Cycles
- None detected.

## Communities (40 total, 8 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.02
Nodes (78): ACCENT_ORDER, ACCENTS, admBranch, admOverlay, admOwner, admPath, admRepo, admToken (+70 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (96): accentVars(), addEl(), animateCount(), applySearch(), bindBoardKeys(), bindItems(), build3DLetter(), buildCube() (+88 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (71): apiCall(), applyImportMerge(), applyImportReplace(), b64(), closeConfirm(), closeImportDialog(), closeIo(), closeLogin() (+63 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (15): build(), install(), main(), snippet(), InstallerTest, build(), find_template_line(), pack() (+7 more)

### Community 4 - "Community 4"
Cohesion: 0.12
Nodes (49): api(), b64url(), clientIp(), countItems(), enc, ensureUser(), fail(), fetch() (+41 more)

### Community 5 - "Community 5"
Cohesion: 0.12
Nodes (29): announce(), apply(), attachFrame(), buildEmblem(), canDraw(), decorate(), decoratePreview(), draw() (+21 more)

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (11): REACTION_KEYS, functions, source, source, context, designs, source, app (+3 more)

### Community 7 - "Community 7"
Cohesion: 0.12
Nodes (8): atmKey(), counts(), Mote, Orb, Petal, pickPalette(), Rain, seed()

### Community 8 - "Community 8"
Cohesion: 0.09
Nodes (18): art, assert, assertStaticPalace(), backupBytes, {chromium}, collectionBytes, count, crypto (+10 more)

### Community 9 - "Community 9"
Cohesion: 0.12
Nodes (11): __test, WEB_CSP, makeD1(), Stmt, call(), codeFor(), ctx, envOf() (+3 more)

### Community 10 - "Community 10"
Cohesion: 0.11
Nodes (11): ctx, here, SCHEMA, built, root, cases, fs, path (+3 more)

### Community 11 - "Community 11"
Cohesion: 0.13
Nodes (19): arm(), drawScene(), drawStars(), finishDrag(), goTo(), helixEntries(), helixPose(), helixWindow() (+11 more)

### Community 12 - "Community 12"
Cohesion: 0.16
Nodes (17): botanicalFlower(), botanicalGeometry(), buildRelicFrame(), defaultFrameDesign(), frameDesign(), hidePreview(), inspect(), open() (+9 more)

### Community 13 - "Community 13"
Cohesion: 0.13
Nodes (13): assert, { chromium }, count, fallback, fs, http, live, path (+5 more)

### Community 14 - "Community 14"
Cohesion: 0.28
Nodes (10): collectionWatchTime(), formatWatchTime(), itemWatchTime(), normalizeWatchDuration(), sumWatchTime(), watchDurationIssue(), watchMinutes(), watchPlural() (+2 more)

### Community 15 - "Community 15"
Cohesion: 0.13
Nodes (13): assert, { chromium }, count, fallback, fs, http, live, path (+5 more)

### Community 16 - "Community 16"
Cohesion: 0.14
Nodes (13): assert, { chromium }, count, fallback, fs, http, live, path (+5 more)

### Community 17 - "Community 17"
Cohesion: 0.14
Nodes (13): assert, { chromium }, count, fallback, fs, http, live, path (+5 more)

### Community 18 - "Community 18"
Cohesion: 0.14
Nodes (10): assert, {chromium}, exportsOn, fs, live, mime, path, root (+2 more)

### Community 19 - "Community 19"
Cohesion: 0.14
Nodes (12): assert, { chromium }, count, fs, http, live, path, poster (+4 more)

### Community 20 - "Community 20"
Cohesion: 0.15
Nodes (13): acceptBgFile(), applyBg(), commitTiers(), coverCheck(), coverState(), loadBg(), openSettings(), renderBgPane() (+5 more)

### Community 21 - "Community 21"
Cohesion: 0.15
Nodes (5): drawBursts(), loop(), resume(), Spark, Streak

### Community 22 - "Community 22"
Cohesion: 0.18
Nodes (8): assert, {chromium}, count, fs, live, path, root, types

### Community 23 - "Community 23"
Cohesion: 0.20
Nodes (3): manifest, root, source

### Community 24 - "Community 24"
Cohesion: 0.18
Nodes (10): assert, {chromium}, fs, live, path, root, shots, snapshot (+2 more)

### Community 25 - "Community 25"
Cohesion: 0.20
Nodes (9): assert, {chromium}, fs, live, mime, path, root, shots (+1 more)

### Community 26 - "Community 26"
Cohesion: 0.20
Nodes (9): assert, {chromium}, fs, live, mime, path, root, shots (+1 more)

### Community 27 - "Community 27"
Cohesion: 0.25
Nodes (7): apply(), applyCardSize(), checkMotion(), sample(), frame(), setMotionPreference(), syncEmblemCaptions()

### Community 28 - "Community 28"
Cohesion: 0.43
Nodes (4): helixEntries(), helixPose(), helixWindow(), data

### Community 29 - "Community 29"
Cohesion: 0.40
Nodes (5): cardElement(), catalogCover(), drawDeck(), isCollected(), itemCover()

### Community 30 - "Community 30"
Cohesion: 0.67
Nodes (3): frame(), project(), stop()

### Community 31 - "Community 31"
Cohesion: 0.67
Nodes (3): saveView(), setView(), syncViewButtons()

## Knowledge Gaps
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `renderPage()` connect `Community 12` to `Community 0`, `Community 1`?**
  _High betweenness centrality (0.385) - this node is a cross-community bridge._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.017857142857142856 - nodes in this community are weakly interconnected._
- **Why does `page()` connect `Community 12` to `Community 19`?**
  _High betweenness centrality (0.385) - this node is a cross-community bridge._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.051535087719298246 - nodes in this community are weakly interconnected._
- **Why does `Stmt` connect `Community 9` to `Community 6`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.060764587525150904 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.06578947368421052 - nodes in this community are weakly interconnected._