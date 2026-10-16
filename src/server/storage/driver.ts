import 'server-only';
import { createHash, createHmac } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from '~db';
import { storageObjects } from '~db/schema';
import { randomHex, sha256 } from '../crypto';

/**
 * Object storage
 *
 * Two drivers share one interface. `local` writes to a directory outside the
 * application root; `s3` speaks the S3 protocol. Callers never know which is
 * configured, and the choice is per-deployment, not per-code path.
 *
 * Metadata lives in Postgres; bytes live here. Nothing is ever stored in a
 * column, so a large video and a one-pixel PNG are equally cheap to record.
 */

export type StorageDriverName = 'local' | 's3';

export interface StorageDriver {
  name: StorageDriverName;
  /** Persist bytes and return the opaque key used to read them back. */
  put(key: string, data: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

const STORAGE_ROOT = path.resolve(
  process.cwd(),
  process.env.STORAGE_ROOT ?? './storage',
);

const keySegments = (key: string): string[] =>
  key.split('/').filter((segment) => segment && segment !== '.' && segment !== '..');

/**
 * Local driver.
 *
 * Keys are validated segment by segment before touching the filesystem, so a
 * traversal attempt cannot escape the storage root even if a key were ever
 * influenced by member input.
 */
class LocalDriver implements StorageDriver {
  readonly name = 'local' as const;

  private resolve(key: string): string {
    const segments = keySegments(key);
    if (segments.length === 0) throw new Error('Invalid storage key');
    const absolute = path.resolve(STORAGE_ROOT, ...segments);
    const root = STORAGE_ROOT.endsWith(path.sep) ? STORAGE_ROOT : `${STORAGE_ROOT}${path.sep}`;
    if (!absolute.startsWith(root)) throw new Error('Invalid storage key');
    return absolute;
  }

  async put(key: string, data: Uint8Array): Promise<void> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    // Write-then-rename so a reader never observes a partial object.
    const temporary = `${target}.${randomHex(6)}.partial`;
    await writeFile(temporary, data);
    await rename(temporary, target);
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(this.resolve(key)));
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await rm(this.resolve(key), { force: true });
    } catch {
      /* already absent */
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      return (await stat(this.resolve(key))).isFile();
    } catch {
      return false;
    }
  }
}

/**
 * S3-compatible driver.
 *
 * Deliberately implemented with the AWS Signature V4 algorithm directly rather
 * than pulling in a vendor SDK, so switching providers is a configuration
 * change and the installation keeps a minimal dependency surface.
 */
class S3Driver implements StorageDriver {
  readonly name = 's3' as const;

  private get bucket(): string {
    return requireEnv('S3_BUCKET');
  }

  private get region(): string {
    return process.env.S3_REGION ?? 'us-east-1';
  }

  private get endpoint(): string {
    return process.env.S3_ENDPOINT ?? `https://s3.${this.region}.amazonaws.com`;
  }

  private async sign(method: string, key: string, payload: Uint8Array): Promise<Response> {
    const accessKey = requireEnv('S3_ACCESS_KEY_ID');
    const secretKey = requireEnv('S3_SECRET_ACCESS_KEY');
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = createHash('sha256').update(payload).digest('hex');
    const host = new URL(this.endpoint).host;

    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = [method, `/${keySegments(key).join('/')}`, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

    const scope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');

    const hmac = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data).digest();
    const signingKey = hmac(
      hmac(hmac(hmac(`AWS4${secretKey}`, dateStamp), this.region), 's3'),
      'aws4_request',
    );
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    return fetch(`${this.endpoint}/${keySegments(key).join('/')}`, {
      method,
      headers: {
        Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        Host: host,
      },
      body: payload.byteLength === 0 ? undefined : (payload as unknown as BodyInit),
    });
  }

  async put(key: string, data: Uint8Array): Promise<void> {
    const response = await this.sign('PUT', key, data);
    if (!response.ok) throw new Error(`S3 PUT failed: ${response.status}`);
  }

  async get(key: string): Promise<Uint8Array | null> {
    const response = await this.sign('GET', key, new Uint8Array(0));
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`S3 GET failed: ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    await this.sign('DELETE', key, new Uint8Array(0));
  }

  async exists(key: string): Promise<boolean> {
    const response = await this.sign('HEAD', key, new Uint8Array(0));
    return response.ok;
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be configured when STORAGE_DRIVER=s3`);
  return value;
}

let driver: StorageDriver | null = null;

export function storage(): StorageDriver {
  if (driver) return driver;
  driver = (process.env.STORAGE_DRIVER ?? 'local') === 's3' ? new S3Driver() : new LocalDriver();
  return driver;
}

// ═══════════════════════════════════════════════════════════════════════════
// Object records
// ═══════════════════════════════════════════════════════════════════════════

export type StoragePurpose =
  | 'upload'
  | 'avatar'
  | 'thumbnail'
  | 'preview'
  | 'game_package'
  | 'game_asset'
  | 'collection_cover'
  | 'event_cover'
  | 'gallery_media';

const PURPOSE_PREFIX: Record<StoragePurpose, string> = {
  upload: 'objects',
  avatar: 'avatars',
  thumbnail: 'thumbs',
  preview: 'previews',
  game_package: 'games',
  game_asset: 'games',
  collection_cover: 'covers',
  event_cover: 'covers',
  gallery_media: 'gallery',
};

export function buildKey(purpose: StoragePurpose, id: string, extension: string): string {
  const prefix = PURPOSE_PREFIX[purpose];
  const safeExtension = extension.replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase();
  // Two-level fan-out keeps directories small on every filesystem.
  return `${prefix}/${id.slice(0, 2)}/${id}${safeExtension ? `.${safeExtension}` : ''}`;
}

export async function putObject(input: {
  purpose: StoragePurpose;
  id: string;
  extension: string;
  data: Uint8Array;
  contentType: string;
}): Promise<{ id: string; objectKey: string; byteSize: number; checksum: string; contentType: string; urlPrefix: string }> {
  const active = storage();
  const key = buildKey(input.purpose, input.id, input.extension);
  await active.put(key, input.data, input.contentType);

  const checksum = sha256(input.data);
  const [record] = await db
    .insert(storageObjects)
    .values({
      driver: active.name,
      objectKey: key,
      urlPrefix: '/objects',
      purpose: input.purpose,
      byteSize: input.data.byteLength,
      contentType: input.contentType,
      checksum,
    })
    .returning();

  return {
    id: record!.id,
    objectKey: key,
    byteSize: input.data.byteLength,
    checksum,
    contentType: input.contentType,
    urlPrefix: record!.urlPrefix,
  };
}

export async function readObject(objectId: string): Promise<{ data: Uint8Array; contentType: string; byteSize: number } | null> {
  const [record] = await db
    .select()
    .from(storageObjects)
    .where(eq(storageObjects.id, objectId))
    .limit(1);
  if (!record || record.removedAt) return null;

  const data = await storage().get(record.objectKey);
  if (!data) return null;
  return { data, contentType: record.contentType, byteSize: record.byteSize };
}

export async function removeObject(objectId: string): Promise<void> {
  const [record] = await db
    .select()
    .from(storageObjects)
    .where(eq(storageObjects.id, objectId))
    .limit(1);
  if (!record) return;
  await storage().delete(record.objectKey);
  await db
    .update(storageObjects)
    .set({ removedAt: new Date() })
    .where(eq(storageObjects.id, objectId));
}