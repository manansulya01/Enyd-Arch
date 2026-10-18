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
  assert.equal(sanitiseFilename('../../private\u0000report.txt'), 'privatereport.txt');
  assert.equal(sanitiseFilename('C:\\temp\\secret.md'), 'secret.md');
});

test('upload size preflight rejects over-limit payloads', () => {
  assert.equal(withinDeclaredLimit(10, 'image'), true);
  assert.equal(withinDeclaredLimit(12_582_913, 'image'), false);
  assert.equal(withinDeclaredLimit(100_000_000), true);
  assert.equal(withinDeclaredLimit(104_857_601), false);
});

function oneEntryZip(entryName: string): Uint8Array {
  const name = new TextEncoder().encode(entryName);
  const bytes = new Uint8Array(31 + name.byteLength);
  bytes.set([0x50, 0x4b, 0x03, 0x04], 0);
  const view = new DataView(bytes.buffer);
  view.setUint16(6, 0, true);
  view.setUint32(18, 1, true);
  view.setUint32(22, 1, true);
  view.setUint16(26, name.byteLength, true);
  view.setUint16(28, 0, true);
  bytes.set(name, 30);
  bytes[30 + name.byteLength] = 0x41;
  return bytes;
}

test('upload validator rejects parent-relative paths inside ZIP archives', async () => {
  const result = await validateUpload({
    filename: 'bundle.zip',
    declaredMime: 'application/zip',
    data: oneEntryZip('../outside.txt'),
    expect: 'archive',
  });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((finding) => finding.code === 'unsafe_archive_paths'));
});
