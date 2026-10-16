/**
 * Respects the member's motion preference before first paint.
 *
 * Without this the page would animate once and then snap to the calm state,
 * which is worse for anyone who asked for reduced motion than not honouring it
 * at all. The script is tiny, synchronous, and reads a data attribute the server
 * already set.
 */
export function ThemeScript({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <script
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{
        __html: `(function(){try{if(${reduceMotion ? 'true' : 'false'})document.documentElement.setAttribute('data-motion','calm');}catch(e){}})();`,
      }}
    />
  );
}