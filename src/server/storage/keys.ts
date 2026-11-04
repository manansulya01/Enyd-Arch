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

/** Pure, deterministic key generation. Member input is never used as a path. */
export function buildKey(purpose: StoragePurpose, id: string, extension: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('Storage object id must be a UUID');
  }
  const prefix = PURPOSE_PREFIX[purpose];
  const safeExtension = extension.replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase();
  return `${prefix}/${id.slice(0, 2)}/${id}${safeExtension ? `.${safeExtension}` : ''}`;
}
