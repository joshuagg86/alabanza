Run `python3 tests/run.py` from the project directory. The runner uses Node when
available, or Swift with JavaScriptCore on macOS. No packages or network needed.

The suites load the actual reader, editor and service-worker scripts with mocked
browser and Firebase boundaries. They cover preferences, old note documents,
offline edits, competing saves, failed saves, lyric rendering, section tracking,
editor return position, rehearsal mode, auto-scroll and offline cache behavior.

These checks do not validate deployed Firebase rules, real account data, browser
fullscreen permissions or the visual layout on physical devices.

Service-list checks also cover repertoire search from Sunday/Wednesday, atomic
additions, repeated clicks, errors and unchanged authorization. Section checks
cover Coro headings and lyrics such as “Coronado con poder” in reader and editor.
Optional Chrome smoke test: `audio-service/.venv/bin/python tests/service-search.browser.py`
(requires Playwright and the existing macOS Chrome installation; Firebase is mocked).
