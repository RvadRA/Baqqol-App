interface TrustCircleProps {
  value: number; // 0–100
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

export function TrustCircle({ 
  value, 
  size = 'md', 
  showLabel = true,
  className = ""
}: TrustCircleProps) {
  // Исправление недопустимых значений (NaN или вне диапазона)
  const safeValue = Math.min(Math.max(value || 50, 0), 100);
  
  const sizes = {
    sm: { radius: 20, stroke: 3, fontSize: 10 },
    md: { radius: 26, stroke: 4, fontSize: 12 },
    lg: { radius: 32, stroke: 5, fontSize: 14 }
  };

  const { radius, stroke, fontSize } = sizes[size];
  const normalizedRadius = radius - stroke;
  const circumference = normalizedRadius * 2 * Math.PI;
  const offset = circumference - (safeValue / 100) * circumference;

  // ✅ strokeDashoffset должен быть строкой
  const strokeDashoffset = offset.toString();

  const color =
    safeValue >= 70
      ? "#22c55e"
      : safeValue >= 40
      ? "#eab308"
      : "#ef4444";

  const getTrustLevel = (score: number) => {
    if (score >= 70) return "ВЫСОКИЙ";
    if (score >= 40) return "СРЕДНИЙ";
    return "НИЗКИЙ";
  };

  const trustLevel = getTrustLevel(safeValue);

  return (
    <div className={`flex flex-col items-center ${className}`}>
      {showLabel && (
        <span className="text-xs text-slate-500 mb-1">
          {size === 'sm' ? 'доверие' : 'Рейтинг доверия'}
        </span>
      )}

      <div className="relative">
        <svg 
          height={radius * 2} 
          width={radius * 2}
          className="transform -rotate-90"
        >
          {/* Фоновый круг */}
          <circle
            stroke="#1e293b"
            fill="transparent"
            strokeWidth={stroke}
            strokeLinecap="round"
            r={normalizedRadius}
            cx={radius}
            cy={radius}
          />

          {/* Прогресс */}
          <circle
            stroke={color}
            fill="transparent"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={strokeDashoffset} 
            r={normalizedRadius}
            cx={radius}
            cy={radius}
            style={{
              transition: "stroke-dashoffset 0.5s ease-in-out",
            }}
          />

          {/* Текст прогресса */}
          <text
            x="50%"
            y="50%"
            dominantBaseline="middle"
            textAnchor="middle"
            fill="white"
            fontSize={fontSize}
            fontWeight="bold"
            className="font-sans"
            transform={`rotate(90 ${radius} ${radius})`}
          >
            {safeValue}%
          </text>
        </svg>
      </div>

      {showLabel && size !== 'sm' && (
        <div className="mt-2 text-center">
          <span className={`
            text-xs font-medium px-2 py-1 rounded-full
            ${safeValue >= 70
              ? "bg-green-900/20 text-green-400"
              : safeValue >= 40
              ? "bg-yellow-900/20 text-yellow-400"
              : "bg-red-900/20 text-red-400"}
          `}>
            {trustLevel}
          </span>
        </div>
      )}
    </div>
  );
}