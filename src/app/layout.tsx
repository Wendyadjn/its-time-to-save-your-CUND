import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "粤语通 · CantoneseMaster",
  description: "粤普双向翻译与粤语学习工具 · Step 1–2 演示",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
