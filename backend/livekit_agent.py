"""
Bilim Platform — LiveKit Voice Agent (GoPrep Architecture)
100% GoPrep / Preppy стиліндегі шынайы уақыттағы WebRTC дауыстық агенті:
- STT: Deepgram Nova-2 (~150 мс ағындық транскрипция)
- LLM: Groq (Llama 3 / GPT-OSS) (~150 мс найзағайдай жылдам жауап)
- TTS: Cartesia Sonic (~90 мс ағындық табиғи дауыс)
- VAD: Silero VAD (Barge-in / сөзді бөлу және үнсіздікті автоматты сезу)

Іске қосу:
  python backend/livekit_agent.py dev
немесе
  python backend/livekit_agent.py start
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from dotenv import load_dotenv

# Жобаның .env файлдарын жүктеу
ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")
load_dotenv(ROOT_DIR / "backend" / ".env")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("bilimcorp.livekit_agent")

SYSTEM_PROMPT = """Сен — Bilim Platform платформасының ақылды дауыстық көмекшісісің.
Пайдаланушымен LiveKit WebRTC арқылы нақты уақытта (GoPrep стилінде) сөйлесіп тұрсың.
ЕРЕЖЕЛЕР:
1. Жауабың тыңдауға өте ыңғайлы, табиғи, мейірімді әрі қарапайым болсын.
2. Ешқашан markdown, жұлдызшалар (*), кестелер немесе кодты қолданба.
3. Әр жауабың шағын, қысқа әрі нақты болсын (1-3 сөйлем).
4. Пайдаланушы қай тілде сөйлесе (қазақша немесе орысша), дәл сол тілде жауап бер."""


def create_agent():
    try:
        from livekit.agents import AutoSubscribe, JobContext, WorkerOptions, cli
        from livekit.agents.voice_assistant import VoiceAssistant
        from livekit.plugins import cartesia, deepgram, groq, silero
    except ImportError as exc:
        logger.error(
            "LiveKit Agents кітапханалары орнатылмаған!\n"
            "Орнату үшін келесі команданы орындаңыз:\n"
            "  pip install livekit-agents livekit-plugins-deepgram livekit-plugins-cartesia livekit-plugins-groq livekit-plugins-silero\n"
        )
        raise exc

    async def entrypoint(ctx: JobContext):
        logger.info(f"Жаңа LiveKit бөлмесіне қосылуда: {ctx.room.name}")
        await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

        # 1. VAD (Silero)
        vad_plugin = silero.VAD.load()

        # 2. STT (Deepgram Nova-2)
        deepgram_key = os.getenv("DEEPGRAM_API_KEY", "")
        stt_plugin = deepgram.STT(
            api_key=deepgram_key or None,
            model="nova-2",
            language="multi",
        )

        # 3. LLM (Groq)
        groq_key = os.getenv("GROQ_API_KEY", "")
        groq_model = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
        llm_plugin = groq.LLM(
            api_key=groq_key or None,
            model=groq_model,
        )

        # 4. TTS (Cartesia Sonic)
        cartesia_key = os.getenv("CARTESIA_API_KEY", "")
        tts_plugin = cartesia.TTS(
            api_key=cartesia_key or None,
            model="sonic",
        )

        # Voice Assistant құрастыру
        assistant = VoiceAssistant(
            vad=vad_plugin,
            stt=stt_plugin,
            llm=llm_plugin,
            tts=tts_plugin,
            system_prompt=SYSTEM_PROMPT,
        )

        assistant.start(ctx.room)
        logger.info(f"Дауыстық көмекші бөлмеде белсенді: {ctx.room.name}")

        try:
            await assistant.say(
                "Сәлеметсіз бе! Мен Bilim көмекшісімін. Сұрағыңызды қоя беріңіз.",
                allow_interruptions=True,
            )
        except Exception as say_err:
            logger.warning(f"Бастапқы амандасу оқылмады: {say_err}")

    return WorkerOptions(entrypoint_fnc=entrypoint)


if __name__ == "__main__":
    from livekit.agents import cli
    cli.run_app(create_agent())
