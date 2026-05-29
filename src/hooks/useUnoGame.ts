import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardColor, GameState, HostGameState, Player, ClientMessage, HostMessage } from "../types";
import { createUnoDeck, shuffleDeck, isCardPlayable } from "../utils/cardUtils";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

const STUN_SERVERS = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export function useUnoGame() {
  // Connection / Signalling variables
  const [roomId, setRoomId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState<string>("");
  const [isHost, setIsHost] = useState<boolean>(false);
  const [lobbyPlayers, setLobbyPlayers] = useState<Player[]>([]);
  const [webrtcStatus, setWebrtcStatus] = useState<string>("");
  
  // Game States
  const [isStarted, setIsStarted] = useState<boolean>(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);

  // Wild color picker selection overlay trigger
  const [wildcardSelection, setWildcardSelection] = useState<{
    cardId: string;
    type: "Wild" | "WildFour";
  } | null>(null);

  // Refs for tracking active WebRTC objects (Host matches multi-peers, Peer matches single Host connection)
  const peerConnections = useRef<Record<string, RTCPeerConnection>>({});
  const dataChannels = useRef<Record<string, RTCDataChannel>>({});
  const peerConnectionSingle = useRef<RTCPeerConnection | null>(null);
  const dataChannelSingle = useRef<RTCDataChannel | null>(null);

  // Host Authoritative state ref (Only loaded on Host client)
  const hostState = useRef<HostGameState | null>(null);

  // Utility to send signaling message via HTTP to our Express server
  const sendSignal = async (
    rId: string,
    fromId: string,
    toId: string,
    type: string,
    data: any
  ) => {
    try {
      await fetch(`${API_BASE}/api/rooms/${rId}/signal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: fromId, to: toId, type, data }),
      });
    } catch (e) {
      console.error("Failed to send Signal", e);
    }
  };

  // Helper: Broadcast game state to all connected guests over WebRTC
  const hostBroadcastState = useCallback(() => {
    if (!isHost || !hostState.current) return;
    
    // Build and push masked game states customized for each player
    hostState.current.players.forEach((player) => {
      const myHand = player.hand;
      
      const maskedPlayers: Player[] = hostState.current!.players.map((p) => ({
        id: p.id,
        name: p.name,
        isHost: p.isHost,
        cardsCount: p.hand.length,
        unoDeclared: p.unoDeclared,
        connected: p.connected,
      }));

      const topDiscard = hostState.current!.discardPile[hostState.current!.discardPile.length - 1];
      const activePlayer = hostState.current!.players[hostState.current!.activePlayerIndex];

      const clientStatePayload: GameState = {
        players: maskedPlayers,
        myHand,
        discardPile: [topDiscard], // send only top card
        activePlayerId: activePlayer ? activePlayer.id : null,
        direction: hostState.current!.direction,
        selectedColor: hostState.current!.selectedColor,
        isStarted: hostState.current!.isStarted,
        winnerPlayerId: hostState.current!.winnerPlayerId,
        drawCountPenalty: 0, // simple penalty logic handled server-side directly
        lastActionLog: hostState.current!.lastActionLog,
        hasDrawnThisTurn: hostState.current!.hasDrawnThisTurn,
      };

      // Set host's own local state view matching what he owns
      if (player.id === playerId) {
        setGameState(clientStatePayload);
        setIsStarted(clientStatePayload.isStarted);
      } else {
        // Send state to Peer via WebRTC DataChannel
        const dc = dataChannels.current[player.id];
        if (dc && dc.readyState === "open") {
          try {
            dc.send(
              JSON.stringify({
                type: "STATE_UPDATE",
                state: clientStatePayload,
              })
            );
          } catch (err) {
            console.error(`Error sending state update to ${player.name}`, err);
          }
        }
      }
    });
  }, [isHost, playerId]);

  // REST endpoints integration
  const createRoom = async (name: string) => {
    if (!name.trim()) return;
    setIsConnecting(true);
    setWebrtcStatus("正在創建房間...");
    try {
      const response = await fetch(`${API_BASE}/api/rooms/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostName: name.trim() }),
      });
      const data = await response.json();
      if (data.error) {
        alert(data.error);
        setIsConnecting(false);
        return;
      }
      setRoomId(data.roomId);
      setPlayerId(data.playerId);
      setPlayerName(name.trim());
      setIsHost(true);
      setWebrtcStatus("房間成功創建！等待玩家加入 🤝");
    } catch (err) {
      console.error(err);
      setWebrtcStatus("無法連接到伺服器。請稍後重試。");
    } finally {
      setIsConnecting(false);
    }
  };

  const joinRoom = async (rId: string, name: string) => {
    if (!rId.trim() || !name.trim()) return;
    setIsConnecting(true);
    setWebrtcStatus("尋找並加入房間中...");
    const cleanRId = rId.toUpperCase().trim();
    try {
      const response = await fetch(`${API_BASE}/api/rooms/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: cleanRId, playerName: name.trim() }),
      });
      const data = await response.json();
      if (data.error) {
        alert(data.error);
        setIsConnecting(false);
        setWebrtcStatus("");
        return;
      }
      setRoomId(cleanRId);
      setPlayerId(data.playerId);
      setPlayerName(name.trim());
      setIsHost(false);
      setWebrtcStatus("已進入房間大廳，正在與房主建立 WebRTC 連線...");
    } catch (err) {
      console.error(err);
      setWebrtcStatus("連線失敗。請檢查代碼或網路狀況。");
      setIsConnecting(false);
    }
  };

  const leaveRoom = async () => {
    if (roomId && playerId) {
      try {
        await fetch(`${API_BASE}/api/rooms/${roomId}/leave`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId }),
        });
      } catch (err) {
        console.error(err);
      }
    }
    // Release RTC Peerconnections
    (Object.values(peerConnections.current) as any[]).forEach((pc) => {
      if (pc && typeof pc.close === "function") {
        pc.close();
      }
    });
    peerConnections.current = {};
    dataChannels.current = {};
    if (peerConnectionSingle.current) {
      peerConnectionSingle.current.close();
      peerConnectionSingle.current = null;
    }
    dataChannelSingle.current = null;

    // Reset local state fields
    setRoomId(null);
    setPlayerId(null);
    setGameState(null);
    setIsStarted(false);
    setIsHost(false);
    setLobbyPlayers([]);
    webrtcStatus && setWebrtcStatus("");
  };

  // Host Action: Lock current room and start game
  const startGame = useCallback(async () => {
    if (!isHost || !roomId || !playerId) return;
    try {
      const res = await fetch(`${API_BASE}/api/rooms/${roomId}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
        return;
      }

      // Initialize UNO Deck & Shuffling
      let rawDeck = createUnoDeck();
      rawDeck = shuffleDeck(rawDeck);

      // Distribute 7 cards to each lobby player
      const playersHand = lobbyPlayers.map((p) => {
        const hand: Card[] = [];
        for (let i = 0; i < 7; i++) {
          const card = rawDeck.pop();
          if (card) hand.push(card);
        }
        return {
          id: p.id,
          name: p.name,
          isHost: p.isHost,
          hand,
          unoDeclared: false,
          connected: true,
        };
      });

      // Draw initial top discard card (Must be a numeric/color non-wild card to start nicely)
      let initialDiscard: Card | undefined = undefined;
      const leftoverDeck: Card[] = [];

      for (let i = 0; i < rawDeck.length; i++) {
        const card = rawDeck[i];
        if (!initialDiscard && card.color !== "Wild") {
          initialDiscard = card;
        } else {
          leftoverDeck.push(card);
        }
      }

      // Fallback in extreme case
      if (!initialDiscard) {
        initialDiscard = rawDeck.pop();
      }

      // Setup Authoritative Game State in Host client
      hostState.current = {
        players: playersHand,
        deck: leftoverDeck,
        discardPile: [initialDiscard!],
        activePlayerIndex: 0,
        direction: "clockwise",
        selectedColor: initialDiscard!.color !== "Wild" ? initialDiscard!.color : "Red",
        isStarted: true,
        winnerPlayerId: null,
        lastActionLog: "遊戲開始！首張牌為 " + initialDiscard!.color + " " + initialDiscard!.value,
        hasDrawnThisTurn: false,
      };

      setIsStarted(true);
      hostBroadcastState();
    } catch (err) {
      console.error("Game starting failed:", err);
    }
  }, [isHost, roomId, playerId, lobbyPlayers, hostBroadcastState]);

  // Host game state processor (Resolves player incoming moves)
  const hostProcessGameAction = useCallback(
    (senderId: string, actionJsonStr: string) => {
      if (!isHost || !hostState.current) return;
      
      let action: ClientMessage;
      try {
        action = JSON.parse(actionJsonStr);
      } catch (e) {
        console.error("Failed to parse game action", e);
        return;
      }

      const hState = hostState.current;
      const activePlayer = hState.players[hState.activePlayerIndex];
      const roundPlayers = hState.players;

      if (action.type === "PING") {
        const dc = dataChannels.current[senderId];
        if (dc && dc.readyState === "open") {
          dc.send(JSON.stringify({ type: "PONG" }));
        }
        return;
      }

      // 1. Play Card Action
      if (action.type === "PLAY_CARD") {
        if (activePlayer.id !== senderId) {
          console.warn("Not player's turn to play!");
          return;
        }

        const { cardId, chosenColor } = action;
        const cardIndex = activePlayer.hand.findIndex((c) => c.id === cardId);
        if (cardIndex === -1) {
          console.warn("Card not found in player's hand");
          return;
        }

        const cardPlayed = activePlayer.hand[cardIndex];
        const topDiscard = hState.discardPile[hState.discardPile.length - 1];

        // Ensure is valid play
        if (!isCardPlayable(cardPlayed, topDiscard, hState.selectedColor)) {
          console.warn("This card is not legal to play!");
          return;
        }

        // Action legal! Remove card from hand
        activePlayer.hand.splice(cardIndex, 1);
        hState.discardPile.push(cardPlayed);

        let actionLog = `${activePlayer.name} 出了一張 ${cardPlayed.color !== "Wild" ? cardPlayed.color : "萬能"} [${cardPlayed.value}]`;

        // Handle card effects and color choice selection
        let nextPlayerStep = 1;
        let forceDrawNumber = 0;

        if (cardPlayed.color === "Wild") {
          hState.selectedColor = chosenColor || "Red";
          actionLog += `，並指定顏色為 ${hState.selectedColor}`;
        } else {
          hState.selectedColor = cardPlayed.color;
        }

        if (cardPlayed.type === "Skip") {
          nextPlayerStep = 2; // Advance past next player
          const skippedIndex = (hState.activePlayerIndex + (hState.direction === "clockwise" ? 1 : -1) + roundPlayers.length) % roundPlayers.length;
          actionLog += `，跳過了 ${roundPlayers[skippedIndex].name}`;
        } else if (cardPlayed.type === "Reverse") {
          if (roundPlayers.length === 2) {
            nextPlayerStep = 2; // In 2P, Reverse acts like a Skip
            actionLog += `，跳過對手回合`;
          } else {
            hState.direction = hState.direction === "clockwise" ? "counter-clockwise" : "clockwise";
            actionLog += `，改變了出牌方向 ⇄`;
          }
        } else if (cardPlayed.type === "DrawTwo") {
          forceDrawNumber = 2;
          nextPlayerStep = 2; // drawing forces skip
        } else if (cardPlayed.type === "WildFour") {
          forceDrawNumber = 4;
          nextPlayerStep = 2; // drawing forces skip
        }

        // Reset turn drawing constraint
        hState.hasDrawnThisTurn = false;

        // Auto reset UNO declared status when playing cards, unless they have exactly 1 card and declared it
        if (activePlayer.hand.length !== 1) {
          activePlayer.unoDeclared = false;
        }

        // Draw card penalties resolution (Draw, add to target player hand, skip turn)
        if (forceDrawNumber > 0) {
          const targetIndex =
            (hState.activePlayerIndex + (hState.direction === "clockwise" ? 1 : -1) + roundPlayers.length) % roundPlayers.length;
          const penalisedPlayer = roundPlayers[targetIndex];
          
          actionLog += `，罰 ${penalisedPlayer.name} 抽 ${forceDrawNumber} 張牌並禁言一回合！`;

          for (let d = 0; d < forceDrawNumber; d++) {
            if (hState.deck.length === 0) {
              // Recycle discard pile
              const topC = hState.discardPile.pop();
              hState.deck = shuffleDeck([...hState.discardPile]);
              hState.discardPile = [topC!];
            }
            const c = hState.deck.pop();
            if (c) penalisedPlayer.hand.push(c);
          }
          penalisedPlayer.unoDeclared = false;
        }

        // Check Winner condition
        if (activePlayer.hand.length === 0) {
          hState.winnerPlayerId = activePlayer.id;
          actionLog = `🎉 恭喜！${activePlayer.name} 已經打完所有手牌，贏得了這局 UNO ！！`;
        }

        // Set turn next index
        const dirSign = hState.direction === "clockwise" ? 1 : -1;
        hState.activePlayerIndex =
          (hState.activePlayerIndex + (nextPlayerStep * dirSign) + roundPlayers.length) % roundPlayers.length;

        hState.lastActionLog = actionLog;
        hostBroadcastState();
      }

      // 2. Draw Card Action
      else if (action.type === "DRAW_CARD") {
        if (activePlayer.id !== senderId) return;
        if (hState.hasDrawnThisTurn) return;

        // Draw a card
        if (hState.deck.length === 0) {
          const topC = hState.discardPile.pop();
          hState.deck = shuffleDeck([...hState.discardPile]);
          hState.discardPile = [topC!];
        }

        const drawnCard = hState.deck.pop();
        if (drawnCard) {
          activePlayer.hand.push(drawnCard);
          hState.hasDrawnThisTurn = true;
          activePlayer.unoDeclared = false;

          hState.lastActionLog = `${activePlayer.name} 抽了一張牌`;
          hostBroadcastState();
        }
      }

      // 3. Pass Turn Action (Can only be triggered if they drew a card this turn)
      else if (action.type === "PASS_TURN") {
        if (activePlayer.id !== senderId) return;
        if (!hState.hasDrawnThisTurn) return;

        const dirSign = hState.direction === "clockwise" ? 1 : -1;
        hState.activePlayerIndex = (hState.activePlayerIndex + dirSign + roundPlayers.length) % roundPlayers.length;
        hState.hasDrawnThisTurn = false;

        hState.lastActionLog = `${activePlayer.name} 選擇過牌，輪到下一位`;
        hostBroadcastState();
      }

      // 4. Declare UNO (Self calling before caught)
      else if (action.type === "DECLAR_UNO") {
        const callerPlayer = roundPlayers.find((p) => p.id === senderId);
        if (callerPlayer && callerPlayer.hand.length <= 2) {
          callerPlayer.unoDeclared = true;
          hState.lastActionLog = `📢 ${callerPlayer.name} 大喊了 「UNO！！」`;
          hostBroadcastState();
        }
      }

      // 5. Catch UNO on a target (Callout player)
      else if (action.type === "CALLOUT_PLAYER") {
        const callerPlayer = roundPlayers.find((p) => p.id === senderId);
        const { targetId } = action;
        const targetPlayer = roundPlayers.find((p) => p.id === targetId);

        if (callerPlayer && targetPlayer && targetPlayer.hand.length === 1 && !targetPlayer.unoDeclared) {
          // Caught! Force draw 2 penalty cards for forgetting
          hState.lastActionLog = `🕵️‍♂️ ${callerPlayer.name} 抓到了 ${targetPlayer.name} 沒喊 UNO！罰抽兩張牌！`;
          
          for (let d = 0; d < 2; d++) {
            if (hState.deck.length === 0) {
              const topC = hState.discardPile.pop();
              hState.deck = shuffleDeck([...hState.discardPile]);
              hState.discardPile = [topC!];
            }
            const c = hState.deck.pop();
            if (c) targetPlayer.hand.push(c);
          }
          targetPlayer.unoDeclared = false; // Reset status
          hostBroadcastState();
        }
      }
    },
    [isHost, hostBroadcastState]
  );

  // Dispatch action from peer to Host (uses local host state if isHost, or sends over RTC DataChannel if guest)
  const sendGameAction = useCallback(
    (action: ClientMessage) => {
      if (isHost) {
        // Direct execution on host structure
        if (playerId) {
          hostProcessGameAction(playerId, JSON.stringify(action));
        }
      } else {
        // Send to host over WebRTC
        const dc = dataChannelSingle.current;
        if (dc && dc.readyState === "open") {
          try {
            dc.send(JSON.stringify(action));
          } catch (e) {
            console.error("P2P Game action sending failed", e);
          }
        }
      }
    },
    [isHost, playerId, hostProcessGameAction]
  );

  // Core P2P Game UI Interactions bindings (play, draw, pass, declare, catch)
  const playCard = (cardId: string) => {
    const card = gameState?.myHand.find((c) => c.id === cardId);
    if (!card) return;

    // Trigger wild selection picker if playing Wild or Wild Draw 4
    if (card.color === "Wild") {
      setWildcardSelection({ cardId, type: card.type as "Wild" | "WildFour" });
    } else {
      sendGameAction({ type: "PLAY_CARD", cardId });
    }
  };

  const selectWildColor = (color: CardColor) => {
    if (!wildcardSelection) return;
    sendGameAction({
      type: "PLAY_CARD",
      cardId: wildcardSelection.cardId,
      chosenColor: color,
    });
    setWildcardSelection(null);
  };

  const drawCard = () => {
    sendGameAction({ type: "DRAW_CARD" });
  };

  const passTurn = () => {
    sendGameAction({ type: "PASS_TURN" });
  };

  const declareUno = () => {
    sendGameAction({ type: "DECLAR_UNO" });
  };

  const catchPlayer = (targetId: string) => {
    sendGameAction({ type: "CALLOUT_PLAYER", targetId });
  };

  // ---------------------------------------------------------------------------
  // Connection Signaling Orchestration EFFECT Loops (Interval polling)
  // ---------------------------------------------------------------------------

  // Loop A: Lobby check for Host and Guest
  useEffect(() => {
    if (!roomId) return;

    const pullLobbyData = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/rooms/${roomId}/players`);
        if (response.ok) {
          const data = await response.json();
          setLobbyPlayers(data.players || []);
          
          // Sync start state
          if (!isHost && data.locked) {
            setIsStarted(true);
          }
        }
      } catch (err) {
        console.error("Error polling room lobby players:", err);
      }
    };

    pullLobbyData();
    const interval = setInterval(pullLobbyData, 1500);
    return () => clearInterval(interval);
  }, [roomId, isHost]);

  // Loop B: Guest signaling receiver (Listen for Host WebRTC connections and candidates)
  useEffect(() => {
    if (isHost || !roomId || !playerId) return;

    let rtcConnected = false;
    const pollSignals = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/rooms/${roomId}/signals/${playerId}`);
        if (!res.ok) return;

        const data = await res.json();
        const incoming = data.signals || [];

        for (const sig of incoming) {
          console.debug("Guest received signaling:", sig.type);

          if (sig.type === "offer") {
            const pc = new RTCPeerConnection(STUN_SERVERS);
            peerConnectionSingle.current = pc;
            setWebrtcStatus("收到房聯協議 Offer... 建立並回覆 Answer 連線。");

            // Setup direct dynamic DataChannel
            pc.ondatachannel = (event) => {
              const dc = event.channel;
              dataChannelSingle.current = dc;
              setWebrtcStatus("與房主的 P2P DataChannel 接通！等待遊戲開始... ⚡");

              dc.onopen = () => {
                console.log("Client RTC Channel Open with Host.");
                // Immediately register player identity link to Host
                dc.send(JSON.stringify({ type: "PING" }));
              };

              dc.onclose = () => {
                console.warn("Client RTC Channel Closed");
              };

              // Main Client payload pipeline: Receives State broadcasts from Host
              dc.onmessage = (e) => {
                try {
                  const payload = JSON.parse(e.data);
                  if (payload.type === "STATE_UPDATE") {
                    setGameState(payload.state);
                    setIsStarted(payload.state.isStarted);
                  }
                } catch (err) {
                  console.error("Client parsing rtc state failed", err);
                }
              };
            };

            // ICE Candidates dispatch back to Host
            pc.onicecandidate = (e) => {
              if (e.candidate) {
                sendSignal(roomId, playerId, sig.from, "candidate", e.candidate);
              }
            };

            // Build RTC Connection Answers
            await pc.setRemoteDescription(new RTCSessionDescription(sig.data));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            await sendSignal(roomId, playerId, sig.from, "answer", answer);
          } else if (sig.type === "candidate" && peerConnectionSingle.current) {
            try {
              await peerConnectionSingle.current.addIceCandidate(new RTCIceCandidate(sig.data));
            } catch (err) {
              console.warn("Guest candidate adding warning:", err);
            }
          }
        }
      } catch (err) {
        console.error("Guest signaling pull failed:", err);
      }
    };

    const interval = setInterval(() => {
      if (!rtcConnected) pollSignals();
    }, 1500);
    return () => clearInterval(interval);
  }, [roomId, playerId, isHost]);

  // Loop C: Host signaling coordinator (Waits for answer/ICE candidates and initiates guest offers)
  useEffect(() => {
    if (!isHost || !roomId || !playerId) return;

    const pullGuestSignals = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/rooms/${roomId}/signals/${playerId}`);
        if (!res.ok) return;

        const data = await res.json();
        const incoming = data.signals || [];

        for (const sig of incoming) {
          console.debug("Host received signaling:", sig.type);
          const peerId = sig.from;
          const pc = peerConnections.current[peerId];

          if (pc) {
            if (sig.type === "answer") {
              await pc.setRemoteDescription(new RTCSessionDescription(sig.data));
              console.log(`Successfully coupled WebRTC RTC handshake answer with Peer ${peerId}`);
            } else if (sig.type === "candidate") {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(sig.data));
              } catch (err) {
                console.warn("Host candidate adding warning:", err);
              }
            }
          }
        }
      } catch (err) {
        console.error("Host signaling pull failed:", err);
      }
    };

    const interval = setInterval(pullGuestSignals, 1500);
    return () => clearInterval(interval);
  }, [roomId, playerId, isHost]);

  // Loop D: Host scanning Lobby list to invite newcomer guests
  useEffect(() => {
    if (!isHost || !roomId || !playerId) return;

    lobbyPlayers.forEach(async (p) => {
      // Skip self
      if (p.id === playerId) return;

      // If active PeerConnection doesn't exist yet, build offer
      if (!peerConnections.current[p.id]) {
        console.log(`Spawning WebRTC RTC handshake offering for newly joined Player: ${p.name} (${p.id})`);
        
        const pc = new RTCPeerConnection(STUN_SERVERS);
        peerConnections.current[p.id] = pc;

        // Build DataChannel
        const dc = pc.createDataChannel("uno-game-channel");
        dataChannels.current[p.id] = dc;

        dc.onopen = () => {
          console.log(`Direct RTC link to Guest ${p.name} (${p.id}) fully established!`);
          // Notify state update
          if (hostState.current) {
            hostBroadcastState();
          }
        };

        dc.onmessage = (event) => {
          hostProcessGameAction(p.id, event.data);
        };

        pc.onicecandidate = (e) => {
          if (e.candidate) {
            sendSignal(roomId, playerId, p.id, "candidate", e.candidate);
          }
        };

        // Create and send SDP Offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        await sendSignal(roomId, playerId, p.id, "offer", offer);
      }
    });
  }, [isHost, roomId, playerId, lobbyPlayers, hostBroadcastState, hostProcessGameAction]);

  // Keep Host own lobby view synchronised (until started)
  useEffect(() => {
    if (isHost && !isStarted && lobbyPlayers.length > 0) {
      const selfPlayer = lobbyPlayers.find(p => p.id === playerId);
      if (selfPlayer) {
        // Mock simple unstarted view state
        const mockedState: GameState = {
          players: lobbyPlayers,
          myHand: [],
          discardPile: [],
          activePlayerId: null,
          direction: "clockwise",
          selectedColor: null,
          isStarted: false,
          winnerPlayerId: null,
          drawCountPenalty: 0,
          lastActionLog: "等待房主開始遊戲...",
          hasDrawnThisTurn: false,
        };
        setGameState(mockedState);
      }
    }
  }, [isHost, isStarted, lobbyPlayers, playerId]);

  return {
    roomId,
    playerId,
    playerName,
    isHost,
    lobbyPlayers,
    webrtcStatus,
    isStarted,
    gameState,
    isConnecting,
    wildcardSelection,
    setWildcardSelection,
    
    // Actions
    createRoom,
    joinRoom,
    leaveRoom,
    startGame,
    playCard,
    selectWildColor,
    drawCard,
    passTurn,
    declareUno,
    catchPlayer,
  };
}
