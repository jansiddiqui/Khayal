"""Speech screening placeholder (CLAUDE.md section 6).

The real model (Whisper transcript + fine-tuned BERT risk score) will implement the same
`score(audio_path) -> SpeechResult` interface. Until then nothing is transcribed or scored:
the UI says "Analysis coming soon" and no number is ever made up.
"""

from dataclasses import dataclass
from pathlib import Path

MODEL_VERSION = "stub-0"


@dataclass(frozen=True)
class SpeechResult:
    transcript: str | None
    risk_score: float | None
    model_version: str


def score(audio_path: Path) -> SpeechResult:
    """No analysis yet: always returns an empty result tagged with the stub's version."""
    return SpeechResult(transcript=None, risk_score=None, model_version=MODEL_VERSION)
