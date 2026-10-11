import { useState } from 'react';
import {
  BookOpen,
  Bot,
  HelpCircle,
  Mic,
  Sparkles,
  Volume2,
  Zap,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import VoiceAssistantWidget from '@/components/ai-tools/VoiceAssistantWidget';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

const QUICK_VOICE_TOPICS = [
  'Қазақстан тарихы туралы айтып бер',
  'Ньютонның 2-заңын қарапайым түсіндір',
  'Абай Құнанбаевтың қарасөздері қандай?',
  'Тригонометрияның негізгі формулалары',
  'Күн жүйесіндегі ғаламшарлар туралы',
  'Python бағдарламалау тілінің артықшылықтары',
];

export default function AiVoicePage() {
  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in pb-12">
        <PageHeader
          eyebrow={
            <>
              <Sparkles size={13} />
              SANA ЖИ
            </>
          }
          icon={<Mic size={20} />}
          title="Дауыстық ИИ көмекші"
          description="Groq Whisper арқылы жылдам тану және Edge-TTS арқылы дауыстап жауап беру"
        />

        {/* Негізгі дауыстық көмекші виджеті */}
        <div className="mx-auto max-w-2xl space-y-6">
          <VoiceAssistantWidget defaultLanguage="kk" />

          {/* Ұсынылатын тақырыптар */}
          <Card className="border-border/40 bg-card/80 shadow-xs">
            <CardContent className="p-5 sm:p-6 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <HelpCircle size={14} className="text-primary" />
                Не сұрауға болады?
              </div>

              <div className="flex flex-wrap gap-2">
                {QUICK_VOICE_TOPICS.map((topic) => (
                  <span
                    key={topic}
                    className="inline-flex items-center rounded-full bg-muted/60 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    <Volume2 size={11} className="mr-1.5 text-muted-foreground" />
                    {topic}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Пайдалану ерекшеліктері */}
          <div className="grid gap-3 sm:grid-cols-3 text-center">
            <div className="rounded-2xl bg-muted/30 p-3.5 space-y-1">
              <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Zap size={16} />
              </div>
              <p className="text-xs font-bold">Жоғары жылдамдық</p>
              <p className="text-[11px] text-muted-foreground">
                Groq LPU чиптерінде 0.5 секундта тану
              </p>
            </div>

            <div className="rounded-2xl bg-muted/30 p-3.5 space-y-1">
              <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Volume2 size={16} />
              </div>
              <p className="text-xs font-bold">Табиғи дауыс</p>
              <p className="text-[11px] text-muted-foreground">
                Қазақ және орыс тілдеріндегі Edge-TTS
              </p>
            </div>

            <div className="rounded-2xl bg-muted/30 p-3.5 space-y-1">
              <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Bot size={16} />
              </div>
              <p className="text-xs font-bold">Ақылды сараптама</p>
              <p className="text-[11px] text-muted-foreground">
                Llama 3.3 моделінен білім беру жауаптары
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
