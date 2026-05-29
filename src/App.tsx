import React, { useState, useEffect, FormEvent } from "react";
import { useUnoGame } from "./hooks/useUnoGame";
import RoomQRCode from "./components/RoomQRCode";
import CameraQRScanner from "./components/CameraQRScanner";
import { getCardBgClass, getCardColorLabel, isCardPlayable } from "./utils/cardUtils";
import { Card, CardColor } from "./types";
import {
  Plus,
  ArrowRight,
  LogOut,
  Play,
  User,
  Crown,
  HelpCircle,
  AlertCircle,
  QrCode,
  Check,
  Flame,
  Volume2,
  RefreshCw,
  Compass,
  Undo2
} from "lucide-react";

export default function App() {
  const {
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
  } = useUnoGame();

  const [inputName, setInputName] = useState<string>("");
  const [inputRoomId, setInputRoomId] = useState<string>("");
  const [showScanner, setShowScanner] = useState<boolean>(false);
  const [showHowToPlay, setShowHowToPlay] = useState<boolean>(false);

  // Read Room ID from URL if redirected via QR code
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rId = params.get("room");
    if (rId) {
      setInputRoomId(rId.toUpperCase());
    }
  }, []);

  // Luna AI Hub Scroll Sync Implementation
  useEffect(() => {
    let lastScrollY = 0;
    const scrollThreshold = 8; // Sensitivity threshold to prevent jitter

    const handleScroll = () => {
      const currentScrollY = window.scrollY || document.documentElement.scrollTop;
      if (Math.abs(currentScrollY - lastScrollY) < scrollThreshold && currentScrollY > 10) return;

      // Determine scroll direction
      const direction = currentScrollY > lastScrollY ? 'down' : 'up';

      // Broadcast scroll state to mother window (Luna AI Hub)
      window.parent.postMessage({
        type: 'iframe_scroll',
        scrollY: currentScrollY,
        direction: direction
      }, '*');

      lastScrollY = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!inputName.trim()) {
      alert("請先輸入您的暱稱");
      return;
    }
    createRoom(inputName);
  };

  const handleJoin = (e: FormEvent) => {
    e.preventDefault();
    if (!inputName.trim()) {
      alert("請輸入暱稱");
      return;
    }
    if (!inputRoomId.trim()) {
      alert("請輸入 5 位數房間代碼");
      return;
    }
    joinRoom(inputRoomId, inputName);
  };

  const onScanSuccess = (scannedRoomId: string) => {
    setInputRoomId(scannedRoomId);
    setShowScanner(false);
  };

  // Helper to color log lines elegantly
  const getLogColorClass = (log: string) => {
    if (!log) return "text-gray-500 font-bold";
    if (log.includes("抓到")) return "text-[#ED1C24] font-black italic uppercase";
    if (log.includes("大喊了")) return "text-[#ED1C24] font-black animate-pulse bg-red-50 px-3 py-1 rounded-full border-2 border-[#ED1C24]/30";
    if (log.includes("恭喜")) return "text-[#00A651] font-black text-sm uppercase italic";
    if (log.includes("抽了")) return "text-[#0054A6] font-black";
    if (log.includes("罰")) return "text-[#ED1C24] font-black";
    return "text-[#0054A6] font-extrabold";
  };

  return (
    <div id="unogame-app-container" className="min-h-screen bg-[#FFD700] text-[#0054A6] font-sans flex flex-col justify-between selection:bg-[#ED1C24] selection:text-white p-4">
      {/* HEADER BAR */}
      <header className="w-full flex justify-between items-center bg-white/30 backdrop-blur-md p-4 rounded-3xl border-4 border-white shadow-xl sticky top-4 z-40 max-w-7xl mx-auto mb-6">
        <div className="flex items-center gap-3.5">
          <div className="bg-[#ED1C24] p-3 rounded-2xl rotate-[-3deg] shadow-lg border-2 border-white">
            <h1 className="text-3xl font-black text-white italic tracking-tighter leading-none select-none">UNO!</h1>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-extrabold uppercase tracking-widest text-[#0054A6] hidden sm:inline">WebRTC Lobby</span>
            <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-[#0054A6] text-white rounded-full self-start">Peer-to-Peer</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            id="btn-rules"
            onClick={() => setShowHowToPlay(!showHowToPlay)}
            className="bg-white hover:bg-white/90 text-[#0054A6] px-4 py-2.5 rounded-full font-bold shadow-sm transition-all border-2 border-[#0054A6] flex items-center gap-1.5 cursor-pointer text-sm"
          >
            <HelpCircle size={16} className="stroke-[2.5]" />
            如何遊玩
          </button>
          {roomId && (
            <button
              id="btn-leave-room"
              onClick={leaveRoom}
              className="bg-[#ED1C24] text-white hover:bg-red-600 px-5 py-2.5 rounded-full font-bold shadow-md hover:scale-[1.02] active:scale-95 transition-all border-b-4 border-red-800 flex items-center gap-1.5 cursor-pointer text-sm"
            >
              <LogOut size={16} className="stroke-[2.5]" />
              離開房間
            </button>
          )}
        </div>
      </header>

      {/* RULES OVERLAY */}
      {showHowToPlay && (
        <div className="fixed inset-0 z-50 bg-[#0054A6]/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white border-4 border-[#0054A6] rounded-[32px] max-w-lg w-full p-8 shadow-2xl relative text-gray-700">
            <button
              onClick={() => setShowHowToPlay(false)}
              className="absolute top-4 right-4 text-[#0054A6] hover:text-[#ED1C24] transition p-1.5 hover:bg-[#FFD700]/30 rounded-full cursor-pointer font-black"
            >
              ✕
            </button>
            <h3 className="text-2xl font-black text-[#0054A6] mb-5 flex items-center gap-2 uppercase italic">
              <Compass size={24} className="text-[#0054A6] stroke-[3]" />
              UNO 遊戲規則說明
            </h3>
            <div className="text-sm font-bold space-y-4 leading-relaxed overflow-y-auto max-h-[60vh] pr-2">
              <p>UNO 是一個刺激好玩的卡牌遊戲。每位玩家最先將手牌全部打完即獲勝！</p>
              <h4 className="font-black text-[#ED1C24] mt-5 uppercase italic text-base">基本出牌：</h4>
              <ul className="list-disc pl-5 space-y-1.5 text-gray-700">
                <li>你可以打出與棄牌堆最上面那一張牌「相同顏色」或「相同數字/功能」的牌。</li>
                <li>萬能牌（🎨 變色、+4）可在您的回合任意打出，並指定下一個出牌顏色。</li>
              </ul>
              <h4 className="font-black text-[#ED1C24] mt-5 uppercase italic text-base">功能牌特殊效果：</h4>
              <ul className="list-disc pl-5 space-y-1.5 text-gray-700">
                <li><strong className="text-[#0054A6] font-black">反轉 (⇄):</strong> 改變出牌方向（順時鐘 ⇆ 逆時鐘）。當只有兩人遊玩時，其作用等同於 Skip 阻擋功能。</li>
                <li><strong className="text-[#0054A6] font-black">阻擋 (⊘):</strong> 跳過下一名玩家的回合。</li>
                <li><strong className="text-[#0054A6] font-black">罰抽兩張 (+2):</strong> 下一位玩家必須從牌堆抽 2 張牌且直接跳過該回合。</li>
                <li><strong className="text-[#0054A6] font-black">萬能罰抽四張 (+4):</strong> 改變出牌顏色，且下一位玩家必須抽 4 張牌並跳過回合。</li>
              </ul>
              <h4 className="font-black text-[#ED1C24] mt-5 uppercase italic text-base">喊 UNO 關鍵博弈 📢</h4>
              <p>
                當您打出牌後，手牌如果「<strong>只剩 1 張</strong>」，您必須主動在大廳或手牌區按下 <strong className="text-[#ED1C24] font-black">「喊 UNO！」</strong>。
              </p>
              <p>
                若您「忘記喊 UNO」，其他玩家可以點擊您暱稱旁邊的 <strong className="text-[#00A651] font-black">「抓 🕵️‍♂️」</strong>。被抓到的人將面臨「<strong>罰抽 2 張牌</strong>」的懲罰！
              </p>
            </div>
          </div>
        </div>
      )}

      {/* MAIN CONTAINER */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 flex flex-col justify-center items-center">
        
        {/* ==================== SCREEN 1: ENTRY & JOIN ==================== */}
        {!roomId && (
          <div id="screen-entry" className="w-full max-w-lg bg-white/90 backdrop-blur-md p-8 rounded-[40px] shadow-2xl border-4 border-[#0054A6] flex flex-col gap-8 text-center animate-in zoom-in-95 duration-200">
            <div>
              <h2 className="text-3xl font-black text-[#0054A6] uppercase italic tracking-tight">好玩的點對點 UNO 遊戲</h2>
              <p className="text-sm text-gray-700 font-bold mt-3 leading-relaxed">
                採用安全的 WebRTC P2P 直連技術，免去伺服器傳輸延遲，即開即玩，支援好友面對面掃描快速開房！
              </p>
            </div>

            <div className="flex flex-col gap-4 text-left">
              <label className="text-xs font-black uppercase tracking-widest text-[#0054A6]">您的暱稱 (Name)</label>
              <div className="relative">
                <User size={18} className="absolute left-4 top-4.5 text-[#0054A6] font-bold" />
                <input
                  id="input-name"
                  type="text"
                  maxLength={15}
                  value={inputName}
                  onChange={(e) => setInputName(e.target.value)}
                  placeholder="例如: 小明 / Alice"
                  className="w-full bg-white border-4 border-[#0054A6] rounded-2xl py-3.5 pl-11 pr-4 text-base focus:border-[#ED1C24] focus:outline-none transition-all text-[#0054A6] text-center font-black placeholder:text-gray-400 placeholder:font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-2">
              {/* Host Action */}
              <form onSubmit={handleCreate} className="flex flex-col">
                <button
                  id="btn-create-lobby"
                  type="submit"
                  className="w-full bg-[#ED1C24] hover:bg-red-600 hover:scale-[1.02] active:scale-95 text-white py-4 px-6 rounded-2xl font-black text-base shadow-xl border-b-4 border-red-800 transition-all flex items-center justify-center gap-2 cursor-pointer uppercase italic"
                >
                  <Plus size={18} className="stroke-[3]" />
                  創建全新房間
                </button>
              </form>

              {/* Guest Actions */}
              <button
                id="btn-trigger-join-overlay"
                onClick={() => {
                  if (!inputName.trim()) {
                    alert("請先輸入您的暱稱，再加入房間");
                    return;
                  }
                  setShowScanner(true);
                }}
                className="bg-[#0054A6] hover:bg-blue-700 hover:scale-[1.02] active:scale-95 text-white py-4 px-6 rounded-2xl font-black text-base shadow-xl border-b-4 border-blue-900 transition-all flex items-center justify-center gap-2 cursor-pointer uppercase italic"
              >
                <QrCode size={18} className="stroke-[3]" />
                加入房間 (掃碼/代碼)
              </button>
            </div>

            {/* Help warning */}
            <div className="flex gap-3 text-xs text-[#0054A6] font-bold text-left bg-[#FFD700]/20 p-4 rounded-3xl border-2 border-[#0054A6]/30 mt-2">
              <AlertCircle size={18} className="text-[#ED1C24] shrink-0 stroke-[3]" />
              <span className="text-gray-800 leading-relaxed font-black">當房主創建房間後，其他玩家可以直接「掃描 QR Code」或「貼上專屬網址」進入此大廳建立連線。</span>
            </div>
          </div>
        )}

        {/* ==================== SCREEN 2: ROOM LOBBY ==================== */}
        {roomId && !isStarted && (
          <div id="screen-lobby" className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-in fade-in duration-200">
            
            {/* Room sharing panel */}
            <div className="lg:col-span-5 flex flex-col items-center">
              <RoomQRCode roomId={roomId} playerCount={lobbyPlayers.length} />
              
              {webrtcStatus && (
                <div className="mt-4 bg-white/70 backdrop-blur-sm p-4 rounded-3xl border-2 border-[#0054A6] text-xs text-[#0054A6] font-bold flex items-center gap-2 max-w-sm w-full shadow-md">
                  <div className="flex h-2.5 w-2.5 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ED1C24] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#ED1C24]"></span>
                  </div>
                  <span className="leading-tight">{webrtcStatus}</span>
                </div>
              )}
            </div>

            {/* Players Roster */}
            <div className="lg:col-span-7 bg-white/80 backdrop-blur-md rounded-[40px] border-4 border-white p-8 flex flex-col shadow-2xl w-full">
              <div className="flex justify-between items-end mb-6">
                <h2 className="text-3xl font-black text-[#0054A6] uppercase italic">The Lobby</h2>
                <span className="bg-[#ED1C24] text-white px-4 py-1.5 rounded-full font-black text-xs uppercase italic tracking-widest shadow-sm">
                  {lobbyPlayers.length} / 10 Players
                </span>
              </div>

              {/* Lobby List */}
              <div id="lobby-player-grid" className="flex flex-col gap-3.5 max-h-[300px] overflow-y-auto pr-1">
                {lobbyPlayers.map((player) => {
                  const isMe = player.id === playerId;
                  return (
                    <div
                      key={player.id}
                      className={`flex items-center gap-4 p-4 rounded-2xl border-2 shadow-sm transition-all bg-white ${
                        player.isHost ? "border-[#ED1C24]" : "border-[#0054A6]/40"
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-full border-2 border-white flex items-center justify-center font-black text-white shadow-sm text-lg ${
                        player.isHost ? "bg-[#ED1C24]" : "bg-[#0054A6]"
                      }`}>
                        {player.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <p className={`font-black text-slate-800 text-base ${isMe ? "text-[#0054A6]" : ""}`}>
                          {player.name} {isMe ? " (你)" : ""}
                        </p>
                        <p className="text-[10px] font-black text-[#00A651] uppercase tracking-wider">
                          {player.isHost ? "房主 OWNER" : "已連線 CONNECTED"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {player.isHost && (
                          <span className="text-[10px] font-black uppercase text-white bg-[#ED1C24] px-2.5 py-1 rounded-full border border-white flex items-center gap-1 shadow-sm">
                            <Crown size={12} className="stroke-[2.5]" />
                            HOST
                          </span>
                        )}
                        <div className="w-3.5 h-3.5 bg-[#00A651] rounded-full border-2 border-white shadow-sm" title="連線正常"></div>
                      </div>
                    </div>
                  );
                })}

                {lobbyPlayers.length <= 1 && (
                  <div className="flex flex-col items-center justify-center text-gray-400 font-bold h-36 bg-white/40 rounded-2xl border-2 border-dashed border-gray-300 p-6 text-center">
                    <span className="text-sm">請邀請其他玩家加入，一起快樂玩 UNO！</span>
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="mt-6 pt-5 border-t-2 border-[#0054A6]/10">
                {isHost ? (
                  <button
                    id="btn-start-game"
                    onClick={startGame}
                    disabled={lobbyPlayers.length < 2}
                    className={`w-full py-5 rounded-[24px] font-black text-2xl shadow-xl transition-all border-b-8 uppercase italic tracking-widest ${
                      lobbyPlayers.length >= 2
                        ? "bg-[#0054A6] text-white hover:scale-[1.02] active:scale-95 border-[#003c7a] cursor-pointer"
                        : "bg-gray-300 text-gray-500 border-gray-400 cursor-not-allowed opacity-50"
                    }`}
                  >
                    <Play size={20} className="inline-block mr-2 stroke-[3]" />
                    <span>開始遊戲 START GAME</span>
                  </button>
                ) : (
                  <div className="text-center p-4 bg-white rounded-2xl border-4 border-[#0054A6] text-sm text-[#0054A6] font-black flex items-center justify-center gap-2.5 shadow-md">
                    <RefreshCw size={18} className="animate-spin text-[#ED1C24] stroke-[3]" />
                    <span>正在等待房主 {lobbyPlayers.find(p => p.isHost)?.name} 關閉房間並開始牌局...</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ==================== SCREEN 3: ACTIVE PLAYING BOARD ==================== */}
        {isStarted && gameState && (
          <div id="screen-gameboard" className="w-full flex flex-col gap-6 select-none max-w-5xl">
            
            {/* Top row: Status Logs & Play Direction info */}
            <div className="grid grid-cols-1 md:grid-cols-3 items-center bg-white p-5 rounded-[24px] border-4 border-[#0054A6] gap-4 shadow-lg text-[#0054A6] font-bold">
              
              {/* Direction and active color badge */}
              <div className="flex items-center gap-4 justify-between md:justify-start">
                <div className="flex flex-col">
                  <span className="text-[10px] text-[#0054A6]/70 uppercase tracking-widest font-black">當前顏色 Matches</span>
                  <div className="flex items-center gap-2 mt-1">
                    {gameState.selectedColor && (
                      <span className={`h-5 w-5 rounded-full inline-block shrink-0 border-2 border-white shadow-sm ${
                        gameState.selectedColor === "Red" ? "bg-[#ED1C24]" :
                        gameState.selectedColor === "Blue" ? "bg-[#0054A6]" :
                        gameState.selectedColor === "Green" ? "bg-[#00A651]" :
                        gameState.selectedColor === "Yellow" ? "bg-[#FFD700]" : "bg-neutral-600"
                      }`}></span>
                    )}
                    <span className="font-black text-[#0054A6] text-lg">
                      {gameState.selectedColor ? getCardColorLabel(gameState.selectedColor) : "無"}
                    </span>
                  </div>
                </div>

                <div className="border-l-2 border-[#0054A6]/20 pl-4 py-1 flex flex-col justify-center">
                  <span className="text-[10px] text-[#0054A6]/70 uppercase tracking-widest font-black">方向 Sequence</span>
                  <span className="font-black text-[#0054A6] text-sm mt-1 flex items-center gap-1.5 uppercase italic">
                    {gameState.direction === "clockwise" ? "↻ 順時針" : "↺ 逆時針"}
                  </span>
                </div>
              </div>

              {/* Global system/players logging line */}
              <div className="md:col-span-2 bg-[#FFD700]/10 border-2 border-[#0054A6]/30 px-4 py-2.5 rounded-2xl text-center text-xs text-[#0054A6] tracking-wide font-black flex items-center justify-center min-h-[46px] max-w-full overflow-hidden shadow-inner">
                <span className={getLogColorClass(gameState.lastActionLog)}>
                  {gameState.lastActionLog || "等待出牌開局中..."}
                </span>
              </div>
            </div>

            {/* Middle: Sandbox Board Center & OTHERS Roster */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-stretch">
              
              {/* Leaderboard opponents checklist */}
              <div className="bg-white border-4 border-[#0054A6] rounded-[24px] p-5 flex flex-col gap-3 h-full md:col-span-1 shadow-lg">
                <h4 className="font-black text-xs uppercase tracking-widest text-[#0054A6] pb-2 border-b-2 border-[#0054A6]/10">
                  競爭對手 ({gameState.players.length})
                </h4>

                <div id="opponents-list" className="flex flex-col gap-2.5 overflow-y-auto max-h-[300px]">
                  {gameState.players.map((plr) => {
                    const isMyTurn = gameState.activePlayerId === plr.id;
                    const isMe = plr.id === playerId;

                    return (
                      <div
                        key={plr.id}
                        className={`flex flex-col gap-2 p-3 rounded-xl border-2 transition-all shadow-sm ${
                          isMyTurn
                            ? "bg-[#FFD700]/10 border-[#ED1C24] scale-[1.02]"
                            : "bg-white border-[#0054A6]/20"
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-black text-sm text-slate-800 flex items-center gap-1 truncate max-w-[120px]">
                            {plr.name}
                            {isMe && <span className="text-[10px] text-[#0054A6] font-bold ml-0.5">(我)</span>}
                          </span>
                          
                          <span className="text-xs font-black font-mono text-white bg-[#0054A6] px-2 py-0.5 rounded-lg border-2 border-white shadow-sm flex items-center gap-1">
                            🎴 {plr.cardsCount}
                          </span>
                        </div>

                        {/* Status elements: Catch button */}
                        <div className="flex justify-between items-center mt-1">
                          {isMyTurn ? (
                            <span className="text-[10px] uppercase font-black text-[#ED1C24] bg-red-100 px-2 py-0.5 rounded border border-red-300 flex items-center gap-1 animate-pulse">
                              <span className="h-1.5 w-1.5 rounded-full bg-[#ED1C24]"></span>
                              出牌中
                            </span>
                          ) : (
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                              等待
                            </span>
                          )}

                          {/* Catch system button: Visible if the target opponent has 1 card but DID NOT SAY UNO */}
                          {!isMe && plr.cardsCount === 1 && (
                            <button
                              id={`btn-catch-${plr.id}`}
                              onClick={() => catchPlayer(plr.id)}
                              className={`text-[10px] font-black uppercase tracking-wider rounded-lg px-2 py-1 select-none transition-all cursor-pointer ${
                                plr.unoDeclared
                                  ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                                  : "bg-[#ED1C24] hover:bg-red-600 text-white shadow-md border-b-2 border-red-800"
                              }`}
                              disabled={plr.unoDeclared}
                              title={plr.unoDeclared ? "對方已喊過 UNO" : "抓他！他手牌剩一張且沒喊 UNO"}
                            >
                              {plr.unoDeclared ? "✓ 已喊" : "🕵️‍♂️ 抓他！"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* CARD TABLE (DISCARD & DRAW DECK) */}
              <div id="playing-deck-discard-center" className="md:col-span-3 bg-white border-4 border-[#0054A6] rounded-[32px] p-8 flex flex-col md:flex-row items-center justify-center gap-12 relative min-h-[300px] shadow-lg">
                
                {/* DRAW PILE / DRAW CARD BUTTON */}
                <div className="flex flex-col items-center gap-4">
                  <span className="text-[10px] uppercase font-black text-[#0054A6] tracking-widest bg-slate-100 px-3 py-1 rounded-full">
                    牌堆 Draw Pile
                  </span>
                  
                  {/* Interactive card back that lets user draw */}
                  <button
                    id="btn-deck-draw"
                    onClick={drawCard}
                    disabled={gameState.activePlayerId !== playerId || gameState.hasDrawnThisTurn}
                    className={`relative w-28 h-40 rounded-2xl font-black flex flex-col items-center justify-center border-4 border-white shadow-xl transition overflow-hidden bg-[#ED1C24] cursor-pointer ${
                      gameState.activePlayerId === playerId && !gameState.hasDrawnThisTurn
                        ? "hover:-translate-y-2 hover:shadow-[#ED1C24]/30 animate-bounce active:scale-95 duration-1000"
                        : "opacity-40 saturate-50 cursor-not-allowed"
                    }`}
                  >
                    {/* Ring circles mimicking original UNO card back design */}
                    <div className="absolute inset-2 border-2 border-dashed border-[#FFD700] rounded-xl flex items-center justify-center rotate-12 bg-[#0054A6]">
                      <div className="absolute -rotate-12 transform scale-110 select-none font-black text-[#FFD700] text-2xl italic tracking-tighter">
                        UNO
                      </div>
                    </div>
                  </button>
                  
                  <div className="text-center">
                    {gameState.activePlayerId === playerId && !gameState.hasDrawnThisTurn ? (
                      <span className="text-sm text-[#ED1C24] font-black animate-pulse">
                        🔔 指示：點擊牌堆抽牌
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500 font-bold">
                        點擊後抽牌
                      </span>
                    )}
                  </div>
                </div>

                {/* DISCARD PILE card */}
                <div className="flex flex-col items-center gap-4">
                  <span className="text-[10px] uppercase font-black text-[#0054A6] tracking-widest bg-slate-100 px-3 py-1 rounded-full">
                    當前棄牌 Discard Pile
                  </span>
                  
                  <div className="relative">
                    {gameState.discardPile.length > 0 ? (
                      (() => {
                        const topCard = gameState.discardPile[gameState.discardPile.length - 1];
                        return (
                          <div
                            className={`w-28 h-40 rounded-2xl font-black flex flex-col justify-between p-3 border-4 border-white shadow-xl relative select-none animate-in fade-in zoom-in-95 duration-200 ${getCardBgClass(
                              topCard.color
                            )}`}
                          >
                            <span className="text-sm font-black">{topCard.value}</span>
                            <div className="self-center flex items-center justify-center bg-white/20 rounded-full w-14 h-14 border border-white/20 shadow-inner">
                              <span className="text-3xl font-black text-white italic tracking-tight">{topCard.value}</span>
                            </div>
                            <span className="text-sm font-black text-right rotate-180">{topCard.value}</span>

                            {/* Corner indicator in case background color needs to carry custom label */}
                            {topCard.color === "Wild" && gameState.selectedColor && (
                              <div className="absolute -bottom-2 -right-2 h-8 w-8 rounded-full border-2 border-slate-900 bg-white shadow flex items-center justify-center" title={`變色至：${getCardColorLabel(gameState.selectedColor)}`}>
                                <span className={`h-4.5 w-4.5 rounded-full ${
                                  gameState.selectedColor === "Red" ? "bg-[#ED1C24]" :
                                  gameState.selectedColor === "Blue" ? "bg-[#0054A6]" :
                                  gameState.selectedColor === "Green" ? "bg-[#00A651]" : "bg-[#FFD700]"
                                }`}></span>
                              </div>
                            )}
                          </div>
                        );
                      })()
                    ) : (
                      <div className="w-28 h-40 bg-slate-200 rounded-2xl border-4 border-dashed border-slate-300 flex items-center justify-center text-xs text-slate-500 font-bold">
                        今日無牌
                      </div>
                    )}
                  </div>
                  
                  <div className="text-center text-xs text-slate-500 font-bold">
                    最新打出的牌
                  </div>
                </div>

                {/* PASS CONTROL */}
                {gameState.activePlayerId === playerId && gameState.hasDrawnThisTurn && (
                  <div className="absolute inset-0 bg-[#0054A6]/95 backdrop-blur-md flex flex-col items-center justify-center gap-4 rounded-[28px] p-6 animate-in fade-in duration-200 text-white border-4 border-[#FFD700] shadow-2xl">
                    <div className="text-center">
                      <h5 className="font-black text-xl text-[#FFD700] uppercase italic tracking-widest">你已經抽了一張牌</h5>
                      <p className="text-sm text-white/95 mt-2 max-w-[320px] font-bold">
                        您剛才抽起的那張牌無法配合出牌，或者您希望保留。請點擊「過牌」結束此回合。
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        id="btn-pass-turn"
                        onClick={passTurn}
                        className="bg-[#FFD700] hover:bg-yellow-400 text-slate-900 font-black py-3 px-8 rounded-full text-sm transition-all shadow-lg active:scale-95 border-b-4 border-yellow-600 uppercase italic tracking-wider cursor-pointer"
                      >
                        👉 確認過牌 PASS 回合
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom: Play controls and Player hand */}
            <div className="flex flex-col gap-3 bg-white border-4 border-[#0054A6] rounded-[32px] p-6 shadow-xl w-full">
              
              {/* Hand controls ribbon */}
              <div className="flex justify-between items-center pb-4 border-b-2 border-[#0054A6]/10">
                <span className="text-xs font-black uppercase tracking-wider text-[#0054A6] flex items-center gap-2">
                  <span>我的手牌 (Your Hand)</span>
                  <span className="bg-[#0054A6] text-white px-3 py-0.5 rounded-full font-mono font-black text-xs border border-white shadow-sm">
                    {gameState.myHand.length} 張
                  </span>
                </span>

                <div className="flex items-center gap-2">
                  {/* UNO BUTTON: Enabled if they have 2 cards and can play 1 to get to 1, or currently have 1 card */}
                  <button
                    id="btn-self-say-uno"
                    onClick={declareUno}
                    className="bg-[#ED1C24] hover:bg-red-600 hover:scale-102 active:scale-95 text-white text-xs font-black py-2.5 px-4 rounded-xl shadow-md border-b-4 border-red-800 transition-all flex items-center gap-1.5 cursor-pointer uppercase italic tracking-wider"
                  >
                    <Volume2 size={14} className="stroke-[3]" />
                    <span>大喊「UNO！」</span>
                  </button>
                </div>
              </div>

              {/* Hand layout CARDS FAN */}
              <div id="player-hand-scroll" className="flex items-center gap-3 overflow-x-auto py-5 px-1 min-h-[195px] scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
                {gameState.myHand.length > 0 ? (
                  gameState.myHand.map((card) => {
                    const isMyTurn = gameState.activePlayerId === playerId;
                    const topCard = gameState.discardPile[gameState.discardPile.length - 1];
                    const playable = isMyTurn && isCardPlayable(card, topCard, gameState.selectedColor);

                    return (
                      <button
                        key={card.id}
                        onClick={() => {
                          if (playable) playCard(card.id);
                        }}
                        disabled={!playable}
                        className={`group relative w-24 h-34 rounded-2xl font-black flex flex-col justify-between p-2.5 flex-shrink-0 border-4 shadow-lg transition-all duration-200 ${getCardBgClass(
                          card.color
                        )} ${
                          playable
                            ? "hover:-translate-y-5 hover:shadow-2xl border-[#00A651] cursor-pointer focus:ring-4 focus:ring-[#00A651]/30 scale-102"
                            : "opacity-45 saturate-50 cursor-not-allowed scale-95 border-white"
                        }`}
                      >
                        <span className="text-xs font-black">{card.value}</span>
                        <div className="self-center flex items-center justify-center bg-white/20 rounded-full w-10 h-10 border border-white/20 shadow-inner">
                          <span className="text-xl font-black text-white italic tracking-tight">{card.value}</span>
                        </div>
                        <span className="text-xs font-black text-right rotate-180">{card.value}</span>

                        {/* Hover hint logic overlay */}
                        {playable && (
                          <span className="absolute inset-x-0 bottom-1 flex items-center justify-center opacity-0 group-hover:opacity-100 transition duration-150">
                            <span className="bg-[#00A651] text-[10px] text-white px-2 py-0.5 rounded shadow-md font-black italic tracking-widest uppercase border border-white">出牌</span>
                          </span>
                        )}
                      </button>
                    );
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center w-full text-slate-400 font-bold text-sm py-8 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 p-4">
                    <span>您的手牌目前是空的（等待發牌或您已取得勝利 🎉）</span>
                  </div>
                )}
              </div>

              {/* Action hints and alerts info */}
              {gameState.activePlayerId === playerId ? (
                <div className="flex items-center gap-2.5 text-xs font-black px-4 py-3 bg-[#00A651]/10 text-[#00A651] border-2 border-[#00A651]/40 rounded-2xl leading-relaxed">
                  <Flame size={16} className="text-[#00A651] shrink-0 stroke-[3]" />
                  <span>現在是你的回合！請點擊加粗發光的牌出牌，若沒有可出的牌，請點擊上方牌堆抽一張牌。</span>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 text-xs font-black text-slate-500 px-4 py-3 bg-[#0054A6]/5 border-2 border-[#0054A6]/20 rounded-2xl leading-relaxed">
                  <RefreshCw size={14} className="animate-spin text-[#0054A6] shrink-0 stroke-[3]" />
                  <span>正在等待其他玩家出牌，請保持注意力！當別人的手牌剩下一張且沒有大喊 UNO 時，點擊大喊抓人！</span>
                </div>
              )}
            </div>

            {/* OVERLAY PICKER: WILDCARD COLOR SELECTOR */}
            {wildcardSelection && (
              <div className="fixed inset-0 z-50 bg-[#0054A6]/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
                <div className="bg-white border-4 border-[#0054A6] rounded-[40px] max-w-sm w-full p-8 shadow-2xl text-center flex flex-col items-center gap-2">
                  <h4 className="font-black text-2xl text-[#0054A6] mb-1 uppercase italic tracking-wider">指定下家出牌顏色</h4>
                  <p className="text-xs text-gray-600 mb-6 font-bold leading-relaxed">
                    您打出了萬能牌，請挑選您想指定的 UNO 牌局花色顏色：
                  </p>

                  <div className="grid grid-cols-2 gap-4 w-full" id="wildcolor-selector-grid">
                    <button
                      onClick={() => selectWildColor("Red")}
                      className="bg-[#ED1C24] hover:bg-red-600 hover:scale-[1.03] text-white font-black py-4 px-4 rounded-2xl transition shadow-md border-b-4 border-red-800 cursor-pointer uppercase italic"
                    >
                      ❤️ 紅色 {getCardColorLabel("Red")}
                    </button>
                    <button
                      onClick={() => selectWildColor("Blue")}
                      className="bg-[#0054A6] hover:bg-blue-700 hover:scale-[1.03] text-white font-black py-4 px-4 rounded-2xl transition shadow-md border-b-4 border-blue-900 cursor-pointer uppercase italic"
                    >
                      💙 藍色 {getCardColorLabel("Blue")}
                    </button>
                    <button
                      onClick={() => selectWildColor("Green")}
                      className="bg-[#00A651] hover:bg-[#008d44] hover:scale-[1.03] text-white font-black py-4 px-4 rounded-2xl transition shadow-md border-b-4 border-green-800 cursor-pointer uppercase italic"
                    >
                      💚 綠色 {getCardColorLabel("Green")}
                    </button>
                    <button
                      onClick={() => selectWildColor("Yellow")}
                      className="bg-[#FFD700] hover:bg-yellow-400 hover:scale-[1.03] text-slate-900 font-black py-4 px-4 rounded-2xl transition shadow-md border-b-4 border-yellow-600 cursor-pointer uppercase italic"
                    >
                      💛 黃色 {getCardColorLabel("Yellow")}
                    </button>
                  </div>

                  <button
                    onClick={() => setWildcardSelection(null)}
                    className="mt-6 text-xs text-gray-500 hover:text-[#0054A6] font-black underline cursor-pointer"
                  >
                    取消 CANCEL
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== SCREEN 4: GAME OVER SPLASH ==================== */}
        {isStarted && gameState && gameState.winnerPlayerId && (
          <div className="fixed inset-0 z-50 bg-[#0054A6]/85 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-white border-4 border-[#0054A6] rounded-[40px] max-w-md w-full p-8 shadow-2xl text-center flex flex-col items-center gap-4 animate-in zoom-in-95 duration-200">
              
              <div className="h-20 w-20 bg-[#FFD700]/20 rounded-full flex items-center justify-center text-4xl mb-1 border-2 border-[#FFD700] shadow-inner">
                🏆
              </div>

              <h3 className="text-2xl md:text-3xl font-black text-[#0054A6] uppercase italic tracking-wider">對局已分出勝負！</h3>
              <p className="text-sm font-black text-[#ED1C24] bg-red-50 border border-red-200 px-4 py-1.5 rounded-full inline-block">
                獲勝者為：{gameState.players.find((p) => p.id === gameState.winnerPlayerId)?.name || "未知玩家"} 🎉
              </p>

              <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-200 w-full mt-2 text-xs text-slate-700 leading-relaxed text-left font-bold">
                最終手牌記錄：
                <div className="flex flex-col gap-1.5 mt-2">
                  {gameState.players.map((plr) => (
                    <div key={plr.id} className="flex justify-between font-mono font-bold text-slate-700 border-b border-dashed border-slate-200 pb-1.5">
                      <span>{plr.name}</span>
                      <span className="text-[#0054A6]">{plr.cardsCount} 張剩餘牌</span>
                    </div>
                  ))}
                </div>
              </div>

              {isHost ? (
                <button
                  id="btn-restart-game"
                  onClick={startGame}
                  className="w-full bg-[#00A651] hover:bg-[#008d44] active:scale-95 text-white font-black py-4 px-4 rounded-2xl text-base shadow-lg transition-all border-b-4 border-green-800 uppercase italic cursor-pointer mt-4"
                >
                  🔄 再玩一局(房主重新發牌)
                </button>
              ) : (
                <div className="text-xs text-gray-500 font-extrabold mt-4 animate-pulse">
                  等待房主確認重新發牌開局...
                </div>
              )}

              <button
                id="btn-gameover-exit"
                onClick={leaveRoom}
                className="text-xs text-slate-400 hover:text-[#ED1C24] font-black tracking-widest uppercase hover:underline mt-2 cursor-pointer"
              >
                返回主頁 RETREAT HOME
              </button>
            </div>
          </div>
        )}

      </main>

      {/* FOOTER BAR */}
      <footer className="p-6 text-center text-xs font-bold text-[#0054A6]/80 flex flex-col sm:flex-row gap-3 justify-between items-center max-w-7xl w-full mx-auto border-t-2 border-[#0054A6]/10 mt-12 bg-transparent">
        <span>© 2026 UNO 多人 P2P 連線遊戲 - Vibrant Palette Edition.</span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#00A651]"></span>
          P2P WebRTC 無伺服器延遲防護
        </span>
      </footer>

      {/* QR SCANNER WINDOW OVERLAY */}
      {showScanner && (
        <CameraQRScanner
          onScanSuccess={onScanSuccess}
          onCancel={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
