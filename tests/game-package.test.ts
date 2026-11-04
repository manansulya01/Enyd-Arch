import assert from 'node:assert/strict';
import test from 'node:test';
import { processGamePackage } from '../src/server/storage/game-package';
import { writeZip } from '../src/server/storage/zip';

test('game packages cannot use persistent browser storage in the shared-origin sandbox', () => {
  const source = new TextEncoder().encode(
    '<!doctype html><html><body><script>localStorage.setItem("save", "data")</script></body></html>',
  );
  const archive = writeZip([{ path: 'index.html', data: source }]);
  const result = processGamePackage(archive);

  assert.equal(result.ok, false);
  assert.ok(result.report.findings.some(
    (finding) => finding.rule === 'storage.persistent' && finding.severity === 'blocking',
  ));
});

test('game packages cannot use IndexedDB or Cache Storage', () => {
  const source = new TextEncoder().encode(
    '<!doctype html><html><body><script>indexedDB.open("save"); caches.open("cache")</script></body></html>',
  );
  const archive = writeZip([{ path: 'index.html', data: source }]);
  const result = processGamePackage(archive);

  assert.equal(result.ok, false);
  assert.ok(result.report.findings.some((finding) => finding.rule === 'storage.persistent'));
});
