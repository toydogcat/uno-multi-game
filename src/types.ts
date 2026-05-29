export type CardColor = "Red" | "Blue" | "Green" | "Yellow" | "Wild";

export type CardType =
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "Skip"
  | "Reverse"
  | "DrawTwo"
  | "Wild"
  | "WildFour";

export interface Card {
  id: string; // unique random id per card
  color: CardColor;
  type: CardType;
  value: string; // display character or symbol
}

export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  cardsCount: number;
  unoDeclared: boolean;
  connected: boolean;
}

// Client-view of the Game State (Masked for privacy)
export interface GameState {
  players: Player[];
  myHand: Card[];
  discardPile: Card[]; // top of pile is last element
  activePlayerId: string | null;
  direction: "clockwise" | "counter-clockwise";
  selectedColor: CardColor | null; // Selected color if top is wild
  isStarted: boolean;
  winnerPlayerId: string | null;
  drawCountPenalty: number; // accumulated draw count penalty (if stacking +2s, or just tracking pending draw penalties)
  lastActionLog: string;
  hasDrawnThisTurn: boolean; // whether active player drew a card and has option to play/pass
}

// Full authority Game State (Only hosted by the Host)
export interface HostGameState {
  players: {
    id: string;
    name: string;
    isHost: boolean;
    hand: Card[];
    unoDeclared: boolean;
    connected: boolean;
  }[];
  deck: Card[];
  discardPile: Card[];
  activePlayerIndex: number;
  direction: "clockwise" | "counter-clockwise";
  selectedColor: CardColor | null;
  isStarted: boolean;
  winnerPlayerId: string | null;
  lastActionLog: string;
  hasDrawnThisTurn: boolean;
}

// RTC Messaging definitions
export type ClientMessage =
  | { type: "PING" }
  | { type: "SET_PLAYER_NAME"; name: string }
  | { type: "PLAY_CARD"; cardId: string; chosenColor?: CardColor }
  | { type: "DRAW_CARD" }
  | { type: "PASS_TURN" }
  | { type: "DECLAR_UNO" }
  | { type: "CALLOUT_PLAYER"; targetId: string };

export type HostMessage =
  | { type: "PONG" }
  | { type: "STATE_UPDATE"; state: GameState }
  | { type: "GAME_OVER"; winnerName: string }
  | { type: "ERROR_MSG"; message: string };
