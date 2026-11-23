// Сынып кодын енгізу → сыныпты көрсету → қосылу (Onboarding.dc.html, JoinClass.dc.html).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import Avatar from '@/components/bl/Avatar';
import { Banner, Button, TextInput } from '@/components/bl/ui';
import { JOIN_CODE_PATTERN, joinClass, normalizeJoinCode, previewClass, type ClassPreview } from '@/lib/classes-api';

export default function JoinClassPanel({ onJoined, initialCode }: { onJoined: (cls: ClassPreview) => void; initialCode?: string }) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState(() => normalizeJoinCode(initialCode ?? ''));
  const valid = JOIN_CODE_PATTERN.test(code);

  const preview = useQuery({
    queryKey: ['classes', 'preview', code],
    queryFn: () => previewClass(code),
    enabled: valid,
    retry: false,
  });

  const join = useMutation({
    mutationFn: () => joinClass(code),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['classes'] });
      if (preview.data) onJoined(preview.data);
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="join-code" className="text-sm font-semibold">
          Сынып коды
        </label>
        <TextInput
          id="join-code"
          type="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={6}
          placeholder="FZ8A24"
          value={code}
          onChange={(e) => {
            setCode(normalizeJoinCode(e.target.value));
            join.reset();
          }}
          className="h-16 text-center text-[28px] font-bold tracking-[0.3em] tabular-nums"
        />
        <span className="self-end text-[13px] text-bl-ink2">{code.length} / 6</span>
      </div>

      {code.length === 6 && !valid ? <Banner tone="warn">Кодта қате таңба бар. Мұғалім берген кодты қайта тексеріңіз.</Banner> : null}
      {valid && preview.isFetching ? <span className="text-sm text-bl-ink2" aria-live="polite">Сынып ізделуде…</span> : null}
      {valid && preview.isSuccess && !preview.data ? (
        <Banner tone="warn">Мұндай кодпен сынып табылмады. Мұғалімнен жаңа кодты сұраңыз.</Banner>
      ) : null}
      {preview.isError ? <Banner tone="bad">{(preview.error as Error).message}</Banner> : null}

      {preview.data ? (
        <section className="flex flex-col gap-3 rounded-2xl border-2 border-bl-ink bg-white p-4">
          <span className="text-[13px] font-semibold text-bl-ink2">Бұл сіздің сыныбыңыз ба?</span>
          <div className="flex items-center gap-3">
            <Avatar name={preview.data.teacher_name} tone="soft" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[17px] font-semibold">{preview.data.title}</span>
              <span className="text-sm text-bl-ink2">
                {preview.data.teacher_name} · {preview.data.subject}
              </span>
            </span>
          </div>
          {join.isError ? <Banner tone="bad">{(join.error as Error).message}</Banner> : null}
          <Button onClick={() => join.mutate()} loading={join.isPending}>
            {join.isPending ? 'Қосылуда…' : 'Қосылу'}
          </Button>
        </section>
      ) : null}
    </div>
  );
}
