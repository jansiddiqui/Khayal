"""Festivals a caregiver can tick for About Today's festival question (docs/games/research.md D6).

The dates live with the question in the frontend (games/dailyOrientation/festivals, one table per
year); the server only stores which festivals the family celebrates. Nothing ticked = no question.
"""

from typing import Literal

FestivalId = Literal[
    "makar_sankranti",
    "pongal",
    "holi",
    "eid_ul_fitr",
    "vaisakhi",
    "bakrid",
    "onam",
    "raksha_bandhan",
    "janmashtami",
    "ganesh_chaturthi",
    "durga_puja",
    "dussehra",
    "diwali",
    "guru_nanak_jayanti",
    "christmas",
]
