import type { ComponentType } from "react";
import type { CardFace } from "../../memoryMatch/logic";
import type { ArtProps } from "./Art";
import { Chai } from "./Chai";
import { Coconut } from "./Coconut";
import { CricketBat } from "./CricketBat";
import { Diya } from "./Diya";
import { Elephant } from "./Elephant";
import { Kite } from "./Kite";
import { Mango } from "./Mango";
import { Marigold } from "./Marigold";
import { Rickshaw } from "./Rickshaw";
import { Roti } from "./Roti";

/** The picture on each Memory Match card face. */
export const CARD_ART: Record<CardFace, ComponentType<ArtProps>> = {
  chai: Chai,
  roti: Roti,
  mango: Mango,
  auto: Rickshaw,
  marigold: Marigold,
  cricket: CricketBat,
  diya: Diya,
  kite: Kite,
  elephant: Elephant,
  coconut: Coconut,
};
