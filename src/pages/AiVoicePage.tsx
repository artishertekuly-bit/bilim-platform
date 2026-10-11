import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import VoiceAssistantWidget from '@/components/ai-tools/VoiceAssistantWidget';
import { Mic, Sparkles } from 'lucide-react';

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
          title="Дауыстық көмекші"
        />

        <div className="mx-auto max-w-2xl">
          <VoiceAssistantWidget defaultLanguage="kk" />
        </div>
      </div>
    </DashboardLayout>
  );
}
