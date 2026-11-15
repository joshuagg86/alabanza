Run `python3 tests/run.py` from the project directory. The runner uses Node when
available, or Swift with JavaScriptCore on macOS. No packages or network needed.

The suites load the actual reader, editor and service-worker scripts with mocked
browser and Firebase boundaries. They cover preferences, old note documents,
offline edits, competing saves, failed saves, lyric rendering, section tracking,
editor return position, rehearsal mode, auto-scroll and offline cache behavior.

These checks do not validate deployed Firebase rules, real account data, browser
fullscreen permissions or the visual layout on physical devices.
