// Баланы қосу (дизайн: ParentLink.dc.html; D26): баланың email-ы → сұраныс → бала Хабарламаларында растайды.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { BareScreen, Button, ButtonLink, ErrorNote, Field, TextInput, TopBar } from '@/components/bl/ui';
import { cancelParentLink, outgoingParentRequests, platformKeys, requestParentLink } from '@/lib/platform-api';
import { isEmailLike } from '@/pages/auth/authText';

export default function ParentLinkPage() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<string | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: platformKeys.outgoing });
    void queryClient.invalidateQueries({ queryKey: platformKeys.children });
  };
  const send = useMutation({
    mutationFn: () => requestParentLink(email),
    onSuccess: () => {
      setSent(email.trim().toLowerCase());
      refresh();
    },
  });
  const cancel = useMutation({
    mutationFn: async () => {
      const rows = await outgoingParentRequests();
      const row = rows.find((r) => r.status === 'pending' && r.child_email === sent);
      if (row) await cancelParentLink(row.id);
    },
    onSuccess: () => {
      setSent(null);
      setEmail('');
      refresh();
    },
  });

  return (
    <BareScreen
      header={<TopBar back="/settings" backLabel="Баптауларға оралу" title="Баланы қосу" />}
      footer={
        sent ? (
          <ButtonLink to="/settings">Дайын</ButtonLink>
        ) : (
          <Button onClick={() => send.mutate()} disabled={!isEmailLike(email)} loading={send.isPending}>
            Сұраныс жіберу
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4 px-4 pb-5 pt-2">
        {sent ? (
          <>
            <section role="status" className="flex flex-col items-center gap-3 rounded-[20px] border border-bl-line bg-white px-5 py-7 text-center">
              <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-bl-soft">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="13" r="8" />
                  <path d="M12 9v4l2.5 2.5" />
                </svg>
              </span>
              <h1 className="m-0 text-[22px] font-bold">Сұраныс жіберілді</h1>
              <p className="m-0 text-[15px] leading-normal text-bl-ink3">{sent} растағанша сұраныс «Балаларым» тізімінде «күтуде» болып тұрады.</p>
            </section>
            <Button variant="danger" size="md" onClick={() => cancel.mutate()} loading={cancel.isPending}>
              Сұранысты қайтарып алу
            </Button>
            {cancel.isError ? <ErrorNote error={cancel.error} /> : null}
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <h1 className="m-0 text-[22px] font-bold leading-[1.3]">Баланың Bilim аккаунтындағы email-ын енгізіңіз</h1>
              <p className="m-0 text-[15px] leading-[1.45] text-bl-ink2">
                Бала сұранысты өз Хабарламаларында растайды. Растағаннан кейін нәтижелері «Балам» бетінде көрінеді.
              </p>
            </div>
            <Field label="Баланың email-ы" htmlFor="child-email">
              <TextInput
                id="child-email"
                type="email"
                inputMode="email"
                autoComplete="off"
                maxLength={254}
                placeholder="aliya@mail.kz"
                value={email}
                onChange={(e) => setEmail(e.target.value.trim())}
              />
            </Field>
            <section className="flex flex-col gap-2 rounded-2xl border border-bl-line bg-white px-4 py-3.5">
              <span className="text-sm font-semibold">Сіз не көресіз</span>
              <span className="text-sm leading-normal text-bl-ink3">Пәндер бойынша емтихан деңгейлері мен «меңгерілді» белгілері, баланың мұғалімдерімен чат.</span>
              <span className="mt-1 text-sm font-semibold">Не көрінбейді</span>
              <span className="text-sm leading-normal text-bl-ink3">Тьютор диалогтары, емтихандағы жауаптар, сыныптағы рейтинг.</span>
            </section>
            {send.isError ? <ErrorNote error={send.error} /> : null}
          </>
        )}
      </div>
    </BareScreen>
  );
}
