import assert from 'node:assert/strict';
import test from 'node:test';
import {
  sanitiseFilename,
  validateUpload,
  withinDeclaredLimit,
} from '../src/server/storage/validate';

test('upload validator rejects empty files before storing anything', async () => {
  const result = await validateUpload({
    filename: 'note.txt',
    declaredMime: 'text/plain',
    data: new Uint8Array(),
  });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((finding) => finding.code === 'empty'));
});

test('upload validator rejects executable filename extensions', async () => {
  const result = await validateUpload({
    filename: 'invoice.exe',
    declaredMime: 'application/octet-stream',
    data: new Uint8Array([0x4d, 0x5a, 0x90, 0x00]),
  });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((finding) => finding.code === 'dangerous_extension'));
});

test('upload validator rejects HTML and script markup disguised as text', async () => {
  const result = await validateUpload({
    filename: 'notes.txt',
    declaredMime: 'text/plain',
    data: new TextEncoder().encode('<!doctype html><html><script>alert(1)</script></html>'),
  });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((finding) => finding.code === 'markup_not_allowed'));
});

test('filename sanitization strips path components and invisible control characters', () => {
  assert.equal(sanitiseFilename('../../private\u0000report.txt'), 'private report.txt');
  assert.equal(sanitiseFilename('C:\\temp\\secret.md'), 'secret.md');
});

test('upload size preflight rejects over-limit payloads', () => {
  assert.equal(withinDeclaredLimit(10, 'image'), true);
  assert.equal(withinDeclaredLimit(12_582_913, 'image'), false);
  assert.equal(withinDeclaredLimit(100_000_000), true);
  assert.equal(withinDeclaredLimit(104_857_601), false);
});
