import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardColor, GameState, HostGameState, Player, ClientMessage, HostMessage } from "../types";
import { createUnoDeck, shuffleDeck, isCardPlayable } from "../utils/cardUtils";
import mqtt from "mqtt";

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

  // MQTT client ref for signaling
  const mqttClient = useRef<any>(null);

  // Helper to generate unique short IDs
  const generateId = (length = 6): string => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  // Utility to send signaling message via MQTT
  const sendSignal = async (
    rId: string,
    fromId: string,
    toId: string,
    type: string,
    data: any
  ) => {
    if (mqttClient.current && mqttClient.current.connected) {
      const topic = `luna/uno/${rId}/signal/${toId}`;
      mqttClient.current.publish(
        topic,
        JSON.stringify({ from: fromId, to: toId, type, data })
      );
      console.debug("Sent MQTT signal:", type, "to", toId);
    } else {
      console.warn("MQTT client not connected, failed to send signal:", type);
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

  // MQTT signaling orchestration
  const initMqttSignaling = (rId: string, pId: string, pName: string, hostFlag: boolean) => {
    const brokerUrl = "wss://broker.emqx.io:8084/mqtt";
    const clientId = `luna_uno_${hostFlag ? "host" : "guest"}_${pId}_${Math.random().toString(16).substr(2, 6)}`;
    
    try {
      mqttClient.current = mqtt.connect(brokerUrl, {
        clientId,
        clean: true,
        connectTimeout: 4000,
        reconnectPeriod: 2000,
      });

      const client = mqttClient.current;

      client.on("connect", () => {
        console.log("Connected to EMQX MQTT signaling broker successfully!");
        
        if (hostFlag) {
          client.subscribe(`luna/uno/${rId}/join`);
          client.subscribe(`luna/uno/${rId}/leave`);
          client.subscribe(`luna/uno/${rId}/signal/${pId}`);
          setWebrtcStatus("房間成功創建！等待玩家加入 🤝");
        } else {
          client.subscribe(`luna/uno/${rId}/lobby_sync`);
          client.subscribe(`luna/uno/${rId}/start`);
          client.subscribe(`luna/uno/${rId}/signal/${pId}`);
          setWebrtcStatus("已進入房間大廳，正在與房主建立 WebRTC 連線...");

          // Publish join request to Host
          client.publish(
            `luna/uno/${rId}/join`,
            JSON.stringify({ id: pId, name: pName.trim(), isHost: false })
          );
        }
      });

      client.on("message", async (topic: string, message: any) => {
        try {
          const payload = JSON.parse(message.toString());
          console.debug("Received MQTT message on", topic, payload);

          // 1. Host processes a Guest joining
          if (topic === `luna/uno/${rId}/join` && hostFlag) {
            setLobbyPlayers((prev) => {
              if (prev.find((p) => p.id === payload.id)) return prev;
              const updated = [...prev, payload];
              // Sync updated lobby with all guests
              client.publish(`luna/uno/${rId}/lobby_sync`, JSON.stringify(updated));
              return updated;
            });
          }

          // 2. Host processes a Guest leaving
          else if (topic === `luna/uno/${rId}/leave` && hostFlag) {
            setLobbyPlayers((prev) => {
              const updated = prev.filter((p) => p.id !== payload.playerId);
              // Sync updated lobby with all guests
              client.publish(`luna/uno/${rId}/lobby_sync`, JSON.stringify(updated));
              return updated;
            });

            // Close P2P connection
            const pc = peerConnections.current[payload.playerId];
            if (pc) {
              pc.close();
              delete peerConnections.current[payload.playerId];
            }
            delete dataChannels.current[payload.playerId];
          }

          // 3. Guest processes updated lobby sync list
          else if (topic === `luna/uno/${rId}/lobby_sync` && !hostFlag) {
            setLobbyPlayers(payload);
          }

          // 4. Guest processes game started trigger
          else if (topic === `luna/uno/${rId}/start` && !hostFlag) {
            setIsStarted(true);
          }

          // 5. Incoming signaling handshake (offer, answer, candidate)
          else if (topic === `luna/uno/${rId}/signal/${pId}`) {
            if (hostFlag) {
              const peerId = payload.from;
              const pc = peerConnections.current[peerId];
              if (pc) {
                if (payload.type === "answer") {
                  await pc.setRemoteDescription(new RTCSessionDescription(payload.data));
                  console.log(`Coupled WebRTC handshake answer for Peer ${peerId}`);
                } else if (payload.type === "candidate") {
                  try {
                    await pc.addIceCandidate(new RTCIceCandidate(payload.data));
                  } catch (err) {
                    console.warn("Host candidate adding warning:", err);
                  }
                }
              }
            } else {
              // Guest receiving signaling from Host
              if (payload.type === "offer") {
                const pc = new RTCPeerConnection(STUN_SERVERS);
                peerConnectionSingle.current = pc;
                setWebrtcStatus("收到房主 Offer... 建立並回覆 Answer 連線。");

                pc.ondatachannel = (event) => {
                  const dc = event.channel;
                  dataChannelSingle.current = dc;
                  setWebrtcStatus("與房主的 P2P DataChannel 接通！等待遊戲開始... ⚡");

                  dc.onopen = () => {
                    console.log("Client RTC Channel Open with Host.");
                    dc.send(JSON.stringify({ type: "PING" }));
                  };

                  dc.onclose = () => {
                    console.warn("Client RTC Channel Closed");
                  };

                  dc.onmessage = (e) => {
                    try {
                      const payloadState = JSON.parse(e.data);
                      if (payloadState.type === "STATE_UPDATE") {
                        setGameState(payloadState.state);
                        setIsStarted(payloadState.state.isStarted);
                      }
                    } catch (err) {
                      console.error("Client parsing rtc state failed", err);
                    }
                  };
                };

                pc.onicecandidate = (e) => {
                  if (e.candidate) {
                    sendSignal(rId, pId, payload.from, "candidate", e.candidate);
                  }
                };

                await pc.setRemoteDescription(new RTCSessionDescription(payload.data));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                await sendSignal(rId, pId, payload.from, "answer", answer);
              } else if (payload.type === "candidate" && peerConnectionSingle.current) {
                try {
                  await peerConnectionSingle.current.addIceCandidate(new RTCIceCandidate(payload.data));
                } catch (err) {
                  console.warn("Guest candidate adding warning:", err);
                }
              }
            }
          }
        } catch (e) {
          console.error("Error parsing MQTT payload:", e);
        }
      });

      client.on("error", (err: any) => {
        console.error("MQTT client error:", err);
        setWebrtcStatus("連線服務出錯，請重試。");
      });
    } catch (e) {
      console.error("Failed to connect MQTT:", e);
    }
  };

  // REST endpoints integration replaced by local frontend logic and MQTT setup
  const createRoom = async (name: string) => {
    if (!name.trim()) return;
    setIsConnecting(true);
    setWebrtcStatus("正在創建房間...");
    try {
      const generatedRoomId = generateId(5);
      const generatedPlayerId = generateId(8);
      
      setRoomId(generatedRoomId);
      setPlayerId(generatedPlayerId);
      setPlayerName(name.trim());
      setIsHost(true);
      
      setLobbyPlayers([
        {
          id: generatedPlayerId,
          name: name.trim(),
          isHost: true,
        },
      ]);
      
      initMqttSignaling(generatedRoomId, generatedPlayerId, name.trim(), true);
    } catch (err) {
      console.error(err);
      setWebrtcStatus("房間創建失敗。請重試。");
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
      const generatedPlayerId = generateId(8);
      
      setRoomId(cleanRId);
      setPlayerId(generatedPlayerId);
      setPlayerName(name.trim());
      setIsHost(false);
      
      initMqttSignaling(cleanRId, generatedPlayerId, name.trim(), false);
    } catch (err) {
      console.error(err);
      setWebrtcStatus("加入房間失敗。");
      setIsConnecting(false);
    } finally {
      setIsConnecting(false);
    }
  };

  const leaveRoom = async () => {
    if (roomId && playerId) {
      try {
        if (mqttClient.current && mqttClient.current.connected) {
          mqttClient.current.publish(
            `luna/uno/${roomId}/leave`,
            JSON.stringify({ playerId })
          );
        }
      } catch (err) {
        console.error(err);
      }
    }
    
    // Close MQTT connection
    if (mqttClient.current) {
      try {
        mqttClient.current.end();
      } catch (err) {
        console.error(err);
      }
      mqttClient.current = null;
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
      // Notify guests via MQTT that the game is starting and lobby is locked
      if (mqttClient.current && mqttClient.current.connected) {
        mqttClient.current.publish(
          `luna/uno/${roomId}/start`,
          JSON.stringify({ locked: true })
        );
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
  // Connection Signaling Orchestration (MQTT Real-Time Push Handshake)
  // ---------------------------------------------------------------------------

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
