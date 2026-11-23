// Профиль суреті: қосу, ауыстыру, қию, бұру, өшіру (дизайн: AvatarEdit.dc.html).
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import Cropper, { type Area } from 'react-easy-crop';

import Avatar from '@/components/bl/Avatar';
import { CameraIcon, GalleryIcon, RotateIcon } from '@/components/bl/icons';
import { Banner, BareScreen, Button, ButtonLink, ConfirmSheet, TopBar } from '@/components/bl/ui';
import { useAuth } from '@/lib/auth-context';
import {
  AVATAR_ERRORS,
  MAX_AVATAR_MB,
  checkAvatarFile,
  removeAvatar,
  renderAvatar,
  uploadAvatar,
} from '@/lib/profile-api';
import { cn } from '@/lib/utils';

type Step = 'pick' | 'crop' | 'done';
const ACCEPT = 'image/jpeg,image/png,image/webp';
const CIRCLE_RATIO = 300 / 358;

function FilePickButton({
  children,
  icon,
  capture,
  onFile,
  variant,
  disabled,
}: {
  children: string;
  icon?: ReactNode;
  capture?: 'user';
  onFile: (file: File) => void;
  variant: 'primary' | 'secondary' | 'onDark';
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onFile(file);
  };
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => ref.current?.click()}
        className={cn(
          'flex items-center justify-center gap-2 rounded-[14px] font-semibold disabled:opacity-60',
          variant === 'primary' && 'h-[52px] border-0 bg-bl-btn text-base text-white',
          variant === 'secondary' && 'h-[52px] border border-bl-field bg-white text-base text-bl-ink',
          variant === 'onDark' && 'h-11 border-0 bg-transparent text-[15px] text-white',
        )}
      >
        {icon}
        {children}
      </button>
      <input
        ref={ref}
        type="file"
        accept={capture ? 'image/*' : ACCEPT}
        capture={capture}
        onChange={onChange}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
    </>
  );
}

export default function AvatarEditPage() {
  const { user, refreshUser } = useAuth();
  const [step, setStep] = useState<Step>('pick');
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [area, setArea] = useState<Area | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [photo, setPhoto] = useState<string | null>(user?.avatarUrl ?? null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [cropPx, setCropPx] = useState(300);

  useEffect(() => setPhoto(user?.avatarUrl ?? null), [user?.avatarUrl]);

  useEffect(() => () => {
    if (src) URL.revokeObjectURL(src);
  }, [src]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el || step !== 'crop') return;
    const ro = new ResizeObserver(([entry]) => setCropPx(Math.round(entry.contentRect.width * CIRCLE_RATIO)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [step]);

  const openFile = (file: File) => {
    const problem = checkAvatarFile(file);
    setNote(null);
    if (problem) {
      setError(AVATAR_ERRORS[problem]);
      setStep('pick');
      return;
    }
    setError(null);
    setSrc(URL.createObjectURL(file));
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setStep('crop');
  };

  const onCropComplete = useCallback((_: Area, pixels: Area) => setArea(pixels), []);

  const save = async () => {
    if (!user || !src || !area) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await renderAvatar(src, area, rotation);
      const url = await uploadAvatar(user.id, blob, user.avatarUrl);
      setPhoto(`${url}?v=${Date.now()}`);
      await refreshUser();
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : AVATAR_ERRORS.upload);
      setStep('pick');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await removeAvatar(user.id, user.avatarUrl);
      setPhoto(null);
      await refreshUser();
      setConfirmRemove(false);
      setNote('Сурет өшірілді');
      setError(null);
    } catch {
      setConfirmRemove(false);
      setError(AVATAR_ERRORS.remove);
    } finally {
      setBusy(false);
    }
  };

  const nudge = (dx: number, dy: number) => setCrop((c) => ({ x: c.x + dx, y: c.y + dy }));

  if (step === 'crop' && src) {
    return (
      <BareScreen dark>
        <header className="flex items-center justify-between gap-2 px-2 pb-1.5 pt-3">
          <button
            type="button"
            onClick={() => setStep('pick')}
            disabled={busy}
            className="h-11 border-0 bg-transparent px-3 text-[15px] font-semibold text-white"
          >
            Болдырмау
          </button>
          <h1 className="m-0 text-base font-semibold">Суретті қию</h1>
          <button
            type="button"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            aria-label="90° бұру"
            className="flex h-11 w-11 items-center justify-center rounded-xl border-0 bg-transparent text-white hover:bg-white/10"
          >
            <RotateIcon />
          </button>
        </header>

        <div className="flex flex-1 flex-col justify-center gap-3.5 px-4">
          <div
            ref={stageRef}
            tabIndex={0}
            role="application"
            aria-label="Суретті жылжыту: саусақпен сүйреңіз немесе бағыт пернелерін басыңыз"
            onKeyDown={(e) => {
              const d = 10;
              if (e.key === 'ArrowLeft') nudge(-d, 0);
              else if (e.key === 'ArrowRight') nudge(d, 0);
              else if (e.key === 'ArrowUp') nudge(0, -d);
              else if (e.key === 'ArrowDown') nudge(0, d);
              else return;
              e.preventDefault();
            }}
            className="relative mx-auto aspect-square w-full max-w-[420px] overflow-hidden rounded-2xl bg-black focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white"
          >
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              minZoom={1}
              maxZoom={3}
              aspect={1}
              cropShape="round"
              cropSize={{ width: cropPx, height: cropPx }}
              showGrid={false}
              objectFit="cover"
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              style={{
                cropAreaStyle: { border: '2px solid rgba(255,255,255,0.9)', color: 'rgba(17,17,17,0.62)' },
              }}
            />
          </div>
          <p className="m-0 text-center text-[13px] text-[#BDB9B1]">Сүйреп жылжытыңыз, жылжытқышпен үлкейтіңіз</p>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(1, z - 0.25))}
              aria-label="Кішірейту"
              className="h-11 w-11 flex-none rounded-xl border-0 bg-[#2A2A2A] text-[22px] font-semibold text-white"
            >
              −
            </button>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              aria-label="Масштаб"
              className="h-11 flex-1 accent-white"
            />
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
              aria-label="Үлкейту"
              className="h-11 w-11 flex-none rounded-xl border-0 bg-[#2A2A2A] text-[22px] font-semibold text-white"
            >
              +
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 px-4 pb-7 pt-3">
          <Button variant="light" onClick={save} loading={busy} disabled={!area}>
            {busy ? 'Сақталуда…' : 'Сақтау'}
          </Button>
          <FilePickButton variant="onDark" onFile={openFile} disabled={busy}>
            Басқа сурет таңдау
          </FilePickButton>
        </div>
      </BareScreen>
    );
  }

  if (step === 'done') {
    return (
      <BareScreen className="justify-center gap-4 px-4 py-6">
        <section className="flex flex-col items-center gap-3 rounded-[20px] border border-bl-line bg-white px-4 py-7 text-center">
          <Avatar name={user?.fullName} url={photo} size="hero" />
          <h1 role="status" className="m-0 text-[22px] font-bold">
            Сурет сақталды
          </h1>
          <p className="m-0 text-[15px] leading-normal text-bl-ink3">
            Жаңа сурет профильде, чатта және сынып тізімінде көрінеді.
          </p>
        </section>
        <ButtonLink to="/settings">Жеке деректерге оралу</ButtonLink>
        <Button variant="secondary" size="md" onClick={() => setStep('pick')}>
          Тағы өзгерту
        </Button>
      </BareScreen>
    );
  }

  return (
    <BareScreen header={<TopBar back="/settings" backLabel="Жеке деректерге оралу" title="Профиль суреті" />}>
      <div className="flex flex-col gap-5 px-4 pb-6 pt-2">
        <section className="flex flex-col items-center gap-3 rounded-[20px] border border-bl-line bg-white px-4 py-6">
          <Avatar name={user?.fullName} url={photo} size="hero" />
          <span className="text-lg font-bold">{user?.fullName}</span>
          <span className="text-center text-sm leading-[1.45] text-bl-ink2">
            Суретті мұғалім, сыныптастар және ата-ана көреді
          </span>
        </section>

        {error ? (
          <Banner tone="warn" live="assertive">
            {error}
          </Banner>
        ) : null}
        {note ? <Banner tone="good">{note}</Banner> : null}

        <section className="flex flex-col gap-2.5">
          <FilePickButton variant="primary" icon={<GalleryIcon />} onFile={openFile}>
            {photo ? 'Суретті ауыстыру' : 'Галереядан таңдау'}
          </FilePickButton>
          <FilePickButton variant="secondary" icon={<CameraIcon />} capture="user" onFile={openFile}>
            Камерамен түсіру
          </FilePickButton>
          {photo ? (
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              className="h-12 border-0 bg-transparent text-[15px] font-semibold text-bl-danger"
            >
              Суретті өшіру
            </button>
          ) : null}
          <span className="text-center text-[13px] text-bl-ink2">JPG, PNG немесе WEBP · {MAX_AVATAR_MB} MB дейін</span>
        </section>
      </div>

      <ConfirmSheet
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title="Суретті өшіресіз бе?"
        description="Сурет орнына аты-жөніңіздің бас әріптері көрінеді. Кейін жаңа сурет қоя аласыз."
        confirmLabel="Иә, өшіру"
        onConfirm={remove}
        busy={busy}
      />
    </BareScreen>
  );
}
