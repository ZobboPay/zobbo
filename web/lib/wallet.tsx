"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

interface WalletContextType {
  address: string | null;
  connected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);

  // Restore the last used wallet (the kit persists it in localStorage).
  useEffect(() => {
    (async () => {
      try {
        const { getKit } = await import("./kit");
        const { address } = await getKit().getAddress();
        if (address) setAddress(address);
      } catch {}
    })();
  }, []);

  const connect = async () => {
    try {
      const { getKit } = await import("./kit");
      const { address } = await getKit().authModal();
      setAddress(address);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (/closed|cancel|reject|denied/i.test(msg) || !msg) {
        throw new Error("Wallet connection was cancelled.");
      }
      throw new Error(`Could not connect: ${msg}`);
    }
  };

  const disconnect = () => {
    setAddress(null);
    import("./kit")
      .then(({ getKit }) => getKit().disconnect())
      .catch(() => {});
  };

  return (
    <WalletContext.Provider
      value={{ address, connected: !!address, connect, disconnect }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWallet must be used within WalletProvider");
  }
  return context;
}
