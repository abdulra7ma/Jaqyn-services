"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

// Replaces the root layout (and its i18n/query providers) when React itself
// crashes, so it can't route copy through @jaqyn/i18n here — falls back to
// Next's built-in error page.
export default function GlobalError({ error }: { error: Error & { digest?: string } }): React.JSX.Element {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
