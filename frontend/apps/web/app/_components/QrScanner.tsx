"use client";

import { useT } from "@jaqyn/i18n";
import { Button } from "@jaqyn/ui";
import { useEffect, useRef, useState } from "react";

// Extract a QR token from a merchant URL (/api/qr/{t}/ or /q/{t}) or raw string.
export function parseScanned(text: string): string {
  const m = text.match(/\/(?:api\/qr|q)\/([^/?#]+)/);
  return m ? m[1]! : text.trim();
}

const REGION_ID = "qr-reader-region";
// Html5QrcodeScannerState: SCANNING = 2, PAUSED = 3.
const RUNNING_STATES = new Set([2, 3]);
const SCAN_CONFIG = { fps: 10, qrbox: { width: 220, height: 220 } };

type Reason = "https" | "permission" | "none" | "generic";

type Scanner = {
  start: (cam: unknown, cfg: unknown, onScan: (d: string) => void, onErr: () => void) => Promise<void>;
  stop: () => Promise<void>;
  clear: () => void;
  getState?: () => number;
};

// Camera needs a secure context (https) or localhost.
function secureContextOk(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  const local = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  return (window.isSecureContext || local) && !!navigator.mediaDevices?.getUserMedia;
}

export function QrScanner({ onResult }: { onResult: (token: string) => void }) {
  const t = useT();
  const [active, setActive] = useState(false);
  const [reason, setReason] = useState<Reason | null>(null);
  const scannerRef = useRef<Scanner | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const start = () => {
    setReason(null);
    if (!secureContextOk()) {
      setReason("https");
      return;
    }
    setActive(true);
  };

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const stopSafe = async () => {
      const s = scannerRef.current;
      scannerRef.current = null;
      if (!s) return;
      try {
        if (RUNNING_STATES.has(s.getState?.() ?? 0)) await s.stop();
      } catch {
        /* already stopped */
      }
      try {
        s.clear();
      } catch {
        /* not rendered */
      }
    };

    (async () => {
      const mod = await import("html5-qrcode");
      if (cancelled) return;
      const Html5Qrcode = mod.Html5Qrcode as unknown as {
        new (id: string): Scanner;
        getCameras: () => Promise<{ id: string }[]>;
      };
      const scanner = new Html5Qrcode(REGION_ID);
      scannerRef.current = scanner;
      const onScan = (decoded: string) => {
        onResultRef.current(parseScanned(decoded));
        setActive(false);
      };

      // Try the back camera, then fall back to whatever cameras exist.
      try {
        await scanner.start({ facingMode: "environment" }, SCAN_CONFIG, onScan, () => {});
        return;
      } catch (err) {
        if (cancelled) return;
        if ((err as { name?: string })?.name === "NotAllowedError") {
          scannerRef.current = null;
          setReason("permission");
          setActive(false);
          return;
        }
      }
      try {
        const cams = await Html5Qrcode.getCameras();
        if (cancelled) return;
        if (cams?.length) {
          await scanner.start(cams[cams.length - 1]!.id, SCAN_CONFIG, onScan, () => {});
          return;
        }
        scannerRef.current = null;
        setReason("none");
        setActive(false);
      } catch (err) {
        scannerRef.current = null;
        if (!cancelled) {
          setReason((err as { name?: string })?.name === "NotAllowedError" ? "permission" : "none");
          setActive(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      void stopSafe();
    };
  }, [active]);

  const message =
    reason === "https"
      ? t("scan.errHttps")
      : reason === "permission"
        ? t("scan.errPermission")
        : reason === "none"
          ? t("scan.errNone")
          : reason === "generic"
            ? t("staff.scan.denied")
            : null;

  return (
    <div className="flex flex-col items-center gap-3">
      <div id={REGION_ID} className="w-full overflow-hidden rounded-2xl" />
      {message && <p className="text-center text-sm text-danger">{message}</p>}
      {!active ? (
        <Button className="w-full" onClick={start}>
          {t("staff.scan.start")}
        </Button>
      ) : (
        <Button variant="secondary" className="w-full" onClick={() => setActive(false)}>
          {t("staff.scan.stop")}
        </Button>
      )}
    </div>
  );
}
