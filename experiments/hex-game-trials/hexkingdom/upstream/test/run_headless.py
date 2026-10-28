#!/usr/bin/env python3
"""Headless browser test runner for Hexkingdom.
Loads test/headless.html in Chromium, collects console output,
and exits 0/1 depending on the ALL_TESTS_DONE marker.
Usage:  python3 test/run_headless.py [url]
Default url: http://localhost:8123/test/headless.html
"""
import sys
import time
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8123/test/headless.html'
TIMEOUT_S = 40


def main():
    logs = []
    result = {'done': False, 'success': False}

    with sync_playwright() as p:
        browser = p.chromium.launch(args=[
            '--use-gl=swiftshader', '--enable-webgl',
            '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader',
        ])
        page = browser.new_page(viewport={'width': 900, 'height': 700})

        def on_console(msg):
            text = msg.text
            logs.append(text)
            print('[console]', text, flush=True)
            if text.startswith('ALL_TESTS_DONE'):
                result['done'] = True
                result['success'] = 'SUCCESS' in text

        page.on('console', on_console)
        page.on('pageerror', lambda e: (logs.append('PAGEERROR ' + str(e)),
                                        print('[pageerror]', e, flush=True)))

        page.goto(URL, wait_until='load', timeout=30000)

        start = time.time()
        while not result['done'] and time.time() - start < TIMEOUT_S:
            page.wait_for_timeout(500)

        browser.close()

    fails = [l for l in logs if l.startswith('FAIL') or l.startswith('PAGEERROR')]
    print('\n===== SUMMARY =====')
    print(f"total console lines: {len(logs)}, failures: {len(fails)}")
    for f in fails:
        print('  ', f)
    if result['done'] and result['success'] and not fails:
        print('RESULT: PASS')
        return 0
    print('RESULT: FAIL')
    return 1


if __name__ == '__main__':
    sys.exit(main())
