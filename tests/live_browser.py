"""Open the actual published Pages site. Never use real receipts or credentials."""
from __future__ import annotations
import base64
import hashlib
import json
import os
from pathlib import Path
import time
import traceback
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen
from playwright.sync_api import sync_playwright, expect

BASE = os.environ['SITE_URL'].rstrip('/') + '/'
EXPECTED = os.environ['EXPECTED_COMMIT']
if urlparse(BASE).scheme != 'https' or urlparse(BASE).hostname != 'allen3429.github.io':
    raise SystemExit('Refusing unexpected deployment target')
OUT = Path('reports/live')
OUT.mkdir(parents=True, exist_ok=True)
rows = []
errors = []
failed_requests = []
submissions = []

def mark(name: str, ok: bool = True) -> None:
    rows.append({'name': name, 'pass': bool(ok)})
    if not ok:
        raise AssertionError(name)
    print('PASS', name, flush=True)

def fetch(rel: str) -> bytes:
    req = Request(urljoin(BASE, rel), headers={'User-Agent': 'AdminScan-release-verification', 'Cache-Control': 'no-cache'})
    with urlopen(req, timeout=30) as r:
        if r.status != 200:
            raise AssertionError(f'{rel}: HTTP {r.status}')
        return r.read()

failure = None
browser = None
page = None
try:
    caps = None
    last = ''
    for attempt in range(24):
        try:
            caps = json.loads(fetch('capabilities.json?release=' + EXPECTED))
            if caps.get('commit') == EXPECTED:
                break
            last = 'CDN still serving previous commit'
        except Exception as exc:
            last = str(exc)
        time.sleep(5)
    else:
        raise AssertionError('Published release not reachable: ' + last)
    mark('Public capabilities identify the exact deployed commit', caps.get('commit') == EXPECTED)
    mark('No SSO, cloud uploads, or school submissions enabled', all(caps.get(k) is False for k in ['ssoEnabled', 'acceptsCloudUploads', 'officialSubmissionEnabled', 'cloudCaseStorage']))
    manifest = json.loads(fetch('build-manifest.json?release=' + EXPECTED))
    for entry in manifest['files']:
        p = entry['path']
        if '..' in p or p.startswith('/'):
            raise AssertionError('Invalid manifest path')
        actual = hashlib.sha256(fetch(p + '?release=' + EXPECTED)).hexdigest()
        mark('Published file hash: ' + p, actual == entry['sha256'])
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        context = browser.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
        page = context.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('requestfailed', lambda r: failed_requests.append({'url': r.url, 'failure': r.failure}))
        page.on('request', lambda r: submissions.append(r.url) if r.method not in ['GET', 'HEAD'] or r.resource_type in ['xhr', 'fetch'] else None)
        page.on('dialog', lambda d: d.accept() if d.type == 'beforeunload' else d.dismiss())
        response = page.goto(BASE, wait_until='networkidle', timeout=60000)
        mark('Real public homepage returns HTTP 200', response.status == 200)
        expect(page.locator('#home')).to_be_visible()
        mark('Homepage and JavaScript loaded', page.evaluate('!!globalThis.AdminSimple && window.ADMINSCAN_PUBLIC_DEMO === true'))
        mark('No horizontal overflow on desktop', page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        page.screenshot(path=str(OUT / 'desktop-home.png'), full_page=True)
        page.locator('#demo').click()
        expect(page.locator('#review')).to_be_visible()
        expect(page.locator('#amountLabel')).to_contain_text('860')
        mark('Synthetic example opens review with amount 860')
        page.locator('#prepare').click()
        expect(page.locator('#done')).to_be_visible()
        expect(page.locator('.done-intro')).to_contain_text('尚未送校方')
        mark('Completion explicitly says not submitted to NTU')
        with page.expect_download() as downloaded:
            page.locator('#downloadDraft').click()
        content = Path(downloaded.value.path()).read_text(encoding='utf-8')
        mark('Actual browser downloads populated HTML draft', '860' in content and '尚未送校方' in content and '合成' in content)
        page.locator('#backToReview').click()
        page.locator('#purpose').fill('合成測試：修改用途')
        page.locator('#navCases').click()
        expect(page.locator('.case-item')).to_contain_text('待再確認')
        mark('Editing invalidates earlier confirmation in case list')
        page.locator('#navNew').click()
        page.locator('#file').set_input_files({'name': 'synthetic.txt', 'mimeType': 'text/plain', 'buffer': '發票\n日期：115/09/06\n總計：1250'.encode('utf-8')})
        expect(page.locator('#review')).to_be_visible()
        expect(page.locator('#amountLabel')).to_contain_text('1,250')
        mark('TXT is read locally and fills amount 1250')
        page.locator('#prepare').click()
        expect(page.locator('#purposeError')).to_be_visible()
        mark('Missing purpose is not silently invented')
        page.locator('#purpose').fill('合成測試材料')
        page.locator('#prepare').click()
        expect(page.locator('#done')).to_be_visible()
        page.locator('.pending-details').first.click()
        expect(page.locator('#pendingList')).to_contain_text('經費来源' if False else '經費來源')
        mark('Unknown funding remains pending after draft creation')
        page.locator('#navNew').click()
        png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9L8AAAAASUVORK5CYII=')
        page.locator('#file').set_input_files({'name': 'synthetic.png', 'mimeType': 'image/png', 'buffer': png})
        expect(page.locator('#unreadDialog')).to_be_visible()
        expect(page.locator('#unreadReason')).to_contain_text('還沒辨識')
        mark('Photo does not pretend to have cloud OCR')
        page.locator('[data-close="unreadDialog"]').click()
        page.locator('#navCases').click()
        page.locator('#clearAll').click()
        page.locator('#confirmClear').click()
        expect(page.locator('.empty-list')).to_be_visible()
        mark('Clear removes page-local drafts')
        mark('Cases not persisted to browser storage', page.evaluate('localStorage.length === 0 && sessionStorage.length === 0'))
        page.locator('#navNew').click()
        page.set_viewport_size({'width': 390, 'height': 844})
        mark('Mobile-sized homepage has no horizontal overflow', page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        page.screenshot(path=str(OUT / 'mobile-home.png'), full_page=True)
        page.locator('#demo').click()
        expect(page.locator('#review')).to_be_visible()
        mark('Mobile-sized review has no horizontal overflow', page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        page.screenshot(path=str(OUT / 'mobile-review.png'), full_page=True)
        page.locator('#prepare').click()
        expect(page.locator('#done')).to_be_visible()
        mark('Mobile-sized browser completes synthetic draft')
        page.locator('#more').click()
        with context.expect_page() as popped:
            page.locator('#openWorkbench').click()
        work = popped.value
        work.on('pageerror', lambda e: errors.append(str(e)))
        work.on('request', lambda r: submissions.append(r.url) if r.method not in ['GET', 'HEAD'] or r.resource_type in ['xhr', 'fetch'] else None)
        work.wait_for_load_state('networkidle')
        mark('More menu opens existing advanced workbench', work.url == urljoin(BASE, 'workbench.html'))
        work.locator('[data-tab="manual"]').click()
        work.locator('[data-manual-issue="appointment-missing"]').click()
        expect(work.locator('#manualCards')).to_contain_text('36、37')
        mark('Manual troubleshooting retains source page references')
        work.locator('[data-tab="lab"]').click()
        work.locator('#runTests').click()
        expect(work.locator('#testPass')).to_have_text('56')
        expect(work.locator('#testCount')).to_have_text('56')
        mark('All 56 synthetic regression cases run in live browser')
        work.locator('[data-tab="execution"]').click()
        work.locator('#execDemo').click()
        work.locator('#ex_confirm').check()
        work.locator('#execPrepare').click()
        work.locator('#execStartDemo').click()
        work.locator('#execCheckLive').click()
        expect(work.locator('#execNotice')).to_contain_text('未送出')
        mark('Delegation simulator cannot submit to school')
        mark('No browser JavaScript errors', not errors)
        mark('No case HTTP submissions or background XHR/fetch requests', not submissions)
        mark('No failed resource requests on main page', not failed_requests)
        browser.close()
        browser = None
except Exception as exc:
    failure = str(exc)
    traceback.print_exc()
    rows.append({'name': 'Live verification completion', 'pass': False, 'error': failure})
    if page is not None:
        try:
            page.screenshot(path=str(OUT / 'failure.png'), full_page=True)
        except Exception:
            pass
finally:
    report = {'site': BASE, 'commit': EXPECTED, 'executedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'mode': 'real-public-HTTPS-Chromium-with-synthetic-data', 'realAdministrativeCases': 0, 'total': len(rows), 'passed': sum(x['pass'] for x in rows), 'failure': failure, 'browserErrors': errors, 'failedRequests': failed_requests, 'caseNetworkRequests': submissions, 'checks': rows}
    (OUT / 'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary, 'a', encoding='utf-8') as f:
            f.write(f'## Live public website verification\n\n{BASE}\n\nCommit: `{EXPECTED}`\n\nPassed: {report["passed"]}/{report["total"]}\n\nSynthetic inputs only; no real school submissions.\n')
if failure:
    raise SystemExit(1)
