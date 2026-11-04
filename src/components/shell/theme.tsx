import { headers } from 'next/headers';

/**
 * Respects the member's motion preference before first paint.
 *
 * The per-response nonce is supplied by middleware. Without it, the inline
 * bootstrap script would be correctly blocked by the strict Content Security
 * Policy.
 */
export async function ThemeScript({ reduceMotion }: { reduceMotion: boolean }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <script
      nonce={nonce}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{
        __html: `(function(){try{if(${reduceMotion ? 'true' : 'false'})document.documentElement.setAttribute('data-motion','calm');}catch(e){}})();`,
      }}
    />
  );
}
