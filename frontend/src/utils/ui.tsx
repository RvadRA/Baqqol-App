export const getInitial = (name?: string) =>
  name ? name.charAt(0).toUpperCase() : "?";

// Mock online status
export const isOnline = () => Math.random() > 0.5;

export const formatLastSeen = (lastSeen?: string): string => {
  if (!lastSeen) return "недавно";
  
  try {
    const now = new Date();
    const lastSeenDate = new Date(lastSeen);
    const diffInMinutes = Math.floor((now.getTime() - lastSeenDate.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return "только что";
    if (diffInMinutes < 60) return `${diffInMinutes} мин назад`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} ч назад`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays === 1) return "вчера";
    if (diffInDays < 7) return `${diffInDays} д назад`;
    
    return lastSeenDate.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short'
    });
  } catch (error) {
    console.error("Error formatting last seen:", error);
    return "недавно";
  }
};