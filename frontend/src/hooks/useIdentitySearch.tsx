import { useState } from "react";
import api from "../api/axios";

interface Identity {
  _id: string;
  phone: string;
  registeredName?: string; // ✅ O'zgartirildi
  trustScore: number;
}

interface LocalName {
  localName: string;
  targetIdentityId: Identity; // ✅ O'zgartirildi
}

export function useIdentitySearch() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [suggestions, setSuggestions] = useState<{
    identities: Identity[];
    locals: LocalName[];
  }>({ identities: [], locals: [] });
  const [notFound, setNotFound] = useState(false);

  const search = async (phone: string) => {
    const normalized = phone.replace(/\s/g, "");
    if (normalized.length < 6) return;

    const res = await api.get(
      `/identities/search?q=${encodeURIComponent(normalized)}`
    );

    setSuggestions(res.data);

    const found =
      res.data.identities?.[0] ||
      res.data.locals?.[0]?.targetIdentityId; // ✅ O'zgartirildi

    if (found) {
      setIdentity(found);
      setNotFound(false);
    } else {
      setIdentity(null);
      setNotFound(true);
    }
  };

  return {
    identity,
    setIdentity,
    suggestions,
    notFound,
    search,
  };
}