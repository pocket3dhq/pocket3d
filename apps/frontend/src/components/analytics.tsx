import Script from 'next/script';
import { connection } from 'next/server';

// Google Tag Manager, only when the operator sets GTM_ID (pocket3d.co does;
// self-hosted instances load nothing). Read at request time, so the public
// image needs no rebuild.
//
// Only rendered on pages whose URL carries no secret: never on the viewer
// /m/<id> (the share id is the only permission on a model), the upload page
// /u/<token>, or the emailed /auth/activate|reset/<token> links, since GTM
// sends the page URL to Google.
const GTM_ID_PATTERN = /^GTM-[A-Z0-9]+$/;

export async function Analytics() {
  await connection();
  const id = process.env.GTM_ID?.trim();
  if (!id || !GTM_ID_PATTERN.test(id)) {
    return null;
  }
  return (
    <>
      <Script
        id="gtm"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtm.js?id=${id}`}
      />
      <Script id="gtm-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());`}
      </Script>
    </>
  );
}
