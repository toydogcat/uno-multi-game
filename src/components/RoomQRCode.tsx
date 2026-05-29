import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Check, Users } from "lucide-react";

interface RoomQRCodeProps {
  roomId: string;
  playerCount: number;
  maxPlayers?: number;
}

export default function RoomQRCode({ roomId, playerCount, maxPlayers = 10 }: RoomQRCodeProps) {
  const [qrUrl, setQrUrl] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);
  const joinUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;

  useEffect(() => {
    QRCode.toDataURL(joinUrl, {
      width: 256,
      margin: 2,
      color: {
        dark: "#1e293b", // Slate 800
        light: "#ffffff", // Pure white
      },
    })
      .then((url) => setQrUrl(url))
      .catch((err) => console.error("Error generating QR code", err));
  }, [joinUrl]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.warn("Clipboard copy failed, falling back", e);
    }
  };

  return (
    <div id="room-qrcode-container" className="flex flex-col items-center bg-white p-8 rounded-[40px] shadow-2xl border-4 border-[#0054A6] max-w-sm w-full">
      <div className="text-center mb-4">
        <span className="text-xs font-black uppercase tracking-widest text-[#ED1C24] bg-[#ED1C24]/10 px-3 py-1 rounded-full border border-[#ED1C24]/20">
          等待玩家加入
        </span>
        <h3 className="text-2xl font-black text-[#0054A6] italic uppercase mt-3">分享房間</h3>
        <p className="text-xs text-gray-500 font-bold mt-1.5 max-w-[280px]">
          讓其他玩家掃描 QR Code 或複製連結加入此房間同樂！
        </p>
      </div>

      <div className="bg-[#f0f0f0] p-4 rounded-3xl mb-4 border-4 border-dashed border-gray-300 flex items-center justify-center w-52 h-52 relative shadow-inner">
        {qrUrl ? (
          <img
            src={qrUrl}
            alt="UNO 房間加入二維碼"
            className="w-full h-full rounded-2xl object-contain"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-gray-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#ED1C24] mb-2"></div>
            <span className="text-xs font-semibold">生成中...</span>
          </div>
        )}
      </div>

      <div className="flex flex-col w-full gap-2.5 mb-2">
        <div className="flex items-center justify-between bg-white px-4 py-2.5 rounded-xl border-2 border-[#0054A6] text-sm font-bold">
          <span className="text-gray-500">房間代碼:</span>
          <span className="font-mono font-black text-[#ED1C24] tracking-widest text-lg">
            {roomId}
          </span>
        </div>

        <div className="flex items-center justify-between bg-white px-4 py-2.5 rounded-xl border-2 border-[#0054A6] text-sm font-bold">
          <span className="text-gray-500 flex items-center gap-1.5">
            <Users size={16} className="text-[#0054A6]" />
            當前人數:
          </span>
          <span className="font-black text-[#0054A6] text-base">
            {playerCount} / {maxPlayers} 人
          </span>
        </div>
      </div>

      <button
        id="btn-copy-link"
        onClick={copyToClipboard}
        className="mt-3 flex items-center justify-center gap-2 w-full py-4 px-5 bg-[#00A651] hover:bg-green-600 text-white rounded-2xl font-black text-sm uppercase italic tracking-wider shadow-lg border-b-4 border-green-800 transition-all active:scale-95 cursor-pointer"
      >
        {copied ? (
          <>
            <Check size={16} className="text-white stroke-[3]" />
            <span>已複製連結！</span>
          </>
        ) : (
          <>
            <Copy size={16} className="stroke-[3]" />
            <span>複製專屬加入連結</span>
          </>
        )}
      </button>
    </div>
  );
}
