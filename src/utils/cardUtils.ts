import { Card, CardColor, CardType } from "../types";

// Generate a complete 108-card standard UNO deck
export function createUnoDeck(): Card[] {
  const deck: Card[] = [];
  const colors: CardColor[] = ["Red", "Blue", "Green", "Yellow"];

  colors.forEach((color) => {
    // Number 0 (1 card per color)
    deck.push({
      id: `${color}-0-${Math.random().toString(36).substring(2, 7)}`,
      color,
      type: "0",
      value: "0",
    });

    // Numbers 1-9 (2 cards per color)
    for (let num = 1; num <= 9; num++) {
      const numStr = num.toString() as CardType;
      deck.push({
        id: `${color}-${numStr}-a-${Math.random().toString(36).substring(2, 7)}`,
        color,
        type: numStr,
        value: numStr,
      });
      deck.push({
        id: `${color}-${numStr}-b-${Math.random().toString(36).substring(2, 7)}`,
        color,
        type: numStr,
        value: numStr,
      });
    }

    // Action cards: Skip, Reverse, Draw Two (2 of each per color)
    const actions: { type: CardType; val: string }[] = [
      { type: "Skip", val: "⊘" },
      { type: "Reverse", val: "⇄" },
      { type: "DrawTwo", val: "+2" },
    ];

    actions.forEach((act) => {
      deck.push({
        id: `${color}-${act.type}-a-${Math.random().toString(36).substring(2, 7)}`,
        color,
        type: act.type,
        value: act.val,
      });
      deck.push({
        id: `${color}-${act.type}-b-${Math.random().toString(36).substring(2, 7)}`,
        color,
        type: act.type,
        value: act.val,
      });
    });
  });

  // Wild Cards: Wild and Wild Draw Four (4 cards each)
  for (let i = 0; i < 4; i++) {
    deck.push({
      id: `Wild-Wild-${i}-${Math.random().toString(36).substring(2, 7)}`,
      color: "Wild",
      type: "Wild",
      value: "🎨",
    });
    deck.push({
      id: `Wild-WildFour-${i}-${Math.random().toString(36).substring(2, 7)}`,
      color: "Wild",
      type: "WildFour",
      value: "+4",
    });
  }

  return deck;
}

// Fisher-Yates Shuffle algorithm
export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Check if a card is playable given the current top card and active selected color
export function isCardPlayable(
  card: Card,
  topCard: Card,
  activeColor: CardColor | null
): boolean {
  // Wild cards can always be played
  if (card.color === "Wild") {
    return true;
  }

  // If there's a selected wildcard color, we must match it
  if (activeColor && activeColor !== "Wild") {
    return card.color === activeColor || card.type === topCard.type;
  }

  // Otherwise, match color or card type
  return card.color === topCard.color || card.type === topCard.type;
}
export function getCardBgClass(color: CardColor): string {
  switch (color) {
    case "Red":
      return "bg-[#ED1C24] text-white border-2 border-white shadow-lg shadow-red-900/10";
    case "Blue":
      return "bg-[#0054A6] text-white border-2 border-white shadow-lg shadow-blue-900/10";
    case "Green":
      return "bg-[#00A651] text-white border-2 border-white shadow-lg shadow-green-900/10";
    case "Yellow":
      return "bg-[#FFD700] text-slate-900 border-2 border-white shadow-lg shadow-yellow-900/10";
    case "Wild":
    default:
      return "bg-gradient-to-br from-[#ED1C24] via-[#FFD700] via-[#00A651] to-[#0054A6] text-white border-2 border-white shadow-2xl";
  }
}

export function getCardColorLabel(color: CardColor): string {
  switch (color) {
    case "Red":
      return "紅色";
    case "Blue":
      return "藍色";
    case "Green":
      return "綠色";
    case "Yellow":
      return "黃色";
    case "Wild":
      return "萬能";
    default:
      return "未知";
  }
}
