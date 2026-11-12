# Milestone 8: voice task screenshots

All shots are 375 × 812 with Read aloud on, signed in as Kamala (the demo patient with the voice task turned on). For the recording shots, a test tone stood in for the microphone; it went through the real recorder, upload and stub.

| Screen | Shot |
|---|---|
| Tell me about a picture: picture, instruction, Start | ![](01-voice-start-375.png) |
| Recording: Stop and the sound-level bar, no countdown | ![](02-voice-recording-375.png) |
| After Stop: saved, "Thank you, that was lovely.", Next game | ![](03-voice-thank-you-375.png) |
| Today's games: the voice task in slot 3, done today | ![](04-games-with-voice-task-375.png) |
| Caregiver: Voice recordings (consent toggle, date, length, playback, "Analysis coming soon") | ![](05-caregiver-voice-recordings-375.png) |

Notes:
- The playback controls are the browser's own `<audio>` element. The screenshot renderer draws them as an empty grey bar.
- Caregiver times are shown in the browser's time zone. The screenshot browser ran in UTC, so 12:20 IST shows as 6:50 am.
