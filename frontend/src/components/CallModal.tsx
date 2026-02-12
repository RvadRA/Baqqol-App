// components/CallModal.tsx - Enhanced
import { useState, useEffect } from "react";
import { Phone, X, PhoneCall, Volume2, Mic, MicOff, PhoneOff, Video, MessageCircle } from "lucide-react";

interface CallModalProps {
  phoneNumber: string;
  contactName: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function CallModal({ phoneNumber, contactName, isOpen, onClose }: CallModalProps) {
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isOnSpeaker, setIsOnSpeaker] = useState(false);
  const [callStatus, setCallStatus] = useState<'dialing' | 'ringing' | 'connected' | 'ended'>('dialing');
  const [isVideo, setIsVideo] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    // Start call simulation
    const timer = setInterval(() => {
      setCallDuration(prev => {
        if (prev === 0) {
          setCallStatus('ringing');
        }
        if (prev === 3) {
          setCallStatus('connected');
        }
        return prev + 1;
      });
    }, 1000);

    return () => {
      clearInterval(timer);
      resetCall();
    };
  }, [isOpen]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const resetCall = () => {
    setCallDuration(0);
    setIsMuted(false);
    setIsOnSpeaker(false);
    setCallStatus('dialing');
    setIsVideo(false);
  };

  const handleCall = () => {
    // Open phone dialer
    window.open(`tel:${phoneNumber}`, '_blank');
    resetCall();
    onClose();
  };

  const handleVideoCall = () => {
    // For future implementation - video call
    setIsVideo(true);
    console.log('Starting video call to:', phoneNumber);
  };

  const handleSendMessage = () => {
    // Go to chat with this contact
    console.log('Navigate to chat with:', contactName);
    onClose();
  };

  const handleEndCall = () => {
    setCallStatus('ended');
    setTimeout(() => {
      onClose();
      resetCall();
    }, 1000);
  };

  const handleToggleMute = () => {
    setIsMuted(!isMuted);
    console.log(isMuted ? 'Microphone unmuted' : 'Microphone muted');
  };

  const handleToggleSpeaker = () => {
    setIsOnSpeaker(!isOnSpeaker);
    console.log(isOnSpeaker ? 'Speaker off' : 'Speaker on');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-gradient-to-br from-gray-900 to-slate-900 rounded-2xl p-8 max-w-md w-full mx-4 border border-slate-700/50 shadow-2xl z-[201] overflow-hidden">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 hover:bg-slate-800/50 rounded-xl transition-colors z-[202]"
        >
          <X className="w-5 h-5 text-gray-400" />
        </button>

        <div className="text-center mb-8">
          <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-6 ${
            callStatus === 'connected' 
              ? 'bg-gradient-to-br from-emerald-600/20 to-green-600/20' 
              : callStatus === 'ringing'
              ? 'bg-gradient-to-br from-yellow-600/20 to-amber-600/20 animate-pulse'
              : 'bg-gradient-to-br from-blue-600/20 to-cyan-600/20'
          }`}>
            {isVideo ? (
              <Video className="w-10 h-10 text-purple-400" />
            ) : (
              <PhoneCall className="w-10 h-10 text-blue-400" />
            )}
          </div>
          
          <h3 className="text-2xl font-bold text-white mb-2">{contactName}</h3>
          <p className="text-gray-400 text-lg">{phoneNumber}</p>
          
          {callStatus !== 'ended' && (
            <div className="mt-4">
              <p className="text-gray-300 mb-1">Статус звонка</p>
              <p className={`text-xl font-semibold ${
                callStatus === 'connected' ? 'text-emerald-400' : 
                callStatus === 'ringing' ? 'text-yellow-400' : 
                'text-blue-400'
              }`}>
                {callStatus === 'dialing' ? 'Набор номера...' :
                 callStatus === 'ringing' ? 'Вызов...' :
                 callStatus === 'connected' ? `${isVideo ? 'Видеозвонок' : 'Разговор'} ${formatDuration(callDuration - 3)}` :
                 'Звонок завершён'}
              </p>
            </div>
          )}
        </div>

        {callStatus === 'ended' ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 mx-auto rounded-full bg-red-500/20 flex items-center justify-center mb-4">
              <PhoneOff className="w-8 h-8 text-red-400" />
            </div>
            <p className="text-xl text-white mb-2">Звонок завершён</p>
            <p className="text-gray-400 mb-6">Длительность: {formatDuration(callDuration - 4)}</p>
            
            {/* Call Again Button */}
            <button
              onClick={() => setCallStatus('dialing')}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-medium transition-all flex items-center justify-center gap-2 mb-3"
            >
              <Phone className="w-5 h-5" />
              Позвонить снова
            </button>
            
            <button
              onClick={handleSendMessage}
              className="w-full py-3 rounded-xl bg-slate-800/50 hover:bg-slate-700/50 text-gray-300 transition-colors flex items-center justify-center gap-2"
            >
              <MessageCircle className="w-5 h-5" />
              Написать сообщение
            </button>
          </div>
        ) : (
          <>
            {/* Call Controls */}
            <div className="flex justify-center gap-4 mb-8">
              {/* Mute Button */}
              <button
                onClick={handleToggleMute}
                className={`p-4 rounded-full transition-all z-[203] flex flex-col items-center gap-1 ${
                  isMuted 
                    ? 'bg-red-500/20 text-red-400' 
                    : 'bg-slate-800/50 hover:bg-slate-700/50 text-gray-300'
                }`}
              >
                {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                <span className="text-xs">{isMuted ? 'Включить' : 'Выключить'}</span>
              </button>
              
              {/* Speaker Button */}
              <button
                onClick={handleToggleSpeaker}
                className={`p-4 rounded-full transition-all z-[203] flex flex-col items-center gap-1 ${
                  isOnSpeaker 
                    ? 'bg-blue-500/20 text-blue-400' 
                    : 'bg-slate-800/50 hover:bg-slate-700/50 text-gray-300'
                }`}
              >
                <Volume2 className="w-6 h-6" />
                <span className="text-xs">{isOnSpeaker ? 'Динамик' : 'Наушники'}</span>
              </button>
              
              {/* End Call Button */}
              <button
                onClick={handleEndCall}
                className="p-4 rounded-full bg-red-500 hover:bg-red-600 transition-colors z-[203] flex flex-col items-center gap-1"
              >
                <PhoneOff className="w-6 h-6 text-white" />
                <span className="text-xs text-white">Завершить</span>
              </button>
            </div>

            {/* Call Actions */}
            <div className="space-y-3 z-[203]">
              {/* Regular Call */}
              <button
                onClick={handleCall}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-medium transition-all flex items-center justify-center gap-2"
              >
                <Phone className="w-5 h-5" />
                Обычный звонок
              </button>
              
              {/* Video Call (if supported) */}
              {!isVideo && (
                <button
                  onClick={handleVideoCall}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 text-white font-medium transition-all flex items-center justify-center gap-2"
                >
                  <Video className="w-5 h-5" />
                  Видеозвонок
                </button>
              )}
              
              {/* Send Message */}
              <button
                onClick={handleSendMessage}
                className="w-full py-3 rounded-xl bg-slate-800/50 hover:bg-slate-700/50 text-gray-300 transition-colors flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-5 h-5" />
                Написать сообщение
              </button>
              
              {/* Cancel */}
              <button
                onClick={handleEndCall}
                className="w-full py-3 rounded-xl bg-slate-800/30 hover:bg-slate-700/30 text-gray-400 transition-colors"
              >
                Отмена
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}