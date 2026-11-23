// Сыныпқа қосылу (дизайн: JoinClass.dc.html; api §5.2, D33). QR-да тек код болады.
import { useEffect, useRef, useState } from 'react';

import AppShell from '@/components/bl/AppShell';
import JoinClassPanel from '@/components/bl/JoinClassPanel';
import { CheckIcon } from '@/components/bl/icons';
import { Banner, Button, ButtonLink, Page, TopBar } from '@/components/bl/ui';
import type { ClassPreview } from '@/lib/classes-api';

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

function barcodeDetector(): DetectorCtor | null {
  const ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  return typeof ctor === 'function' ? ctor : null;
}

function QrScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  useEffect(() => {
    const Ctor = barcodeDetector();
    if (!Ctor) return;
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    const detector = new Ctor({ formats: ['qr_code'] });
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        stream = s;
        if (!video.current || stopped) return;
        video.current.srcObject = s;
        void video.current.play();
        const tick = async () => {
          if (stopped || !video.current) return;
          try {
            const found = await detector.detect(video.current);
            const value = found[0]?.rawValue?.trim();
            if (value) {
              onCodeRef.current(value);
              return;
            }
          } catch {
            /* кадр дайын емес */
          }
          timer = window.setTimeout(tick, 350);
        };
        timer = window.setTimeout(tick, 350);
      })
      .catch(() => setError('Камераға рұқсат берілмеді. Кодты қолмен енгізіңіз.'));
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="flex flex-col gap-2.5">
      {error ? (
        <Banner tone="warn">{error}</Banner>
      ) : (
        <video ref={video} muted playsInline aria-label="QR-кодты камераға көрсетіңіз" className="aspect-square w-full rounded-2xl bg-black object-cover" />
      )}
      <Button variant="secondary" size="md" onClick={onClose}>
        Сканерлеуді тоқтату
      </Button>
    </div>
  );
}

export default function JoinClassPage() {
  const [joined, setJoined] = useState<ClassPreview | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState<string | null>(null);
  const canScan = Boolean(barcodeDetector()) && Boolean(navigator.mediaDevices?.getUserMedia);

  return (
    <AppShell nav={false}>
      <TopBar back="/profile" backLabel="Профильге оралу" title="Сыныпқа қосылу" />
      <Page className="gap-4 pt-3">
        {joined ? (
          <>
            <section role="status" className="flex flex-col items-center gap-3 rounded-[20px] border border-bl-line bg-white px-5 py-7 text-center">
              <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-bl-okbg text-bl-oktext">
                <CheckIcon size={28} />
              </span>
              <h1 className="m-0 text-[22px] font-bold">Сыныпқа қосылдыңыз</h1>
              <span className="text-[15px] font-semibold">
                {joined.title} · {joined.teacher_name}
              </span>
              <p className="m-0 text-[15px] leading-normal text-bl-ink3">
                Енді мұғалім {joined.subject} бойынша емтихан нәтижелеріңізді көреді және сізбен чатта жазыса алады. Тьютормен
                диалогтарыңыз жеке болып қалады: мұғалімге тек қауіпсіздік ережесін бұзған хабарлама жіберіледі.
              </p>
            </section>
            <ButtonLink to="/profile">Профильге оралу</ButtonLink>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <h1 className="m-0 text-[22px] font-bold leading-[1.3]">Мұғалім берген кодты енгізіңіз</h1>
              <p className="m-0 text-[15px] leading-[1.45] text-bl-ink2">Код 6 таңбадан тұрады. Оны мұғалім сабақта немесе хабарламада береді.</p>
            </div>
            {scanning ? (
              <QrScanner
                onCode={(code) => {
                  setScanned(code);
                  setScanning(false);
                }}
                onClose={() => setScanning(false)}
              />
            ) : (
              <JoinClassPanel key={scanned ?? 'manual'} initialCode={scanned ?? undefined} onJoined={setJoined} />
            )}
            {canScan && !scanning ? (
              <Button variant="secondary" size="md" onClick={() => setScanning(true)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
                  <path d="M8 12h8" />
                </svg>
                QR-кодты сканерлеу
              </Button>
            ) : null}
            <p className="m-0 text-sm text-bl-ink2">Код жоқ па? Мұғаліміңізден сұраңыз.</p>
          </>
        )}
      </Page>
    </AppShell>
  );
}
