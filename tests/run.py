#!/usr/bin/env python3
"""Run reader, editor and offline integration checks without network dependencies."""
import json
import pathlib
import shutil
import subprocess
import tempfile

root = pathlib.Path(__file__).resolve().parents[1]
suites = {
    'reader': ['tests/browser-stubs.js', 'reader-experience.js', 'permissions.js', 'rhythm.js', 'drummer-reader.js', 'index-app.js', 'tests/experience.test.js'],
    'editor': ['tests/browser-stubs.js', 'reader-experience.js', 'permissions.js', 'rhythm.js', 'app.js', 'tests/editor.test.js'],
    'playlists': ['tests/browser-stubs.js', 'reader-experience.js', 'permissions.js', 'rhythm.js', 'drummer-reader.js', 'index-app.js', 'tests/playlists.test.js'],
    'offline': ['tests/sw-stubs.js', 'sw.js', 'tests/sw.test.js'],
}
with tempfile.TemporaryDirectory(prefix='alabanza-tests-') as folder:
    folder = pathlib.Path(folder)
    sources = {name: '\n'.join((root / path).read_text() for path in files) for name, files in suites.items()}
    if shutil.which('node'):
        for name, source in sources.items():
            script = folder / (name + '.js')
            script.write_text(source + '\ntestPromise.then(() => { process.stdout.write(testResult + "\\n"); if (!testResult.startsWith("PASS")) process.exitCode = 1; });')
            subprocess.run(['node', str(script)], check=True)
    elif shutil.which('swift'):
        bundles = []
        for name, source in sources.items():
            bundle = folder / (name + '.json')
            bundle.write_text(json.dumps(source))
            bundles.append(str(bundle))
        runner = folder / 'runner.swift'
        runner.write_text('''import Foundation
import JavaScriptCore
for path in CommandLine.arguments.dropFirst() {
    let context = JSContext()!
    context.exceptionHandler = { _, error in print("ERROR: \(error!)"); exit(1) }
    let data = try Data(contentsOf: URL(fileURLWithPath: path))
    context.evaluateScript(try JSONDecoder().decode(String.self, from: data))
    let result = context.evaluateScript("testResult")!.toString()!
    print(result)
    if !result.hasPrefix("PASS") { exit(1) }
}
''')
        subprocess.run(['swift', '-module-cache-path', '/tmp/alabanza-tests-swift-cache', str(runner), *bundles], check=True)
    else:
        raise SystemExit('Install Node, or run on macOS with Swift and JavaScriptCore.')
