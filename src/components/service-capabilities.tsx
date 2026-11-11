"use client";
import { createContext, useContext } from "react";
import type { Capabilities } from "@/lib/capabilities";
const Context = createContext<Capabilities>({ groq: false, siliconflow: false, tts: false });
export const useServiceCapabilities = () => useContext(Context);
export default function ServiceCapabilities({ value, children }: { value: Capabilities; children: React.ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
