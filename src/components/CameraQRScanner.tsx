import React, { useEffect, useState, FormEvent } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { Camera, X, Play, RefreshCw, AlertCircle } from "lucide-react";

interface CameraQRScannerProps {
  onScanSuccess: (roomId: string) => void;
  onCancel: () => void;
}

export default function CameraQRScanner({ onScanSuccess, onCancel }: CameraQRScannerProps) {
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [manualRoomId, setManualRoomId] = useState<string>("");
  const [manualError, setManualError] = useState<string>("");
  const [scanError, setScanError] = useState<string>("");

  useEffect(() => {
    let scanner: Html5QrcodeScanner | null = null;

    if (isScanning) {
      setScanError("");
      try {
        scanner = new Html5QrcodeScanner(
          "qr-reader-div",
          {
            fps: 10,
            qrbox: { width: 220, height: 220 },
            supportedScanTypes: [0], // 0 corresponds to camera scan
          },
          /* verbose= */ false
        );

        scanner.render(
          (decodedText) => {
            console.log("QR decoded:", decodedText);
            // Parse Room ID from complete URL or raw text
            let finalRoomId = decodedText.trim();
            try {
              if (decodedText.startsWith("http")) {
                const urlObj = new URL(decodedText);
                const queryRoom = urlObj.searchParams.get("room");
                if (queryRoom) {
                  finalRoomId = queryRoom;
                }
              }
            } catch (e) {
              console.warn("Parsed URL failed", e);
            }

            finalRoomId = finalRoomId.toUpperCase().replace(/[^A-Z0-9]/g, "");
            if (finalRoomId && finalRoomId.length > 0) {
              if (scanner) {
                scanner.clear().catch((err) => console.error("Error clearing scanner", err));
              }
              setIsScanning(false);
              onScanSuccess(finalRoomId);
            }
          },
          (errorMessage) => {
            // Uncritical scan noises - do not spam the console or page
          }
        );
      } catch (err: any) {
        console.error("Failed to start camera scan:", err);
        setScanError(
          "無法開啟相機。這可能是因為當前環境未授權相機權限（請檢查瀏覽器安全性或是否開啟了 iframe 權限），或相機正被其他應用程式佔用。"
        );
        setIsScanning(false);
      }
    }

    return () => {
      if (scanner) {
        scanner.clear().catch((err) => console.error("Unmount cleanup failed", err));
      }
    };
  }, [isScanning, onScanSuccess]);

  const handleManualSubmit = (e: FormEvent) => {
    e.preventDefault();
    setManualError("");
    const cleanRoomId = manualRoomId.toUpperCase().trim();
    if (!cleanRoomId) {
      setManualError("請輸入房間代碼");
      return;
    }
    if (cleanRoomId.length !== 5) {
      setManualError("房間代碼通常為 5 個英數字元");
      return;
    }
    onScanSuccess(cleanRoomId);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0054A6]/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-[32px] max-w-md w-full shadow-2xl border-4 border-[#0054A6] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b-4 border-[#0054A6] px-6 py-4 bg-[#FFD700]/30">
          <h3 className="text-xl font-black text-[#0054A6] uppercase italic flex items-center gap-2">
            <Camera className="text-[#ED1C24] stroke-[3]" size={20} />
            掃描 QR Code 加入房間
          </h3>
          <button
            onClick={onCancel}
            className="text-[#0054A6] hover:text-[#ED1C24] transition p-1 hover:bg-[#FFD700]/35 rounded-full cursor-pointer font-bold"
          >
            <X size={20} className="stroke-[3]" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-5">
          {/* Option A: Camera Scan */}
          <div className="flex flex-col items-center">
            {isScanning ? (
              <div className="w-full flex flex-col items-center gap-2">
                <div id="qr-reader-div" className="w-full overflow-hidden rounded-2xl border-4 border-dashed border-[#ED1C24] max-w-xs bg-slate-50"></div>
                <button
                  type="button"
                  onClick={() => setIsScanning(false)}
                  className="mt-3 text-xs text-[#ED1C24] font-black hover:underline cursor-pointer uppercase tracking-wider"
                >
                  關閉相機
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center py-4 text-center">
                <button
                  id="btn-start-scan"
                  type="button"
                  onClick={() => setIsScanning(true)}
                  className="flex items-center justify-center gap-2.5 bg-[#ED1C24] hover:bg-red-600 active:scale-95 text-white font-black px-6 py-4 rounded-2xl shadow-lg border-b-4 border-red-800 transition duration-150 uppercase italic tracking-wider cursor-pointer"
                >
                  <Camera size={20} className="stroke-[3]" />
                  <span>打開相機掃描儀</span>
                </button>
                <p className="text-xs text-gray-500 font-bold mt-3">
                  需要授權相機權限，對準房主的 QR Code 即可！
                </p>
              </div>
            )}

            {scanError && (
              <div className="flex gap-2.5 bg-amber-50 rounded-2xl p-4 border-2 border-amber-200 mt-4 text-xs text-amber-900 font-semibold leading-relaxed max-w-sm">
                <AlertCircle className="shrink-0 text-[#ED1C24] stroke-[3]" size={18} />
                <span>{scanError}</span>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="relative flex items-center justify-center">
            <div className="absolute inset-y-1/2 left-0 right-0 border-t-2 border-[#0054A6]/20"></div>
            <span className="relative bg-white px-3 text-xs uppercase font-black tracking-widest text-[#0054A6] text-center">
              或手動輸入
            </span>
          </div>

          {/* Option B: Manual Input Fallback */}
          <form onSubmit={handleManualSubmit} className="flex flex-col gap-3">
            <div className="flex gap-3">
              <input
                id="input-manual-room-id"
                type="text"
                maxLength={5}
                value={manualRoomId}
                onChange={(e) => setManualRoomId(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                placeholder="例如: ABCDE"
                className="flex-1 bg-white border-4 border-[#0054A6] rounded-xl text-center font-mono font-black tracking-widest text-lg py-2.5 px-4 uppercase placeholder:font-sans placeholder:tracking-normal placeholder:text-sm placeholder:text-gray-400 placeholder:font-bold text-[#ED1C24] transition-all"
              />
              <button
                type="submit"
                className="bg-[#0054A6] hover:bg-blue-700 active:scale-95 text-white font-black px-6 rounded-xl text-sm transition-all shadow-md border-b-4 border-blue-900 cursor-pointer"
              >
                加入
              </button>
            </div>
            {manualError && (
              <span className="text-xs text-[#ED1C24] font-black flex items-center gap-1 pl-1">
                ⚠️ {manualError}
              </span>
            )}
          </form>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 border-t-2 border-gray-100 px-6 py-3.5 flex justify-end">
          <button
            onClick={onCancel}
            className="text-xs font-black text-gray-500 hover:text-gray-700 hover:bg-gray-200 px-4 py-2 rounded-lg transition-all cursor-pointer"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}
